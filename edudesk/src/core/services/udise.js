'use strict';
/**
 * UDISE S02 (add student) and S03 (update active student) using the ORIGINAL fillable PDFs.
 *
 * - The supplied PDFs are stored as protected master templates (read-only copies,
 *   checksum recorded). Filling always works on an in-memory copy.
 * - Field values are written into the existing AcroForm fields; field names are never
 *   renamed or removed.
 * - Appearance streams: when the Electron renderer is available, every field's visible
 *   text is typeset by Chromium (correct Marathi/Hindi conjuncts, automatic shrink-to-fit)
 *   and attached as the field's appearance, so the value stays editable while looking
 *   right in every viewer. Without the renderer, Latin text falls back to pdf-lib appearances
 *   and NeedAppearances is set so viewers regenerate them.
 * - Two copies are produced per student: an editable copy and a flattened submission copy.
 */
const fs = require('fs');
const path = require('path');
require('regenerator-runtime/runtime');
const { PDFDocument, PDFName, PDFBool, StandardFonts, PDFTextField, PDFCheckBox, PDFString, PDFHexString } = require('pdf-lib');
const { UserError, ensureDir, sanitizeFileName, sha256File, sha256Buffer, todayISO, nowLocal, academicYear, formatDate, json, uniquePath } = require('../util');
const Students = require('./students');

/** Logical data keys used by the forms. */
const DATA_KEYS = {
  S02: ['udise_code', 'academic_year', 'school_name', 'hos_contact', 'state', 'district', 'block', 'name', 'gender', 'dob', 'is_cwsn', 'class_name', 'section',
    'admission_date', 'father_name', 'mother_name', 'mobile', 'guardian_name', 'aadhaar', 'aadhaar_name', 'reason', 'doc_register', 'doc_birth_cert', 'doc_transfer_cert',
    'hos_agree', 'hos_sig', 'hos_name', 'hos_desig', 'hos_date', 'beo_agree', 'beo_sig', 'beo_name', 'beo_desig', 'beo_date', 'deo_agree', 'deo_sig', 'deo_name', 'deo_desig', 'deo_date'],
  S03: ['academic_year', 'udise_code', 'school_name', 'state', 'district', 'block', 'pen', 'student_name', 'mobile',
    'existing_name', 'existing_dob', 'existing_gender', 'existing_aadhaar', 'existing_aadhaar_name', 'existing_class_section', 'existing_mother', 'existing_father',
    'updated_name', 'updated_dob', 'updated_gender', 'updated_aadhaar', 'updated_aadhaar_name', 'updated_class_section', 'updated_mother', 'updated_father',
    'doc_school_register', 'doc_birth_cert', 'undertaking_school', 'undertaking_officer', 'head_name', 'head_designation', 'officer_name', 'officer_designation'],
};

/** Default mapping: PDF field name -> data key (matches the supplied v.04 S02 and v.02 S03). */
const DEFAULT_MAPPING = {
  S02: {
    udise_code_1: 'udise_code', academic_year_2: 'academic_year', school_name_3: 'school_name', hos_contact_4: 'hos_contact', state_5: 'state', district_6: 'district', block_7: 'block',
    name_8: 'name', gender_9: 'gender', date_of_birth_10: 'dob', is_cwsn_11: 'is_cwsn', class_12: 'class_name', section_13: 'section', admission_date_14: 'admission_date',
    "father's_name_15": 'father_name', "mother's_name_16": 'mother_name', mobile_number_17: 'mobile', "guardian's_name_if_applicable_18": 'guardian_name',
    aadhaar_number_19: 'aadhaar', name_as_per_aadhaar_20: 'aadhaar_name', reason_21: 'reason', doc_register_22: 'doc_register', doc_birth_cert_23: 'doc_birth_cert',
    doc_transfer_cert_24: 'doc_transfer_cert', hos_agree_25: 'hos_agree', hos_sig_26: 'hos_sig', hos_name_27: 'hos_name', hos_desig_28: 'hos_desig', hos_date_29: 'hos_date',
    beo_agree_30: 'beo_agree', beo_sig_31: 'beo_sig', beo_name_32: 'beo_name', beo_desig_33: 'beo_desig', beo_date_34: 'beo_date',
    deo_agree_35: 'deo_agree', deo_sig_36: 'deo_sig', deo_name_37: 'deo_name', deo_desig_38: 'deo_desig', deo_date_39: 'deo_date',
  },
  S03: Object.fromEntries(['academic_year', 'udise_code', 'school_name', 'state', 'district', 'block', 'mobile', 'existing_name', 'existing_dob', 'existing_gender', 'existing_aadhaar',
    'existing_aadhaar_name', 'existing_class_section', 'existing_mother', 'existing_father', 'updated_name', 'updated_dob', 'updated_gender', 'updated_aadhaar', 'updated_aadhaar_name',
    'updated_class_section', 'updated_mother', 'updated_father', 'doc_school_register', 'doc_birth_cert', 'undertaking_school', 'undertaking_officer', 'head_name', 'head_designation',
    'officer_name', 'officer_designation', 'student_name'].map((k) => [k, k]).concat([['student_pen', 'pen']])),
};

