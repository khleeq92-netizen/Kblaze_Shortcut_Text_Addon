'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const PizZip = require('pizzip');
const { EduDeskApp } = require('../src/core/app');

const PRIVATE = path.join(__dirname, '..', 'private', 'college-letters');

async function makeApp(name, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `edudesk-test-${name}-`));
  const app = await new EduDeskApp({ dataRoot: root, ...opts }).open();
  app.settings.set('college', {
    name: 'Test Junior College of Science', address: 'Main Road, Test Town', udise_code: '27000000001', index_no: '56.09.012',
    principal_name: 'Dr Test Principal', principal_designation: 'Principal', district: 'Sample District', block: 'Sample Taluka', phone: '9000000000',
  });
  return app;
}

function cleanup(app) {
  const root = app.dataRoot;
  try { if (app.db) app.close(); } catch (_) { /* ignore */ }
  fs.rmSync(root, { recursive: true, force: true });
}

function category(app, code) {
  return app.services.categories.list().find((c) => c.code === code);
}

function template(app, startsWith) {
  return app.services.templates.list().find((t) => t.name.startsWith(startsWith));
}

/** Simulate a user editing and saving the document in Word. */
function editDocx(p, find, replace) {
  const z = new PizZip(fs.readFileSync(p));
  const x = z.file('word/document.xml').asText();
  if (!x.includes(find)) throw new Error(`text "${find}" not found in document`);
  z.file('word/document.xml', x.replace(find, replace));
  fs.writeFileSync(p, z.generate({ type: 'nodebuffer' }));
}

function docText(p) {
  return require('../src/core/docx').extractText(fs.readFileSync(p));
}

function pdfText(p) {
  return require('child_process').execFileSync('pdftotext', ['-layout', p, '-']).toString();
}

async function draftAndGenerate(app, extra = {}) {
  const L = app.services.letters;
  const cat = category(app, extra.cat || 'BEO');
  const d = L.saveDraft({
    category_id: cat.id, subcategory_id: cat.subcategories[0].id, template_id: template(app, 'Standard Letter (English)').id,
    recipient_designation: 'Block Education Officer', recipient_office: 'Panchayat Samiti, Sample Taluka', subject: 'Submission of student information',
    body: 'Paragraph one.\nParagraph two.', enclosures: 'List of students\nAadhaar copies', ...extra.fields,
  });
  const g = await L.generate(d.id);
  return { d, g, letter: g.letter };
}

module.exports = { makeApp, cleanup, category, template, editDocx, docText, pdfText, draftAndGenerate, PRIVATE };
