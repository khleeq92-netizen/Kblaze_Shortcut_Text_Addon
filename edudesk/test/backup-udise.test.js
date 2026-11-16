'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { makeApp, cleanup, draftAndGenerate } = require('./helpers');
const { EduDeskApp } = require('../src/core/app');
const { sha256File } = require('../src/core/util');

test('backup is complete and verified; tampering is detected; restore brings back data and links', async () => {
  const app = await makeApp('bk');
  try {
    const L = app.services.letters;
    const { letter } = await draftAndGenerate(app);
    await L.finalize(letter.id, { confirmUnmodified: true });
    const fin = L.get(letter.id);
    const dest = path.join(app.dataRoot, '..', path.basename(app.dataRoot) + '-external');
    const b = await app.services.backup.create({ destination: dest });
    assert.ok(b.ok);
    const files = JSON.parse(fs.readFileSync(path.join(b.path, 'manifest.json'))).files.map((f) => f.path);
    assert.ok(files.includes('database.sqlite'));
    assert.ok(files.some((f) => f.endsWith('.pdf') && f.includes('Outward')));
    assert.ok(files.some((f) => f.startsWith('Documents/Templates/')));
    assert.ok(files.some((f) => f.includes('UDISE') && f.endsWith('.pdf')), 'UDISE master templates included');
    assert.equal((await app.services.backup.verify(b.path)).ok, true);
    // tamper a copy -> verification fails
    const tampered = path.join(dest, 'tampered');
    fs.cpSync(b.path, tampered, { recursive: true });
    const victim = path.join(tampered, files.find((f) => f.endsWith('.pdf') && f.includes('Outward')));
    fs.appendFileSync(victim, 'x');
    const tv = await app.services.backup.verify(tampered);
    assert.equal(tv.ok, false);
    await assert.rejects(() => app.services.backup.restore(tampered), /failed verification/);

    // data loss: delete the letter's files and the record, then restore
    fs.unlinkSync(fin.pdf_abs);
    app.db.run("UPDATE letters SET subject='DAMAGED' WHERE id=?", [letter.id]);
    const r = await app.services.backup.restore(b.path);
    assert.ok(r.restartRequired);
    const app2 = await new EduDeskApp({ dataRoot: app.dataRoot }).open();
    try {
      const l2 = app2.services.letters.get(letter.id);
      assert.equal(l2.subject, 'Submission of student information');
      assert.ok(fs.existsSync(l2.pdf_abs), 'document link works after restore');
      assert.equal(sha256File(l2.pdf_abs), fin.pdf_sha);
      assert.ok(fs.existsSync(r.preRestoreBackup), 'current data was backed up before restoring');
    } finally { app2.close(); }
    fs.rmSync(dest, { recursive: true, force: true });
  } finally { fs.rmSync(app.dataRoot, { recursive: true, force: true }); }
});

test('UDISE masters: installed, protected and their fields mapped', async () => {
  const app = await makeApp('udm');
  try {
    const U = app.services.udise;
    const s02 = U.activeTemplate('S02');
    const s03 = U.activeTemplate('S03');
    assert.equal(s02.version_label, 'v.04_17/08/2026');
    assert.equal(s03.version_label, 'v.02_09.10.2025');
    assert.equal(Object.keys(s02.mapping).length, 39, 'all 39 S02 fields mapped');
    assert.equal(Object.keys(s03.mapping).length, 33, 'all 33 S03 fields mapped');
    // a modified master is detected and refused
    fs.chmodSync(s03.abs_path, 0o644);
    fs.appendFileSync(s03.abs_path, '\n%tamper');
    assert.throws(() => U.activeTemplate('S03'), /checksum/);
  } finally { cleanup(app); }
});

