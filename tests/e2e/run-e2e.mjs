// End-to-end tests: loads the built extension (dist/) into Chromium and verifies
// expansion across editor types, forms, the assistant, Autopilot and the UI.
//   npm run test:e2e        (builds first)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'manifest.json'))) throw new Error('Run npm run build first');
execFileSync(process.execPath, [path.join(here, 'build-fixtures.mjs')], { stdio: 'inherit' });

// ---------- static server for fixture pages
const server = http.createServer((req, res) => {
  // /isolated.html = fixture page with WhatsApp Web's cross-origin isolation headers
  if (req.url.startsWith('/isolated')) {
    res.writeHead(200, { 'content-type': 'text/html', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
    res.end(fs.readFileSync(path.join(here, 'fixtures/index.html'))); return;
  }
  const p = path.join(here, 'fixtures', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(path.join(here, 'fixtures')) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    const idx = path.join(here, 'fixtures/index.html');
    res.writeHead(200, { 'content-type': 'text/html' }); res.end(fs.readFileSync(idx)); return;
  }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;

const profile = path.join(here, '.profile-' + Date.now());
const ctx = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--no-first-run'],
  viewport: { width: 1280, height: 900 },
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const ext = (p) => `chrome-extension://${extId}/${p}`;

const results = [];
let page;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const t0 = Date.now();
  await page?.evaluate(() => document.querySelectorAll('qth-overlay-root').forEach((e) => e.remove())).catch(() => {});
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('  ✓', name); }
  catch (e) { results.push({ name, ok: false, error: String(e?.message || e) }); console.log('  ✗', name, '\n     ', String(e?.message || e).split('\n')[0]); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m = '') => { if (a !== b) throw new Error(`${m} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, msg = 'condition') {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await sleep(60); }
  throw new Error('Timed out waiting for ' + msg + (last instanceof Error ? ': ' + last.message : ''));
}

// ---------- seed test data through the dashboard origin (raw IndexedDB + storage)
await sleep(800); // onInstalled seeding
const dash = await ctx.newPage();
await dash.goto(ext('dashboard/index.html#/snippets'));
await dash.waitForSelector('.sidebar');
const now = Date.now();
const S = (id, shortcut, content, extra = {}) => ({ id, name: id, shortcut, content, contentType: 'text', folderId: null, enabled: true, favorite: false, pinned: false, tags: [], trigger: 'default', createdAt: now, updatedAt: now, ...extra });
const testSnippets = [
  S('t_multi', ';addr', 'Line one\nLine two\nLine three'),
  S('t_cursor', ';cur', 'Hi {{cursor}}!'),
  S('t_rich', ';rich', '<p>Hello <b>bold</b> world</p>', { contentType: 'html' }),
  S('t_form', ';pay', 'Dear {{name}}, pay {{currency: amount; required}} by {{date: due; default=2030-01-31; format=DD/MM/YYYY}}.'),
  S('t_disabled', ';off', 'should not expand', { enabled: false }),
  S('t_math', ';calc', '{{= 6 * 7}} items on {{today; format=YYYY}}'),
];
await dash.evaluate(async (snips) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('quicktext-hub-db', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res) => { const tx = db.transaction('snippets', 'readwrite'); snips.forEach((s) => tx.objectStore('snippets').put(s)); tx.oncomplete = res; });
  await chrome.storage.local.set({ 'qth.revision': { at: Date.now(), collections: ['snippets'] } });
}, testSnippets);
const setSettings = (patch) => dash.evaluate(async (p) => {
  const cur = (await chrome.storage.local.get('qth.settings'))['qth.settings'] || {};
  await chrome.storage.local.set({ 'qth.settings': { ...cur, ...p, profile: { name: 'Test User', email: 'test@example.com', signature: 'Best,\nTest User', phone: '', company: 'Acme', title: '', website: '', ...(cur.profile || {}) } } });
}, patch);
await setSettings({});

page = await ctx.newPage();
if (process.env.DEBUG) { page.on('console', (m) => console.log('   [page]', m.text())); page.on('pageerror', (e) => console.log('   [pageerror]', e.message)); }
await page.goto(base);
await page.waitForFunction(() => window.lexicalText && window.quillText);
await sleep(400);

async function typeInto(sel, text, frame = page) {
  await frame.click(sel);
  await page.keyboard.type(text, { delay: 25 });
  await sleep(250);
}
const val = (sel) => page.$eval(sel, (e) => e.value);
const txt = (sel) => page.$eval(sel, (e) => e.innerText);
async function clear() {
  await page.evaluate(() => {
    document.querySelectorAll('qth-overlay-root').forEach((e) => e.remove());
    for (const id of ['input', 'textarea', 'controlled', 'password']) document.getElementById(id).value = '';
    document.getElementById('ce').innerHTML = '';
    document.getElementById('gmail').innerHTML = '<div><br></div>';
  });
}

console.log(`\nQuickText Hub E2E (extension ${extId})\n`);

await test('sample data is seeded on install (/ty, /sig, /payment, /trade)', async () => {
  const n = await dash.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('quicktext-hub-db', 1); r.onsuccess = () => res(r.result); });
    return new Promise((res) => { const q = db.transaction('snippets').objectStore('snippets').getAll(); q.onsuccess = () => res(q.result.map((s) => s.shortcut)); });
  });
  for (const s of ['/ty', '/sig', '/payment', '/trade']) assert(n.includes(s), 'missing ' + s);
});

await test('input: shortcut expands immediately', async () => {
  await clear(); await typeInto('#input', 'Thanks /ty');
  eq(await val('#input'), 'Thanks Thank you so much! 🙏');
});
await test('input: caret is placed after the inserted text', async () => {
  await page.keyboard.type(' ok', { delay: 20 });
  eq(await val('#input'), 'Thanks Thank you so much! 🙏 ok');
});
await test('input: word-boundary rule (no expansion inside "abc/ty")', async () => {
  await clear(); await typeInto('#input', 'abc/ty');
  eq(await val('#input'), 'abc/ty');
});
await test('input: disabled snippets never expand', async () => {
  await clear(); await typeInto('#input', ';off');
  eq(await val('#input'), ';off');
});
await test('password fields are never touched', async () => {
  await clear(); await typeInto('#password', '/ty');
  eq(await val('#password'), '/ty');
});
await test('framework-controlled input receives input events (React-style state)', async () => {
  await clear(); await typeInto('#controlled', '/ty');
  eq(await page.evaluate(() => window.controlledState()), 'Thank you so much! 🙏');
});
await test('textarea: multi-line snippet', async () => {
  await clear(); await typeInto('#textarea', 'A: ;addr');
  eq(await val('#textarea'), 'A: Line one\nLine two\nLine three');
});
await test('textarea: native undo (Ctrl+Z) restores the shortcut', async () => {
  await page.keyboard.press('Control+z');
  await sleep(150);
  const v = await val('#textarea');
  assert(v.startsWith('A: ;add') && !v.includes('Line'), 'got ' + JSON.stringify(v));
});
await test('textarea: {{cursor}} positions the caret', async () => {
  await clear(); await typeInto('#textarea', ';cur');
  await page.keyboard.type('Sam', { delay: 20 });
  eq(await val('#textarea'), 'Hi Sam!');
});
await test('formulas + dates render in the background', async () => {
  await clear(); await typeInto('#input', ';calc');
  eq(await val('#input'), `42 items on ${new Date().getFullYear()}`);
});
await test('contenteditable: expansion with surrounding text', async () => {
  await clear(); await typeInto('#ce', 'Hello /ty');
  eq((await txt('#ce')).trim(), 'Hello Thank you so much! 🙏');
});
await test('contenteditable (Gmail-style div structure): multi-line', async () => {
  await clear(); await typeInto('#gmail', ';addr');
  const t = await txt('#gmail');
  assert(t.includes('Line one') && t.includes('Line three') && t.split('\n').filter(Boolean).length >= 3, JSON.stringify(t));
  assert(!t.includes(';addr'), 'shortcut left behind');
});
await test('contenteditable: rich snippet keeps formatting', async () => {
  await clear(); await typeInto('#ce', ';rich');
  const h = await page.$eval('#ce', (e) => e.innerHTML);
  assert(/<b>bold<\/b>/.test(h) && !h.includes(';rich'), h);
});
await test('Quill editor (paste adapter)', async () => {
  await typeInto('#quill .ql-editor', 'Q /ty');
  eq((await page.evaluate(() => window.quillText())).trim(), 'Q Thank you so much! 🙏');
});
await test('Lexical editor — WhatsApp Web’s editor framework (paste adapter)', async () => {
  await typeInto('#lexical', 'L /ty');
  await sleep(200);
  eq((await page.evaluate(() => window.lexicalText())).trim(), 'L Thank you so much! 🙏');
});
await test('Lexical editor: multi-line snippet', async () => {
  await page.keyboard.press('Enter');
  await page.keyboard.type(';addr', { delay: 25 });
  await sleep(300);
  const t = await page.evaluate(() => window.lexicalText());
  assert(t.includes('Line one') && t.includes('Line three') && !t.includes(';addr'), JSON.stringify(t));
});
await test('same-origin iframe editor', async () => {
  const f = page.frameLocator('#frame');
  await f.locator('#inner').click();
  await page.keyboard.type('In frame /ty', { delay: 25 });
  await sleep(300);
  eq((await f.locator('#inner').innerText()).trim(), 'In frame Thank you so much! 🙏');
});
await test('fill-in form: overlay opens, validates required field, inserts result', async () => {
  await clear(); await typeInto('#textarea', ';pay');
  const frameEl = await page.waitForSelector('qth-overlay-root', { state: 'attached', timeout: 4000 });
  assert(frameEl, 'no overlay');
  const of = await until(() => page.frames().find((f) => !f.isDetached() && f.url().includes('/overlay/index.html')), 4000, 'overlay frame');
  await of.waitForSelector('.qform input');
  const inputs = await of.$$('.qform input');
  await inputs[0].fill('Ada');
  await of.click('button:has-text("Insert")');
  await sleep(200);
  assert(await of.$('.err'), 'required error should show for empty amount');
  await inputs[1].fill('1250');
  await of.click('button:has-text("Insert")');
  if (process.env.DEBUG) { await sleep(1000); console.log('   overlay?', await page.evaluate(() => !!document.querySelector('qth-overlay-root')), 'value:', JSON.stringify(await val('#textarea')), 'ovErr:', await of.evaluate(() => document.body.innerText.slice(0, 400)).catch((e) => 'detached')); }
  await until(async () => (await val('#textarea')).includes('Ada'), 4000, 'insertion');
  eq(await val('#textarea'), 'Dear Ada, pay $1,250.00 by 31/01/2030.');
});
await test('snippet assistant: hotkey opens picker, search + Enter inserts', async () => {
  await clear(); await page.click('#input');
  await page.keyboard.type('Note: ', { delay: 20 });
  await page.keyboard.press('Control+Shift+Space');
  const of = await until(() => page.frames().find((f) => !f.isDetached() && f.url().includes('/overlay/index.html')), 4000, 'picker frame');
  await of.waitForSelector('.ov-list li');
  await page.keyboard.type('Quick thanks', { delay: 15 });
  await sleep(150);
  // Enter inserts and closes the picker, so its frame can vanish mid-keypress; judge by the result.
  await of.press('.ov-search', 'Enter', { timeout: 2000 }).catch(() => {});
  if (process.env.DEBUG) { await sleep(1500); console.log('   DBG overlay open:', await page.evaluate(() => !!document.querySelector('qth-overlay-root')), 'frame detached:', of.isDetached(), 'value:', JSON.stringify(await val('#input')), 'search:', of.isDetached() ? '-' : await of.$eval('.ov-search', (e) => e.value + ' items=' + document.querySelectorAll('.ov-list li').length).catch(() => '?')); }
  await until(async () => (await val('#input')).includes('Thank you'), 4000, 'insert from picker');
  eq(await val('#input'), 'Note: Thank you so much! 🙏');
});
await test('delimiter trigger mode keeps the typed punctuation', async () => {
  await setSettings({ triggerMode: 'delimiter' });
  await sleep(400);
  await clear(); await typeInto('#input', '/ty, ok');
  eq(await val('#input'), 'Thank you so much! 🙏, ok');
  await setSettings({ triggerMode: 'immediate' });
  await sleep(400);
});
await test('per-site disable list stops expansion', async () => {
  await setSettings({ blockedSites: ['127.0.0.1'] });
  await sleep(400);
  await clear(); await typeInto('#input', '/ty');
  eq(await val('#input'), '/ty');
  await setSettings({ blockedSites: [] });
  await sleep(400);
});
await test('Autopilot: fills by label, selects option, ticks box, asks before submitting', async () => {
  await dash.evaluate(async () => {
    const wf = { id: 'wf_e2e', name: 'E2E form', enabled: true, createdAt: Date.now(), updatedAt: Date.now(), steps: [
      { id: 'a', type: 'type', target: { kind: 'label', value: 'Name' }, value: '{{me.name}}', clear: true },
      { id: 'b', type: 'tab' },
      { id: 'c', type: 'type', target: { kind: 'focused', value: '' }, value: 'ada@example.com' },
      { id: 'd', type: 'select', target: { kind: 'label', value: 'Topic' }, value: 'Support' },
      { id: 'e', type: 'check', target: { kind: 'label', value: 'I agree' }, checked: true },
      { id: 'f', type: 'click', target: { kind: 'label', value: 'Send message' } },
    ] };
    const db = await new Promise((res) => { const r = indexedDB.open('quicktext-hub-db', 1); r.onsuccess = () => res(r.result); });
    await new Promise((res) => { const tx = db.transaction('workflows', 'readwrite'); tx.objectStore('workflows').put(wf); tx.oncomplete = res; });
    const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
    await chrome.tabs.sendMessage(tab.id, { type: 'qth/runWorkflow', id: 'wf_e2e' }, { frameId: 0 });
  });
  const of = await until(() => page.frames().find((f) => !f.isDetached() && f.url().includes('/overlay/index.html')), 8000, 'confirmation dialog');
  await of.waitForSelector('button:has-text("Approve")');
  eq(await page.$eval('#submitted', (e) => e.textContent), '', 'must not submit before approval');
  eq(await page.$eval('#f-name', (e) => e.value), 'Test User');
  eq(await page.$eval('#f-email', (e) => e.value), 'ada@example.com');
  eq(await page.$eval('#f-topic', (e) => e.value), 'Support');
  eq(await page.$eval('#f-agree', (e) => e.checked), true);
  await of.click('button:has-text("Approve")');
  await until(async () => (await page.$eval('#submitted', (e) => e.textContent)).startsWith('SUBMITTED'), 4000, 'submit');
  eq(await page.$eval('#submitted', (e) => e.textContent), 'SUBMITTED:Test User|ada@example.com|Support');
});
await test('Autopilot: cancelling the confirmation stops the workflow', async () => {
  await sleep(800); // let the previous run finish
  await page.evaluate(() => { document.getElementById('submitted').textContent = ''; });
  await dash.evaluate(async () => { const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' }); await chrome.tabs.sendMessage(tab.id, { type: 'qth/runWorkflow', id: 'wf_e2e' }, { frameId: 0 }); });
  const of = await until(() => page.frames().find((f) => !f.isDetached() && f.url().includes('/overlay/index.html')), 8000, 'confirmation dialog');
  await of.click('button:has-text("Cancel")');
  await sleep(500);
  eq(await page.$eval('#submitted', (e) => e.textContent), '');
});

await test('dashboard: create a snippet through the UI and use it', async () => {
  await dash.goto(ext('dashboard/index.html#/new'));
  await dash.fill('.name-input', 'UI snippet');
  await dash.fill('input[placeholder="/sig"]', ';ui');
  await dash.fill('.code-wrap textarea', 'Created in the dashboard for {{me.name}}');
  await dash.click('button:has-text("Save")');
  await dash.waitForSelector('text=Snippet saved');
  await sleep(300);
  await page.bringToFront();
  await clear(); await typeInto('#input', ';ui');
  eq(await val('#input'), 'Created in the dashboard for Test User');
});
await test('dashboard: live preview renders the form + output', async () => {
  await dash.bringToFront();
  await dash.goto(ext('dashboard/index.html#/snippet/t_form'));
  await dash.waitForSelector('.qform');
  const inputs = await dash.$$('.qform input');
  await inputs[0].fill('Bo');
  await inputs[1].fill('10');
  await until(async () => (await dash.textContent('.preview-box')).includes('Dear Bo, pay $10.00 by 31/01/2030.'), 3000, 'preview');
});
await test('dashboard: every main view renders without errors', async () => {
  const errors = [];
  dash.on('pageerror', (e) => errors.push(e.message));
  for (const r of ['/snippets', '/favorites', '/recent', '/templates', '/data', '/data/tbl_customers', '/autopilot', '/autopilot/wf_contact_form', '/marketplace', '/stats', '/settings', '/settings?tab=expansion', '/settings?tab=cloud', '/settings?tab=backup', '/settings?tab=plan', '/settings?tab=syntax', '/welcome', '/search?q=thank']) {
    await dash.goto(ext('dashboard/index.html#' + r));
    await dash.waitForSelector('.main >> *', { timeout: 4000 });
    await sleep(120);
  }
  assert(!errors.length, errors.join('; '));
});
await test('dashboard: command builder inserts a dropdown command', async () => {
  await dash.goto(ext('dashboard/index.html#/new'));
  await dash.click('text=Insert field / command');
  await dash.click('.cmd-tile:has-text("Dropdown")');
  const inputs = await dash.$$('.modal input.input');
  await inputs[0].fill('plan');
  await inputs[1].fill('Basic, Pro');
  await dash.click('.modal-foot button:has-text("Insert")');
  const v = await dash.$eval('.code-wrap textarea', (e) => e.value);
  assert(v.includes('{{select: plan; options=Basic, Pro}}'), v);
});
await test('WhatsApp-style isolated page (COOP/COEP): form opens as popup window and inserts into Lexical', async () => {
  const iso = await ctx.newPage();
  await iso.goto(base.replace('index.html', 'isolated.html'));
  await iso.waitForFunction(() => window.lexicalText && crossOriginIsolated);
  await sleep(400);
  await iso.click('#lexical');
  await iso.keyboard.type('Hello ;pay', { delay: 25 });
  const win = await until(() => ctx.pages().find((x) => x.url().includes('/overlay/index.html') && x.url().includes('window=1')), 6000, 'popup window');
  await win.waitForSelector('.qform input');
  await win.locator('.qform input[type=text]').first().fill('Numan');
  await win.locator('.qform input[type=number]').first().fill('750');
  await win.click('button:has-text("Insert")');
  await until(async () => (await iso.evaluate(() => window.lexicalText())).includes('Numan'), 6000, 'insertion into Lexical');
  eq((await iso.evaluate(() => window.lexicalText())).trim(), 'Hello Dear Numan, pay $750.00 by 31/01/2030.');
  await iso.close();
});
await test('WhatsApp-style isolated page: plain snippet + assistant popup window', async () => {
  const iso = await ctx.newPage();
  await iso.goto(base.replace('index.html', 'isolated.html'));
  await iso.waitForFunction(() => window.lexicalText);
  await sleep(400);
  await iso.click('#lexical');
  await iso.keyboard.type('A /ty ', { delay: 25 });
  await iso.keyboard.press('Control+Shift+Space');
  const win = await until(() => ctx.pages().find((x) => x.url().includes('/overlay/index.html') && x.url().includes('window=1')), 6000, 'assistant window');
  await win.waitForSelector('.ov-list li');
  await win.fill('.ov-search', 'Quick thanks');
  await sleep(150);
  await win.press('.ov-search', 'Enter', { timeout: 2000 }).catch(() => {});
  await until(async () => (await iso.evaluate(() => window.lexicalText())).split('Thank you').length === 3, 6000, 'second insertion');
  await iso.close();
});
await test('side panel: lists snippets, fills a gold signal form inline, live preview computes pips', async () => {
  const sp = await ctx.newPage();
  await sp.goto(ext('sidepanel/index.html'));
  await sp.waitForSelector('.sp-item');
  await sp.fill('.sp-filter input', 'Trading update');
  await sp.click('.sp-item-head');
  await sp.waitForSelector('.sp-open .qform');
  const nums = sp.locator('.sp-open input[type=number]');
  await nums.nth(0).fill('3800');
  await nums.nth(1).fill('3790');
  await nums.nth(2).fill('3830');
  await until(async () => (await sp.textContent('.sp-open .preview-box')).includes('Risk/Reward: 1 : 3'), 3000, 'preview');
  await sp.close();
});
await test('side panel insert path: rendered text is inserted into the focused field', async () => {
  await page.bringToFront();
  await clear();
  await page.click('#textarea');
  await page.keyboard.type('Note: ', { delay: 20 });
  const r = await dash.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
    return chrome.tabs.sendMessage(tab.id, { type: 'qth/insertText', payload: { text: 'From side panel\nline 2', html: '', isRich: false, cursorBack: null } }, { frameId: 0 });
  });
  assert(r && r.ok, JSON.stringify(r));
  eq(await val('#textarea'), 'Note: From side panel\nline 2');
});
await test('setting "toolbar icon opens side panel" switches the action behaviour', async () => {
  await setSettings({ actionOpens: 'sidepanel' });
  await until(async () => (await dash.evaluate(() => chrome.action.getPopup({}))) === '', 3000, 'popup cleared');
  await setSettings({ actionOpens: 'popup' });
  await until(async () => (await dash.evaluate(() => chrome.action.getPopup({}))).endsWith('popup/index.html'), 3000, 'popup restored');
});
await test('templates: "Add all" creates a category folder with its snippets', async () => {
  await dash.goto(ext('dashboard/index.html#/templates'));
  await dash.click('.cat-bar button:has-text("Trade signals")');
  await dash.click('button:has-text("Add all")');
  await dash.waitForSelector('text=Added');
  await until(async () => (await dash.$$('.snip')).length >= 3, 3000, 'folder list');
});
await test('popup renders snippet list', async () => {
  const p = await ctx.newPage();
  await p.goto(ext('popup/index.html'));
  await p.waitForSelector('.list li');
  assert((await p.$$('.list li')).length > 3, 'few rows');
  await p.close();
});

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
fs.mkdirSync(path.join(here, 'output'), { recursive: true });
fs.writeFileSync(path.join(here, 'output/results.json'), JSON.stringify({ at: new Date().toISOString(), extensionId: extId, results }, null, 2));
if (passed !== results.length) await page.screenshot({ path: path.join(here, 'output/fixture.png'), fullPage: true });
await ctx.close();
server.close();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(passed === results.length ? 0 : 1);
