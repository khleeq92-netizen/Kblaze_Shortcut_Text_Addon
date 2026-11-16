const { _electron: electron } = require('playwright');
const path = require('path'); const fs = require('fs');
(async () => {
  const root = process.cwd(); const data = path.join(root, '.test-data', 'ui2'); fs.rmSync(data, { recursive: true, force: true });
  const out = path.join(root, 'test', 'e2e', 'output', 'ui2'); fs.mkdirSync(out, { recursive: true });
  const app = await electron.launch({ executablePath: require(root + '/node_modules/electron'), args: ['--no-sandbox', root], env: { ...process.env, EDUDESK_DATA: data, NODE_OPTIONS: '' } });
  const win = await app.firstWindow(); const errors = [];
  win.on('pageerror', (e) => errors.push(String(e))); win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await win.setViewportSize({ width: 1440, height: 900 }); await win.waitForSelector('#nav a');
  const call = (s, m, ...a) => win.evaluate(async ([s2, m2, a2]) => { const r = await window.edudesk.call(s2, m2, ...a2); if (!r.ok) throw new Error(r.error); return r.result; }, [s, m, a]);
  await call('sys', 'settingsSet', 'college', { name: 'Sample Junior College of Science' });
  await call('sys', 'settingsSet', 'letter', { language: 'mr' });
  await call('sys', 'settingsSet', 'ui', { onboardingDone: true });
  const go = async (h) => { await win.evaluate((x) => { location.hash = x; }, h); await win.waitForTimeout(900); };
  // 1) Marathi: HSC + passing certificate -> template text in Marathi
  await go('#/dashboard'); await go('#/letter/new');
  const cats = await call('categories', 'list', {}); const hsc = cats.find((c) => c.code === 'HSC'); const sub = hsc.subcategories.find((s) => /Passing/.test(s.name));
  await win.selectOption('[name="category_id"]', String(hsc.id)); await win.waitForTimeout(200);
  await win.selectOption('[name="subcategory_id"]', String(sub.id)); await win.waitForTimeout(300);
  const tplText = await win.$eval('[name="template_id"]', (s) => s.options[s.selectedIndex].text);
  const lang = await win.$eval('[name="language"]', (s) => s.value);
  const subj = await win.$eval('[name="subject"]', (s) => s.value);
  await win.screenshot({ path: path.join(out, '1_marathi_template.png') });
  // switch to English and back
  await win.selectOption('[name="language"]', 'en'); await win.waitForTimeout(300);
  const subjEn = await win.$eval('[name="subject"]', (s) => s.value);
  await win.selectOption('[name="language"]', 'mr'); await win.waitForTimeout(300);
  const subjMr = await win.$eval('[name="subject"]', (s) => s.value);
  // 2) reuse mode with imported letters
  const rep = await call('templates', 'importPreviousFolder', path.join(root, 'private', 'college-letters'));
  await win.evaluate(() => { window.__go && 0; });
  await go('#/drafts'); if (await win.locator('button:has-text("Leave")').count()) { await win.locator('button:has-text("Leave")').click(); await win.waitForTimeout(500); } await go('#/letter/new?mode=reuse');
  await win.fill('#rq', 'गुणपत्रिका'); await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(out, '2_reuse_list.png') });
  await win.locator('[data-use]').first().click(); await win.waitForTimeout(500);
  await win.screenshot({ path: path.join(out, '3_reuse_form.png') });
  console.log(JSON.stringify({ tplText, lang, subj, subjEn, subjMr, imported: rep.filter((r) => r.ok).length, errors }, null, 1));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