test('UDISE S02 / S03 fill the original fields; existing and updated columns never mix; validation', async () => {
  const app = await makeApp('udf');
  try {
    const U = app.services.udise;
    const master = U.activeTemplate('S02');
    const masterSha = sha256File(master.abs_path);
    const d02 = {
      ...U.profileDefaults('S02'), name: 'SANA SHAIKH', gender: 'Female', dob: '12/03/2010', class_name: '11', section: 'A', admission_date: '15/06/2026',
      father_name: 'AHMED SHAIKH', mother_name: 'RUKHSAR SHAIKH', mobile: '9876543210', aadhaar: '123412341234', aadhaar_name: 'SANA SHAIKH', reason: '3 - Profile not created by current school in previous year',
      doc_register: true, doc_birth_cert: true,
    };
    assert.deepEqual(U.validate('S02', d02).errors, []);
    assert.ok(U.validate('S02', { ...d02, aadhaar: '123' }).errors.some((e) => /Aadhaar/.test(e)));
    assert.ok(U.validate('S02', { ...d02, class_name: '1' }).errors.some((e) => /classes 2 to 12/.test(e)));
    assert.ok(U.validate('S02', { ...d02, doc_register: false }).errors.some((e) => /mandatory/.test(e)));
    assert.ok(U.validate('S02', { ...d02, admission_date: '01/01/2009' }).errors.some((e) => /before the date of birth/.test(e)));

    const d03 = { ...U.profileDefaults('S03'), pen: '22483047376', student_name: 'KSHITIJ PATIL', mobile: '9876543210', existing_name: 'KSHITIJ PATIL', updated_name: 'KSHITIJ SHRIKRISHNA PATIL', existing_dob: '01/01/2009', updated_dob: '10/01/2009', existing_verified: true };
    assert.deepEqual(U.validate('S03', d03).errors, []);
    assert.ok(U.validate('S03', { ...d03, existing_verified: false }).errors.some((e) => /checked against UDISE/.test(e)));
    assert.ok(U.validate('S03', { ...d03, updated_name: '', updated_dob: '' }).errors.some((e) => /at least one/.test(e)));

    const p02 = await U.prepareSubmission({ formType: 'S02', entries: [{ data: d02 }, { data: { ...d02, name: 'ZAID KHAN', aadhaar_name: 'ZAID KHAN' } }], letter: { recipient_designation: 'Block Education Officer', recipient_office: 'Panchayat Samiti, Sample Taluka' } });
    assert.equal(p02.items.length, 2, 'one form per student');
    const doc = await PDFDocument.load(fs.readFileSync(p02.items[0].editable));
    const f = doc.getForm();
    assert.equal(f.getTextField('name_8').getText(), 'SANA SHAIKH');
    assert.equal(f.getTextField('udise_code_1').getText(), '27000000001');
    assert.equal(f.getTextField('academic_year_2').getText(), d02.academic_year);
    assert.equal(f.getTextField("father's_name_15").getText(), 'AHMED SHAIKH');
    assert.equal(f.getCheckBox('doc_register_22').isChecked(), true);
    assert.equal(f.getCheckBox('doc_transfer_cert_24').isChecked(), false);
    assert.equal(f.getCheckBox('hos_agree_25').isChecked(), true);
    assert.equal(f.getTextField('hos_name_27').getText(), 'Dr Test Principal');
    assert.equal(f.getTextField('beo_name_32').getText() || '', '', 'BEO section left for the officer');
    assert.equal(doc.getPage(0).getWidth().toFixed(2), '595.28', 'original page size');
    const flat = await PDFDocument.load(fs.readFileSync(p02.items[0].flat));
    assert.equal(flat.getForm().getFields().length, 0, 'submission copy is flattened');
    assert.equal(sha256File(master.abs_path), masterSha, 'master template unchanged');

    const p03 = await U.prepareSubmission({ formType: 'S03', entries: [{ data: d03 }] });
    const d3 = (await PDFDocument.load(fs.readFileSync(p03.items[0].editable))).getForm();
    assert.equal(d3.getTextField('existing_name').getText(), 'KSHITIJ PATIL');
    assert.equal(d3.getTextField('updated_name').getText(), 'KSHITIJ SHRIKRISHNA PATIL');
    assert.equal(d3.getTextField('existing_dob').getText(), '01/01/2009');
    assert.equal(d3.getTextField('updated_dob').getText(), '10/01/2009');
    assert.equal(d3.getTextField('student_pen').getText(), '22483047376');

    // covering letter -> finalize -> forms archived with the letter under the same outward number
    const L = app.services.letters;
    await L.generate(p02.letter.id);
    const fin = await L.finalize(p02.letter.id, { confirmUnmodified: true });
    assert.ok(fin.ok, fin.error);
    const l = L.get(p02.letter.id);
    const dir = l.archive_abs;
    assert.match(dir, /Outward[\\/]UDISE[\\/]OUT_\d{3}$/);
    const names = fs.readdirSync(dir);
    for (const n of ['Covering_Letter.docx', 'Covering_Letter.pdf', 'S02_SANA_SHAIKH.pdf', 'S02_ZAID_KHAN.pdf', 'Batch_Manifest.txt', 'Editable_Copies', 'Supporting_Documents']) assert.ok(names.includes(n), `missing ${n}`);
    assert.equal(l.attachments.filter((a) => a.kind === 'udise_form').length, 2);
    const manifest = fs.readFileSync(path.join(dir, 'Batch_Manifest.txt'), 'utf8');
    assert.ok(manifest.includes(l.outward_no) && manifest.includes('ZAID KHAN') && manifest.includes('XXXX-XXXX-1234'));
    assert.equal(app.services.udise.listSubmissions()[1].status, 'Archived');
    // backup includes the completed submission
    const b = await app.services.backup.create({});
    const files = JSON.parse(fs.readFileSync(path.join(b.path, 'manifest.json'))).files.map((x) => x.path);
    assert.ok(files.some((x) => x.endsWith('S02_SANA_SHAIKH.pdf')));
  } finally { cleanup(app); }
});

