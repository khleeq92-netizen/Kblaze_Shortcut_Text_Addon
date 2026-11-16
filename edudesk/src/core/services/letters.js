'use strict';
/**
 * Letter lifecycle: draft -> (approval) -> Word document -> finalize & archive (DOCX + PDF)
 * -> dispatch -> delivered / acknowledged -> closed. Also cancellation, revisions,
 * manual number overrides and externally prepared letters.
 */
const fs = require('fs');
const path = require('path');
const docx = require('../docx');
const { verifyPdf, isLockedByEditor } = require('../converter');
const Recipients = require('./recipients');
const {
  UserError, todayISO, nowLocal, formatDate, academicYear, sanitizeFileName, shortSubject,
  uniquePath, sha256File, sha256Buffer, ensureDir, safeCopy, fileSize, json, applyFilePattern,
} = require('../util');

const EDITABLE_STATUSES = ['Draft', 'Awaiting Approval', 'Approved', 'Generated'];
const DISPATCH_MODES = ['Hand Delivery', 'Registered Post', 'Speed Post', 'Courier', 'Email', 'Other'];
const DISPATCH_STATUSES = ['Ready for Dispatch', 'Dispatched', 'Delivered', 'Acknowledgement Pending', 'Closed', 'Cancelled'];

const DRAFT_FIELDS = [
  'category_id', 'subcategory_id', 'template_id', 'recipient_id', 'recipient_office', 'recipient_name', 'recipient_designation',
  'recipient_department', 'recipient_address', 'subject', 'letter_date', 'reference_no', 'body', 'summary', 'enclosures',
  'remarks', 'signatory_name', 'signatory_designation', 'language', 'inward_id',
];

class Letters {
  constructor(app) { this.app = app; this.db = app.db; }

  // ------------------------------------------------------------------ queries
  get(id) {
    const l = this.db.get('SELECT * FROM letters WHERE id = ?', [id]);
    if (!l) throw new UserError('Letter not found.');
    l.extra = json(l.extra, {});
    l.attachments = this.db.all('SELECT * FROM letter_attachments WHERE letter_id = ? AND deleted_at IS NULL ORDER BY id', [id])
      .map((a) => ({ ...a, abs_path: this.app.resolve(a.file_path), exists: fs.existsSync(this.app.resolve(a.file_path)) }));
    l.versions = this.db.all('SELECT * FROM letter_versions WHERE letter_id = ? ORDER BY version DESC', [id])
      .map((v) => ({ ...v, docx_abs: this.app.resolve(v.docx_path), pdf_abs: this.app.resolve(v.pdf_path) }));
    l.docx_abs = this.app.resolve(l.docx_path);
    l.pdf_abs = this.app.resolve(l.pdf_path);
    l.work_abs = this.app.resolve(l.work_docx_path);
    l.archive_abs = this.app.resolve(l.archive_dir);
    l.inward = l.inward_id ? this.db.get('SELECT id, inward_no, subject, sender_office, date_received, status FROM inward WHERE id = ?', [l.inward_id]) : null;
    l.udise = this.db.get('SELECT * FROM udise_submissions WHERE letter_id = ?', [id]) || null;
    if (l.udise) {
      l.udise.items = this.db.all('SELECT id, student_name, editable_pdf, flat_pdf FROM udise_items WHERE submission_id = ?', [l.udise.id])
        .map((it) => ({ ...it, flat_abs: this.app.resolve(it.flat_pdf), editable_abs: this.app.resolve(it.editable_pdf) }));
    }
    return l;
  }

