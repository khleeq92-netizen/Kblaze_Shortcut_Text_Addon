'use strict';
const fs = require('fs');
const path = require('path');
const { UserError, todayISO, nowLocal, academicYear, sanitizeFileName, safeCopy, sha256File } = require('../util');

const STATUSES = ['Received', 'Pending Review', 'Assigned', 'In Progress', 'Replied', 'Completed', 'Archived'];
const CHANNELS = ['By Hand', 'Post', 'Registered Post', 'Speed Post', 'Courier', 'Email', 'WhatsApp', 'Portal / Online', 'Other'];
const FIELDS = ['date_received', 'letter_date', 'sender_name', 'sender_office', 'sender_designation', 'subject', 'summary', 'category_id', 'reference_no',
  'received_through', 'assigned_to', 'action_required', 'reply_required', 'reply_deadline', 'status', 'remarks'];

class Inward {
  constructor(app) { this.app = app; this.db = app.db; }

  get(id) {
    const r = this.db.get('SELECT * FROM inward WHERE id=?', [id]);
    if (!r) throw new UserError('Inward entry not found.');
    r.attachments = this.db.all('SELECT * FROM inward_attachments WHERE inward_id=? AND deleted_at IS NULL ORDER BY id', [id])
      .map((a) => ({ ...a, abs_path: this.app.resolve(a.file_path), exists: fs.existsSync(this.app.resolve(a.file_path)) }));
    r.replies = this.db.all('SELECT id, outward_no, subject, letter_date, status, archive_status, pdf_path FROM letters WHERE inward_id=? AND deleted_at IS NULL ORDER BY id', [id])
      .map((x) => ({ ...x, pdf_abs: this.app.resolve(x.pdf_path) }));
    return r;
  }

  validate(v) {
    if (!v.subject || !String(v.subject).trim()) throw new UserError('Subject is required.');
    if (!v.date_received) throw new UserError('Date received is required.');
    if (!v.sender_office && !v.sender_name) throw new UserError('Enter the sender name or office.');
    if (v.status && !STATUSES.includes(v.status)) throw new UserError('Invalid status.');
    if (v.reply_deadline && v.reply_deadline < v.date_received) throw new UserError('Reply deadline cannot be before the date received.');
    if (v.letter_date && v.letter_date > v.date_received) throw new UserError('The letter date cannot be after the date it was received.');
  }

  save(input) {
    const user = this.app.require('inward.manage');
    const v = {};
    for (const f of FIELDS) if (f in input) v[f] = input[f] === '' ? null : input[f];
    v.reply_required = v.reply_required ? 1 : 0;
    if (!input.id && !v.date_received) v.date_received = todayISO();
    if (!input.id && !v.status) v.status = v.assigned_to ? 'Assigned' : 'Received';
    const cat = v.category_id ? this.db.get('SELECT name FROM categories WHERE id=?', [v.category_id]) : null;
    v.category_name = cat ? cat.name : null;
    return this.db.tx(() => {
      let id = input.id;
      if (id) {
        const old = this.get(id);
        this.validate({ ...old, ...v });
        const keys = Object.keys(v);
        this.db.run(`UPDATE inward SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`, [...keys.map((k) => v[k]), nowLocal(), id]);
        this.app.audit(user, 'inward.update', 'inward', id, { fields: keys });
      } else {
        this.validate(v);
        const a = this.app.numbering.allocate('inward', {
          dateISO: v.date_received,
          categoryCode: cat ? this.db.get('SELECT code FROM categories WHERE id=?', [v.category_id]).code : null,
          exists: (formatted) => !!this.db.get('SELECT 1 FROM inward WHERE inward_no=?', [formatted]),
        });
        const keys = Object.keys(v);
        id = this.db.run(`INSERT INTO inward(${keys.join(', ')}, inward_no, inward_seq, scheme_id, period_key, academic_year, created_by) VALUES(${keys.map(() => '?').join(',')},?,?,?,?,?,?)`,
          [...keys.map((k) => v[k]), a.formatted, a.seq, a.schemeId, a.periodKey, academicYear(v.date_received, this.app.settings.get('academic').startMonth), user]).lastInsertRowid;
        this.app.audit(user, 'inward.create', 'inward', id, { inward_no: a.formatted });
      }
      this.app.emitChange('inward');
      return this.get(id);
    });
  }