test('new UDISE template version: inactive until activated, history kept, old submissions untouched', async () => {
  const app = await makeApp('udv');
  try {
    const U = app.services.udise;
    const old = U.activeTemplate('S03');
    // simulate a newly received official version (same fields, different file)
    const doc = await PDFDocument.load(fs.readFileSync(old.abs_path));
    doc.setSubject('updated official format');
    const p = path.join(app.dataRoot, 'Form_S03_new.pdf');
    fs.writeFileSync(p, await doc.save());
    const up = await U.uploadTemplate('S03', p, { versionLabel: 'v.03_01.04.2027' });
    assert.equal(up.template.active, 0, 'not active until the user activates it');
    assert.equal(U.activeTemplate('S03').id, old.id);
    const prev = await U.previewTemplate(up.template.id);
    assert.ok(fs.existsSync(prev));
    U.activateTemplate(up.template.id);
    assert.equal(U.activeTemplate('S03').version_label, 'v.03_01.04.2027');
    assert.equal(U.listTemplates('S03').length, 2);
    await assert.rejects(() => U.uploadTemplate('S03', p, {}), /already stored/);
    await assert.rejects(() => U.uploadTemplate('S03', path.join(__dirname, 'helpers.js'), {}), /\.pdf/);
  } finally { cleanup(app); }
});

test('student import from CSV with validation', async () => {
  const app = await makeApp('stu');
  try {
    const csv = path.join(app.dataRoot, 's.csv');
    fs.writeFileSync(csv, '﻿GR No,Name,Gender,DOB,Class,Father Name,Aadhaar No,Mobile\n101,Sana Shaikh,Female,12/03/2010,11,Ahmed,1234 1234 1234,9876543210\n102,,Male,01/01/2010,11,X,,\n103,"Khan, Zaid",Male,2010-05-04,12,Imran,99,\n');
    const p = await app.services.students.parseImport(csv);
    assert.equal(p.items.length, 3);
    assert.equal(p.items[0].data.dob, '2010-03-12');
    assert.equal(p.items[0].data.aadhaar, '123412341234');
    assert.ok(p.items[1].problems.length && p.items[2].problems.length);
    const r = app.services.students.importRows(p.items.filter((i) => !i.problems.length).map((i) => i.data));
    assert.equal(r.added, 1);
    const s = app.services.students.list({ q: 'Sana' })[0];
    const s03 = app.services.udise.fromStudent('S03', s);
    assert.equal(s03.existing_dob, '12/03/2010');
  } finally { cleanup(app); }
});
