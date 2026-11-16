'use strict';
/**
 * Backup & restore.
 *
 * A backup is a plain folder (easy to inspect, copy to a pen drive, or restore by hand):
 *   EduDesk_Backup_2026-11-15_101500/
 *     manifest.json        – list of every file with size + SHA-256, schema version, app version
 *     database.sqlite      – consistent snapshot of the database
 *     settings.json        – readable copy of all settings (numbering schemes included in the DB)
 *     Documents/...        – templates, archived DOCX/PDF, inward scans, acknowledgements, UDISE forms
 *     Work/...             – documents currently being edited in Word
 * A backup is only reported as successful after every file has been re-read and its
 * checksum compared with the manifest, and the database copy passed an integrity check.
 */
const fs = require('fs');
const path = require('path');
const { loadSqlJs } = require('../db');
const { SCHEMA_VERSION } = require('../schema');
const { UserError, ensureDir, sha256File, nowLocal, uniquePath } = require('../util');

const APP_VERSION = (() => { try { return require('../../../package.json').version; } catch (_) { return '1.0.0'; } })();

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, base, out);
    else if (ent.isFile() && !/^~\$|^\.~lock\./.test(ent.name)) out.push(path.relative(base, p));
  }
  return out;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

class Backup {
  constructor(app) { this.app = app; this.db = app.db; }

  defaultDestination() {
    return this.app.settings.get('backup').destination || path.join(this.app.dataRoot, 'Backups');
  }