const S02_REASONS = [
  '1 - Student rejoining after dropping out',
  '2 - Student admitted from unrecognized/open school',
  '3 - Profile not created by current school in previous year',
  '4 - Profile not created by previous school in previous year',
  '5 - Student from other country',
];

const CHECKBOX_KEYS = new Set(['doc_register', 'doc_birth_cert', 'doc_transfer_cert', 'hos_agree', 'beo_agree', 'deo_agree', 'doc_school_register', 'undertaking_school', 'undertaking_officer']);

/**
 * Some PDF writers store the field's default appearance (/DA) with octal escapes, e.g.
 * "\057Helv 9 Tf". That is valid PDF, but pdf-lib does not decode it, so decode it here.
 */
function normalizeDA(field) {
  const fix = (s) => (s && /\\[0-7]{3}/.test(s) ? s.replace(/\\([0-7]{3})/g, (m, o) => String.fromCharCode(parseInt(o, 8))) : null);
  const af = field.acroField;
  const d = fix(af.getDefaultAppearance());
  if (d) af.setDefaultAppearance(d);
  for (const w of af.getWidgets()) {
    const wd = fix(w.getDefaultAppearance && w.getDefaultAppearance());
    if (wd) w.setDefaultAppearance(wd);
  }
}

function isTruthy(v) { return v === true || v === 1 || v === '1' || v === 'Yes' || v === 'yes' || v === 'true'; }

class Udise {
  constructor(app) { this.app = app; this.db = app.db; }

  mastersDir() { return ensureDir(path.join(this.app.documentsRoot(), 'Templates', 'UDISE')); }

  // ---------------------------------------------------------------- templates
  async inspectPdf(buffer) {
    let doc;
    try { doc = await PDFDocument.load(buffer, { updateMetadata: false }); } catch (e) { throw new UserError(`This PDF cannot be opened: ${e.message}`); }
    const fields = doc.getForm().getFields().map((f) => ({ name: f.getName(), type: f instanceof PDFCheckBox ? 'checkbox' : f instanceof PDFTextField ? 'text' : f.constructor.name }));
    if (!fields.length) throw new UserError('This PDF has no fillable form fields. Upload the editable (fillable) version of the form.');
    const page = doc.getPage(0);
    return { fields, pages: doc.getPageCount(), size: page.getSize() };
  }

  listTemplates(formType) {
    return this.db.all(`SELECT * FROM udise_templates ${formType ? 'WHERE form_type = ?' : ''} ORDER BY form_type, id DESC`, formType ? [formType] : [])
      .map((t) => ({ ...t, field_names: json(t.field_names, []), mapping: json(t.mapping, {}), abs_path: this.app.resolve(t.file_path), intact: this.checkIntact(t) }));
  }

  checkIntact(t) {
    try { return sha256File(this.app.resolve(t.file_path)) === t.sha256; } catch (_) { return false; }
  }

  activeTemplate(formType) {
    const t = this.db.get('SELECT * FROM udise_templates WHERE form_type=? AND active=1 ORDER BY id DESC LIMIT 1', [formType]);
    if (!t) throw new UserError(`No active ${formType} form template. Upload it in Templates → UDISE forms.`);
    const abs = this.app.resolve(t.file_path);
    if (!fs.existsSync(abs)) throw new UserError(`The ${formType} master template file is missing: ${abs}`);
    if (sha256File(abs) !== t.sha256) throw new UserError(`The ${formType} master template was modified outside EduDesk (checksum mismatch). Restore it from a backup or upload it again.`);
    return { ...t, field_names: json(t.field_names, []), mapping: json(t.mapping, {}), abs_path: abs };
  }