  list({ statuses, q, categoryId, includeDeleted = false, limit = 500 } = {}) {
    const where = [];
    const params = [];
    if (!includeDeleted) where.push('deleted_at IS NULL');
    if (statuses && statuses.length) { where.push(`status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
    if (categoryId) { where.push('category_id = ?'); params.push(categoryId); }
    if (q) {
      where.push('(subject LIKE ? OR recipient_office LIKE ? OR recipient_name LIKE ? OR summary LIKE ? OR outward_no LIKE ?)');
      for (let i = 0; i < 5; i++) params.push(`%${q}%`);
    }
    return this.db.all(`SELECT id, letter_kind, status, archive_status, pdf_status, dispatch_status, category_name, subcategory_name, subject, recipient_office,
      recipient_designation, letter_date, outward_no, created_at, updated_at, deleted_at FROM letters ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY COALESCE(updated_at, created_at) DESC LIMIT ?`, [...params, limit]);
  }

  // ------------------------------------------------------------------ drafts
  saveDraft(input) {
    const user = this.app.require(input.id ? 'letters.editDraft' : 'letters.create');
    const now = nowLocal();
    return this.db.tx(() => {
      let existing = null;
      if (input.id) {
        existing = this.db.get('SELECT * FROM letters WHERE id = ?', [input.id]);
        if (!existing) throw new UserError('Letter not found.');
        if (!EDITABLE_STATUSES.includes(existing.status)) throw new UserError(`A letter that is "${existing.status}" cannot be edited. Use "Create revision" instead.`);
      }
      const v = {};
      for (const f of DRAFT_FIELDS) if (f in input) v[f] = input[f] === '' ? null : input[f];
      if (v.letter_date === undefined && !existing) v.letter_date = todayISO();
      if (v.language === undefined && !existing) v.language = this.app.settings.get('letter').language;
      if (!existing) {
        const ls = this.app.settings.get('letter');
        if (v.signatory_name == null) v.signatory_name = ls.signatoryName || this.app.settings.get('college').principal_name || null;
        if (v.signatory_designation == null) v.signatory_designation = ls.signatoryDesignation || this.app.settings.get('college').principal_designation || null;
        if (v.template_id == null && ls.defaultTemplateId) v.template_id = ls.defaultTemplateId;
      }
      if ('enclosures' in v) v.enclosure_count = String(v.enclosures || '').split('\n').map((s) => s.trim()).filter(Boolean).length;
      if ('category_id' in v || 'subcategory_id' in v) Object.assign(v, this.categorySnapshot(v.category_id ?? existing?.category_id, v.subcategory_id ?? existing?.subcategory_id));
      if (v.letter_date) v.academic_year = academicYear(v.letter_date, this.app.settings.get('academic').startMonth);
      let id;
      if (existing) {
        const keys = Object.keys(v);
        if (keys.length) this.db.run(`UPDATE letters SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`, [...keys.map((k) => v[k]), now, existing.id]);
        id = existing.id;
        if (existing.status === 'Generated' && keys.some((k) => !['remarks', 'summary'].includes(k))) {
          this.db.run('UPDATE letters SET extra=? WHERE id=?', [JSON.stringify({ ...json(existing.extra, {}), workStale: true }), id]);
        }
        this.app.audit(user, 'letter.update', 'letter', id, { fields: keys });
      } else {
        const keys = Object.keys(v);
        id = this.db.run(`INSERT INTO letters(${[...keys, 'status', 'created_by', 'created_at'].join(', ')}) VALUES(${[...keys, 1, 2, 3].map(() => '?').join(',')})`,
          [...keys.map((k) => v[k]), 'Draft', user, now]).lastInsertRowid;
        this.app.audit(user, 'letter.create', 'letter', id, { subject: v.subject });
      }
      this.app.emitChange('letters');
      return this.get(id);
    });
  }

  categorySnapshot(categoryId, subcategoryId) {
    const c = categoryId ? this.db.get('SELECT name, folder_name, code FROM categories WHERE id=?', [categoryId]) : null;
    const s = subcategoryId ? this.db.get('SELECT name FROM subcategories WHERE id=?', [subcategoryId]) : null;
    return { category_name: c ? c.name : null, category_folder: c ? c.folder_name : null, subcategory_name: s ? s.name : null };
  }

  /** Start a new draft from an existing letter (any status). Numbers are never copied. */
  copyFrom(id) {
    const src = this.get(id);
    const input = {};
    for (const f of DRAFT_FIELDS) input[f] = src[f];
    input.letter_date = todayISO();
    input.inward_id = null;
    input.reference_no = null;
    return this.saveDraft(input);
  }

  submitForApproval(id) {
    const user = this.app.require('letters.editDraft');
    const l = this.get(id);
    if (l.status !== 'Draft') throw new UserError('Only drafts can be sent for approval.');
    this.validateForGeneration(l);
    this.db.tx(() => {
      this.db.run("UPDATE letters SET status='Awaiting Approval', updated_at=? WHERE id=?", [nowLocal(), id]);
      this.app.audit(user, 'letter.submitApproval', 'letter', id);
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  approve(id) {
    const user = this.app.require('letters.approve');
    const l = this.get(id);
    if (!['Awaiting Approval', 'Draft'].includes(l.status)) throw new UserError(`A letter that is "${l.status}" cannot be approved.`);
    this.db.tx(() => {
      this.db.run("UPDATE letters SET status='Approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?", [user, nowLocal(), nowLocal(), id]);
      this.app.audit(user, 'letter.approve', 'letter', id);
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  sendBack(id, reason) {
    const user = this.app.require('letters.approve');
    const l = this.get(id);
    if (!['Awaiting Approval', 'Approved'].includes(l.status)) throw new UserError('Only letters awaiting approval can be sent back.');
    this.db.tx(() => {
      this.db.run("UPDATE letters SET status='Draft', approved_by=NULL, approved_at=NULL, updated_at=? WHERE id=?", [nowLocal(), id]);
      this.app.audit(user, 'letter.sendBack', 'letter', id, { reason });
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  deleteDraft(id) {
    const user = this.app.require('records.cancelDelete');
    const l = this.get(id);
    if (l.outward_no) throw new UserError('This letter already has an outward number. Cancel it instead; the number stays in the register.');
    this.db.tx(() => {
      this.db.run("UPDATE letters SET deleted_at=datetime('now','localtime'), status='Draft' WHERE id=?", [id]);
      this.app.audit(user, 'letter.delete', 'letter', id, { subject: l.subject });
    });
    this.app.emitChange('letters');
  }

  restore(id) {
    const user = this.app.require('records.cancelDelete');
    this.db.tx(() => {
      this.db.run('UPDATE letters SET deleted_at=NULL WHERE id=?', [id]);
      this.app.audit(user, 'letter.restore', 'letter', id);
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  // ------------------------------------------------------------------ placeholders
  values(l, { outwardNumber } = {}) {
    const c = this.app.settings.get('college');
    const ls = this.app.settings.get('letter');
    const enclosures = String(l.enclosures || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const inward = l.inward_id ? this.db.get('SELECT * FROM inward WHERE id=?', [l.inward_id]) : null;
    const extra = typeof l.extra === 'string' ? json(l.extra, {}) : (l.extra || {});
    const vals = {
      college_name: c.name, college_address: c.address, college_code: c.college_code, udise_code: c.udise_code, index_no: c.index_no,
      affiliation: c.affiliation, college_phone: c.phone, college_email: c.email, principal_name: c.principal_name, principal_designation: c.principal_designation,
      outward_number: outwardNumber !== undefined ? outwardNumber : (l.outward_no || ''),
      letter_date: formatDate(l.letter_date, ls.dateFormat),
      academic_year: l.academic_year || academicYear(l.letter_date, this.app.settings.get('academic').startMonth),
      recipient_name: l.recipient_name || '', recipient_designation: l.recipient_designation || '', recipient_office: l.recipient_office || '',
      recipient_department: l.recipient_department || '', recipient_address: l.recipient_address || '', recipient_block: c.block || '',
      subject: l.subject || '', reference: l.reference_no || '', letter_body: l.body || '', summary: l.summary || '',
      enclosures: enclosures.map((e, i) => `${i + 1}. ${e}`).join('\n'), enclosure_count: String(enclosures.length || ''),
      signatory_name: l.signatory_name || '', signatory_designation: l.signatory_designation || '', remarks: l.remarks || '',
      inward_reference: inward ? `${inward.reference_no ? inward.reference_no + ', ' : ''}${inward.sender_office || ''} letter received on ${formatDate(inward.date_received, ls.dateFormat)} (Inward No. ${inward.inward_no})` : '',
      student_count: extra.studentCount ? String(extra.studentCount) : '',
    };
    for (const o of c.other || []) if (o && o.key) vals[String(o.key).replace(/[^\w]/g, '_')] = o.value || '';
    // placeholders typed inside the subject / body / summary text are expanded too
    const expand = (s) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vals && !['letter_body', 'subject', 'summary'].includes(k) ? vals[k] : m));
    vals.letter_body = expand(vals.letter_body);
    vals.subject = expand(vals.subject);
    vals.summary = expand(vals.summary);
    return vals;
  }

  validateForGeneration(l) {
    const missing = [];
    if (!l.subject || !String(l.subject).trim()) missing.push('Subject');
    if (!l.letter_date) missing.push('Letter date');
    if (!l.recipient_office && !l.recipient_designation && !l.recipient_name) missing.push('Recipient');
    if (!l.template_id) missing.push('Letter template');
    if (!l.category_id) missing.push('Category');
    if (missing.length) throw new UserError(`Please complete: ${missing.join(', ')}.`);
  }

  templateFile(l) {
    const t = this.db.get('SELECT * FROM templates WHERE id=?', [l.template_id]);
    if (!t) throw new UserError('The selected template no longer exists. Choose another template.');
    const versionId = l.template_version_id && l.status !== 'Draft' ? l.template_version_id : t.current_version_id;
    return this.app.services.templates.versionPath(versionId);
  }

  /** Render the letter to a temporary DOCX (and PDF when a converter exists) for preview. */
  async preview(id) {
    const l = this.get(id);
    const tf = this.templateFile(l);
    const buf = docx.renderTemplate(fs.readFileSync(tf.path), this.values(l, { outwardNumber: l.outward_no || '(assigned when the Word document is generated)' }));
    const dir = ensureDir(path.join(this.app.workDir(), '_preview'));
    const stamp = Date.now();
    const docxPath = path.join(dir, `preview_${id}_${stamp}.docx`);
    fs.writeFileSync(docxPath, buf);
    const text = docx.extractText(buf);
    const pdfPath = path.join(dir, `preview_${id}_${stamp}.pdf`);
    const conv = await this.app.converter.toPdf(docxPath, pdfPath);
    return { docxPath, pdfPath: conv.ok ? pdfPath : null, text, conversionError: conv.ok ? null : conv.error };
  }

  // ------------------------------------------------------------------ numbering
  numberExists() {
    return (formatted, seq, schemeId, pk, ck) =>
      !!this.db.get('SELECT 1 FROM letters WHERE outward_no = ?', [formatted]) ||
      !!this.db.get('SELECT 1 FROM letters WHERE outward_scheme_id=? AND outward_period=? AND outward_category_key=? AND outward_seq=?', [schemeId, pk, ck, seq]);
  }

  /** Reserve an outward number inside the caller's transaction. */
  reserveNumber(l, user) {
    if (l.outward_no) return l.outward_no;
    const cat = l.category_id ? this.db.get('SELECT code FROM categories WHERE id=?', [l.category_id]) : null;
    const a = this.app.numbering.allocate('outward', { dateISO: l.letter_date || todayISO(), categoryCode: cat && cat.code, exists: this.numberExists() });
    this.db.run(`UPDATE letters SET outward_no=?, outward_seq=?, outward_scheme_id=?, outward_period=?, outward_category_key=?, academic_year=?, number_reserved_at=? WHERE id=?`,
      [a.formatted, a.seq, a.schemeId, a.periodKey, a.categoryKey, a.academicYear, nowLocal(), l.id]);
    this.app.audit(user, 'outward.reserve', 'letter', l.id, { outward_no: a.formatted });
    return a.formatted;
  }

  overrideNumber(id, newNumber, reason) {
    const user = this.app.require('numbering.override');
    newNumber = String(newNumber || '').trim();
    if (!newNumber) throw new UserError('Enter the outward number to use.');
    if (!reason || !String(reason).trim()) throw new UserError('A reason is required for a manual number override.');
    const l = this.get(id);
    if (['Cancelled'].includes(l.status)) throw new UserError('Cancelled letters keep their original number.');
    if (l.archive_status === 'Complete') throw new UserError('The number of a finalized letter cannot be changed. Cancel it and create a new letter, or create a revision.');
    return this.db.tx(() => {
      if (this.db.get('SELECT id FROM letters WHERE outward_no=? AND id<>?', [newNumber, id])) throw new UserError(`Outward number ${newNumber} is already used in the register.`);
      this.db.run(`UPDATE letters SET outward_no=?, outward_seq=NULL, number_override=1, number_reserved_at=COALESCE(number_reserved_at, ?),
        academic_year=COALESCE(academic_year, ?), extra=? WHERE id=?`,
      [newNumber, nowLocal(), academicYear(l.letter_date || todayISO(), this.app.settings.get('academic').startMonth), JSON.stringify({ ...l.extra, workStale: !!l.work_docx_path }), id]);
      this.app.audit(user, 'outward.override', 'letter', id, { from: l.outward_no, to: newNumber, reason });
      this.app.emitChange('letters');
      return this.get(id);
    });
  }

  // ------------------------------------------------------------------ Word document
  workPath(l) {
    const base = this.fileBase(l);
    return path.join(this.app.workDir(), String(l.id), `${base}.docx`);
  }

  workStatus(id) {
    const l = this.get(id);
    const p = l.work_abs;
    if (!p || !fs.existsSync(p)) return { exists: false };
    const sha = sha256File(p);
    return {
      exists: true, path: p, locked: isLockedByEditor(p), modified: sha !== l.work_generated_sha,
      savedAt: fs.statSync(p).mtime.toISOString(), size: fileSize(p), stale: !!l.extra.workStale,
    };
  }

  /**
   * Generate the editable Word document. Reserves the outward number first (unless the
   * settings defer numbering to finalisation). Never overwrites a document the user
   * has edited unless `confirmReplace` is given, and even then keeps a copy.
   */
  async generate(id, { confirmReplace = false } = {}) {
    const user = this.app.require('letters.editDraft');
    let l = this.get(id);
    if (!EDITABLE_STATUSES.includes(l.status)) throw new UserError(`The Word document of a "${l.status}" letter cannot be regenerated.`);
    this.validateForGeneration(l);
    const wf = this.app.settings.get('workflow');
    if (wf.approvalRequired && !['Approved', 'Generated'].includes(l.status)) throw new UserError('This letter must be approved before the Word document is generated.');

    const existing = l.work_abs && fs.existsSync(l.work_abs) ? l.work_abs : null;
    if (existing) {
      if (isLockedByEditor(existing)) throw new UserError('The Word document is open in Word. Save and close it before regenerating.', 'WORK_LOCKED');
      const modified = sha256File(existing) !== l.work_generated_sha;
      if (modified && !confirmReplace) {
        return { needsConfirm: 'replaceEdited', message: 'The Word document has been edited since it was generated. Regenerating will replace those edits (a copy of the edited file will be kept in the work folder).' };
      }
    }
    const tf = this.templateFile(l);
    this.db.tx(() => {
      if (wf.assignNumberAt !== 'finalize') this.reserveNumber(l, user);
    });
    l = this.get(id);
    const buf = docx.renderTemplate(fs.readFileSync(tf.path), this.values(l));
    const target = this.workPath(l);
    ensureDir(path.dirname(target));
    if (existing) {
      const keep = uniquePath(path.join(path.dirname(existing), `${path.basename(existing, '.docx')}_previous_${Date.now()}.docx`));
      fs.renameSync(existing, keep);
    }
    const finalTarget = uniquePath(target);
    fs.writeFileSync(finalTarget, buf, { flag: 'wx' });
    const sha = sha256Buffer(buf);
    this.db.tx(() => {
      this.db.run(`UPDATE letters SET status='Generated', template_version_id=?, work_docx_path=?, work_generated_at=?, work_generated_sha=?, extra=?, updated_at=? WHERE id=?`,
        [tf.version.id, this.app.toStored(finalTarget), nowLocal(), sha, JSON.stringify({ ...l.extra, workStale: false }), nowLocal(), id]);
      this.app.audit(user, 'letter.generateDocx', 'letter', id, { file: path.basename(finalTarget), templateVersion: tf.version.version, outward_no: l.outward_no });
    });
    this.app.emitChange('letters');
    return { ok: true, letter: this.get(id), path: finalTarget };
  }

  async openInWord(id) {
    const l = this.get(id);
    if (!l.work_abs || !fs.existsSync(l.work_abs)) throw new UserError('Generate the Word document first.');
    return this.app.converter.openInWord(l.work_abs, this.app.hooks.shellOpen);
  }

  // ------------------------------------------------------------------ archive helpers
  fileBase(l, { version } = {}) {
    const a = this.app.settings.get('archive');
    const scheme = l.outward_scheme_id ? this.db.get('SELECT digits FROM numbering_schemes WHERE id=?', [l.outward_scheme_id]) : null;
    const seq = l.outward_seq != null ? String(l.outward_seq).padStart(scheme ? scheme.digits : 3, '0') : null;
    const base = applyFilePattern(a.fileNamePattern, {
      TYPE: 'OUT',
      SEQ: seq || sanitizeFileName(l.outward_no || `DRAFT_${l.id}`, 40),
      OUTNO: sanitizeFileName(l.outward_no || `DRAFT_${l.id}`, 40),
      AY: l.academic_year || academicYear(l.letter_date || todayISO(), this.app.settings.get('academic').startMonth),
      DATE: formatDate(l.letter_date || todayISO(), a.fileDateFormat),
      SUBJECT: shortSubject(l.subject),
      CATEGORY: l.category_folder || 'General',
    });
    return sanitizeFileName(base, 150) + (version && version > 1 ? `_v${version}` : '');
  }

  archiveDirFor(l) {
    const ay = l.academic_year || academicYear(l.letter_date || todayISO(), this.app.settings.get('academic').startMonth);
    const folder = l.category_folder || 'General';
    const base = path.join(this.app.documentsRoot(), ay, 'Outward', sanitizeFileName(folder, 40));
    if (l.letter_kind === 'udise_s02' || l.letter_kind === 'udise_s03') {
      const seq = l.outward_seq != null ? String(l.outward_seq).padStart(3, '0') : sanitizeFileName(l.outward_no, 40);
      return path.join(base, `OUT_${seq}`);
    }
    return base;
  }

  archiveNames(l, version) {
    if (l.letter_kind === 'udise_s02' || l.letter_kind === 'udise_s03') {
      const b = version > 1 ? `Covering_Letter_v${version}` : 'Covering_Letter';
      return { docx: `${b}.docx`, pdf: `${b}.pdf` };
    }
    const b = this.fileBase(l, { version });
    return { docx: `${b}.docx`, pdf: `${b}.pdf` };
  }

  // ------------------------------------------------------------------ finalize & archive
  /**
   * Finalize & Archive (mandatory dual-format archiving).
   * Returns { ok:true, ... } only after the DOCX and the PDF made from that exact DOCX
   * exist, are non-empty, are readable and their checksums match.
   */
  async finalize(id, { confirmUnmodified = false } = {}) {
    const user = this.app.require('letters.finalize');
    let l = this.get(id);
    if (l.archive_status === 'Complete' && !l.extra.revisionPending) throw new UserError('This letter is already finalized and archived.');
    if (l.archive_status === 'Incomplete') return this.retryPdf(id);
    const revising = !!l.extra.revisionPending;
    if (!revising && l.status !== 'Generated') throw new UserError('Generate the Word document and review it in Word before finalizing.');
    if (!revising && l.extra.workStale) {
      throw new UserError('The letter details were changed after the Word document was generated. Regenerate the Word document (or undo the changes) before finalizing.', 'WORK_STALE');
    }
    const work = l.work_abs;
    if (!work || !fs.existsSync(work)) throw new UserError('The Word document could not be found in the work folder. Generate it again.', 'WORK_MISSING');
    if (isLockedByEditor(work)) {
      throw new UserError('The document is still open in Microsoft Word. Save your changes, close the document in Word, and then click Finalize & Archive again.', 'WORK_LOCKED');
    }
    if (fileSize(work) <= 0) throw new UserError('The Word document is empty. Open it in Word and save it again.', 'WORK_EMPTY');
    let workBuf = fs.readFileSync(work);
    try { docx.verifyDocx(workBuf); } catch (e) { throw new UserError(`The saved Word document cannot be read (${e.message}). Open it in Word and save it again as .docx.`, 'WORK_CORRUPT'); }
    const workSha = sha256Buffer(workBuf);
    if (!revising && workSha === l.work_generated_sha && !confirmUnmodified) {
      return { needsConfirm: 'unmodified', message: 'No changes were saved in Word since the document was generated. Finalize the generated document as it is?' };
    }
    if (revising && workSha === l.extra.revisionBaseSha && !confirmUnmodified) {
      return { needsConfirm: 'unmodified', message: 'The revision has no saved changes compared with the archived version. Archive it anyway as a new version?' };
    }

    // Late numbering (assignNumberAt = finalize): reserve and stamp the number into the edited file.
    if (!l.outward_no) {
      this.db.tx(() => this.reserveNumber(l, user));
      l = this.get(id);
      workBuf = docx.fillSelected(workBuf, { outward_number: l.outward_no });
      fs.writeFileSync(work, workBuf);
    }

    const version = revising ? l.extra.revisionPending.version : 1;
    const dir = ensureDir(l.archive_abs && revising ? l.archive_abs : this.archiveDirFor(l));
    const names = this.archiveNames(l, version);
    const docxTarget = uniquePath(path.join(dir, names.docx));
    const pdfTarget = uniquePath(path.join(dir, docxTarget.slice(dir.length + 1).replace(/\.docx$/i, '.pdf')));

    // Step: save the final DOCX into the archive (never overwriting anything).
    fs.writeFileSync(docxTarget, workBuf, { flag: 'wx' });
    const docxSha = sha256File(docxTarget);
    if (docxSha !== sha256Buffer(workBuf)) throw new Error('Archived DOCX does not match the work copy.');

    this.db.tx(() => {
      const upd = revising
        ? ['UPDATE letters SET pdf_status=?, extra=?, updated_at=? WHERE id=?', ['Pending', JSON.stringify({ ...l.extra, revisionDocx: this.app.toStored(docxTarget), revisionDocxSha: docxSha }), nowLocal(), id]]
        : [`UPDATE letters SET archive_dir=?, docx_path=?, docx_sha=?, archive_status='Incomplete', pdf_status='Pending', current_version=1, updated_at=? WHERE id=?`,
          [this.app.toStored(dir), this.app.toStored(docxTarget), docxSha, nowLocal(), id]];
      this.db.run(upd[0], upd[1]);
      this.app.audit(user, revising ? 'letter.revision.docxSaved' : 'letter.docxArchived', 'letter', id, { docx: this.app.toStored(docxTarget), sha: docxSha });
    });

    return this.completePdf(id, { docxTarget, pdfTarget, docxSha, version, revising, user });
  }

  async completePdf(id, { docxTarget, pdfTarget, docxSha, version, revising, user }) {
    const conv = await this.app.converter.toPdf(docxTarget, pdfTarget);
    const l = this.get(id);
    if (!conv.ok) {
      this.db.tx(() => {
        this.db.run('UPDATE letters SET pdf_status=?, pdf_error=?, updated_at=? WHERE id=?', ['Failed', conv.error, nowLocal(), id]);
        this.app.audit(user, 'letter.pdfFailed', 'letter', id, { error: conv.error });
      });
      this.app.emitChange('letters');
      return { ok: false, stage: 'pdf', error: conv.error, letter: this.get(id) };
    }
    const verification = await this.verifyPair(docxTarget, pdfTarget, docxSha);
    if (!verification.ok) {
      this.db.tx(() => {
        this.db.run('UPDATE letters SET pdf_status=?, pdf_error=?, updated_at=? WHERE id=?', ['Failed', verification.error, nowLocal(), id]);
        this.app.audit(user, 'letter.verifyFailed', 'letter', id, verification);
      });
      // keep the unverified PDF out of the archive
      try { fs.renameSync(pdfTarget, uniquePath(pdfTarget.replace(/\.pdf$/i, '_UNVERIFIED.pdf'))); } catch (_) { /* ignore */ }
      this.app.emitChange('letters');
      return { ok: false, stage: 'verify', error: verification.error, letter: this.get(id) };
    }
    const pdfSha = sha256File(pdfTarget);
    this.db.tx(() => {
      if (revising) {
        const rp = l.extra.revisionPending;
        this.db.run(`UPDATE letters SET docx_path=?, pdf_path=?, docx_sha=?, pdf_sha=?, pdf_source_sha=?, pdf_status='Complete', pdf_error=NULL, current_version=?, extra=?, updated_at=? WHERE id=?`,
          [this.app.toStored(docxTarget), this.app.toStored(pdfTarget), docxSha, pdfSha, docxSha, version,
            JSON.stringify({ ...l.extra, revisionPending: null, revisionDocx: null, revisionDocxSha: null, revisionBaseSha: null, workStale: false }), nowLocal(), id]);
        this.db.run('INSERT INTO letter_versions(letter_id, version, docx_path, pdf_path, docx_sha, pdf_sha, reason, revised_by) VALUES(?,?,?,?,?,?,?,?)',
          [id, version, this.app.toStored(docxTarget), this.app.toStored(pdfTarget), docxSha, pdfSha, rp.reason, rp.by]);
        this.app.audit(user, 'letter.revision.archived', 'letter', id, { version, reason: rp.reason });
      } else {
        this.db.run(`UPDATE letters SET pdf_path=?, pdf_sha=?, pdf_source_sha=?, pdf_status='Complete', pdf_error=NULL, archive_status='Complete', status='Finalized',
          dispatch_status=COALESCE(dispatch_status, 'Ready for Dispatch'), finalized_at=?, finalized_by=?, updated_at=? WHERE id=?`,
        [this.app.toStored(pdfTarget), pdfSha, docxSha, nowLocal(), user, nowLocal(), id]);
        this.db.run('INSERT INTO letter_versions(letter_id, version, docx_path, pdf_path, docx_sha, pdf_sha, reason, revised_by) VALUES(?,?,?,?,?,?,?,?)',
          [id, 1, this.app.toStored(docxTarget), this.app.toStored(pdfTarget), docxSha, pdfSha, 'Original', user]);
        if (l.inward_id) this.db.run("UPDATE inward SET status='Replied', updated_at=datetime('now','localtime') WHERE id=? AND status NOT IN ('Completed','Archived')", [l.inward_id]);
        this.app.audit(user, 'letter.finalized', 'letter', id, { outward_no: l.outward_no, docx: this.app.toStored(docxTarget), pdf: this.app.toStored(pdfTarget), engine: conv.engine });
      }
    });
    if (!revising && (l.letter_kind === 'udise_s02' || l.letter_kind === 'udise_s03')) {
      await this.app.services.udise.archiveForLetter(id, path.dirname(docxTarget));
    }
    this.retireWorkCopy(l);
    this.app.emitChange('letters');
    const fin = this.get(id);
    return {
      ok: true, engine: conv.engine, pages: verification.pages, letter: fin,
      confirmation: {
        outward_no: fin.outward_no, letter_date: fin.letter_date, recipient: [fin.recipient_designation, fin.recipient_office].filter(Boolean).join(', '),
        subject: fin.subject, docx: docxTarget, pdf: pdfTarget, folder: path.dirname(docxTarget), version,
      },
    };
  }

  /** Verify both files exist, are non-empty, readable, and the PDF came from this DOCX. */
  async verifyPair(docxPath, pdfPath, expectedDocxSha) {
    if (fileSize(docxPath) <= 0) return { ok: false, error: 'Archived DOCX is missing or empty.' };
    if (fileSize(pdfPath) <= 0) return { ok: false, error: 'PDF is missing or empty.' };
    try { docx.verifyDocx(fs.readFileSync(docxPath)); } catch (e) { return { ok: false, error: `Archived DOCX cannot be read: ${e.message}` }; }
    if (sha256File(docxPath) !== expectedDocxSha) return { ok: false, error: 'Archived DOCX changed during PDF creation.' };
    const v = await verifyPdf(pdfPath);
    if (!v.ok) return v;
    return { ok: true, pages: v.pages };
  }

  /** Retry PDF creation for a letter whose DOCX is archived but whose PDF failed. */
  async retryPdf(id) {
    const user = this.app.require('letters.finalize');
    const l = this.get(id);
    const revising = !!(l.extra.revisionPending && l.extra.revisionDocx);
    const docxStored = revising ? l.extra.revisionDocx : l.docx_path;
    const docxSha = revising ? l.extra.revisionDocxSha : l.docx_sha;
    if (!docxStored) throw new UserError('There is no archived Word document for this letter yet.');
    if (!revising && l.archive_status === 'Complete') throw new UserError('This letter is already completely archived.');
    const docxTarget = this.app.resolve(docxStored);
    if (!fs.existsSync(docxTarget)) throw new UserError(`The archived Word document is missing: ${docxTarget}`);
    if (sha256File(docxTarget) !== docxSha) throw new UserError('The archived Word document was modified outside EduDesk. Create a revision instead.');
    const pdfTarget = uniquePath(docxTarget.replace(/\.docx$/i, '.pdf'));
    this.app.audit(user, 'letter.pdfRetry', 'letter', id);
    return this.completePdf(id, { docxTarget, pdfTarget, docxSha, version: revising ? l.extra.revisionPending.version : 1, revising, user });
  }

  retireWorkCopy(l) {
    try {
      const dir = path.join(this.app.workDir(), String(l.id));
      if (!fs.existsSync(dir)) return;
      const dest = uniquePath(path.join(this.app.workDir(), '_archived', `${l.id}_${Date.now()}`));
      ensureDir(path.dirname(dest));
      fs.renameSync(dir, dest);
      this.db.run('UPDATE letters SET work_docx_path=NULL WHERE id=?', [l.id]);
    } catch (e) {
      this.app.log('warn', 'could not retire work copy', { id: l.id, error: e.message });
    }
  }

  // ------------------------------------------------------------------ revisions
  /** Start a revision of a finalized letter: the archived DOCX is copied to the work folder. */
  startRevision(id, reason) {
    const user = this.app.require('letters.revise');
    if (!reason || !String(reason).trim()) throw new UserError('Please enter the reason for revising this letter.');
    const l = this.get(id);
    if (l.archive_status !== 'Complete') throw new UserError('Only completely archived letters can be revised.');
    if (l.status === 'Cancelled') throw new UserError('Cancelled letters cannot be revised.');
    if (l.extra.revisionPending) throw new UserError('A revision of this letter is already in progress.');
    const version = (l.current_version || 1) + 1;
    const work = uniquePath(path.join(this.app.workDir(), String(id), `${this.fileBase(l, { version })}.docx`));
    ensureDir(path.dirname(work));
    fs.copyFileSync(l.docx_abs, work, fs.constants.COPYFILE_EXCL);
    const baseSha = sha256File(work);
    this.db.tx(() => {
      this.db.run('UPDATE letters SET work_docx_path=?, work_generated_sha=?, work_generated_at=?, extra=?, updated_at=? WHERE id=?',
        [this.app.toStored(work), baseSha, nowLocal(), JSON.stringify({ ...l.extra, revisionPending: { version, reason: reason.trim(), by: user, at: nowLocal() }, revisionBaseSha: baseSha }), nowLocal(), id]);
      this.app.audit(user, 'letter.revision.start', 'letter', id, { version, reason });
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  discardRevision(id) {
    const user = this.app.require('letters.revise');
    const l = this.get(id);
    if (!l.extra.revisionPending) throw new UserError('No revision is in progress.');
    if (l.extra.revisionDocx) throw new UserError('The revised document is already archived; retry the PDF instead of discarding.');
    this.retireWorkCopy(l);
    this.db.tx(() => {
      this.db.run('UPDATE letters SET extra=? WHERE id=?', [JSON.stringify({ ...l.extra, revisionPending: null, revisionBaseSha: null }), id]);
      this.app.audit(user, 'letter.revision.discard', 'letter', id);
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  // ------------------------------------------------------------------ cancellation
  cancel(id, reason) {
    const user = this.app.require('records.cancelDelete');
    if (!reason || !String(reason).trim()) throw new UserError('Please enter the reason for cancelling.');
    const l = this.get(id);
    if (l.status === 'Cancelled') throw new UserError('This letter is already cancelled.');
    if (!l.outward_no) return this.deleteDraft(id);
    this.db.tx(() => {
      this.db.run("UPDATE letters SET status='Cancelled', dispatch_status='Cancelled', cancelled_at=?, cancel_reason=?, updated_at=? WHERE id=?", [nowLocal(), reason.trim(), nowLocal(), id]);
      this.app.audit(user, 'letter.cancel', 'letter', id, { outward_no: l.outward_no, reason });
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  // ------------------------------------------------------------------ dispatch
  recordDispatch(id, d) {
    const user = this.app.require('letters.dispatch');
    const l = this.get(id);
    if (l.archive_status !== 'Complete') throw new UserError('Finalize & archive the letter before recording dispatch.');
    if (l.status === 'Cancelled') throw new UserError('Cancelled letters cannot be dispatched.');
    const mode = d.dispatch_mode;
    if (mode && !DISPATCH_MODES.includes(mode)) throw new UserError('Choose a valid dispatch mode.');
    let status = d.dispatch_status || l.dispatch_status || 'Ready for Dispatch';
    if (!DISPATCH_STATUSES.includes(status)) throw new UserError('Invalid dispatch status.');
    if (['Dispatched', 'Delivered', 'Acknowledgement Pending', 'Closed'].includes(status) && (!d.dispatch_date || !mode)) {
      throw new UserError('Dispatch date and dispatch mode are required once a letter is dispatched.');
    }
    if (status === 'Delivered' && !d.delivered_date) throw new UserError('Enter the delivered date.');
    if (d.dispatch_date && l.letter_date && d.dispatch_date < l.letter_date) throw new UserError('Dispatch date cannot be earlier than the letter date.');
    if (d.delivered_date && d.dispatch_date && d.delivered_date < d.dispatch_date) throw new UserError('Delivered date cannot be earlier than the dispatch date.');
    const ack = d.ack_received_date ? 'Received' : (['Delivered', 'Acknowledgement Pending'].includes(status) ? 'Pending' : l.ack_status);
    const letterStatus = { 'Ready for Dispatch': 'Finalized', Dispatched: 'Dispatched', Delivered: 'Delivered', 'Acknowledgement Pending': 'Dispatched', Closed: 'Closed' }[status] || l.status;
    this.db.tx(() => {
      this.db.run(`UPDATE letters SET dispatch_date=?, dispatch_mode=?, tracking_no=?, courier_service=?, delivered_date=?, ack_received_date=?, dispatch_remarks=?,
        dispatch_status=?, ack_status=?, status=?, updated_at=? WHERE id=?`,
      [d.dispatch_date || null, mode || null, d.tracking_no || null, d.courier_service || null, d.delivered_date || null, d.ack_received_date || null,
        d.dispatch_remarks || null, status, ack || null, letterStatus, nowLocal(), id]);
      this.app.audit(user, 'letter.dispatch', 'letter', id, { status, mode, tracking: d.tracking_no });
    });
    this.app.emitChange('letters');
    return this.get(id);
  }

  addAttachment(id, filePath, { kind = 'supporting', label } = {}) {
    const user = this.app.require(kind === 'ack' ? 'letters.dispatch' : 'letters.editDraft');
    const l = this.get(id);
    if (!fs.existsSync(filePath)) throw new UserError('File not found.');
    const ay = l.academic_year || academicYear(l.letter_date || todayISO(), this.app.settings.get('academic').startMonth);
    let dir;
    if (kind === 'ack') dir = path.join(this.app.documentsRoot(), ay, 'Acknowledgements');
    else if (l.archive_abs) dir = path.join(l.archive_abs, 'Supporting_Documents');
    else dir = path.join(this.app.workDir(), String(id), 'Supporting_Documents');
    const prefix = kind === 'ack' ? `ACK_${sanitizeFileName(l.outward_no || 'letter' + id, 40)}_` : '';
    const dest = safeCopy(filePath, path.join(dir, prefix + sanitizeFileName(path.basename(filePath, path.extname(filePath)), 80) + path.extname(filePath).toLowerCase()));
    const sha = sha256File(dest);
    const attId = this.db.tx(() => {
      const aid = this.db.run('INSERT INTO letter_attachments(letter_id, kind, label, file_path, sha256) VALUES(?,?,?,?,?)', [id, kind, label || path.basename(filePath), this.app.toStored(dest), sha]).lastInsertRowid;
      if (kind === 'ack') {
        this.db.run("UPDATE letters SET ack_status='Received', ack_received_date=COALESCE(ack_received_date, ?), updated_at=? WHERE id=?", [todayISO(), nowLocal(), id]);
      }
      this.app.audit(user, kind === 'ack' ? 'letter.ackUploaded' : 'letter.attachment', 'letter', id, { file: this.app.toStored(dest) });
      return aid;
    });
    this.app.emitChange('letters');
    return { id: attId, path: dest };
  }

  removeAttachment(attId) {
    const user = this.app.require('records.cancelDelete');
    const a = this.db.get('SELECT * FROM letter_attachments WHERE id=?', [attId]);
    if (!a) throw new UserError('Attachment not found.');
    this.db.run("UPDATE letter_attachments SET deleted_at=datetime('now','localtime') WHERE id=?", [attId]);
    this.app.audit(user, 'letter.attachment.remove', 'letter', a.letter_id, { file: a.file_path });
    this.app.emitChange('letters');
  }

  // ------------------------------------------------------------------ external letters
  /**
   * Record a letter that was prepared outside EduDesk (typed earlier in Word, or a scanned
   * signed copy). A number is allocated and the file is archived in DOCX+PDF (DOCX input)
   * or PDF only (PDF input).
   */
  async recordExternal(input, filePath) {
    const user = this.app.require('letters.finalize');
    if (!filePath || !fs.existsSync(filePath)) throw new UserError('Choose the letter file (.docx or .pdf).');
    const ext = path.extname(filePath).toLowerCase();
    if (!['.docx', '.pdf'].includes(ext)) throw new UserError('Only .docx or .pdf files can be recorded.');
    const draft = this.saveDraft({ ...input, template_id: null });
    this.db.run("UPDATE letters SET letter_kind='external' WHERE id=?", [draft.id]);
    let l = this.get(draft.id);
    if (!l.subject || !l.category_id || (!l.recipient_office && !l.recipient_designation)) throw new UserError('Subject, category and recipient are required.');
    if (input.manual_outward_no) {
      this.db.tx(() => {
        if (this.db.get('SELECT id FROM letters WHERE outward_no=?', [input.manual_outward_no])) throw new UserError(`Outward number ${input.manual_outward_no} already exists.`);
        this.app.require('numbering.override');
        this.db.run('UPDATE letters SET outward_no=?, number_override=1, number_reserved_at=? WHERE id=?', [input.manual_outward_no, nowLocal(), l.id]);
        this.app.audit(user, 'outward.override', 'letter', l.id, { to: input.manual_outward_no, reason: input.override_reason || 'Recorded external letter' });
      });
    } else {
      this.db.tx(() => this.reserveNumber(l, user));
    }
    l = this.get(l.id);
    const dir = ensureDir(this.archiveDirFor(l));
    const names = this.archiveNames(l, 1);
    if (ext === '.docx') {
      docx.verifyDocx(fs.readFileSync(filePath));
      const work = path.join(this.app.workDir(), String(l.id), names.docx);
      ensureDir(path.dirname(work));
      fs.copyFileSync(filePath, work);
      const sha = sha256File(work);
      this.db.run("UPDATE letters SET status='Generated', work_docx_path=?, work_generated_sha=?, work_generated_at=? WHERE id=?", [this.app.toStored(work), sha, nowLocal(), l.id]);
      return this.finalize(l.id, { confirmUnmodified: true });
    }
    const pdfTarget = uniquePath(path.join(dir, names.pdf));
    fs.copyFileSync(filePath, pdfTarget, fs.constants.COPYFILE_EXCL);
    const v = await verifyPdf(pdfTarget);
    if (!v.ok) { fs.unlinkSync(pdfTarget); throw new UserError(v.error); }
    const pdfSha = sha256File(pdfTarget);
    this.db.tx(() => {
      this.db.run(`UPDATE letters SET archive_dir=?, pdf_path=?, pdf_sha=?, pdf_status='Complete', archive_status='Complete', status='Finalized', dispatch_status='Ready for Dispatch',
        current_version=1, finalized_at=?, finalized_by=?, extra=? WHERE id=?`,
      [this.app.toStored(dir), this.app.toStored(pdfTarget), pdfSha, nowLocal(), user, JSON.stringify({ ...l.extra, pdfOnly: true }), l.id]);
      this.db.run("INSERT INTO letter_versions(letter_id, version, pdf_path, pdf_sha, reason, revised_by) VALUES(?,1,?,?,'Recorded external PDF',?)", [l.id, this.app.toStored(pdfTarget), pdfSha, user]);
      this.app.audit(user, 'letter.recordExternal', 'letter', l.id, { outward_no: l.outward_no, pdfOnly: true });
    });
    this.app.emitChange('letters');
    const fin = this.get(l.id);
    return { ok: true, letter: fin, confirmation: { outward_no: fin.outward_no, letter_date: fin.letter_date, subject: fin.subject, recipient: fin.recipient_office, docx: null, pdf: pdfTarget, folder: dir } };
  }

  history(id) {
    const l = this.get(id);
    const audit = this.db.all("SELECT * FROM audit_log WHERE entity='letter' AND entity_id=? ORDER BY id", [id]).map((a) => ({ ...a, details: json(a.details, null) }));
    const replies = l.inward_id ? this.db.all('SELECT id, outward_no, subject, letter_date, status FROM letters WHERE inward_id=? AND deleted_at IS NULL ORDER BY id', [l.inward_id]) : [];
    return { letter: l, audit, inward: l.inward, relatedLetters: replies };
  }
}

Letters.DISPATCH_MODES = DISPATCH_MODES;
Letters.DISPATCH_STATUSES = DISPATCH_STATUSES;
Letters.Recipients = Recipients;
module.exports = Letters;
