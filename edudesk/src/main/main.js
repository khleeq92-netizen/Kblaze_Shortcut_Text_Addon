'use strict';
/**
 * Electron main process: window, secure IPC bridge, and the Chromium-based hooks
 * (HTML -> PDF for reports, typeset overlays for UDISE PDF fields).
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { EduDeskApp } = require('../core/app');
const { API } = require('./api');
const { htmlToPdf, renderFieldOverlay, shellOpen } = require('./hooks');

let win = null;
let core = null;
let startupError = null;

const isDev = !app.isPackaged;
const resourcesDir = app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', '..', 'assets');

function resolveDataRoot() {
  if (process.env.EDUDESK_DATA) return process.env.EDUDESK_DATA;
  // electron-builder "portable" target sets this variable; keep data next to the .exe
  if (process.env.PORTABLE_EXECUTABLE_DIR) return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'EduDeskData');
  const exeDir = path.dirname(process.execPath);
  if (fs.existsSync(path.join(exeDir, 'portable.txt'))) return path.join(exeDir, 'EduDeskData');
  return path.join(app.getPath('documents'), 'EduDesk');
}

// ---------------------------------------------------------------- startup
async function startCore() {
  const dataRoot = resolveDataRoot();
  core = await new EduDeskApp({ dataRoot, resourcesDir, htmlToPdf, renderFieldOverlay, shellOpen }).open();
  core.onChange((what) => { if (win && !win.isDestroyed()) win.webContents.send('edudesk:changed', what); });
  core.log('info', 'EduDesk started', { version: app.getVersion(), dataRoot, platform: process.platform });
  // automatic backups: shortly after start, then hourly check
  const autoBackup = async () => {
    try {
      const r = await core.services.backup.runAutoIfDue();
      if (r && win) win.webContents.send('edudesk:notice', { type: 'success', text: `Automatic backup created and verified (${r.files} files).` });
    } catch (e) {
      core.log('error', 'auto backup failed', { error: e.message });
      if (win) win.webContents.send('edudesk:notice', { type: 'error', text: `Automatic backup failed: ${e.message}` });
    }
  };
  setTimeout(autoBackup, 60 * 1000);
  setInterval(autoBackup, 60 * 60 * 1000);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1080, minHeight: 680, show: false,
    title: 'EduDesk Correspondence Manager', backgroundColor: '#f4f6fa',
    icon: path.join(resourcesDir, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('closed', () => { win = null; });
}

function registerIpc() {
  ipcMain.handle('edudesk:api', async (_e, service, method, args) => {
    if (startupError) return { ok: false, error: startupError, userFacing: true };
    try {
      const result = await API.call(core, { service, method, args: args || [], helpers: { app, shell, dialog, win, htmlToPdf } });
      return { ok: true, result };
    } catch (err) {
      if (!err.userFacing) core && core.log('error', `${service}.${method} failed`, { error: err.message, stack: err.stack });
      return { ok: false, error: err.userFacing ? err.message : `Unexpected error: ${err.message}`, code: err.code, userFacing: !!err.userFacing };
    }
  });
}

// Indian English locale: dd/mm/yyyy date pickers and spell-check.
app.commandLine.appendSwitch('lang', 'en-IN');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      // macOS needs a menu bar: it provides Quit (⌘Q), Hide, and copy/paste (⌘C/⌘V) in text fields.
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: 'appMenu' }, { role: 'editMenu' },
        { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(isDev ? [{ role: 'toggleDevTools' }] : [])] },
        { role: 'windowMenu' },
      ]));
    } else {
      Menu.setApplicationMenu(isDev ? Menu.buildFromTemplate([{ role: 'viewMenu' }, { role: 'editMenu' }]) : null);
    }
    registerIpc();
    try {
      await startCore();
    } catch (e) {
      startupError = `EduDesk could not open its data folder: ${e.message}`;
      console.error(e);
    }
    createWindow();
  });
  app.on('window-all-closed', () => {
    try { if (core && core.db) core.close(); } catch (_) { /* ignore */ }
    app.quit();
  });
}