  /** Add a new template version (not active until activated, unless it is the first one). */
  async uploadTemplate(formType, filePath, { versionLabel, note, user, activate } = {}) {
    user = user || this.app.require('templates.manage');
    if (!['S02', 'S03'].includes(formType)) throw new UserError('Form type must be S02 or S03.');
    if (path.extname(filePath).toLowerCase() !== '.pdf') throw new UserError('Upload the form as a .pdf file.');
    const buf = fs.readFileSync(filePath);
    const info = await this.inspectPdf(buf);
    const names = info.fields.map((f) => f.name);
    const mapping = {};
    for (const n of names) if (DEFAULT_MAPPING[formType][n]) mapping[n] = DEFAULT_MAPPING[formType][n];
    const sha = sha256Buffer(buf);
    const dup = this.db.get('SELECT id FROM udise_templates WHERE form_type=? AND sha256=?', [formType, sha]);
    if (dup) throw new UserError('This exact form file is already stored as a template version.');
    const label = versionLabel || (await this.detectVersion(buf)) || `uploaded ${todayISO()}`;
    const dest = uniquePath(path.join(this.mastersDir(), `${formType}_${sanitizeFileName(label, 40)}.pdf`));
    fs.writeFileSync(dest, buf, { flag: 'wx' });
    try { fs.chmodSync(dest, 0o444); } catch (_) { /* read-only flag is best effort */ }
    const first = !this.db.get('SELECT id FROM udise_templates WHERE form_type=?', [formType]);
    const id = this.db.tx(() => {
      const tid = this.db.run('INSERT INTO udise_templates(form_type, version_label, file_path, original_name, sha256, field_names, mapping, active, note) VALUES(?,?,?,?,?,?,?,?,?)',
        [formType, label, this.app.toStored(dest), path.basename(filePath), sha, JSON.stringify(info.fields), JSON.stringify(mapping), 0, note || null]).lastInsertRowid;
      this.app.audit(user, 'udise.template.upload', 'udise_template', tid, { formType, label, mapped: Object.keys(mapping).length, fields: names.length });
      return tid;
    });
    if (first || activate) this.activateTemplate(id, user);
    const unmapped = names.filter((n) => !mapping[n]);
    return { template: this.listTemplates(formType).find((t) => t.id === id), unmapped };
  }

  async detectVersion(buf) {
    // The official forms print a version string such as "v.04_17/08/2026" or "v.02_09.10.2025".
    const latin = buf.toString('latin1');
    const m = /v\.?\s?(\d{1,2})_(\d{2}[./]\d{2}[./]\d{4})/.exec(latin);
    return m ? `v.${m[1]}_${m[2]}` : null;
  }

  activateTemplate(id, user) {
    user = user || this.app.require('templates.manage');
    const t = this.db.get('SELECT * FROM udise_templates WHERE id=?', [id]);
    if (!t) throw new UserError('Template not found.');
    const mapping = json(t.mapping, {});
    if (!Object.keys(mapping).length) throw new UserError('Map the PDF fields to EduDesk data before activating this template.');
    this.db.tx(() => {
      this.db.run('UPDATE udise_templates SET active=0 WHERE form_type=?', [t.form_type]);
      this.db.run('UPDATE udise_templates SET active=1 WHERE id=?', [id]);
      this.app.audit(user, 'udise.template.activate', 'udise_template', id, { formType: t.form_type, label: t.version_label });
    });
    this.app.emitChange('udise');
  }

  saveMapping(id, mapping) {
    const user = this.app.require('templates.manage');
    const t = this.db.get('SELECT * FROM udise_templates WHERE id=?', [id]);
    if (!t) throw new UserError('Template not found.');
    const names = json(t.field_names, []).map((f) => f.name);
    const clean = {};
    for (const [field, key] of Object.entries(mapping || {})) {
      if (!names.includes(field)) continue;
      if (key && !DATA_KEYS[t.form_type].includes(key)) throw new UserError(`Unknown data item "${key}".`);
      if (key) clean[field] = key;
    }
    this.db.run('UPDATE udise_templates SET mapping=? WHERE id=?', [JSON.stringify(clean), id]);
    this.app.audit(user, 'udise.template.mapping', 'udise_template', id, { mapped: Object.keys(clean).length });
    return this.listTemplates(t.form_type).find((x) => x.id === id);
  }

  async installBundledMasters() {
    const dir = path.join(this.app.resourcesDir, 'udise');
    for (const [type, file, label] of [['S02', 'Form_S02_UDISE_v04.pdf', 'v.04_17/08/2026'], ['S03', 'Form_S03_UDISE_v02.pdf', 'v.02_09.10.2025']]) {
      const p = path.join(dir, file);
      if (fs.existsSync(p) && !this.db.get('SELECT id FROM udise_templates WHERE form_type=?', [type])) {
        await this.uploadTemplate(type, p, { versionLabel: label, note: 'Bundled master template', user: 'system', activate: true });
      }
    }
  }

  // ---------------------------------------------------------------- data
  /** Values that come from the College Profile (editable per submission). */
  profileDefaults(formType) {
    const c = this.app.settings.get('college');
    const ay = academicYear(todayISO(), this.app.settings.get('academic').startMonth);
    const base = { udise_code: c.udise_code, academic_year: ay, school_name: c.name, state: c.state, district: c.district, block: c.block };
    if (formType === 'S02') {
      return { ...base, hos_contact: c.hos_contact || [c.principal_name, c.phone ? `(${c.phone})` : ''].filter(Boolean).join(' '), hos_name: c.principal_name, hos_desig: c.principal_designation, hos_agree: true, doc_register: true };
    }
    return { ...base, head_name: c.principal_name, head_designation: c.principal_designation, undertaking_school: true, doc_school_register: true };
  }

