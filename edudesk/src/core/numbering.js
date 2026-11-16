'use strict';
/**
 * Outward / inward numbering engine.
 *
 * Pattern tokens:
 *   {PREFIX} {SUFFIX} {SEP} {SEQ} (zero padded) {N} (plain number)
 *   {AY} (2026-27) {AYFULL} (2026-2027) {YEAR} (2026) {CAT} (category code)
 *
 * Safety rules implemented here:
 *  - numbers are only allocated inside a database transaction;
 *  - counters only ever move forward, so cancelled / finalized numbers are never reused;
 *  - before handing out a number the engine checks the register and skips any value
 *    already present (e.g. taken by an authorised manual override);
 *  - a scheme that has already been used is never edited in place: saving changes
 *    retires it and creates a new scheme, so historical numbers stay untouched.
 */
const { academicYear, parseISO, UserError } = require('./util');

const PRESETS = [
  { key: 'seq_ay', label: '001/2026-27', pattern: '{SEQ}{SEP}{AY}', prefix: '' },
  { key: 'prefix_seq_ay', label: 'OUT/001/2026-27', pattern: '{PREFIX}{SEP}{SEQ}{SEP}{AY}', prefix: 'OUT' },
  { key: 'cat_seq_ay', label: 'BEO/001/2026-27 (category-wise)', pattern: '{CAT}{SEP}{SEQ}{SEP}{AY}', prefix: '', per_category: 1 },
  { key: 'ay_seq', label: '2026-27/001', pattern: '{AY}{SEP}{SEQ}', prefix: '' },
  { key: 'college_ay_seq', label: 'COLLEGE/2026-2027/001', pattern: '{PREFIX}{SEP}{AYFULL}{SEP}{SEQ}', prefix: 'COLLEGE' },
];

function periodKey(scheme, dateISO, startMonth) {
  if (scheme.reset === 'academic') return academicYear(dateISO, startMonth);
  if (scheme.reset === 'calendar') return String((parseISO(dateISO) || {}).y || new Date().getFullYear());
  return 'ALL';
}