  /** Create and verify a full backup. */
  async create({ destination, kind = 'manual', note } = {}) {
    const user = kind === 'manual' ? this.app.require('backup.manage') : 'system';
    const destRoot = destination || this.defaultDestination();
    try { ensureDir(destRoot); } catch (e) { throw new UserError(`Cannot write to the backup location ${destRoot}: ${e.message}`); }
    const docRoot = this.app.documentsRoot();
    const rel = path.relative(docRoot, path.resolve(destRoot));
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) throw new UserError('The backup location cannot be inside the documents archive folder.');
    const dir = uniquePath(path.join(destRoot, `EduDesk_Backup_${stamp()}${kind !== 'manual' ? '_' + kind : ''}`));
    ensureDir(dir);
    const files = [];
    try {
      // database snapshot (consistent: taken from memory between transactions)
      const dbBytes = this.app.db.exportBytes();
      fs.writeFileSync(path.join(dir, 'database.sqlite'), dbBytes);
      files.push('database.sqlite');
      fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(this.app.settings.all(), null, 2));
      files.push('settings.json');
      for (const [srcRoot, prefix] of [[docRoot, 'Documents'], [this.app.workDir(), 'Work']]) {
        for (const r of walk(srcRoot)) {
          if (prefix === 'Work' && r.startsWith('_preview')) continue;
          const target = path.join(dir, prefix, r);
          ensureDir(path.dirname(target));
          fs.copyFileSync(path.join(srcRoot, r), target);
          files.push(path.join(prefix, r));
        }
      }
      const manifest = {
        product: 'EduDesk Correspondence Manager', appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, createdAt: nowLocal(), kind, note: note || null,
        sourceDataRoot: this.app.dataRoot, sourceDocumentsRoot: docRoot,
        files: files.map((f) => ({ path: f.split(path.sep).join('/'), size: fs.statSync(path.join(dir, f)).size, sha256: sha256File(path.join(dir, f)) })),
      };
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      const v = await this.verify(dir);
      const size = manifest.files.reduce((s, f) => s + f.size, 0);
      const id = this.db.run('INSERT INTO backups(path, kind, size_bytes, file_count, verified, verified_at, note) VALUES(?,?,?,?,?,?,?)',
        [dir, kind, size, manifest.files.length, v.ok ? 1 : 0, v.ok ? nowLocal() : null, note || (v.ok ? null : v.errors.join('; '))]).lastInsertRowid;
      this.app.audit(user, 'backup.create', 'backup', id, { dir, files: manifest.files.length, verified: v.ok });
      if (!v.ok) throw new UserError(`The backup was written but verification FAILED: ${v.errors.slice(0, 5).join('; ')}. Do not rely on this backup.`);
      if (kind === 'auto') this.app.settings.set('backup', { lastAutoAt: new Date().toISOString() });
      return { ok: true, id, path: dir, files: manifest.files.length, size };
    } catch (e) {
      this.app.log('error', 'backup failed', { dir, error: e.message });
      if (!e.userFacing) throw new UserError(`Backup failed: ${e.message}`);
      throw e;
    }
  }

  /** Re-read every file in a backup and compare with its manifest. */
  async verify(dir) {
    const errors = [];
    const mPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(mPath)) return { ok: false, errors: ['manifest.json is missing – this is not an EduDesk backup folder.'] };
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(mPath, 'utf8')); } catch (e) { return { ok: false, errors: ['manifest.json is damaged.'] }; }
    for (const f of manifest.files) {
      const p = path.join(dir, ...f.path.split('/'));
      if (!fs.existsSync(p)) { errors.push(`Missing: ${f.path}`); continue; }
      if (fs.statSync(p).size !== f.size) { errors.push(`Size mismatch: ${f.path}`); continue; }
      if (sha256File(p) !== f.sha256) errors.push(`Checksum mismatch: ${f.path}`);
    }
    if (!manifest.files.some((f) => f.path === 'database.sqlite')) errors.push('Database file missing from manifest.');
    else if (!errors.some((e) => e.includes('database.sqlite'))) {
      try {
        const S = await loadSqlJs();
        const raw = new S.Database(fs.readFileSync(path.join(dir, 'database.sqlite')));
        const res = raw.exec('PRAGMA integrity_check')[0].values[0][0];
        const ver = raw.exec('PRAGMA user_version')[0].values[0][0];
        raw.close();
        if (res !== 'ok') errors.push(`Database integrity check failed: ${res}`);
        if (ver > SCHEMA_VERSION) errors.push('This backup was made by a newer EduDesk version.');
      } catch (e) {
        errors.push(`Database copy cannot be opened: ${e.message}`);
      }
    }
    const row = this.db.get('SELECT id FROM backups WHERE path=?', [dir]);
    if (row) this.db.run('UPDATE backups SET verified=?, verified_at=? WHERE id=?', [errors.length ? 0 : 1, nowLocal(), row.id]);
    return { ok: errors.length === 0, errors, manifest: { createdAt: manifest.createdAt, appVersion: manifest.appVersion, schemaVersion: manifest.schemaVersion, files: manifest.files.length, kind: manifest.kind } };
  }

  list() {
    return this.db.all('SELECT * FROM backups ORDER BY id DESC').map((b) => ({ ...b, exists: fs.existsSync(b.path) }));
  }

  /** Quick database-only copy before risky operations (imports, restores, migrations). */
  safetySnapshot(reason) {
    try {
      const dir = ensureDir(path.join(this.app.dataRoot, 'Backups', 'Safety'));
      const p = path.join(dir, `edudesk_${stamp()}_${String(reason || 'safety').replace(/[^\w]+/g, '_').slice(0, 40)}.sqlite`);
      fs.writeFileSync(p, this.app.db.exportBytes());
      const old = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite')).sort();
      for (const f of old.slice(0, Math.max(0, old.length - 20))) fs.unlinkSync(path.join(dir, f));
      return p;
    } catch (e) {
      this.app.log('warn', 'safety snapshot failed', { error: e.message });
      return null;
    }
  }

  /**
   * Restore a verified backup. The current data is backed up first. Files that would be
   * replaced are moved aside (never deleted). The caller must restart the application.
   */
  async restore(dir) {
    const user = this.app.require('backup.manage');
    const v = await this.verify(dir);
    if (!v.ok) throw new UserError(`This backup failed verification and cannot be restored: ${v.errors.slice(0, 5).join('; ')}`);
    const pre = await this.create({ kind: 'pre-restore', note: `Automatic backup before restoring ${path.basename(dir)}` });
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const docRoot = this.app.documentsRoot();
    const aside = path.join(this.app.dataRoot, 'Backups', `replaced_before_restore_${stamp()}`);
    let restored = 0;
    for (const f of manifest.files) {
      if (!f.path.startsWith('Documents/') && !f.path.startsWith('Work/')) continue;
      const src = path.join(dir, ...f.path.split('/'));
      const isDoc = f.path.startsWith('Documents/');
      const relParts = f.path.split('/').slice(1);
      const target = path.join(isDoc ? docRoot : this.app.workDir(), ...relParts);
      if (fs.existsSync(target)) {
        if (sha256File(target) === f.sha256) continue;
        const moved = path.join(aside, isDoc ? 'Documents' : 'Work', ...relParts);
        ensureDir(path.dirname(moved));
        try { fs.chmodSync(target, 0o644); } catch (_) { /* ignore */ }
        fs.renameSync(target, moved);
      }
      ensureDir(path.dirname(target));
      fs.copyFileSync(src, target);
      restored++;
    }
    this.app.audit(user, 'backup.restore', 'backup', null, { from: dir, preRestoreBackup: pre.path, files: restored });
    // Replace the database last; close it so the in-memory copy cannot overwrite the restored file.
    const dbBytes = fs.readFileSync(path.join(dir, 'database.sqlite'));
    const dbPath = this.app.dbPath;
    this.app.db.raw.close();
    this.app.db = null;
    const tmp = `${dbPath}.restore-tmp`;
    fs.writeFileSync(tmp, dbBytes);
    fs.renameSync(tmp, dbPath);
    return { ok: true, restartRequired: true, preRestoreBackup: pre.path, filesRestored: restored, replacedFilesFolder: fs.existsSync(aside) ? aside : null };
  }

  /** Run the automatic daily/weekly backup when it is due. */
  async runAutoIfDue() {
    const cfg = this.app.settings.get('backup');
    if (!cfg.auto || cfg.auto === 'off') return null;
    const intervalMs = cfg.auto === 'weekly' ? 7 * 86400000 : 86400000;
    const last = cfg.lastAutoAt ? Date.parse(cfg.lastAutoAt) : 0;
    if (Date.now() - last < intervalMs) return null;
    const res = await this.create({ kind: 'auto' });
    this.prune();
    return res;
  }

  /** Keep only the newest N automatic backups (manual backups are never pruned). */
  prune() {
    const keep = Math.max(3, Number(this.app.settings.get('backup').keep) || 30);
    const autos = this.db.all("SELECT * FROM backups WHERE kind='auto' ORDER BY id DESC");
    for (const b of autos.slice(keep)) {
      try { fs.rmSync(b.path, { recursive: true, force: true }); } catch (_) { /* ignore */ }
      this.db.run("UPDATE backups SET note=COALESCE(note,'') || ' (removed by retention policy)' WHERE id=?", [b.id]);
    }
  }

  /**
   * Move the documents archive to a new folder. Every file is copied and verified first;
   * only then is the setting switched. The old folder is left untouched for the user to remove.
   */
  async moveDocumentsRoot(newRoot) {
    const user = this.app.require('settings.manage');
    const oldRoot = this.app.documentsRoot();
    newRoot = path.resolve(newRoot);
    if (newRoot === oldRoot) throw new UserError('That is already the archive folder.');
    const rel = path.relative(oldRoot, newRoot);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) throw new UserError('The new folder cannot be inside the current archive folder.');
    ensureDir(newRoot);
    if (fs.readdirSync(newRoot).length) throw new UserError('Choose an empty folder for the archive.');
    await this.create({ kind: 'pre-move', note: `Before moving archive to ${newRoot}` });
    const files = walk(oldRoot);
    for (const r of files) {
      const t = path.join(newRoot, r);
      ensureDir(path.dirname(t));
      fs.copyFileSync(path.join(oldRoot, r), t);
      if (sha256File(t) !== sha256File(path.join(oldRoot, r))) throw new UserError(`Copy verification failed for ${r}. The archive location was NOT changed.`);
    }
    this.app.settings.set('archive', { documentsRoot: newRoot });
    this.app.audit(user, 'archive.move', 'settings', null, { from: oldRoot, to: newRoot, files: files.length });
    return { ok: true, files: files.length, oldRoot, newRoot };
  }
}

module.exports = Backup;
