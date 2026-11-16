'use strict';
/**
 * Whitelisted IPC surface. The renderer can only call the methods listed here.
 */
const fs = require('fs');
const path = require('path');
const { PRESETS } = require('../core/numbering');
const { STANDARD_PLACEHOLDERS } = require('../core/docx');
const Letters = require('../core/services/letters');
const Inward = require('../core/services/inward');
const Udise = require('../core/services/udise');
const { UserError } = require('../core/util');

const ALLOWED = {
  categories: ['list', 'save', 'setActive', 'remove', 'reorder', 'saveSub', 'setSubActive', 'removeSub', 'reorderSubs', 'usage'],
  recipients: ['list', 'get', 'save', 'setActive'],
  templates: ['list', 'get', 'create', 'uploadVersion', 'setCurrentVersion', 'update', 'duplicate', 'remove', 'inspect', 'listSnippets', 'saveSnippet', 'removeSnippet', 'variant', 'importPreviousLetters', 'importPreviousFolder'],
  letters: ['get', 'list', 'saveDraft', 'copyFrom', 'submitForApproval', 'approve', 'sendBack', 'deleteDraft', 'restore', 'preview', 'overrideNumber', 'workStatus',
    'generate', 'openInWord', 'fromPreviousLetter', 'finalize', 'retryPdf', 'startRevision', 'discardRevision', 'cancel', 'recordDispatch', 'addAttachment', 'removeAttachment', 'recordExternal', 'history'],
  inward: ['get', 'save', 'setStatus', 'addAttachment', 'removeAttachment', 'softDelete', 'restore', 'createReply', 'history'],
  students: ['list', 'get', 'save', 'remove', 'parseImport', 'importRows'],
  udise: ['listTemplates', 'uploadTemplate', 'activateTemplate', 'saveMapping', 'profileDefaults', 'fromStudent', 'validate', 'prepareSubmission', 'listSubmissions', 'getSubmission', 'previewForm', 'inspectPdf'],
  reports: ['list', 'run', 'export'],
  search: ['run', 'recent', 'clearRecent', 'academicYears'],
  backup: ['create', 'verify', 'list', 'restore', 'moveDocumentsRoot'],
  dashboard: ['stats'],
  users: ['permissions', 'roles', 'list', 'saveRole', 'saveUser', 'auditLog'],
};

const SETTINGS_PERMISSION = { college: 'settings.manage', letter: 'settings.manage', archive: 'settings.manage', academic: 'settings.manage', workflow: 'settings.manage', conversion: 'settings.manage', backup: 'backup.manage' };