  /** Build form data for a student record (S02) or the "existing" side (S03). */
  fromStudent(formType, s) {
    const ls = 'DD/MM/YYYY';
    if (formType === 'S02') {
      return {
        name: s.name, gender: s.gender, dob: formatDate(s.dob, ls) || s.dob, is_cwsn: s.is_cwsn || 'No', class_name: s.class_name, section: s.section,
        admission_date: formatDate(s.admission_date, ls) || s.admission_date, father_name: s.father_name, mother_name: s.mother_name, mobile: s.mobile,
        guardian_name: s.guardian_name, aadhaar: s.aadhaar, aadhaar_name: s.aadhaar_name || s.name,
      };
    }
    return {
      pen: s.pen, student_name: s.name, mobile: s.mobile,
      existing_name: s.name, existing_dob: formatDate(s.dob, ls) || s.dob, existing_gender: s.gender, existing_aadhaar: s.aadhaar,
      existing_aadhaar_name: s.aadhaar_name, existing_class_section: [s.class_name, s.section].filter(Boolean).join(' - '), existing_mother: s.mother_name, existing_father: s.father_name,
    };
  }

  /** Validation: returns { errors:[], warnings:[] } for one form's data. */
  validate(formType, d) {
    const errors = [];
    const warnings = [];
    const need = (k, label) => { if (!d[k] || !String(d[k]).trim()) errors.push(`${label} is required.`); };
    need('udise_code', 'UDISE code'); need('academic_year', 'Academic year'); need('school_name', 'School name');
    if (d.udise_code && !/^\d{11}$/.test(String(d.udise_code).trim())) warnings.push('UDISE code normally has 11 digits.');
    if (d.academic_year && !/^\d{4}-\d{2}$/.test(d.academic_year)) errors.push('Academic year must look like 2026-27.');
    const dateOk = (v) => !v || /^\d{2}\/\d{2}\/\d{4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v);
    const aadhaarOk = (v) => !v || /^\d{12}$/.test(String(v).replace(/\s/g, ''));
    const mobileOk = (v) => !v || /^[6-9]\d{9}$/.test(String(v).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''));
    if (formType === 'S02') {
      need('name', 'Student name'); need('gender', 'Gender'); need('dob', 'Date of birth'); need('class_name', 'Class'); need('admission_date', 'Admission date');
      need('father_name', "Father's name"); need('mother_name', "Mother's name"); need('reason', 'Reason for non-creation of profile');
      if (!dateOk(d.dob)) errors.push('Date of birth must be DD/MM/YYYY.');
      if (!dateOk(d.admission_date)) errors.push('Admission date must be DD/MM/YYYY.');
      if (!aadhaarOk(d.aadhaar)) errors.push('Aadhaar number must have 12 digits.');
      if (!mobileOk(d.mobile)) errors.push('Mobile number must be a valid 10-digit number.');
      if (!d.aadhaar) warnings.push('Aadhaar number is empty.');
      if (d.aadhaar && !d.aadhaar_name) warnings.push('Name as per Aadhaar is empty.');
      if (d.aadhaar_name && d.name && d.aadhaar_name.trim().toUpperCase() !== d.name.trim().toUpperCase()) warnings.push('Name as per Aadhaar differs from the student name – please confirm.');
      if (!isTruthy(d.doc_register)) errors.push('The School Register / Admission Register copy is a mandatory document for S02.');
      const cls = parseInt(d.class_name, 10);
      if (d.class_name && !Number.isNaN(cls) && (cls < 2 || cls > 12)) errors.push('Form S02 is only for classes 2 to 12.');
      const dob = String(d.dob || '');
      const adm = String(d.admission_date || '');
      const iso = (v) => (/^\d{2}\/\d{2}\/\d{4}$/.test(v) ? `${v.slice(6)}-${v.slice(3, 5)}-${v.slice(0, 2)}` : v);
      if (dob && adm && iso(adm) < iso(dob)) errors.push('Admission date cannot be before the date of birth.');
      if (!d.hos_name) warnings.push('Head of School name is empty.');
    } else {
      need('pen', "Student's PEN"); need('student_name', 'Student name');
      const pairs = [['name', 'Name'], ['dob', 'Date of birth'], ['gender', 'Gender'], ['aadhaar', 'Aadhaar number'], ['aadhaar_name', 'Name as per Aadhaar'],
        ['class_section', 'Class & section'], ['mother', "Mother's name"], ['father', "Father's name"]];
      let changes = 0;
      for (const [k, label] of pairs) {
        const ex = String(d[`existing_${k}`] || '').trim();
        const up = String(d[`updated_${k}`] || '').trim();
        if (up && up !== ex) changes++;
        if (up && up === ex) warnings.push(`${label}: the updated value is the same as the existing value.`);
        if (up && !ex) warnings.push(`${label}: the existing UDISE value is empty – confirm what UDISE+ currently shows.`);
      }
      if (!changes) errors.push('Enter at least one value in "Details to be Updated in UDISE Plus".');
      if (!dateOk(d.existing_dob) || !dateOk(d.updated_dob)) errors.push('Dates must be DD/MM/YYYY.');
      if (!aadhaarOk(d.existing_aadhaar) || !aadhaarOk(d.updated_aadhaar)) errors.push('Aadhaar numbers must have 12 digits.');
      if (!mobileOk(d.mobile)) errors.push('Mobile number must be a valid 10-digit number.');
      if (d.pen && !/^\d{6,15}$/.test(String(d.pen))) errors.push("Student's PEN should contain only digits.");
      if (!isTruthy(d.existing_verified)) errors.push('Confirm that the "Existing Details" were checked against UDISE+.');
      if (!d.head_name) warnings.push('Head of School name is empty.');
    }
    return { errors, warnings };
  }

  // ---------------------------------------------------------------- filling
  /**
   * Fill a form. Returns { editable: Buffer, flat: Buffer, overflow: [...] }.
   * The master buffer is never modified.
   */
  async fill(template, data) {
    const master = fs.readFileSync(template.abs_path);
    const fontsDir = path.join(this.app.resourcesDir, 'fonts');
    const values = {};
    for (const [field, key] of Object.entries(template.mapping)) values[field] = data[key];

    const build = async (flatten) => {
      const doc = await PDFDocument.load(master, { updateMetadata: false });
      const form = doc.getForm();
      const helv = await doc.embedFont(StandardFonts.Helvetica);
      const textFields = [];
      for (const f of form.getFields()) {
        const name = f.getName();
        if (!(name in values)) continue;
        const v = values[name];
        if (f instanceof PDFCheckBox) {
          if (isTruthy(v)) f.check(); else f.uncheck();
        } else if (f instanceof PDFTextField) {
          normalizeDA(f);
          const text = v == null ? '' : String(v);
          f.setText(text);
          textFields.push({ field: f, name, text });
        }
      }
      // Appearances
      const overflow = [];
      const latinOnly = (t) => /^[\x20-\x7E -ɏ]*$/.test(t);
      const useRenderer = !!this.app.hooks.renderFieldOverlay;
      if (useRenderer) {
        await this.applyRenderedAppearances(doc, textFields, overflow, fontsDir);
      } else {
        for (const tf of textFields) {
          if (latinOnly(tf.text)) {
            tf.field.setFontSize(0);
            tf.field.updateAppearances(helv);
          } else overflow.push({ field: tf.name, issue: 'non-latin-no-renderer' });
        }
      }
      // With rendered appearances viewers must NOT regenerate them (their fonts may lack Devanagari).
      // In the fallback mode the viewer is asked to regenerate so the stored values are shown.
      if (useRenderer) form.acroForm.dict.delete(PDFName.of('NeedAppearances'));
      else form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
      if (flatten) {
        if (!useRenderer && textFields.some((t) => !latinOnly(t.text))) {
          throw new UserError('Marathi/Hindi text in UDISE forms needs the EduDesk desktop renderer. Please run this from the EduDesk application.');
        }
        form.acroForm.dict.delete(PDFName.of('NeedAppearances'));
        form.flatten({ updateFieldAppearances: false });
      }
      doc.setProducer('EduDesk Correspondence Manager');
      return { bytes: Buffer.from(await doc.save({ updateFieldAppearances: false })), overflow };
    };
    const editable = await build(false);
    const flat = await build(true);
    return { editable: editable.bytes, flat: flat.bytes, overflow: editable.overflow };
  }

  /**
   * Typeset field text with Chromium and use it as each widget's normal appearance.
   */
  async applyRenderedAppearances(doc, textFields, overflow, fontsDir) {
    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    const items = [];
    for (const tf of textFields) {
      for (const w of tf.field.acroField.getWidgets()) {
        const r = w.getRectangle();
        items.push({ name: tf.name, text: tf.text, x: r.x, y: r.y, w: r.width, h: r.height, multiline: tf.field.isMultiline() || r.height > 28 });
      }
    }
    if (!items.length) return;
    const rendered = await this.app.hooks.renderFieldOverlay({ width, height, items, fontsDir });
    const overlay = await PDFDocument.load(rendered.pdf);
    for (const o of rendered.overflow || []) overflow.push(o);
    const [embedded] = await doc.embedPdf(overlay, [0]);
    const sx = width / embedded.width;
    const sy = height / embedded.height;
    let i = 0;
    for (const tf of textFields) {
      for (const w of tf.field.acroField.getWidgets()) {
        const it = items[i++];
        if (!tf.text) {
          const mk0 = w.getAppearanceCharacteristics();
          const bg0 = mk0 && mk0.getBackgroundColor();
          const bc0 = mk0 && mk0.getBorderColor();
          const op = (c, s) => `${c.map((n) => Number(n).toFixed(3)).join(' ')} ${c.length === 1 ? (s ? 'G' : 'g') : c.length === 4 ? (s ? 'K' : 'k') : (s ? 'RG' : 'rg')}`;
          const ec = (bg0 && bg0.length ? `${op(bg0, false)} 0 0 ${it.w} ${it.h} re f ` : '') + (bc0 && bc0.length ? `${op(bc0, true)} 1 w 0.5 0.5 ${it.w - 1} ${it.h - 1} re S` : '');
          const empty = doc.context.register(doc.context.stream(ec, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, it.w, it.h] }));
          w.setNormalAppearance(empty);
          continue;
        }
        // Build a form XObject that draws the overlay page shifted so this widget's area lands at (0,0).
        const xobjName = 'EdOv';
        // keep the original field background / border colours (from the widget's /MK entry)
        const mk = w.getAppearanceCharacteristics();
        const col = (c, stroke) => {
          if (!c || !c.length) return null;
          const v = c.map((n) => Number(n).toFixed(3)).join(' ');
          return `${v} ${c.length === 1 ? (stroke ? 'G' : 'g') : c.length === 4 ? (stroke ? 'K' : 'k') : (stroke ? 'RG' : 'rg')}`;
        };
        const bg = mk && col(mk.getBackgroundColor(), false);
        const bc = mk && col(mk.getBorderColor(), true);
        const bw = (w.getBorderStyle() && w.getBorderStyle().getWidth()) || 1;
        const frame = (bg ? `q ${bg} 0 0 ${it.w} ${it.h} re f Q ` : '') + (bc ? `q ${bc} ${bw} w ${bw / 2} ${bw / 2} ${it.w - bw} ${it.h - bw} re S Q ` : '');
        const content = `${frame}q ${sx} 0 0 ${sy} ${-it.x} ${-it.y} cm /${xobjName} Do Q`;
        const stream = doc.context.stream(content, {
          Type: 'XObject', Subtype: 'Form', BBox: [0, 0, it.w, it.h],
          Resources: { XObject: { [xobjName]: embedded.ref } },
        });
        const ref = doc.context.register(stream);
        w.setNormalAppearance(ref);
      }
    }
  }

  // ---------------------------------------------------------------- submissions
  /**
   * Prepare a submission: fills one form per student into a staging folder and creates
   * the covering-letter draft linked to it. Nothing is archived until the covering letter
   * is finalized (then the forms move into the same outward folder).
   */
  async prepareSubmission({ formType, entries, letter }) {
    const user = this.app.require('letters.create');
    if (!['S02', 'S03'].includes(formType)) throw new UserError('Choose S02 or S03.');
    if (!entries || !entries.length) throw new UserError('Add at least one student.');
    const template = this.activeTemplate(formType);
    const problems = [];
    entries.forEach((e, i) => {
      const r = this.validate(formType, e.data);
      if (r.errors.length) problems.push(`Student ${i + 1} (${e.data.name || e.data.student_name || 'unnamed'}): ${r.errors.join(' ')}`);
    });
    if (problems.length) throw new UserError(problems.join('\n'));

    const cat = this.db.get("SELECT id FROM categories WHERE code='UDISE'") || this.db.get('SELECT id FROM categories ORDER BY sort_order LIMIT 1');
    const sub = cat ? this.db.get('SELECT id FROM subcategories WHERE category_id=? AND name LIKE ?', [cat.id, `${formType}%`]) : null;
    const coverTpl = this.db.get(`SELECT id FROM templates WHERE deleted_at IS NULL AND active=1 AND name LIKE ? ORDER BY id LIMIT 1`, [`%${formType}%`]);
    const names = entries.map((e) => e.data.name || e.data.student_name).filter(Boolean);
    const draft = this.app.services.letters.saveDraft({
      category_id: cat && cat.id, subcategory_id: sub && sub.id, template_id: (letter && letter.template_id) || (coverTpl && coverTpl.id) || undefined,
      subject: (letter && letter.subject) || (formType === 'S02'
        ? `Request to create UDISE+ student profile (Form S02) – ${entries.length} student(s)`
        : `Request to update student details in UDISE+ (Form S03) – ${entries.length} student(s)`),
      enclosures: (letter && letter.enclosures) || [`Form ${formType} – ${entries.length} student(s): ${names.join(', ')}`, formType === 'S02' ? 'Attested copy of School / Admission Register' : 'Copy of School Register'].join('\n'),
      summary: (letter && letter.summary) || `UDISE ${formType} submission for ${entries.length} student(s): ${names.slice(0, 10).join(', ')}${names.length > 10 ? '…' : ''}`,
      ...(letter || {}),
    });
    const letterId = draft.id;
    const staging = ensureDir(path.join(this.app.workDir(), String(letterId), 'UDISE'));
    const result = this.db.tx(() => {
      this.db.run("UPDATE letters SET letter_kind=?, extra=? WHERE id=?", [formType === 'S02' ? 'udise_s02' : 'udise_s03', JSON.stringify({ ...draft.extra, studentCount: entries.length }), letterId]);
      const sid = this.db.run('INSERT INTO udise_submissions(form_type, letter_id, template_id, student_count, staging_dir) VALUES(?,?,?,?,?)',
        [formType, letterId, template.id, entries.length, this.app.toStored(staging)]).lastInsertRowid;
      this.app.audit(user, 'udise.prepare', 'udise_submission', sid, { formType, students: entries.length, letterId });
      return sid;
    });
    const items = [];
    const used = new Set();
    for (const e of entries) {
      const { editable, flat, overflow } = await this.fill(template, e.data);
      const nm = sanitizeFileName(e.data.name || e.data.student_name || 'Student', 50);
      let base = `${formType}_${nm}`;
      for (let k = 2; used.has(base); k++) base = `${formType}_${nm}_${k}`;
      used.add(base);
      const edPath = path.join(staging, `${base}_editable.pdf`);
      const flPath = path.join(staging, `${base}.pdf`);
      fs.writeFileSync(edPath, editable);
      fs.writeFileSync(flPath, flat);
      const itemId = this.db.run('INSERT INTO udise_items(submission_id, student_id, student_name, data, editable_pdf, flat_pdf) VALUES(?,?,?,?,?,?)',
        [result, e.student_id || null, e.data.name || e.data.student_name, JSON.stringify(e.data), this.app.toStored(edPath), this.app.toStored(flPath)]).lastInsertRowid;
      items.push({ id: itemId, name: e.data.name || e.data.student_name, editable: edPath, flat: flPath, overflow });
      if (e.saveStudent && formType === 'S02') this.saveStudentFromForm(e.data, e.student_id);
    }
    const manifest = this.writeManifest(result, staging);
    this.db.run('UPDATE udise_submissions SET manifest_path=? WHERE id=?', [this.app.toStored(manifest), result]);
    this.app.emitChange('letters');
    return { submissionId: result, letter: this.app.services.letters.get(letterId), items, manifest };
  }

  saveStudentFromForm(d, studentId) {
    const iso = (v) => (/^\d{2}\/\d{2}\/\d{4}$/.test(v || '') ? `${v.slice(6)}-${v.slice(3, 5)}-${v.slice(0, 2)}` : v);
    try {
      this.app.services.students.save({
        id: studentId || undefined, name: d.name, gender: d.gender, dob: iso(d.dob), is_cwsn: d.is_cwsn, class_name: d.class_name, section: d.section,
        admission_date: iso(d.admission_date), father_name: d.father_name, mother_name: d.mother_name, guardian_name: d.guardian_name, mobile: d.mobile, aadhaar: d.aadhaar, aadhaar_name: d.aadhaar_name,
      });
    } catch (e) {
      this.app.log('warn', 'student save from S02 failed', { error: e.message });
    }
  }

  writeManifest(submissionId, dir) {
    const s = this.db.get('SELECT * FROM udise_submissions WHERE id=?', [submissionId]);
    const items = this.db.all('SELECT * FROM udise_items WHERE submission_id=? ORDER BY id', [submissionId]);
    const l = s.letter_id ? this.db.get('SELECT outward_no, subject, letter_date FROM letters WHERE id=?', [s.letter_id]) : {};
    const t = this.db.get('SELECT version_label FROM udise_templates WHERE id=?', [s.template_id]);
    const lines = [
      `UDISE ${s.form_type} SUBMISSION – BATCH MANIFEST`,
      `Outward No.: ${l.outward_no || '(assigned on finalization)'}`,
      `Subject: ${l.subject || ''}`,
      `Form template version: ${t ? t.version_label : ''}`,
      `Prepared: ${nowLocal()}`,
      `Number of students: ${items.length}`,
      '',
      'Sr | Student | Key details | Form file',
    ];
    items.forEach((it, i) => {
      const d = json(it.data, {});
      const key = s.form_type === 'S02'
        ? `Class ${d.class_name || ''}${d.section ? '-' + d.section : ''}, DOB ${d.dob || ''}, Aadhaar ${d.aadhaar ? 'XXXX-XXXX-' + String(d.aadhaar).slice(-4) : '-'}`
        : `PEN ${d.pen || ''}`;
      lines.push(`${i + 1} | ${it.student_name} | ${key} | ${path.basename(this.app.resolve(it.flat_pdf))}`);
    });
    const p = path.join(dir, 'Batch_Manifest.txt');
    if (fs.existsSync(p)) fs.unlinkSync(p);
    fs.writeFileSync(p, '﻿' + lines.join('\r\n'), 'utf8');
    return p;
  }

  /** Called after the covering letter is finalized: moves forms into the outward folder and links them. */
  async archiveForLetter(letterId, archiveDir) {
    const s = this.db.get('SELECT * FROM udise_submissions WHERE letter_id=?', [letterId]);
    if (!s) return;
    const items = this.db.all('SELECT * FROM udise_items WHERE submission_id=?', [s.id]);
    const editableDir = ensureDir(path.join(archiveDir, 'Editable_Copies'));
    ensureDir(path.join(archiveDir, 'Supporting_Documents'));
    this.db.tx(() => {
      for (const it of items) {
        for (const [col, kind, dir] of [['flat_pdf', 'udise_form', archiveDir], ['editable_pdf', 'udise_form_editable', editableDir]]) {
          const src = this.app.resolve(it[col]);
          if (!src || !fs.existsSync(src)) continue;
          const dest = uniquePath(path.join(dir, path.basename(src)));
          fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
          if (sha256File(dest) !== sha256File(src)) throw new Error(`Copy verification failed for ${dest}`);
          this.db.run(`UPDATE udise_items SET ${col}=? WHERE id=?`, [this.app.toStored(dest), it.id]);
          this.db.run('INSERT INTO letter_attachments(letter_id, kind, label, file_path, sha256) VALUES(?,?,?,?,?)',
            [letterId, kind, `${s.form_type} – ${it.student_name}${kind === 'udise_form_editable' ? ' (editable copy)' : ''}`, this.app.toStored(dest), sha256File(dest)]);
        }
      }
      const manifest = this.writeManifest(s.id, archiveDir);
      this.db.run("UPDATE udise_submissions SET status='Archived', manifest_path=? WHERE id=?", [this.app.toStored(manifest), s.id]);
      this.db.run("INSERT INTO letter_attachments(letter_id, kind, label, file_path, sha256) VALUES(?,?,?,?,?)", [letterId, 'manifest', 'Batch manifest', this.app.toStored(manifest), sha256File(manifest)]);
      this.app.audit('system', 'udise.archived', 'udise_submission', s.id, { letterId, items: items.length });
    });
  }

  listSubmissions({ formType } = {}) {
    return this.db.all(`SELECT s.*, l.outward_no, l.subject, l.letter_date, l.status AS letter_status, l.archive_status, l.recipient_office, t.version_label
      FROM udise_submissions s LEFT JOIN letters l ON l.id = s.letter_id LEFT JOIN udise_templates t ON t.id = s.template_id
      ${formType ? 'WHERE s.form_type = ?' : ''} ORDER BY s.id DESC`, formType ? [formType] : []);
  }

  getSubmission(id) {
    const s = this.db.get('SELECT * FROM udise_submissions WHERE id=?', [id]);
    if (!s) throw new UserError('Submission not found.');
    s.items = this.db.all('SELECT * FROM udise_items WHERE submission_id=?', [id]).map((it) => ({ ...it, data: json(it.data, {}), editable_abs: this.app.resolve(it.editable_pdf), flat_abs: this.app.resolve(it.flat_pdf) }));
    return s;
  }

  /** Fill any stored template version (active or not) with clearly marked sample data. */
  async previewTemplate(id) {
    const t = this.db.get('SELECT * FROM udise_templates WHERE id=?', [id]);
    if (!t) throw new UserError('Template not found.');
    const tpl = { ...t, mapping: json(t.mapping, {}), abs_path: this.app.resolve(t.file_path) };
    const sample = t.form_type === 'S02'
      ? { ...this.profileDefaults('S02'), name: 'SAMPLE STUDENT NAME', gender: 'Female', dob: '01/01/2010', is_cwsn: 'No', class_name: '11', section: 'A', admission_date: '15/06/2026', father_name: 'SAMPLE FATHER', mother_name: 'SAMPLE MOTHER', mobile: '9999999999', aadhaar: '000000000000', aadhaar_name: 'SAMPLE STUDENT NAME', reason: S02_REASONS[2], doc_birth_cert: true }
      : { ...this.profileDefaults('S03'), pen: '00000000000', student_name: 'SAMPLE STUDENT', mobile: '9999999999', existing_name: 'SAMPLE OLD NAME', updated_name: 'SAMPLE NEW NAME', existing_dob: '01/01/2010', updated_dob: '02/01/2010', doc_birth_cert: true };
    const { flat } = await this.fill(tpl, sample);
    const dir = ensureDir(path.join(this.app.workDir(), '_preview'));
    const p = path.join(dir, `${t.form_type}_${sanitizeFileName(t.version_label, 30)}_SAMPLE_${Date.now()}.pdf`);
    fs.writeFileSync(p, flat);
    return p;
  }

  /** Generate a single filled form for preview without creating a submission. */
  async previewForm(formType, data) {
    const template = this.activeTemplate(formType);
    const { flat, overflow } = await this.fill(template, data);
    const dir = ensureDir(path.join(this.app.workDir(), '_preview'));
    const p = path.join(dir, `${formType}_preview_${Date.now()}.pdf`);
    fs.writeFileSync(p, flat);
    return { path: p, overflow, validation: this.validate(formType, data) };
  }
}

Udise.DATA_KEYS = DATA_KEYS;
Udise.DEFAULT_MAPPING = DEFAULT_MAPPING;
Udise.S02_REASONS = S02_REASONS;
module.exports = Udise;
