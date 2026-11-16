'use strict';
/**
 * EduDeskApp: the application core. It owns the database, the folder layout and all
 * services. It has no Electron dependency, so every workflow can be tested in Node.
 */
const fs = require('fs');
const path = require('path');
const { Database } = require('./db');
const { Settings } = require('./settings');
const { Numbering } = require('./numbering');
const { Converter } = require('./converter');
const { seed, PERMISSIONS } = require('./seed');
const { ensureDir, UserError, json } = require('./util');

class EduDeskApp {
  /**
   * @param {object} opts
   * @param {string} opts.dataRoot   EduDesk data folder
   * @param {string} [opts.resourcesDir] folder with bundled assets (templates, fonts, UDISE masters)
   * @param {function} [opts.htmlToPdf] async (html, pdfPath, options) => void; provided by Electron
   * @param {function} [opts.renderFieldOverlay] async (spec) => Buffer PDF; provided by Electron
   * @param {function} [opts.shellOpen] async (path) => errorString|''
   */
  constructor(opts) {
    this.opts = opts;
    this.dataRoot = path.resolve(opts.dataRoot);
    this.resourcesDir = opts.resourcesDir || path.join(__dirname, '..', '..', 'assets');
    this.hooks = { htmlToPdf: opts.htmlToPdf || null, renderFieldOverlay: opts.renderFieldOverlay || null, shellOpen: opts.shellOpen || null };
    this.listeners = new Set();
  }

  async open() {
    ensureDir(this.dataRoot);
    for (const d of ['Data', 'Work', 'Backups', 'Exports', 'Logs']) ensureDir(path.join(this.dataRoot, d));
    this.dbPath = path.join(this.dataRoot, 'Data', 'edudesk.sqlite');
    const existed = fs.existsSync(this.dbPath);
    if (existed) this.preMigrationBackup();
    this.db = await Database.open(this.dbPath);
    const integrity = this.db.integrityCheck();
    if (!integrity.ok) this.log('error', 'Database integrity check failed', integrity);
    this.settings = new Settings(this.db);
    this.numbering = new Numbering(this);
    this.converter = new Converter(this);
    const firstRun = seed(this);
    ensureDir(this.documentsRoot());
    this.services = {};
    const modules = {
      categories: require('./services/categories'),
      recipients: require('./services/recipients'),
      templates: require('./services/templates'),
      letters: require('./services/letters'),
      inward: require('./services/inward'),
      students: require('./services/students'),
      udise: require('./services/udise'),
      reports: require('./services/reports'),
      search: require('./services/search'),
      backup: require('./services/backup'),
      dashboard: require('./services/dashboard'),
      users: require('./services/users'),
    };
    for (const [name, Mod] of Object.entries(modules)) this.services[name] = new Mod(this);
    // idempotent: installs on first run and adds samples shipped by later versions
    await this.services.templates.installBundledSamples();
    // private builds can ship the college's own previous letters: import them once
    const libDir = path.join(this.resourcesDir, 'library');
    if (!this.settings.get('ui').libraryImported && fs.existsSync(libDir)) {
      try { this.services.templates.importPreviousFolder(libDir); } catch (e) { this.log('warn', 'library import failed', { error: e.message }); }
      this.settings.set('ui', { libraryImported: true });
    }
    if (firstRun) await this.services.udise.installBundledMasters();
    this.integrity = integrity;
    return this;
  }

  /** Copy the DB file before applying a schema upgrade. */
  preMigrationBackup() {
    try {
      const { SCHEMA_VERSION } = require('./schema');
      const buf = fs.readFileSync(path.join(this.dataRoot, 'Data', 'edudesk.sqlite'));
      // user_version is stored big-endian at offset 60 of the SQLite header
      const v = buf.length > 64 ? buf.readUInt32BE(60) : 0;
      if (v && v < SCHEMA_VERSION) {
        const dest = path.join(this.dataRoot, 'Backups', `pre-upgrade-schema${v}-${Date.now()}.sqlite`);
        fs.copyFileSync(path.join(this.dataRoot, 'Data', 'edudesk.sqlite'), dest);
      }
    } catch (e) {
      this.log('warn', 'pre-migration backup failed', { error: e.message });
    }
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
  }

  // ---------- folders & stored paths ----------
  documentsRoot() {
    const custom = this.settings.get('archive').documentsRoot;
    return path.resolve(custom || path.join(this.dataRoot, 'Documents'));
  }
  workDir() { return path.join(this.dataRoot, 'Work'); }
  exportsDir() { return ensureDir(path.join(this.dataRoot, 'Exports')); }
  logsDir() { return ensureDir(path.join(this.dataRoot, 'Logs')); }

  /**
   * Store paths relative to the documents root ("doc:") or data root ("data:") so the
   * archive can be moved to another drive without breaking links.
   */
  toStored(abs) {
    if (!abs) return null;
    const a = path.resolve(abs);
    const docRoot = this.documentsRoot();
    const rel = (root) => path.relative(root, a);
    const inside = (root) => { const r = rel(root); return r && !r.startsWith('..') && !path.isAbsolute(r); };
    if (inside(docRoot)) return 'doc:' + rel(docRoot).split(path.sep).join('/');
    if (inside(this.dataRoot)) return 'data:' + rel(this.dataRoot).split(path.sep).join('/');
    return a;
  }

  resolve(stored) {
    if (!stored) return null;
    if (stored.startsWith('doc:')) return path.join(this.documentsRoot(), ...stored.slice(4).split('/'));
    if (stored.startsWith('data:')) return path.join(this.dataRoot, ...stored.slice(5).split('/'));
    return stored;
  }

  // ---------- users / permissions (single-user today, multi-user ready) ----------
  currentUser() {
    const username = this.settings.get('session').currentUser || 'owner';
    const u = this.db.get('SELECT u.*, r.name AS role_name, r.permissions FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = ? AND u.active = 1', [username]);
    if (!u) return { username: 'owner', display_name: 'Owner', role_name: 'Owner', permissions: PERMISSIONS.map((p) => p[0]) };
    return { ...u, permissions: json(u.permissions, []) };
  }
  can(perm) { return this.currentUser().permissions.includes(perm); }
  require(perm) {
    if (!this.can(perm)) {
      const label = (PERMISSIONS.find((p) => p[0] === perm) || [perm, perm])[1];
      throw new UserError(`You do not have permission to: ${label}.`);
    }
    return this.currentUser().username;
  }

  audit(user, action, entity, entityId, details) {
    this.db.run('INSERT INTO audit_log(user_name, action, entity, entity_id, details) VALUES(?,?,?,?,?)',
      [user || 'owner', action, entity || null, entityId == null ? null : entityId, details == null ? null : JSON.stringify(details)]);
  }

  log(level, message, data) {
    try {
      const line = `${new Date().toISOString()} [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}\n`;
      fs.appendFileSync(path.join(this.logsDir(), `edudesk-${new Date().toISOString().slice(0, 7)}.log`), line);
    } catch (_) { /* logging must never break the app */ }
  }

  /** Change notifications so the UI (dashboard etc.) can refresh automatically. */
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emitChange(what) { for (const fn of this.listeners) { try { fn(what); } catch (_) { /* ignore */ } } }
}

module.exports = { EduDeskApp };