function formatNumber(scheme, { seq, dateISO, startMonth, categoryCode }) {
  const ay = academicYear(dateISO, startMonth);
  const ayFull = `${ay.slice(0, 4)}-${parseInt(ay.slice(0, 4), 10) + 1}`;
  const year = String((parseISO(dateISO) || {}).y || new Date().getFullYear());
  const map = {
    PREFIX: scheme.prefix || '',
    SUFFIX: scheme.suffix || '',
    SEP: scheme.separator == null ? '/' : scheme.separator,
    SEQ: String(seq).padStart(Math.max(1, scheme.digits || 1), '0'),
    N: String(seq),
    AY: ay,
    AYFULL: ayFull,
    YEAR: year,
    CAT: categoryCode || 'GEN',
  };
  let out = scheme.pattern.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  // collapse doubled separators produced by empty tokens (e.g. empty prefix)
  const sep = map.SEP;
  if (sep) {
    const esc = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(${esc}){2,}`, 'g'), sep).replace(new RegExp(`^${esc}|${esc}$`, 'g'), '');
  }
  return out;
}

class Numbering {
  constructor(app) {
    this.app = app;
    this.db = app.db;
  }

  startMonth() {
    return this.app.settings.get('academic').startMonth;
  }

  listSchemes(scope) {
    return this.db.all('SELECT * FROM numbering_schemes WHERE scope = ? ORDER BY retired_at IS NOT NULL, id DESC', [scope]);
  }

  activeScheme(scope) {
    const s = this.db.get('SELECT * FROM numbering_schemes WHERE scope = ? AND active = 1 AND retired_at IS NULL ORDER BY id DESC LIMIT 1', [scope]);
    if (!s) throw new UserError(`No active ${scope} numbering scheme. Configure one in Settings → Numbering.`);
    return s;
  }

  schemeUsage(id) {
    const a = this.db.get('SELECT COUNT(*) AS n FROM letters WHERE outward_scheme_id = ?', [id]).n;
    const b = this.db.get('SELECT COUNT(*) AS n FROM inward WHERE scheme_id = ?', [id]).n;
    return a + b;
  }

  validateScheme(s) {
    if (!s.pattern || !/\{(SEQ|N)\}/.test(s.pattern)) throw new UserError('The numbering pattern must contain {SEQ} or {N}.');
    if (s.per_category && !/\{CAT\}/.test(s.pattern)) throw new UserError('Category-wise numbering needs {CAT} in the pattern so numbers stay unique.');
    if (s.reset === 'academic' && !/\{(AY|AYFULL)\}/.test(s.pattern)) throw new UserError('Academic-year reset needs {AY} or {AYFULL} in the pattern so numbers stay unique.');
    if (s.reset === 'calendar' && !/\{YEAR\}/.test(s.pattern)) throw new UserError('Calendar-year reset needs {YEAR} in the pattern so numbers stay unique.');
    const digits = Number(s.digits);
    if (!(digits >= 1 && digits <= 8)) throw new UserError('Number of digits must be between 1 and 8.');
    if (!(Number(s.start_number) >= 0)) throw new UserError('Starting number must be zero or more.');
  }

  /**
   * Create or update a scheme. Used schemes are retired and replaced, never edited.
   * The saved scheme becomes the active one for its scope.
   */
  saveScheme(input, user = 'owner') {
    const s = {
      scope: input.scope,
      name: input.name || 'Numbering',
      pattern: input.pattern,
      prefix: input.prefix || '',
      suffix: input.suffix || '',
      separator: input.separator == null ? '/' : input.separator,
      digits: Number(input.digits || 3),
      start_number: Number(input.start_number == null ? 1 : input.start_number),
      reset: input.reset || 'academic',
      per_category: input.per_category ? 1 : 0,
    };
    if (!['outward', 'inward'].includes(s.scope)) throw new UserError('Invalid numbering scope.');
    this.validateScheme(s);
    return this.db.tx(() => {
      let id = input.id;
      if (id && this.schemeUsage(id) === 0) {
        this.db.run(`UPDATE numbering_schemes SET name=?, pattern=?, prefix=?, suffix=?, separator=?, digits=?, start_number=?, reset=?, per_category=? WHERE id=?`,
          [s.name, s.pattern, s.prefix, s.suffix, s.separator, s.digits, s.start_number, s.reset, s.per_category, id]);
        this.db.run('DELETE FROM number_counters WHERE scheme_id = ?', [id]);
      } else {
        id = this.db.run(`INSERT INTO numbering_schemes(scope, name, pattern, prefix, suffix, separator, digits, start_number, reset, per_category, active)
          VALUES(?,?,?,?,?,?,?,?,?,?,0)`, [s.scope, s.name, s.pattern, s.prefix, s.suffix, s.separator, s.digits, s.start_number, s.reset, s.per_category]).lastInsertRowid;
      }
      this.db.run(`UPDATE numbering_schemes SET active = 0, retired_at = COALESCE(retired_at, datetime('now','localtime')) WHERE scope = ? AND id <> ? AND active = 1`, [s.scope, id]);
      this.db.run('UPDATE numbering_schemes SET active = 1, retired_at = NULL WHERE id = ?', [id]);
      this.app.audit(user, 'numbering.save', 'numbering_scheme', id, s);
      return this.db.get('SELECT * FROM numbering_schemes WHERE id = ?', [id]);
    });
  }

  preview(scope, { dateISO, categoryCode } = {}) {
    const scheme = this.activeScheme(scope);
    const next = this.peekNext(scheme, dateISO, categoryCode);
    return { scheme, next: formatNumber(scheme, { seq: next, dateISO, startMonth: this.startMonth(), categoryCode }) };
  }

  previewPattern(input, { dateISO, categoryCode } = {}) {
    const s = { ...input, digits: Number(input.digits || 3) };
    return formatNumber(s, { seq: Number(input.start_number || 1), dateISO, startMonth: this.startMonth(), categoryCode });
  }

  peekNext(scheme, dateISO, categoryCode) {
    const pk = periodKey(scheme, dateISO, this.startMonth());
    const ck = scheme.per_category ? categoryCode || 'GEN' : '';
    const row = this.db.get('SELECT next_value FROM number_counters WHERE scheme_id=? AND period_key=? AND category_key=?', [scheme.id, pk, ck]);
    return row ? row.next_value : scheme.start_number;
  }

  /**
   * Allocate the next number. MUST be called inside db.tx().
   * `exists(formatted)` returns true when a number is already used.
   */
  allocate(scope, { dateISO, categoryCode, exists }) {
    if (this.db.txDepth === 0) throw new Error('Numbering.allocate must run inside a transaction');
    const scheme = this.activeScheme(scope);
    const startMonth = this.startMonth();
    const pk = periodKey(scheme, dateISO, startMonth);
    const ck = scheme.per_category ? categoryCode || 'GEN' : '';
    const row = this.db.get('SELECT next_value FROM number_counters WHERE scheme_id=? AND period_key=? AND category_key=?', [scheme.id, pk, ck]);
    let seq = row ? row.next_value : scheme.start_number;
    let formatted;
    for (let guard = 0; guard < 100000; guard++) {
      formatted = formatNumber(scheme, { seq, dateISO, startMonth, categoryCode: ck || categoryCode });
      if (!exists(formatted, seq, scheme.id, pk, ck)) break;
      seq++;
    }
    this.db.run(`INSERT INTO number_counters(scheme_id, period_key, category_key, next_value) VALUES(?,?,?,?)
      ON CONFLICT(scheme_id, period_key, category_key) DO UPDATE SET next_value = excluded.next_value`, [scheme.id, pk, ck, seq + 1]);
    return { formatted, seq, schemeId: scheme.id, periodKey: pk, categoryKey: ck, academicYear: academicYear(dateISO, startMonth) };
  }
}

module.exports = { Numbering, formatNumber, periodKey, PRESETS };
