'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeApp, cleanup, category, PRIVATE } = require('./helpers');
const docx = require('../src/core/docx');
const { makeReusableLetter, buildSampleDocx } = require('../src/core/docxBuilder');

const have = fs.existsSync(PRIVATE);

test('Marathi and English samples are paired; switching language finds the Marathi version with Marathi text', async () => {
  const app = await makeApp('variants');
  try {
    const T = app.services.templates;
    const en = T.list().find((t) => t.name === 'HSC Board – passing certificate collection');
    assert.ok(en && en.variant_group);
    const mr = T.variant(en.id, 'mr');
    assert.ok(mr, 'Marathi variant exists');
    assert.equal(mr.language, 'mr');
    assert.match(mr.default_subject, /उत्तीर्ण प्रमाणपत्र/);
    assert.match(mr.default_body, /प्रमाणपत्रे/);
    // the Marathi template uses Marathi labels
    const L = app.services.letters;
    const d = L.saveDraft({ category_id: category(app, 'HSC').id, template_id: mr.id, language: 'mr', recipient_designation: 'मा. विभागीय सचिव', recipient_office: 'विभागीय मंडळ', subject: mr.default_subject, body: mr.default_body });
    const g = await L.generate(d.id);
    const text = docx.extractText(fs.readFileSync(g.path));
    for (const s of ['जा. क्र.:', 'दिनांक:', 'प्रति,', 'विषय:', 'आपला विश्वासू']) assert.ok(text.includes(s), `missing ${s}`);
    // sample sync is idempotent: reopening does not duplicate samples
    const count = T.list().length;
    await T.installBundledSamples();
    assert.equal(T.list().length, count);
  } finally { cleanup(app); }
});

test('previous letter: only the reference value and the date are replaced, everything else kept', () => {
  const z = new (require('pizzip'))(buildSampleDocx('en'));
  const doc = z.file('word/document.xml').asText().replace(/<w:body>[\s\S]*?(<w:sectPr)/, '<w:body><w:p><w:r><w:t>Ref: OLD/029/2025-26</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">दिनांक: </w:t></w:r><w:r><w:t>05/10/2025</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>प्रति,</w:t></w:r></w:p><w:p><w:r><w:t>मा. विभागीय सचिव,</w:t></w:r></w:p><w:p><w:r><w:t>विषय: गुणपत्रिका मिळण्याबाबत.</w:t></w:r></w:p><w:p><w:r><w:t>Body text stays.</w:t></w:r></w:p>$1');
  z.file('word/document.xml', doc);
  const { buffer, meta } = makeReusableLetter(z.generate({ type: 'nodebuffer' }));
  assert.equal(docx.verifyDocx(buffer), true);
  const t = docx.extractText(buffer);
  assert.ok(t.startsWith('Ref: {{outward_number}}\tदिनांक: {{letter_date}}'), t.slice(0, 80));
  assert.ok(t.includes('Body text stays.') && !t.includes('OLD/029'));
  assert.equal(meta.subject, 'गुणपत्रिका मिळण्याबाबत.');
  assert.deepEqual(meta.recipientLines.slice(0, 1), ['मा. विभागीय सचिव']);
  assert.equal(meta.language, 'mr');
});

test('import the real college letters and reuse one end to end', { skip: !have && 'college letters not available' }, async () => {
  const app = await makeApp('library');
  try {
    const T = app.services.templates;
    const files = fs.readdirSync(PRIVATE).filter((f) => f.endsWith('.docx')).length;
    // a private build may already have imported its bundled letters at start-up
    T.importPreviousFolder(PRIVATE);
    const lib = T.list({ kind: 'library' });
    assert.equal(lib.length, files, 'every letter imported exactly once');
    assert.ok(lib.filter((t) => t.meta.refFound && t.meta.dateFound).length >= 35);
    assert.equal(T.importPreviousFolder(PRIVATE).filter((r) => r.skipped).length, files, 're-import skips duplicates');
    assert.equal(T.list().filter((t) => t.kind === 'library').length, 0, 'previous letters are not mixed into the template list');
    const hsc = lib.find((t) => / - 23 - /.test(t.meta.sourceFile));
    assert.ok(hsc, 'HSC certificate letter found');
    assert.equal(hsc.category_id, category(app, 'HSC').id, 'category detected');
    const L = app.services.letters;
    const d = L.fromPreviousLetter(hsc.id, { letter_date: '2026-11-20' });
    assert.equal(d.category_id, category(app, 'HSC').id);
    assert.match(d.recipient_designation, /विभागीय सचिव/);
    const g = await L.generate(d.id);
    const text = docx.extractText(fs.readFileSync(g.path));
    assert.ok(text.includes(g.letter.outward_no), 'new outward number printed');
    assert.ok(text.includes('20/11/2026'), 'new date printed');
    assert.ok(!text.includes('DRMAAJC/2026-2027/008'), 'old number gone');
    assert.ok(text.includes('गुणपत्रिका व प्रमाणपत्र मिळण्याबाबत विनंती'), 'the rest of the letter is unchanged');
    const f = await L.finalize(d.id, { confirmUnmodified: true });
    assert.ok(f.ok, f.error);
    assert.ok(fs.existsSync(f.confirmation.pdf));
  } finally { cleanup(app); }
});
