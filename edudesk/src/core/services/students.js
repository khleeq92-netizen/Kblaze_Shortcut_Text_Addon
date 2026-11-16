'use strict';
const fs = require('fs');
const path = require('path');
const { UserError, nowLocal } = require('../util');

const FIELDS = ['gr_no', 'pen', 'name', 'gender', 'dob', 'is_cwsn', 'class_name', 'section', 'admission_date', 'father_name', 'mother_name',
  'guardian_name', 'mobile', 'aadhaar', 'aadhaar_name', 'notes'];

/** Header aliases accepted when importing CSV / Excel student lists. */
const ALIASES = {
  gr_no: ['gr no', 'gr_no', 'grno', 'general register no', 'register no', 'admission no', 'reg no'],
  pen: ['pen', 'student pen', 'pen no', 'pen number'],
  name: ['name', 'student name', 'full name', 'student'],
  gender: ['gender', 'sex'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate'],
  is_cwsn: ['cwsn', 'is cwsn', 'is_cwsn', 'divyang'],
  class_name: ['class', 'std', 'standard', 'class name'],
  section: ['section', 'div', 'division'],
  admission_date: ['admission date', 'date of admission', 'doa'],
  father_name: ['father', 'father name', "father's name", 'fathers name'],
  mother_name: ['mother', 'mother name', "mother's name", 'mothers name'],
  guardian_name: ['guardian', 'guardian name', "guardian's name"],
  mobile: ['mobile', 'mobile no', 'mobile number', 'phone', 'contact'],
  aadhaar: ['aadhaar', 'aadhar', 'aadhaar no', 'aadhar no', 'aadhaar number', 'uid'],
  aadhaar_name: ['name as per aadhaar', 'aadhaar name', 'name as per aadhar', 'aadhar name'],
};

function normDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function validate(v) {
  const problems = [];
  if (!v.name || !String(v.name).trim()) problems.push('Name is required.');
  if (v.aadhaar && !/^\d{12}$/.test(String(v.aadhaar).replace(/\s/g, ''))) problems.push('Aadhaar number must have 12 digits.');
  if (v.mobile && !/^[6-9]\d{9}$/.test(String(v.mobile).replace(/[\s+-]/g, '').replace(/^91(?=\d{10}$)/, ''))) problems.push('Mobile number must be a 10-digit Indian mobile number.');
  if (v.dob && !/^\d{4}-\d{2}-\d{2}$/.test(v.dob)) problems.push('Date of birth must be a valid date.');
  if (v.pen && !/^\d{6,15}$/.test(String(v.pen).trim())) problems.push('PEN should contain only digits.');
  return problems;
}

class Students {
  constructor(app) { this.app = app; this.db = app.db; }

  list({ q = '', className, limit = 1000, includeInactive = false } = {}) {
    const where = ['deleted_at IS NULL'];
    const params = [];
    if (!includeInactive) where.push('active = 1');
    if (className) { where.push('class_name = ?'); params.push(className); }
    if (q) {
      where.push('(name LIKE ? OR gr_no LIKE ? OR pen LIKE ? OR aadhaar LIKE ? OR father_name LIKE ? OR mobile LIKE ?)');
      for (let i = 0; i < 6; i++) params.push(`%${q}%`);
    }
    return this.db.all(`SELECT * FROM students WHERE ${where.join(' AND ')} ORDER BY class_name, section, name LIMIT ?`, [...params, limit]);
  }

  get(id) {
    const s = this.db.get('SELECT * FROM students WHERE id=?', [id]);
    if (!s) throw new UserError('Student not found.');
    return s;
  }

  clean(input) {
    const v = {};
    for (const f of FIELDS) if (f in input) v[f] = input[f] === '' || input[f] == null ? null : String(input[f]).trim();
    if (v.dob) v.dob = normDate(v.dob);
    if (v.admission_date) v.admission_date = normDate(v.admission_date);
    if (v.aadhaar) v.aadhaar = v.aadhaar.replace(/\s/g, '');
    if (v.mobile) v.mobile = v.mobile.replace(/[\s+-]/g, '').replace(/^91(?=\d{10}$)/, '');
    return v;
  }

  save(input) {
    const user = this.app.require('letters.create');
    const v = this.clean(input);
    const problems = validate({ ...(input.id ? this.get(input.id) : {}), ...v });
    if (problems.length) throw new UserError(problems.join(' '));
    return this.db.tx(() => {
      let id = input.id;
      const keys = Object.keys(v);
      if (id) this.db.run(`UPDATE students SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`, [...keys.map((k) => v[k]), nowLocal(), id]);
      else id = this.db.run(`INSERT INTO students(${keys.join(', ')}) VALUES(${keys.map(() => '?').join(',')})`, keys.map((k) => v[k])).lastInsertRowid;
      this.app.audit(user, input.id ? 'student.update' : 'student.create', 'student', id, { name: v.name });
      this.app.emitChange('students');
      return this.get(id);
    });
  }

  remove(id) {
    const user = this.app.require('records.cancelDelete');
    this.db.run("UPDATE students SET deleted_at=datetime('now','localtime') WHERE id=?", [id]);
    this.app.audit(user, 'student.delete', 'student', id);
    this.app.emitChange('students');
  }

  /** Read a CSV or Excel sheet and return rows mapped to student fields (preview). */
  async parseImport(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let rows = [];
    if (ext === '.csv') {
      rows = parseCsv(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, ''));
    } else if (ext === '.xlsx') {
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      const ws = wb.worksheets[0];
      ws.eachRow({ includeEmpty: false }, (row) => {
        rows.push(row.values.slice(1).map((c) => (c && typeof c === 'object' && 'text' in c ? c.text : c && typeof c === 'object' && 'result' in c ? c.result : c)));
      });
    } else throw new UserError('Import a .csv or .xlsx file.');
    if (rows.length < 2) throw new UserError('The file has no data rows.');
    const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
    const map = {};
    header.forEach((h, i) => {
      for (const [f, al] of Object.entries(ALIASES)) if (al.includes(h) && !(f in map)) map[f] = i;
    });
    if (!('name' in map)) throw new UserError('Could not find a "Name" column in the first row.');
    const items = rows.slice(1).filter((r) => r.some((c) => c != null && String(c).trim())).map((r) => {
      const obj = {};
      for (const [f, i] of Object.entries(map)) obj[f] = r[i] instanceof Date ? r[i].toISOString().slice(0, 10) : r[i] == null ? '' : String(r[i]);
      const v = this.clean(obj);
      return { data: v, problems: validate(v) };
    });
    return { columns: map, items };
  }

  importRows(items) {
    const user = this.app.require('letters.create');
    this.app.services.backup.safetySnapshot('before student import');
    let added = 0;
    let skipped = 0;
    this.db.tx(() => {
      for (const it of items) {
        const v = this.clean(it);
        if (validate(v).length) { skipped++; continue; }
        const dup = v.gr_no ? this.db.get('SELECT id FROM students WHERE gr_no=? AND deleted_at IS NULL', [v.gr_no]) : null;
        const keys = Object.keys(v);
        if (dup) this.db.run(`UPDATE students SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`, [...keys.map((k) => v[k]), nowLocal(), dup.id]);
        else this.db.run(`INSERT INTO students(${keys.join(', ')}) VALUES(${keys.map(() => '?').join(',')})`, keys.map((k) => v[k]));
        added++;
      }
      this.app.audit(user, 'student.import', 'student', null, { added, skipped });
    });
    this.app.emitChange('students');
    return { added, skipped };
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

Students.FIELDS = FIELDS;
Students.validate = validate;
Students.parseCsv = parseCsv;
module.exports = Students;
