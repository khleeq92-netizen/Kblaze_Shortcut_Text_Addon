'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PizZip = require('pizzip');
const { makeApp, cleanup, category, template, editDocx, docText, pdfText, draftAndGenerate, PRIVATE } = require('./helpers');
const docx = require('../src/core/docx');
const { convertToLetterhead, buildSampleDocx } = require('../src/core/docxBuilder');
const { verifyPdf } = require('../src/core/converter');

const haveCollegeLetters = fs.existsSync(PRIVATE);
const collegeLetter = haveCollegeLetters ? path.join(PRIVATE, fs.readdirSync(PRIVATE).find((f) => f.startsWith('01 UDISE_BEO - 01'))) : null;

test('placeholders are replaced and Marathi / Hindi / English text is preserved', () => {
  const buf = docx.renderTemplate(buildSampleDocx('mr'), {
    outward_number: 'OUT/001/2026-27', letter_date: '14/11/2026', subject: 'विद्यार्थ्यांची माहिती सादर करणेबाबत', letter_body: 'पहिला परिच्छेद.\nदूसरा अनुच्छेद (हिंदी).\nThird paragraph in English.',
    recipient_designation: 'मा. गटशिक्षणाधिकारी', signatory_name: 'डॉ. प्राचार्य', college_name: 'Test College', enclosures: '1. यादी',
  });
  const t = docx.extractText(buf);
  for (const s of ['OUT/001/2026-27', 'विषय: ', 'विद्यार्थ्यांची माहिती', 'दूसरा अनुच्छेद (हिंदी).', 'Third paragraph in English.', 'मा. गटशिक्षणाधिकारी', 'दिनांक: 14/11/2026']) assert.ok(t.includes(s), `missing ${s}`);
  assert.ok(!/\{\{/.test(t), 'no placeholder left');
  // optional reference line removed when empty
  assert.ok(!t.includes('संदर्भ:'));
});

test('multi-paragraph bodies (3+ lines) produce valid Word XML and separate paragraphs', () => {
  const body = 'Line one.\nLine two.\nLine three.\n\nLine five after a blank line.';
  for (const lang of ['en', 'mr', 'hi']) {
    const buf = docx.renderTemplate(buildSampleDocx(lang), { letter_body: body, subject: 'S', enclosures: 'A\nB\nC' });
    assert.equal(docx.verifyDocx(buf), true);
    const t = docx.extractText(buf);
    assert.ok(/Line one\.\nLine two\.\nLine three\./.test(t), `separate paragraphs (${lang})`);
  }
  // a damaged document is detected
  const z = new PizZip(buildSampleDocx('en'));
  z.file('word/document.xml', z.file('word/document.xml').asText().replace('</w:body>', '<w:p></w:body>'));
  assert.throws(() => docx.verifyDocx(z.generate({ type: 'nodebuffer' })), /damaged/);
});

test('placeholders split across Word runs are still replaced, formatting kept', () => {
  const zip = new PizZip(buildSampleDocx('en'));
  let x = zip.file('word/document.xml').asText();
  // split {{subject}} into three runs with different formatting, like Word often does
  x = x.replace('<w:t xml:space="preserve">{{subject}}</w:t></w:r>', '<w:t xml:space="preserve">{{sub</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>ject</w:t></w:r><w:r><w:t>}}</w:t></w:r>');
  zip.file('word/document.xml', x);
  const out = docx.renderTemplate(zip.generate({ type: 'nodebuffer' }), { subject: 'Split run test' });
  assert.ok(docx.extractText(out).includes('Split run test'));
});

test('letterhead conversion keeps header images, watermark, borders and page setup', { skip: !haveCollegeLetters && 'college letters not available' }, () => {
  const src = fs.readFileSync(collegeLetter);
  const out = convertToLetterhead(src, 'mr');
  const a = new PizZip(src); const b = new PizZip(out);
  for (const name of Object.keys(a.files).filter((n) => /^word\/(header|footer|media)/.test(n))) {
    assert.ok(b.file(name), `missing ${name}`);
    assert.deepEqual(b.file(name).asNodeBuffer(), a.file(name).asNodeBuffer(), `${name} changed`);
  }
  const sect = (z) => /<w:sectPr[\s\S]*<\/w:sectPr>/.exec(z.file('word/document.xml').asText())[0];
  assert.equal(sect(b), sect(a), 'section properties (margins, borders, header refs) unchanged');
  const ph = docx.findPlaceholders(out);
  for (const p of ['outward_number', 'letter_date', 'subject', 'letter_body', 'signatory_name']) assert.ok(ph.includes(p));
});

test('uploaded templates: macros removed, .docm refused, placeholders detected', async () => {
  const app = await makeApp('tpl');
  try {
    assert.throws(() => docx.sanitizeTemplate(buildSampleDocx('en'), 'x.docm'), /Macro-enabled|\.docx/);
    const z = new PizZip(buildSampleDocx('en'));
    z.file('word/vbaProject.bin', Buffer.from('fake macro'));
    z.file('word/_rels/document.xml.rels', z.file('word/_rels/document.xml.rels').asText().replace('</Relationships>', '<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>'));
    const f = path.join(app.dataRoot, 'with_macro.docx');
    fs.writeFileSync(f, z.generate({ type: 'nodebuffer' }));
    const r = app.services.templates.create({ name: 'Macro test' }, f);
    assert.deepEqual(r.removedParts, ['word/vbaProject.bin']);
    const stored = app.services.templates.versionPath(r.template.current_version_id).path;
    const sz = new PizZip(fs.readFileSync(stored));
    assert.equal(sz.file('word/vbaProject.bin'), null);
    assert.ok(!sz.file('word/_rels/document.xml.rels').asText().includes('vbaProject'));
    // new version keeps the old one
    const v2 = app.services.templates.uploadVersion(r.template.id, f, 'second');
    assert.equal(v2.template.versions.length, 2);
    assert.ok(fs.existsSync(app.services.templates.versionPath(v2.template.versions[1].id).path));
  } finally { cleanup(app); }
});

test('full letter workflow: generate -> edit in Word -> finalize -> DOCX + PDF verified', async () => {
  const app = await makeApp('flow');
  try {
    const L = app.services.letters;
    const { letter, g } = await draftAndGenerate(app);
    assert.equal(letter.status, 'Generated');
    assert.equal(letter.outward_no, 'OUT/001/2026-27'.replace('2026-27', letter.academic_year));
    assert.ok(docText(g.path).includes(letter.outward_no));
    // unmodified -> asks for confirmation
    const ask = await L.finalize(letter.id);
    assert.equal(ask.needsConfirm, 'unmodified');
    // simulate the user's edit in Word
    editDocx(g.path, 'Paragraph two.', 'Paragraph two – corrected in Word.');
    const f = await L.finalize(letter.id);
    assert.equal(f.ok, true, f.error);
    const fin = L.get(letter.id);
    assert.equal(fin.status, 'Finalized');
    assert.equal(fin.archive_status, 'Complete');
    assert.equal(fin.dispatch_status, 'Ready for Dispatch');
    assert.ok(fs.statSync(fin.docx_abs).size > 0 && fs.statSync(fin.pdf_abs).size > 0);
    assert.equal(path.dirname(fin.docx_abs), path.dirname(fin.pdf_abs), 'stored together');
    assert.match(path.basename(fin.docx_abs), /^OUT_001_\d{4}-\d{2}_\d{2}-\d{2}-\d{4}_Submission_Student_Information\.docx$/);
    assert.ok(fin.docx_abs.includes(path.join(fin.academic_year, 'Outward', 'BEO')));
    assert.equal(fin.pdf_source_sha, fin.docx_sha, 'PDF made from the archived DOCX');
    assert.ok(docText(fin.docx_abs).includes('corrected in Word'));
    assert.ok(pdfText(fin.pdf_abs).includes('corrected in Word'), 'PDF reflects the final edited DOCX, not the draft');
    assert.ok((await verifyPdf(fin.pdf_abs)).ok);
    // finalized letters are locked
    assert.throws(() => L.saveDraft({ id: letter.id, subject: 'changed' }), /cannot be edited/);
    await assert.rejects(() => L.finalize(letter.id), /already finalized/);
  } finally { cleanup(app); }
});

test('finalization refuses locked, stale and missing work documents; never overwrites edits', async () => {
  const app = await makeApp('guards');
  try {
    const L = app.services.letters;
    const { letter, g } = await draftAndGenerate(app);
    // Word lock file present -> refuse
    const lock = path.join(path.dirname(g.path), `~$${path.basename(g.path)}`);
    fs.writeFileSync(lock, 'x');
    await assert.rejects(() => L.finalize(letter.id), /still open in Microsoft Word/);
    fs.unlinkSync(lock);
    // regenerate after a user edit needs confirmation and keeps a copy
    editDocx(g.path, 'Paragraph one.', 'Edited paragraph one.');
    const ask = await L.generate(letter.id);
    assert.equal(ask.needsConfirm, 'replaceEdited');
    const re = await L.generate(letter.id, { confirmReplace: true });
    assert.ok(re.ok);
    const kept = fs.readdirSync(path.dirname(g.path)).filter((f) => f.includes('_previous_'));
    assert.equal(kept.length, 1);
    assert.ok(docText(path.join(path.dirname(g.path), kept[0])).includes('Edited paragraph one.'));
    assert.equal(L.get(letter.id).outward_no, letter.outward_no, 'regeneration keeps the same number');
    // details changed after generation -> finalize blocked until regenerated
    L.saveDraft({ id: letter.id, subject: 'Changed subject' });
    await assert.rejects(() => L.finalize(letter.id, { confirmUnmodified: true }), /Regenerate/);
    await L.generate(letter.id, { confirmReplace: true });
    // missing work file
    fs.unlinkSync(L.get(letter.id).work_abs);
    await assert.rejects(() => L.finalize(letter.id, { confirmUnmodified: true }), /could not be found/);
  } finally { cleanup(app); }
});

test('PDF failure keeps DOCX and number, retry completes the archive without a new number', async () => {
  const app = await makeApp('retry');
  try {
    const L = app.services.letters;
    const { letter } = await draftAndGenerate(app);
    app.settings.set('conversion', { engine: 'word' }); // Word is not available here -> conversion fails
    const r = await L.finalize(letter.id, { confirmUnmodified: true });
    assert.equal(r.ok, false);
    let l = L.get(letter.id);
    assert.equal(l.archive_status, 'Incomplete');
    assert.equal(l.pdf_status, 'Failed');
    assert.ok(fs.existsSync(l.docx_abs));
    assert.equal(l.pdf_path, null);
    const no = l.outward_no;
    const count = app.db.get('SELECT COUNT(*) AS n FROM letters WHERE outward_no IS NOT NULL').n;
    app.settings.set('conversion', { engine: 'auto' });
    const r2 = await L.retryPdf(letter.id);
    assert.equal(r2.ok, true, r2.error);
    l = L.get(letter.id);
    assert.equal(l.archive_status, 'Complete');
    assert.equal(l.outward_no, no);
    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM letters WHERE outward_no IS NOT NULL').n, count, 'no duplicate numbers');
    // a DOCX modified outside EduDesk is not silently used for the PDF
  } finally { cleanup(app); }
});

test('revisions create new versions and keep the original files', async () => {
  const app = await makeApp('rev');
  try {
    const L = app.services.letters;
    const { letter } = await draftAndGenerate(app);
    await L.finalize(letter.id, { confirmUnmodified: true });
    const v1 = L.get(letter.id);
    assert.throws(() => L.startRevision(letter.id, ''), /reason/);
    const rv = L.startRevision(letter.id, 'Recipient office name corrected');
    editDocx(rv.work_abs, 'Paragraph one.', 'Paragraph one (revised).');
    const f = await L.finalize(letter.id);
    assert.equal(f.ok, true, f.error);
    const v2 = L.get(letter.id);
    assert.equal(v2.current_version, 2);
    assert.match(path.basename(v2.docx_abs), /_v2\.docx$/);
    assert.ok(fs.existsSync(v1.docx_abs) && fs.existsSync(v1.pdf_abs), 'v1 preserved');
    assert.equal(v2.versions.length, 2);
    assert.equal(v2.versions[0].reason, 'Recipient office name corrected');
    assert.ok(pdfText(v2.pdf_abs).includes('(revised)'));
    assert.equal(v2.outward_no, v1.outward_no);
  } finally { cleanup(app); }
});

test('letters in Marathi on the college letterhead finalize with Devanagari intact', { skip: !haveCollegeLetters && 'college letters not available' }, async () => {
  const app = await makeApp('mr');
  try {
    const t = app.services.templates.create({ name: 'College letterhead', language: 'mr', convertBody: true }, collegeLetter);
    const cat = category(app, 'UDISE');
    const L = app.services.letters;
    const d = L.saveDraft({ category_id: cat.id, template_id: t.template.id, recipient_designation: 'मा. गटशिक्षणाधिकारी साहेब', recipient_office: 'पंचायत समिती, फुलंब्री', subject: 'UDISE प्रणालीमध्ये नवीन TAB उपलब्ध करून देण्याबाबत विनंती.', body: 'सविनय अर्ज आहे की, नावे प्रविष्ट झालेली नाहीत.', language: 'mr' });
    await L.generate(d.id);
    const f = await L.finalize(d.id, { confirmUnmodified: true });
    assert.ok(f.ok, f.error);
    const fin = L.get(d.id);
    const txt = pdfText(fin.pdf_abs);
    assert.ok(txt.includes('दिनांक'));
    assert.ok(txt.includes('पंचायत समिती'));
    // the header images (logo/watermark) are inside the archived DOCX
    const z = new PizZip(fs.readFileSync(fin.docx_abs));
    assert.ok(Object.keys(z.files).some((n) => n.startsWith('word/media/')));
  } finally { cleanup(app); }
});

test('externally prepared letters are numbered and archived; dispatch rules enforced', async () => {
  const app = await makeApp('ext');
  try {
    const L = app.services.letters;
    const cat = category(app, 'GEN');
    const src = path.join(app.dataRoot, 'old_letter.docx');
    fs.writeFileSync(src, docx.renderTemplate(buildSampleDocx('en'), { subject: 'Old letter', letter_body: 'Typed earlier.' }));
    const r = await L.recordExternal({ category_id: cat.id, subject: 'Bank statement request', recipient_office: 'State Bank of India', letter_date: '2026-10-19' }, src);
    assert.ok(r.ok, r.error);
    const l = L.get(r.letter.id);
    assert.equal(l.archive_status, 'Complete');
    assert.ok(fs.existsSync(l.pdf_abs) && fs.existsSync(l.docx_abs));
    assert.throws(() => L.recordDispatch(l.id, { dispatch_status: 'Dispatched' }), /required/);
    assert.throws(() => L.recordDispatch(l.id, { dispatch_status: 'Dispatched', dispatch_mode: 'Speed Post', dispatch_date: '2026-10-01' }), /earlier than the letter date/);
    L.recordDispatch(l.id, { dispatch_status: 'Dispatched', dispatch_mode: 'Speed Post', dispatch_date: '2026-10-20', tracking_no: 'EE123456789IN' });
    assert.equal(L.get(l.id).status, 'Dispatched');
    assert.equal(L.get(l.id).delivered_date, null, 'never auto-delivered');
    const ack = path.join(app.dataRoot, 'ack.pdf');
    fs.copyFileSync(l.pdf_abs, ack);
    L.addAttachment(l.id, ack, { kind: 'ack' });
    assert.equal(L.get(l.id).ack_status, 'Received');
    assert.ok(L.get(l.id).attachments.some((a) => a.kind === 'ack' && a.abs_path.includes('Acknowledgements')));
  } finally { cleanup(app); }
});

test('reports export to CSV and Excel; search across registers', async () => {
  const app = await makeApp('rep');
  try {
    const L = app.services.letters;
    const { letter } = await draftAndGenerate(app, { fields: { subject: 'Mark memo collection request', summary: 'Collect HSC mark memos' } });
    await L.finalize(letter.id, { confirmUnmodified: true });
    app.services.inward.save({ date_received: '2026-11-10', sender_office: 'Divisional Board', subject: 'Mark memo circular' });
    const s = app.services.search.run({ q: 'mark memo' });
    assert.equal(s.length, 2);
    assert.ok(s.some((x) => x.type === 'inward') && s.some((x) => x.type === 'outward'));
    assert.equal(app.services.search.run({ q: letter.outward_no }).length, 1);
    const csv = await app.services.reports.export('outward', {}, 'csv');
    assert.ok(fs.readFileSync(csv.path, 'utf8').includes('Mark memo collection request'));
    const xlsx = await app.services.reports.export('category_wise', {}, 'xlsx');
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsx.path);
    assert.equal(wb.worksheets[0].getCell(6, 1).value, letter.outward_no);
    assert.equal(wb.worksheets[1].name, 'Summary');
  } finally { cleanup(app); }
});
