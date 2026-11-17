// End-to-end tests for K-Flow automations on the demonstration pages
// (admission.html → step2.html, csp.html) in a real Chromium with the built extension.
import { zipSync, strToU8 } from 'fflate';

export async function automationTests({ test, ctx, dash, ext, origin, sleep, until, eq, assert }) {
  const url = (p) => `${origin}/${p}`;
  // Runs `fn({ put, all, touch, arg })` in the dashboard (extension origin) via CDP.
  const db = (fn, arg) => dash.evaluate(`(async () => {
    const arg = ${JSON.stringify(arg ?? null)};
    const d = await new Promise((res, rej) => { const r = indexedDB.open('k-flow-db', 2); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const put = (store, recs) => new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); for (const x of [recs].flat()) tx.objectStore(store).put(x); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const all = (store) => new Promise((res) => { const q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result); });
    const touch = (c) => chrome.storage.local.set({ 'kf.revision': { at: Date.now(), collections: [c] } });
    return (${fn.toString()})({ put, all, touch, arg });
  })()`);
  const send = (msg) => dash.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const tabId = (pattern) => dash.evaluate(async (p) => (await chrome.tabs.query({ url: p }))[0]?.id, pattern);
  const frame = (p, part) => until(() => p.frames().find((f) => !f.isDetached() && f.url().includes(part)), 8000, part);
  const t0 = Date.now();

  // ---------------------------------------------------------------- data
  const students = {
    id: 'tbl_e2e_students', name: 'E2E Students', key: 'e2e_students', workspaceId: 'ws_general', createdAt: t0, updatedAt: t0, keyColumn: 'gr_no', currentRowId: 'st1',
    columns: [['GR No', 'gr_no'], ['Student Name', 'student_name'], ['DOB', 'student_dob'], ['Gender', 'gender'], ['Category', 'category'], ['Mobile', 'mobile'], ['District', 'district'], ['Cert', 'cert_no'], ['Address', 'address']].map(([name, key]) => ({ id: 'c_' + key, name, key, type: 'text' })),
    rows: [
      { id: 'st1', values: { gr_no: '0012', student_name: 'Asha Patil', student_dob: '2008-09-05', gender: 'Female', category: 'OBC', mobile: '9876543210', district: 'Aurangabad', cert_no: 'C-123', address: 'Main Road, Phulambri' } },
      { id: 'st2', values: { gr_no: '0013', student_name: 'Ravi Jadhav', student_dob: '2007-01-15', gender: 'Male', category: 'OPEN', mobile: '9123456780', district: 'Jalna', cert_no: '', address: 'Station Road, Jalna' } },
    ],
  };
  const R = (id, target, value, extra = {}) => ({ id, enabled: true, label: id, target, action: 'fill', value, overwrite: 'always', ...extra });
  const profile = {
    id: 'afp_e2e', name: 'E2E admission part 1', enabled: true, workspaceId: 'ws_general', sites: [{ kind: 'domain', value: '127.0.0.1' }], datasetId: 'tbl_e2e_students', runMode: 'manual', tags: [], createdAt: t0, updatedAt: t0,
    rules: [
      R('Name', { by: 'label', value: 'Name of Candidate' }, '{{student_name}}'),
      R('DOB', { by: 'label', value: 'Date of Birth' }, '{{student_dob}}', { dateFormat: 'DD/MM/YYYY' }),
      R('Gender', { by: 'name', value: 'gender' }, '{{gender}}', { action: 'radio' }),
      R('Category', { by: 'id', value: 'category' }, '{{category}}', { action: 'select' }),
      R('Cert', { by: 'label', value: 'Caste Certificate No' }, '{{cert_no}}', { condition: 'category != "OPEN"', waitMs: 3000 }),
      R('Mobile', { by: 'label', value: 'Mobile No' }, '{{mobile}}'),
      R('District', { by: 'id', value: 'district' }, '{{district}}', { action: 'select' }),
      R('Confirm', { by: 'id', value: 'confirm' }, '', { action: 'check' }),
      R('Captcha', { by: 'id', value: 'captcha' }, 'ABCD'),
    ],
  };
  await db(async ({ put, touch, arg }) => { await put('tables', arg.students); await put('autofill', arg.profile); await touch('autofill'); }, { students, profile });

  const adm = await ctx.newPage();
  await adm.goto(url('admission.html'));
  await sleep(600);
  const v = (sel) => adm.$eval(sel, (e) => (e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value ?? e.textContent));

  await test('autofill: fills a gov-style form from a dataset record (radio, select, dynamic field, ARIA dropdown, date picker); CAPTCHA untouched', async () => {
    const tid = await tabId(url('admission.html*'));
    const r = await send({ type: 'kf/autofill/run', tabId: tid, profileId: 'afp_e2e' });
    assert(r?.report, JSON.stringify(r));
    eq(await v('#cand_name'), 'Asha Patil');
    eq(await v('#dob'), '05/09/2008');
    eq(await adm.$eval('input[value=F]', (e) => e.checked), true);
    eq(await v('#category'), '2');
    eq(await v('#cert'), 'C-123', 'dynamically generated field');
    eq(await v('#mobile'), '9876543210');
    eq(await adm.$eval('#district', (e) => e.textContent), 'Aurangabad');
    eq(await v('#confirm'), true);
    eq(await v('#captcha'), '');
    const st = Object.fromEntries(r.report.items.map((i) => [i.label, i.status]));
    eq(st.Captcha, 'blocked');
    eq(r.report.filled, 8);
    await until(async () => (await db(async ({ all }) => (await all('executions')).filter((e) => e.refId === 'afp_e2e' && e.status === 'partial').length)) > 0, 3000, 'execution logged');
  });

  await test('autofill preview: validates and highlights without changing the page', async () => {
    await adm.reload(); await sleep(500);
    const tid = await tabId(url('admission.html*'));
    const r = await send({ type: 'kf/autofill/run', tabId: tid, profileId: 'afp_e2e', preview: true });
    eq(await v('#cand_name'), '');
    assert(r.report.items.some((i) => i.status === 'previewed'), 'previewed items');
    assert(await adm.evaluate(() => !!document.querySelector('kf-ui-root')), 'preview UI shown');
  });

  await test('dataset record stepping: next record fills the next student; condition skips the certificate for OPEN', async () => {
    await adm.reload(); await sleep(500);
    const m = await send({ type: 'kf/dataset/move', datasetId: 'tbl_e2e_students', dir: 'next' });
    eq(m.label, '0013 · Ravi Jadhav');
    const tid = await tabId(url('admission.html*'));
    const r = await send({ type: 'kf/autofill/run', tabId: tid, profileId: 'afp_e2e' });
    eq(await v('#cand_name'), 'Ravi Jadhav');
    eq(await adm.$eval('input[value=M]', (e) => e.checked), true);
    eq(await v('#category'), '1');
    eq(r.report.items.find((i) => i.label === 'Cert').status, 'skipped');
    await send({ type: 'kf/dataset/move', datasetId: 'tbl_e2e_students', dir: 'set', rowId: 'st1' });
  });

  await test('in-page hotkey (Alt+Shift+F) autofills the matching profile', async () => {
    await adm.reload(); await sleep(700);
    await adm.click('h1');
    await adm.keyboard.press('Alt+Shift+F');
    await until(async () => (await v('#cand_name')) === 'Asha Patil', 6000, 'hotkey fill');
  });

  await test('multi-page macro: runs across a page navigation and finishes on part 2', async () => {
    await adm.goto(url('admission.html')); await sleep(500);
    const mac = { id: 'mac_e2e_multi', name: 'E2E two pages', enabled: true, sites: [], tags: [], workspaceId: 'ws_general', datasetId: 'tbl_e2e_students', createdAt: t0, updatedAt: t0,
      settings: { stepDelayMs: 30, retries: 1, retryDelayMs: 200, timeoutMs: 6000, onError: 'stop', speed: 1 }, steps: [
        { id: 's1', type: 'type', target: { by: 'label', value: 'Name of Candidate' }, value: '{{student_name}}' },
        { id: 's2', type: 'click', target: { by: 'id', value: 'nextlink' } },
        { id: 's3', type: 'waitFor', target: { by: 'label', value: 'Residential Address' }, ms: 8000 },
        { id: 's4', type: 'type', target: { by: 'label', value: 'Residential Address' }, value: '{{address}}' },
        { id: 's5', type: 'extract', target: { by: 'css', value: 'h1' }, value: 'title' },
        { id: 's6', type: 'assert', condition: { kind: 'urlMatches', value: 'step2.html' } },
      ] };
    await db(async ({ put, touch, arg }) => { await put('macros', arg); await touch('macros'); }, mac);
    const tid = await tabId(url('admission.html*'));
    const r = await send({ type: 'kf/macro/start', tabId: tid, macroId: 'mac_e2e_multi' });
    assert(r?.ok, JSON.stringify(r));
    await adm.waitForURL(/step2\.html/, { timeout: 8000 });
    await until(async () => (await adm.$eval('#addr', (e) => e.value).catch(() => '')) === 'Main Road, Phulambri', 8000, 'address typed on page 2');
    const exe = await until(async () => (await db(async ({ all }) => (await all('executions')).find((e) => e.refId === 'mac_e2e_multi' && e.status !== 'running'))), 8000, 'macro execution');
    eq(exe.status, 'success', exe.error || '');
    eq(exe.steps.filter((s) => s.status === 'done').length, 6);
  });

  await test('macro pause / resume / stop', async () => {
    const mac = { id: 'mac_e2e_long', name: 'E2E long', enabled: true, sites: [], tags: [], workspaceId: 'ws_general', createdAt: t0, updatedAt: t0,
      settings: { stepDelayMs: 0, retries: 0, retryDelayMs: 100, timeoutMs: 3000, onError: 'stop', speed: 1 }, steps: [{ id: 'a', type: 'delay', ms: 300 }, { id: 'b', type: 'delay', ms: 30000 }, { id: 'c', type: 'type', target: { by: 'id', value: 'pincode' }, value: 'never' }] };
    await db(async ({ put, touch, arg }) => { await put('macros', arg); await touch('macros'); }, mac);
    const tid = await tabId(url('step2.html*'));
    await send({ type: 'kf/macro/start', tabId: tid, macroId: 'mac_e2e_long' });
    await sleep(500);
    eq((await send({ type: 'kf/macro/control', tabId: tid, action: 'pause' })).status, 'paused');
    eq((await send({ type: 'kf/automation/forPage', tabId: tid })).run.status, 'paused');
    eq((await send({ type: 'kf/macro/control', tabId: tid, action: 'resume' })).status, 'running');
    await send({ type: 'kf/macro/control', tabId: tid, action: 'stop' });
    const exe = await until(async () => db(async ({ all }) => (await all('executions')).find((e) => e.refId === 'mac_e2e_long' && e.status !== 'running')), 5000, 'stopped execution');
    eq(exe.status, 'stopped');
    eq(await adm.$eval('#pincode', (e) => e.value), '');
  });

  await test('submit-type click asks for approval; approving submits', async () => {
    await adm.goto(url('step2.html')); await sleep(400);
    const mac = { id: 'mac_e2e_submit', name: 'E2E submit', enabled: true, sites: [], tags: [], workspaceId: 'ws_general', createdAt: t0, updatedAt: t0,
      settings: { stepDelayMs: 0, retries: 0, retryDelayMs: 100, timeoutMs: 3000, onError: 'stop', speed: 1 }, steps: [{ id: 'a', type: 'type', target: { by: 'id', value: 'addr' }, value: 'X' }, { id: 'b', type: 'type', target: { by: 'id', value: 'pincode' }, value: '431111' }, { id: 'c', type: 'click', target: { by: 'id', value: 'final' } }] };
    await db(async ({ put, touch, arg }) => { await put('macros', arg); await touch('macros'); }, mac);
    await send({ type: 'kf/macro/start', tabId: await tabId(url('step2.html*')), macroId: 'mac_e2e_submit' });
    const of = await frame(adm, '/overlay/index.html');
    await of.waitForSelector('button:has-text("Approve")');
    eq(await adm.$eval('#done', (e) => e.textContent), '');
    await of.click('button:has-text("Approve")');
    await until(async () => (await adm.$eval('#done', (e) => e.textContent)) === 'SUBMITTED:X|431111', 5000, 'submitted');
  });

  await test('macro recorder: records typing, a checkbox, a link click and the next page; replay reproduces it', async () => {
    await adm.goto(url('admission.html')); await sleep(500);
    const tid = await tabId(url('admission.html*'));
    await send({ type: 'kf/rec/start', tabId: tid });
    await adm.waitForSelector('kf-ui-root', { state: 'attached' });
    await adm.click('#cand_name'); await adm.keyboard.type('Recorded Name', { delay: 10 }); await adm.keyboard.press('Tab');
    await adm.click('#mobile'); await adm.keyboard.type('9000000001', { delay: 10 }); await adm.keyboard.press('Tab');
    await adm.click('#confirm');
    await adm.click('#nextlink');
    await adm.waitForURL(/step2/);
    await sleep(700);
    await adm.click('#pincode'); await adm.keyboard.type('431111', { delay: 10 }); await adm.keyboard.press('Tab');
    await sleep(300);
    const res = await send({ type: 'kf/rec/stop', tabId: tid, save: true, name: 'E2E recorded', open: false });
    assert(res.saved, JSON.stringify(res));
    const m = await db(async ({ all, arg }) => (await all('macros')).find((x) => x.id === arg), res.macroId);
    const kinds = m.steps.filter((s) => !s.disabled).map((s) => s.type);
    eq(kinds.join(','), 'type,type,check,click,type');
    assert(m.steps[0].type === 'navigate' && m.steps[0].disabled, 'start URL kept as disabled navigate step');
    // replay on a fresh form
    await adm.goto(url('admission.html')); await sleep(500);
    await send({ type: 'kf/macro/start', tabId: tid, macroId: res.macroId });
    await adm.waitForURL(/step2/, { timeout: 10000 });
    await until(async () => (await adm.$eval('#pincode', (e) => e.value).catch(() => '')) === '431111', 8000, 'replayed on page 2');
  });

  await test('visual field selector: click a field, assign a value in the K-Flow panel, profile is saved and works', async () => {
    await adm.goto(url('step2.html')); await sleep(500);
    await send({ type: 'kf/mapper/start', tabId: await tabId(url('step2.html*')) });
    await adm.waitForSelector('kf-ui-root', { state: 'attached' });
    await sleep(200);
    await adm.click('#pincode');
    const of = await frame(adm, '/overlay/index.html');
    await of.waitForSelector('text=Map field');
    await of.selectOption('select.select >> nth=0', '__new');
    await of.fill('input[placeholder="Profile name"]', 'E2E mapped');
    await of.click('.seg button:has-text("Fixed text")');
    await of.fill('input[placeholder="Text to fill"]', '431112');
    eq(await of.$eval('input.mono', (e) => e.value), '#pincode', 'generated selector');
    await of.click('button:has-text("Save & finish")');
    const p = await until(async () => db(async ({ all }) => (await all('autofill')).find((x) => x.name === 'E2E mapped')), 5000, 'mapped profile');
    eq(p.rules[0].target.value, '#pincode');
    eq(p.sites[0].value, '127.0.0.1');
    await adm.reload(); await sleep(500);
    await send({ type: 'kf/autofill/run', tabId: await tabId(url('step2.html*')), profileId: p.id });
    eq(await adm.$eval('#pincode', (e) => e.value), '431112');
  });

  await test('vault: set up through the dashboard; {{vault.key}} fills a password field; no plaintext is stored', async () => {
    await dash.goto(ext('dashboard/index.html#/vault'));
    const pw = dash.locator('input[type=password]');
    await pw.nth(0).fill('E2e-Vault-Passphrase!');
    await pw.nth(1).fill('E2e-Vault-Passphrase!');
    await dash.click('button:has-text("Create vault")');
    await dash.waitForSelector('button:has-text("Add secret")', { timeout: 20000 });
    await dash.click('button:has-text("Add secret")');
    await dash.fill('input[placeholder="UDISE+ login"]', 'Portal');
    await dash.fill('input[placeholder="udise_password"]', 'portal_pw');
    await dash.fill('.modal input[type=password]', 'Sup3r-Secret');
    await dash.click('button:has-text("Save encrypted")');
    await dash.waitForSelector('text={{vault.portal_pw}}');
    const stored = await db(async ({ all }) => JSON.stringify(await all('vault')));
    assert(!stored.includes('Sup3r-Secret'), 'vault stores ciphertext only');
    await db(async ({ put, touch, arg }) => { await put('autofill', arg); await touch('autofill'); }, { id: 'afp_e2e_vault', name: 'E2E vault', enabled: true, workspaceId: 'ws_general', sites: [{ kind: 'domain', value: '127.0.0.1' }], runMode: 'manual', tags: [], createdAt: t0, updatedAt: t0, rules: [R('pw', { by: 'id', value: 'portal_pw' }, '{{vault.portal_pw}}', { sensitive: true })] });
    await adm.reload(); await sleep(400);
    const r = await send({ type: 'kf/autofill/run', tabId: await tabId(url('step2.html*')), profileId: 'afp_e2e_vault' });
    eq(r.report.filled, 1);
    eq(await adm.$eval('#portal_pw', (e) => e.value), 'Sup3r-Secret');
    const hist = await db(async ({ all }) => JSON.stringify(await all('executions')));
    assert(!hist.includes('Sup3r-Secret'), 'secret never logged');
  });

  await test('scripts run on a strict-CSP page through the sandboxed interpreter (no eval, no extension privileges)', async () => {
    const cp = await ctx.newPage();
    await cp.goto(url('csp.html')); await sleep(500);
    const scr = { id: 'scr_e2e', name: 'E2E script', enabled: true, workspaceId: 'ws_college', sites: [], runMode: 'manual', timeoutMs: 5000, maxLoopIterations: 1000, tags: [], createdAt: t0, updatedAt: t0,
      code: "await kf.fill('Institution', kf.vars.college_name);\nkf.log('filled');\nreturn [kf.value('#n'), typeof chrome, typeof window.chrome];" };
    const loop = { ...scr, id: 'scr_e2e_loop', code: 'let i = 0;\nwhile (true) { i++; }' };
    await db(async ({ put, touch, arg }) => { await put('scripts', arg); await touch('scripts'); }, [scr, loop]);
    const tid = await tabId(url('csp.html*'));
    const r = await send({ type: 'kf/script/run', tabId: tid, scriptId: 'scr_e2e' });
    assert(r.ok, JSON.stringify(r.error));
    eq(JSON.stringify(r.result), JSON.stringify(['Dr M.A. Aziz Jr College of Science, Phulambri', 'undefined', 'undefined']));
    eq(await cp.$eval('#n', (e) => e.value), 'Dr M.A. Aziz Jr College of Science, Phulambri');
    const bad = await send({ type: 'kf/script/run', tabId: tid, scriptId: 'scr_e2e_loop' });
    eq(bad.ok, false);
    assert(/exceeded 1000 iterations/.test(bad.error.message), bad.error.message);
    eq(bad.error.line, 2);
    await cp.close();
  });

  await test('script dry run in the dashboard executes inside the extension sandbox page', async () => {
    await dash.goto(ext('dashboard/index.html#/scripts/scr_col_fields'));
    await dash.click('button:has-text("Dry run")');
    await until(async () => (await dash.textContent('.kf-log').catch(() => '')).includes('Found 2 fields'), 8000, 'dry-run output');
    const scr = { id: 'scr_e2e_priv', name: 'Privilege probe', enabled: true, workspaceId: 'ws_general', sites: [], runMode: 'manual', timeoutMs: 5000, maxLoopIterations: 1000, tags: [], createdAt: t0, updatedAt: t0,
      code: "let leaked = 'none';\ntry { leaked = typeof ({}).constructor.constructor('return this')().chrome?.storage; } catch (e) { leaked = 'blocked'; }\nreturn [typeof chrome, leaked];" };
    await db(async ({ put, touch, arg }) => { await put('scripts', arg); await touch('scripts'); }, scr);
    await dash.goto(ext('dashboard/index.html#/scripts/scr_e2e_priv'));
    await dash.click('button:has-text("Dry run")');
    const outs = () => dash.$$eval('.code-out', (els) => els.map((e) => e.textContent).join('|')).catch(() => '');
    await until(async () => (await outs()).includes('"undefined"'), 8000, 'probe output');
    const outText = await dash.$$eval('.code-out', (els) => els.map((e) => e.textContent).join('|'));
    assert(!outText.includes('"object"'), 'sandbox exposed chrome.storage: ' + outText);
  });

  await test('Excel import through the dashboard: column mapping, records, sensitive columns encrypted at rest', async () => {
    const cell = (r, c, v) => `<c r="${String.fromCharCode(65 + c)}${r}" t="inlineStr"><is><t>${v}</t></is></c>`;
    const rows = [['GR No', 'Student Name', 'Aadhaar No', 'Mobile'], ['101', 'Sana Shaikh', '234523452345', '9000000002'], ['102', 'Om Kale', '345634563456', '9000000003']];
    const sheet = `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(i + 1, j, v)).join('')}</row>`).join('')}</sheetData></worksheet>`;
    const xlsx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Register" sheetId="1" r:id="rId1"/></sheets></workbook>'), 'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), 'xl/worksheets/sheet1.xml': strToU8(sheet) });
    await dash.goto(ext('dashboard/index.html#/data'));
    await dash.click('.page-head button:has-text("Import")');
    const [chooser] = await Promise.all([dash.waitForEvent('filechooser'), dash.click('button.kf-src')]);
    await chooser.setFiles({ name: 'register.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(xlsx) });
    await dash.waitForSelector('table.kf-map');
    await dash.click('button:has-text("Create dataset")');
    await dash.waitForSelector('text=Imported 2 records');
    const t = await db(async ({ all }) => (await all('tables')).find((x) => x.name === 'register'));
    assert(t, 'dataset created');
    eq(t.rows.length, 2);
    eq(t.keyColumn, 'gr_no');
    assert(String(t.rows[0].values.aadhaar_no).startsWith('enc:v1:'), 'Aadhaar encrypted at rest');
    assert(String(t.rows[0].values.mobile).startsWith('enc:v1:'), 'mobile encrypted at rest');
    eq(t.rows[0].values.student_name, 'Sana Shaikh');
    await dash.waitForSelector('text=Sana Shaikh');
  });

  await test('workspaces: switching changes the dashboard; College workspace has its starter profiles', async () => {
    await dash.goto(ext('dashboard/index.html#/overview'));
    await dash.click('#kf-ws-switch');
    await dash.click('.kf-wsw-menu button:has-text("College Administration")');
    await dash.waitForSelector('.kf-hero h1:has-text("College Administration")');
    await dash.goto(ext('dashboard/index.html#/autofill'));
    await dash.waitForSelector('text=UDISE+ S02');
    await dash.waitForSelector('text=FYJC Online Admission');
    await dash.click('#kf-ws-switch');
    await dash.click('.kf-wsw-menu button:has-text("General Productivity")');
    await dash.waitForSelector('text=E2E admission part 1');
  });

  await test('execution history view lists runs and exports an Excel report', async () => {
    await dash.goto(ext('dashboard/index.html#/history'));
    await dash.waitForSelector('text=E2E admission part 1');
    const [dl] = await Promise.all([dash.waitForEvent('download'), dash.click('button:has-text("Excel report")')]);
    assert(dl.suggestedFilename().endsWith('.xlsx'), dl.suggestedFilename());
  });
  await adm.close();
}
