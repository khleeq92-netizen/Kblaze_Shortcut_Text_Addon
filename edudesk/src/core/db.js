'use strict';
/**
 * SQLite database wrapper built on sql.js (SQLite compiled to WebAssembly).
 *
 * Why sql.js: it has no native binaries, so the same build runs on every Windows
 * machine without compiler tool-chains or ABI mismatches. The database lives in
 * memory and is persisted to disk after every committed write transaction using
 * an atomic "write temp file -> fsync -> rename" sequence, so a crash or power
 * cut can never leave a half-written database file behind.
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { SCHEMA_VERSION, migrations } = require('./schema');

let SQL = null;
async function loadSqlJs() {
  if (SQL) return SQL;
  const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
  SQL = await initSqlJs({ locateFile: (f) => path.join(wasmDir, f) });
  return SQL;
}

class Database {
  constructor(filePath, raw) {
    this.filePath = filePath;
    this.raw = raw;
    this.txDepth = 0;
    this.dirty = false;
    this.raw.run('PRAGMA foreign_keys = ON');
  }

  static async open(filePath) {
    const S = await loadSqlJs();
    let raw;
    if (filePath && fs.existsSync(filePath)) {
      raw = new S.Database(fs.readFileSync(filePath));
    } else {
      if (filePath) fs.mkdirSync(path.dirname(filePath), { recursive: true });
      raw = new S.Database();
    }
    const db = new Database(filePath, raw);
    db.migrate();
    return db;
  }

  /** Apply pending schema migrations inside one transaction. */
  migrate() {
    const current = this.userVersion();
    if (current > SCHEMA_VERSION) {
      throw new Error(`Database was created by a newer EduDesk version (schema ${current}). Please update the application.`);
    }
    if (current === SCHEMA_VERSION) return { from: current, to: current };
    this.tx(() => {
      for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
        const m = migrations[v];
        if (!m) throw new Error(`Missing migration ${v}`);
        m(this);
      }
      this.raw.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
    return { from: current, to: SCHEMA_VERSION };
  }

  userVersion() {
    return this.get('PRAGMA user_version').user_version;
  }

  exec(sql) {
    this.raw.exec(sql);
    this.markDirty();
  }

  run(sql, params = []) {
    this.raw.run(sql, normalize(params));
    const changes = this.raw.getRowsModified();
    const id = this.get('SELECT last_insert_rowid() AS id').id;
    this.markDirty();
    return { changes, lastInsertRowid: id };
  }

  get(sql, params = []) {
    const stmt = this.raw.prepare(sql);
    try {
      stmt.bind(normalize(params));
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  all(sql, params = []) {
    const stmt = this.raw.prepare(sql);
    const rows = [];
    try {
      stmt.bind(normalize(params));
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  }

  /**
   * Run fn inside a transaction. Nested calls join the outer transaction.
   * The database is written to disk once the outermost transaction commits.
   */
  tx(fn) {
    if (this.txDepth > 0) {
      this.txDepth++;
      try {
        return fn(this);
      } finally {
        this.txDepth--;
      }
    }
    this.raw.run('BEGIN IMMEDIATE');
    this.txDepth = 1;
    let result;
    try {
      result = fn(this);
      this.raw.run('COMMIT');
    } catch (err) {
      try { this.raw.run('ROLLBACK'); } catch (_) { /* already rolled back */ }
      this.txDepth = 0;
      this.dirty = false;
      throw err;
    }
    this.txDepth = 0;
    this.persist();
    return result;
  }

  markDirty() {
    this.dirty = true;
    if (this.txDepth === 0) this.persist();
  }

  /** Atomically write the in-memory database to disk. */
  persist() {
    if (!this.filePath || !this.dirty) return;
    const data = this.raw.export();
    // export() resets PRAGMAs on some builds; re-enable FK enforcement.
    this.raw.run('PRAGMA foreign_keys = ON');
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, Buffer.from(data));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.filePath);
    this.dirty = false;
  }

  integrityCheck() {
    const rows = this.all('PRAGMA integrity_check');
    const fk = this.all('PRAGMA foreign_key_check');
    const ok = rows.length === 1 && rows[0].integrity_check === 'ok' && fk.length === 0;
    return { ok, details: rows.map((r) => r.integrity_check), foreignKeyProblems: fk.length };
  }

  exportBytes() {
    const data = this.raw.export();
    this.raw.run('PRAGMA foreign_keys = ON');
    return Buffer.from(data);
  }

  close() {
    this.persist();
    this.raw.close();
  }
}

function normalize(params) {
  if (Array.isArray(params)) return params.map(normValue);
  const out = {};
  for (const [k, v] of Object.entries(params)) out[k.startsWith('$') || k.startsWith(':') || k.startsWith('@') ? k : `$${k}`] = normValue(v);
  return out;
}
function normValue(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  return v;
}

module.exports = { Database, loadSqlJs };