const sys = {
  async info(core, { app }) {
    const conv = await core.converter.status();
    return {
      version: app.getVersion(), dataRoot: core.dataRoot, documentsRoot: core.documentsRoot(), platform: process.platform, converter: conv,
      user: core.currentUser(), integrity: core.integrity, placeholders: STANDARD_PLACEHOLDERS,
      dispatchModes: Letters.DISPATCH_MODES, dispatchStatuses: Letters.DISPATCH_STATUSES, inwardStatuses: Inward.STATUSES, inwardChannels: Inward.CHANNELS,
      numberingPresets: PRESETS, s02Reasons: Udise.S02_REASONS, udiseKeys: Udise.DATA_KEYS,
    };
  },
  async openPath(core, { shell }, p) {
    if (!p || !fs.existsSync(p)) throw new UserError('The file could not be found. It may have been moved or deleted.');
    const err = await shell.openPath(p);
    if (err) throw new UserError(`Could not open the file: ${err}`);
    return true;
  },
  async showItem(core, { shell }, p) {
    if (!p || !fs.existsSync(p)) throw new UserError('The file or folder could not be found.');
    shell.showItemInFolder(p);
    return true;
  },
  async openFolder(core, { shell }, p) {
    if (!p) throw new UserError('No folder.');
    fs.mkdirSync(p, { recursive: true });
    const err = await shell.openPath(p);
    if (err) throw new UserError(err);
    return true;
  },
  async pickFile(core, { dialog, win }, opts = {}) {
    const r = await dialog.showOpenDialog(win, { title: opts.title || 'Choose a file', properties: ['openFile', ...(opts.multi ? ['multiSelections'] : [])], filters: opts.filters || [] });
    return r.canceled ? null : (opts.multi ? r.filePaths : r.filePaths[0]);
  },
  async pickFolder(core, { dialog, win }, opts = {}) {
    const r = await dialog.showOpenDialog(win, { title: opts.title || 'Choose a folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  async saveFile(core, { dialog, win }, opts = {}) {
    const r = await dialog.showSaveDialog(win, { title: opts.title || 'Save as', defaultPath: opts.defaultPath ? path.join(core.exportsDir(), opts.defaultPath) : core.exportsDir(), filters: opts.filters || [] });
    if (r.canceled || !r.filePath) return null;
    if (fs.existsSync(r.filePath)) throw new UserError('A file with that name already exists. Choose a different name (EduDesk never overwrites files).');
    return r.filePath;
  },
  /** Export a copy of an archived file to a user-chosen location (never overwrites). */
  async copyFile(core, helpers, src, dest) {
    if (!src || !fs.existsSync(src)) throw new UserError('The source file could not be found.');
    if (!dest) throw new UserError('Choose where to save the copy.');
    if (fs.existsSync(dest)) throw new UserError('A file with that name already exists.');
    fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
    core.audit(core.currentUser().username, 'file.exportCopy', 'file', null, { src, dest });
    return dest;
  },
  async print(core, helpers, p) {
    if (!p || !fs.existsSync(p)) throw new UserError('The file could not be found.');
    const r = await core.converter.print(p);
    if (!r.ok) throw new UserError(r.error);
    return true;
  },
  async relaunch(core, { app }) {
    try { if (core.db) core.close(); } catch (_) { /* ignore */ }
    app.relaunch();
    app.exit(0);
  },
  templateFile(core, h, versionId) { return core.services.templates.versionPath(versionId).path; },
  udisePreviewTemplate(core, h, id) { return core.services.udise.previewTemplate(id); },
  settingsAll(core) { return core.settings.all(); },
  settingsSet(core, h, section, value) {
    if (!['ui'].includes(section)) core.require(SETTINGS_PERMISSION[section] || 'settings.manage');
    if (section === 'archive' && value && 'documentsRoot' in value) throw new UserError('Use "Move archive folder" to change the archive location safely.');
    if (section === 'academic' && value && value.startMonth && !(value.startMonth >= 1 && value.startMonth <= 12)) throw new UserError('Choose a valid month.');
    const res = core.settings.set(section, value);
    core.audit(core.currentUser().username, 'settings.update', 'settings', null, { section });
    core.emitChange('settings');
    return res;
  },
  numberingList(core, h, scope) { return core.numbering.listSchemes(scope); },
  numberingSave(core, h, input) { core.require('settings.manage'); return core.numbering.saveScheme(input, core.currentUser().username); },
  numberingPreview(core, h, scope, opts) { return core.numbering.preview(scope, opts || {}); },
  numberingPreviewPattern(core, h, input, opts) { return core.numbering.previewPattern(input, opts || {}); },
  converterStatus(core) { return core.converter.status(); },
  integrityCheck(core) { return core.db.integrityCheck(); },
  async exportReport(core, helpers, key, filters, format) {
    core.require('reports.export');
    const ext = { csv: 'csv', xlsx: 'xlsx', pdf: 'pdf' }[format];
    if (!ext) throw new UserError('Unknown format.');
    const title = (core.services.reports.list().find((r) => r.key === key) || { title: 'Report' }).title.replace(/[^\w]+/g, '_');
    const dest = await sys.saveFile(core, helpers, { title: 'Export report', defaultPath: `${title}_${new Date().toISOString().slice(0, 10)}.${ext}`, filters: [{ name: format.toUpperCase(), extensions: [ext] }] });
    if (!dest) return null;
    return core.services.reports.export(key, filters, format, dest);
  },
};

const API = {
  async call(core, { service, method, args, helpers }) {
    if (!core) throw new UserError('EduDesk is still starting. Please wait a moment.');
    if (service === 'sys') {
      const fn = sys[method];
      if (!fn) throw new Error(`Unknown system call ${method}`);
      return fn(core, helpers, ...args);
    }
    if (!core.db) throw new UserError('EduDesk must be restarted to finish the restore. Click "Restart now".', 'RESTART_REQUIRED');
    if (!ALLOWED[service] || !ALLOWED[service].includes(method)) throw new Error(`Call not allowed: ${service}.${method}`);
    const svc = core.services[service];
    return svc[method](...args);
  },
};

module.exports = { API, ALLOWED };
