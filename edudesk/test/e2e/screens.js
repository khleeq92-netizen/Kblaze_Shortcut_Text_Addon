'use strict';
// Launch the real app with Playwright and screenshot every screen; fails on renderer errors.
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const data = path.join(__dirname, '..', '..', '.test-data', 'screens');
  if (!process.env.KEEP) fs.rmSync(data, { recursive: true, force: true });
  const out = process.env.SHOTS || path.join(__dirname, 'output');
  fs.mkdirSync(out, { recursive: true });
  const app = await electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', '..')], env: { ...process.env, EDUDESK_DATA: data, NODE_OPTIONS: '' } });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push(String(e)));
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForSelector('#nav a');
  const routes = (process.env.ROUTES || 'settings/college,dashboard,letter/new,drafts,outward,inward,inward/new,dispatch,udise,students,templates,templates?tab=udise,recipients,reports,archive,settings/numbering,settings/categories,settings/backup,settings/conversion,settings/users,settings/audit,settings/archive,settings/letters').split(',');
  for (const r of routes) {
    await win.evaluate((h) => { location.hash = '#/' + h; }, r);
    await win.waitForTimeout(900);
    await win.screenshot({ path: path.join(out, r.replace(/[^\w]+/g, '_') + '.png') });
  }
  console.log(JSON.stringify({ errors }, null, 1));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
