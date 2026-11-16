'use strict';
/**
 * End-to-end test of the real Electron app, driven through the user interface.
 *   xvfb-run -a node test/e2e/run-e2e.js        (Linux CI)
 *   node test/e2e/run-e2e.js                     (Windows)
 * Word editing is simulated by changing the saved .docx on disk, exactly as Word would.
 */
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const PizZip = require('pizzip');

const root = path.join(__dirname, '..', '..');
const data = path.join(root, '.test-data', 'e2e');
const shots = path.join(__dirname, 'output', 'e2e');
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✓ ${name}`); } catch (e) { try { await globalThis.__shot && globalThis.__shot('FAIL'); } catch (_) {} results.push({ name, ok: false, error: e.message }); console.log(`  ✗ ${name}\n    ${e.message}`); throw e; }
};

(async () => {
  fs.rmSync(data, { recursive: true, force: true });
  fs.mkdirSync(shots, { recursive: true });
  const app = await electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', root], env: { ...process.env, EDUDESK_DATA: data, NODE_OPTIONS: '' } });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(String(e)));
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await win.setViewportSize({ width: 1440, height: 900 });
  const call = (s, m, ...a) => win.evaluate(async ([s2, m2, a2]) => { const r = await window.edudesk.call(s2, m2, ...a2); if (!r.ok) throw new Error(r.error); return r.result; }, [s, m, a]);
  const shot = (n) => win.screenshot({ path: path.join(shots, `${n}.png`) });
  globalThis.__shot = shot;
  const clickText = async (t) => { await win.getByRole('button', { name: t, exact: false }).first().click(); };
  const go = async (h) => { await win.evaluate((x) => { location.hash = x; }, h); await win.waitForTimeout(700); };

  try {
    await win.waitForSelector('#nav a');
    await step('first run opens the college profile', async () => {
      await win.waitForSelector('[name="name"]');
      await win.fill('[name="name"]', 'Sample Junior College of Science');
      await win.fill('[name="address"]', 'Main Road, Sample Taluka, Sample District');
      await win.fill('[name="udise_code"]', '27000000001');
      await win.fill('[name="index_no"]', '56.09.012');
      await win.fill('[name="principal_name"]', 'Dr Sample Principal');
      await win.fill('[name="district"]', 'Sample District');
      await win.fill('[name="block"]', 'Sample Taluka');
      await shot('01_college_profile');
      await clickText('Save college profile');
      await win.waitForTimeout(800);
      const s = await call('sys', 'settingsAll');
      assert.equal(s.college.udise_code, '27000000001');
    });

    const collegeLetter = path.join(root, 'private', 'college-letters');
    if (fs.existsSync(collegeLetter)) {
      await step('college letterhead imported as a template', async () => {
        const f = path.join(collegeLetter, fs.readdirSync(collegeLetter).find((x) => x.startsWith('03 HSC_Board - 20')));
        const r = await call('templates', 'create', { name: 'College Letterhead (English)', language: 'en', convertBody: true, is_letterhead: true }, f);
        await call('sys', 'settingsSet', 'letter', { defaultTemplateId: r.template.id });
      });
    }

    let letterId;
    await step('create a letter through the UI and save the draft', async () => {
      await go('#/letter/new');
      const beo = (await call('categories', 'list', {})).find((c) => c.code === 'BEO');
      await win.selectOption('[name="category_id"]', String(beo.id));
      await win.fill('[name="recipient_designation"]', 'Block Education Officer');
      await win.fill('[name="recipient_office"]', 'Panchayat Samiti, Sample Taluka');
      await win.fill('[name="subject"]', 'Submission of student information for 2026-27');
      await win.fill('[name="body"]', 'With reference to the above subject, the information of our students is enclosed.\nKindly accept the same.');
      await win.fill('[name="summary"]', 'Student information sent to BEO');
      await win.fill('[name="enclosures"]', 'Student list\nAadhaar copies');
      await shot('02_letter_form');
      await clickText('Save Draft');
      await win.waitForFunction(() => /#\/letter\/\d+/.test(location.hash));
      letterId = Number((await win.evaluate(() => location.hash)).split('/').pop());
      const l = await call('letters', 'get', letterId);
      assert.equal(l.status, 'Draft');
      assert.equal(l.outward_no, null);
    });

    await step('generate the Word document (outward number reserved)', async () => {
      await clickText('Generate Word Document');
      await win.getByText('Word document ready').waitFor();
      await shot('03_word_ready');
      await win.getByRole('button', { name: 'Later' }).click();
      const l = await call('letters', 'get', letterId);
      assert.equal(l.status, 'Generated');
      assert.match(l.outward_no, /^OUT\/001\/\d{4}-\d{2}$/);
      assert.ok(fs.existsSync(l.work_abs));
    });

    await step('edit in Word (simulated save), then Finalize & Archive', async () => {
      const l = await call('letters', 'get', letterId);
      const z = new PizZip(fs.readFileSync(l.work_abs));
      z.file('word/document.xml', z.file('word/document.xml').asText().replace('Kindly accept the same.', 'Kindly accept the same. (Edited in Word)'));
      fs.writeFileSync(l.work_abs, z.generate({ type: 'nodebuffer' }));
      await win.waitForTimeout(4500);
      await shot('04_ready_to_finalize');
      await clickText('Finalize & Archive');
      await win.getByText('Letter finalized and archived').waitFor({ timeout: 120000 });
      await win.getByText('DOCX saved successfully').waitFor();
      await shot('05_finalized');
      await win.getByRole('button', { name: 'Done' }).click();
      const f = await call('letters', 'get', letterId);
      assert.equal(f.archive_status, 'Complete');
      assert.ok(fs.existsSync(f.docx_abs) && fs.existsSync(f.pdf_abs));
      const txt = require('child_process').execFileSync('pdftotext', [f.pdf_abs, '-']).toString();
      assert.ok(txt.includes('Edited in Word'), 'PDF contains the Word edit');
    });

    await step('record dispatch through the UI', async () => {
      await go(`#/letter/${letterId}`);
      await clickText('Record Dispatch');
      await win.selectOption('.modal [name="dispatch_mode"]', 'Speed Post');
      await win.fill('.modal [name="tracking_no"]', 'EE123456789IN');
      await win.getByRole('button', { name: 'Save dispatch details' }).click();
      await win.waitForTimeout(800);
      const l = await call('letters', 'get', letterId);
      assert.equal(l.dispatch_status, 'Dispatched');
      assert.equal(l.tracking_no, 'EE123456789IN');
    });

    let inwardId;
    await step('inward entry through the UI and a linked reply', async () => {
      await go('#/inward/new');
      await win.fill('#frm [name="sender_office"]', 'Divisional Board');
      await win.fill('#frm [name="subject"]', 'Submission of HSC pre-list');
      await win.check('#frm [name="reply_required"]');
      await clickText('Save & assign inward number');
      await win.waitForFunction(() => /#\/inward\/\d+/.test(location.hash));
      inwardId = Number((await win.evaluate(() => location.hash)).split('/').pop());
      const r = await call('inward', 'get', inwardId);
      assert.match(r.inward_no, /^IN\/001\//);
      await shot('06_inward');
      await clickText('Draft reply letter');
      await win.waitForFunction(() => /#\/letter\/\d+/.test(location.hash));
      const rid = Number((await win.evaluate(() => location.hash)).split('/').pop());
      const rl = await call('letters', 'get', rid);
      assert.equal(rl.inward_id, inwardId);
    });

    let udiseLetter;
    await step('UDISE S02 through the UI: manual student, covering letter, finalize', async () => {
      await go('#/udise');
      await win.getByRole('button', { name: 'Start S02' }).click();
      await win.waitForTimeout(500);
      await clickText('Enter manually');
      const set = async (k, v) => win.fill(`.student-card [data-k="${k}"]`, v);
      await set('name', 'SANA SHAIKH');
      await win.selectOption('.student-card [data-k="gender"]', 'Female');
      await set('dob', '2010-03-12');
      await set('class_name', '11');
      await set('section', 'A');
      await set('admission_date', '2026-06-15');
      await set('father_name', 'शेख अहमद');
      await set('mother_name', 'SHAIKH RUKHSAR');
      await set('mobile', '9876543210');
      await set('aadhaar', '123412341234');
      await set('aadhaar_name', 'SANA SHAIKH');
      await win.selectOption('.student-card [data-k="reason"]', { index: 3 });
      await clickText('Check all forms');
      await win.getByText('All checks passed.').waitFor();
      await shot('07_udise_s02');
      await clickText('Continue to covering letter');
      await win.getByText('Covering letter', { exact: true }).waitFor();
      await win.getByRole('button', { name: /Generate 1 form/ }).click();
      await win.waitForFunction(() => /#\/letter\/\d+/.test(location.hash), null, { timeout: 60000 });
      udiseLetter = Number((await win.evaluate(() => location.hash)).split('/').pop());
      await win.waitForTimeout(800);
      await shot('08_udise_letter');
      await clickText('Generate Word Document');
      await win.getByText('Word document ready').waitFor();
      await win.getByRole('button', { name: 'Later' }).click();
      await clickText('Finalize & Archive');
      await win.getByText('No changes saved in Word').waitFor();
      await win.getByRole('button', { name: 'Finalize as it is' }).click();
      await win.getByText('Letter finalized and archived').waitFor({ timeout: 120000 });
      await win.getByRole('button', { name: 'Done' }).click();
      const l = await call('letters', 'get', udiseLetter);
      const files = fs.readdirSync(l.archive_abs);
      for (const n of ['Covering_Letter.docx', 'Covering_Letter.pdf', 'S02_SANA_SHAIKH.pdf', 'Batch_Manifest.txt']) assert.ok(files.includes(n), `missing ${n}`);
      const ed = path.join(l.archive_abs, 'Editable_Copies', 'S02_SANA_SHAIKH_editable.pdf');
      const { PDFDocument } = require('pdf-lib');
      const form = (await PDFDocument.load(fs.readFileSync(ed))).getForm();
      assert.equal(form.getTextField("father's_name_15").getText(), 'शेख अहमद');
      assert.equal(form.getTextField('udise_code_1').getText(), '27000000001');
      await go(`#/letter/${udiseLetter}`);
      await shot('09_udise_archived');
    });

    await step('outward register shows the letters; report exported as PDF', async () => {
      await go('#/outward');
      await win.getByText('OUT/001/', { exact: false }).first().waitFor();
      await shot('10_outward_register');
      const out = path.join(data, 'Exports', 'outward_register_test.pdf');
      const r = await call('reports', 'export', 'outward', {}, 'pdf', out);
      assert.ok(r.rows >= 2 && fs.statSync(out).size > 0);
      const txt = require('child_process').execFileSync('pdftotext', ['-layout', out, '-']).toString();
      assert.ok(txt.includes('OUTWARD REGISTER') && txt.includes('OUT/001/') && txt.includes('EE123456789IN'), txt.slice(0, 800));
    });

    await step('global search finds outward and inward records', async () => {
      await win.fill('#global-search', 'Submission');
      await win.press('#global-search', 'Enter');
      await win.waitForTimeout(1000);
      await shot('11_search');
      const r = await call('search', 'run', { q: 'Submission' });
      assert.ok(r.some((x) => x.type === 'inward') && r.some((x) => x.type === 'outward'));
    });

    await step('backup through the UI is created and verified', async () => {
      await go('#/settings/backup');
      await clickText('Back up now');
      await win.getByText('Backup created and verified', { exact: false }).waitFor({ timeout: 120000 });
      await shot('12_backup');
      const b = await call('backup', 'list');
      assert.equal(b[0].verified, 1);
    });

    await step('dashboard reflects the records', async () => {
      await go('#/dashboard');
      await shot('13_dashboard');
      const s = await call('dashboard', 'stats');
      assert.equal(s.totalOutward, 2);
      assert.equal(s.totalInward, 1);
    });

    assert.deepEqual(errors, [], `renderer errors: ${errors.join(' | ')}`);
  } finally {
    fs.writeFileSync(path.join(shots, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    await app.close();
  }
  console.log(`\nE2E: ${results.filter((r) => r.ok).length}/${results.length} steps passed`);
})().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
