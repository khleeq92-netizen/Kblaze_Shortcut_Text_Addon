'use strict';
const { UserError } = require('../util');

const FIELDS = ['office_name', 'department', 'recipient_name', 'designation', 'address', 'district', 'state', 'pin_code', 'phone', 'email', 'notes', 'category_id'];

class Recipients {
  constructor(app) { this.app = app; this.db = app.db; }

  list({ q = '', includeInactive = false, categoryId } = {}) {
    const where = [];
    const params = [];
    if (!includeInactive) where.push('r.active = 1');
    if (categoryId) { where.push('r.category_id = ?'); params.push(categoryId); }
    if (q) {
      where.push("(r.office_name LIKE ? OR r.recipient_name LIKE ? OR r.designation LIKE ? OR r.department LIKE ? OR r.district LIKE ?)");
      for (let i = 0; i < 5; i++) params.push(`%${q}%`);
    }
    return this.db.all(`SELECT r.*, c.name AS category_name FROM recipients r LEFT JOIN categories c ON c.id = r.category_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.office_name, r.designation`, params);
  }

  get(id) { return this.db.get('SELECT * FROM recipients WHERE id=?', [id]); }

  save(input) {
    const user = this.app.require('letters.create');
    if (!String(input.office_name || '').trim()) throw new UserError('Office name is required.');
    if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) throw new UserError('Email address looks invalid.');
    if (input.pin_code && !/^\d{6}$/.test(String(input.pin_code).trim())) throw new UserError('PIN code must be 6 digits.');
    const vals = FIELDS.map((f) => (input[f] === '' ? null : input[f] == null ? null : typeof input[f] === 'string' ? input[f].trim() : input[f]));
    return this.db.tx(() => {
      let id = input.id;
      if (id) {
        this.db.run(`UPDATE recipients SET ${FIELDS.map((f) => `${f}=?`).join(', ')}, updated_at=datetime('now','localtime') WHERE id=?`, [...vals, id]);
      } else {
        id = this.db.run(`INSERT INTO recipients(${FIELDS.join(', ')}) VALUES(${FIELDS.map(() => '?').join(',')})`, vals).lastInsertRowid;
      }
      this.app.audit(user, input.id ? 'recipient.update' : 'recipient.create', 'recipient', id, { office: input.office_name });
      this.app.emitChange('recipients');
      return this.get(id);
    });
  }

  setActive(id, active) {
    const user = this.app.require('letters.create');
    this.db.run('UPDATE recipients SET active=? WHERE id=?', [active ? 1 : 0, id]);
    this.app.audit(user, active ? 'recipient.restore' : 'recipient.archive', 'recipient', id);
    this.app.emitChange('recipients');
  }

  /** Full multi-line postal address block for letters. */
  static addressBlock(r) {
    if (!r) return '';
    const tail = [r.district, r.state].filter(Boolean).join(', ') + (r.pin_code ? ` - ${r.pin_code}` : '');
    return [r.address, tail.trim()].filter((x) => x && x.trim()).join('\n');
  }
}

module.exports = Recipients;