  setStatus(id, status) {
    const user = this.app.require('inward.manage');
    if (!STATUSES.includes(status)) throw new UserError('Invalid status.');
    this.db.run('UPDATE inward SET status=?, updated_at=? WHERE id=?', [status, nowLocal(), id]);
    this.app.audit(user, 'inward.status', 'inward', id, { status });
    this.app.emitChange('inward');
    return this.get(id);
  }

  addAttachment(id, filePath, label) {
    const user = this.app.require('inward.manage');
    const r = this.get(id);
    if (!fs.existsSync(filePath)) throw new UserError('File not found.');
    const ext = path.extname(filePath).toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.docx', '.doc', '.xlsx', '.bmp'].includes(ext)) throw new UserError('Attach a scanned PDF, an image, or an Office document.');
    const dir = path.join(this.app.documentsRoot(), r.academic_year || academicYear(r.date_received), 'Inward', sanitizeFileName(r.inward_no, 40));
    const dest = safeCopy(filePath, path.join(dir, sanitizeFileName(path.basename(filePath, ext), 80) + ext));
    this.db.tx(() => {
      this.db.run('INSERT INTO inward_attachments(inward_id, label, file_path, sha256) VALUES(?,?,?,?)', [id, label || path.basename(filePath), this.app.toStored(dest), sha256File(dest)]);
      this.app.audit(user, 'inward.attachment', 'inward', id, { file: this.app.toStored(dest) });
    });
    this.app.emitChange('inward');
    return this.get(id);
  }

  removeAttachment(attId) {
    const user = this.app.require('records.cancelDelete');
    const a = this.db.get('SELECT * FROM inward_attachments WHERE id=?', [attId]);
    if (!a) throw new UserError('Attachment not found.');
    this.db.run("UPDATE inward_attachments SET deleted_at=datetime('now','localtime') WHERE id=?", [attId]);
    this.app.audit(user, 'inward.attachment.remove', 'inward', a.inward_id, { file: a.file_path });
    this.app.emitChange('inward');
  }

  softDelete(id, reason) {
    const user = this.app.require('records.cancelDelete');
    if (!reason) throw new UserError('Please give a reason.');
    this.db.run("UPDATE inward SET deleted_at=datetime('now','localtime') WHERE id=?", [id]);
    this.app.audit(user, 'inward.delete', 'inward', id, { reason });
    this.app.emitChange('inward');
  }

  restore(id) {
    const user = this.app.require('records.cancelDelete');
    this.db.run('UPDATE inward SET deleted_at=NULL WHERE id=?', [id]);
    this.app.audit(user, 'inward.restore', 'inward', id);
    this.app.emitChange('inward');
    return this.get(id);
  }

  /** Draft an outgoing reply linked to this inward letter. */
  createReply(id) {
    const r = this.get(id);
    const draft = this.app.services.letters.saveDraft({
      inward_id: id, category_id: r.category_id, recipient_office: r.sender_office, recipient_name: r.sender_name, recipient_designation: r.sender_designation,
      subject: r.subject ? `Reply: ${r.subject}` : '', reference_no: r.reference_no,
    });
    if (['Received', 'Pending Review', 'Assigned'].includes(r.status)) this.setStatus(id, 'In Progress');
    return draft;
  }

  history(id) {
    const r = this.get(id);
    const audit = this.db.all("SELECT * FROM audit_log WHERE entity='inward' AND entity_id=? ORDER BY id", [id]);
    return { inward: r, replies: r.replies, audit };
  }
}

Inward.STATUSES = STATUSES;
Inward.CHANNELS = CHANNELS;
module.exports = Inward;
