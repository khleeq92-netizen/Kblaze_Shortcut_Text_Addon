// Variable resolution: turns Variable records + the active dataset record into
// named values usable as {{name}} in autofill rules, macros, scripts and snippets.
// Formulas use the same safe expression engine as templates (no eval).
import type { Variable, DataTable, DataRow, Settings } from '../shared/types';
import { evaluate, parseExpr, exprNames, type EvalScope } from '../engine/expr';
import { formatDate, parseDate } from '../engine/dates';
import { toText, type Value, type FormatOptions, truthy } from '../engine/values';

export const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
export const RESERVED = new Set(['me', 'data', 'page', 'index', 'rownumber', 'row', 'record', 'vault', 'today', 'now', 'cursor', 'kf']);

export interface VarContext {
  record?: Record<string, any> | null;
  datasets?: DataTable[];
  now?: Date;
  fo: FormatOptions;
  /** decrypted vault values by key (only when the vault is unlocked) */
  vault?: Record<string, string> | null;
  page?: { url: string; title: string; host: string };
  /** Restrict to variables of these workspace ids (null workspace = global). */
  workspaceId?: string;
  scopeRef?: string | null;
}

export interface ResolvedVars {
  values: Record<string, Value>;
  errors: Record<string, string>;
}

export function validateVariableName(name: string): string | null {
  if (!VAR_NAME_RE.test(name)) return 'Use letters, numbers and _ only (must not start with a number)';
  if (RESERVED.has(name.toLowerCase())) return `"${name}" is reserved`;
  return null;
}

/** Random value from a spec: int:min-max | float:min-max:dp | alnum:N | digits:N | letters:N | uuid | choice (uses options) */
export function randomValue(spec: string, options: string[] = [], rnd: () => number = Math.random): string {
  const s = spec.trim();
  const m = /^(int|float|alnum|digits|letters|hex)(?::(.*))?$/i.exec(s);
  const pick = (chars: string, n: number) => Array.from({ length: Math.max(1, Math.min(256, n)) }, () => chars[Math.floor(rnd() * chars.length)]).join('');
  if (/^uuid$/i.test(s)) {
    const h = pick('0123456789abcdef', 32);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[Math.floor(rnd() * 4)]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }
  if (/^choice$/i.test(s) || (!m && options.length)) return options.length ? options[Math.floor(rnd() * options.length)] : '';
  if (!m) throw new Error(`Unknown random spec "${spec}". Use int:1-100, float:0-1:2, alnum:8, digits:6, letters:5, hex:8, uuid or choice`);
  const kind = m[1].toLowerCase();
  const arg = m[2] || '';
  if (kind === 'int' || kind === 'float') {
    const [range, dp] = arg.split(':');
    const [a, b] = (range || '0-100').split(/\s*-\s*(?=\d|-)/).map(Number);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`Invalid range in "${spec}"`);
    if (kind === 'int') return String(Math.floor(lo + rnd() * (hi - lo + 1)));
    return (lo + rnd() * (hi - lo)).toFixed(Math.max(0, Math.min(10, Number(dp ?? 2))));
  }
  const n = parseInt(arg || '8', 10);
  if (kind === 'digits') return pick('0123456789', n);
  if (kind === 'letters') return pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ', n);
  if (kind === 'hex') return pick('0123456789abcdef', n);
  return pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', n);
}

/** Dataset row -> plain object keyed by column key (and also column name). */
export function rowToRecord(t: DataTable, row: DataRow | undefined | null): Record<string, any> | null {
  if (!row) return null;
  const o: Record<string, any> = { __id: row.id };
  for (const c of t.columns) o[c.key] = row.values[c.key] ?? '';
  return o;
}

export function activeRecord(t: DataTable | undefined | null): DataRow | null {
  if (!t || !t.rows.length) return null;
  return t.rows.find((r) => r.id === t.currentRowId) || t.rows[0];
}

/** Dependency order (topological, cycles reported). */
function orderVariables(vars: Variable[]): { order: Variable[]; cycles: Set<string> } {
  const byName = new Map(vars.map((v) => [v.name, v]));
  const deps = new Map<string, string[]>();
  for (const v of vars) {
    const srcs: string[] = [];
    if (v.kind === 'formula') srcs.push(v.value);
    if (v.kind === 'conditional') { srcs.push(...(v.branches || []).flatMap((b) => [b.when, b.then.startsWith('=') ? b.then.slice(1) : ''])); if (v.value.startsWith('=')) srcs.push(v.value.slice(1)); }
    const names = new Set<string>();
    for (const s of srcs) { if (!s) continue; try { exprNames(parseExpr(s)).forEach((n) => names.add(n)); } catch { /* reported later */ } }
    deps.set(v.name, [...names].filter((n) => byName.has(n) && n !== v.name));
  }
  const order: Variable[] = [];
  const state = new Map<string, number>();
  const cycles = new Set<string>();
  const visit = (n: string, stack: string[]) => {
    const st = state.get(n);
    if (st === 2) return;
    if (st === 1) { stack.slice(stack.indexOf(n)).forEach((x) => cycles.add(x)); return; }
    state.set(n, 1);
    for (const d of deps.get(n) || []) visit(d, [...stack, n]);
    state.set(n, 2);
    order.push(byName.get(n)!);
  };
  for (const v of vars) visit(v.name, []);
  return { order, cycles };
}

/** Variables visible in a context: global ones, the workspace's, and those scoped to the running profile/macro. Later wins. */
export function visibleVariables(all: Variable[], workspaceId?: string, scopeRef?: string | null): Variable[] {
  const live = all.filter((v) => !v.deleted);
  const tier = (v: Variable) => (v.scopeRef ? (v.scopeRef === scopeRef ? 3 : -1) : !v.workspaceId ? 1 : v.workspaceId === workspaceId ? 2 : -1);
  const map = new Map<string, Variable>();
  for (const v of live.filter((x) => tier(x) >= 0).sort((a, b) => tier(a) - tier(b))) map.set(v.name, v);
  return [...map.values()];
}

export function resolveVariables(all: Variable[], ctx: VarContext): ResolvedVars {
  const now = ctx.now || new Date();
  const values: Record<string, Value> = {};
  const errors: Record<string, string> = {};
  const record = ctx.record || null;
  if (record) for (const [k, v] of Object.entries(record)) if (k !== '__id') values[k] = v as Value;
  if (record) { values.row = { ...record } as any; values.record = values.row; }
  if (ctx.vault) values.vault = { ...ctx.vault };
  const vars = visibleVariables(all, ctx.workspaceId, ctx.scopeRef);
  const columnKeys = new Set((ctx.datasets || []).flatMap((t) => t.columns.map((c) => c.key)));
  const { order, cycles } = orderVariables(vars);
  const scope: EvalScope = {
    lookup: (name) => {
      if (Object.prototype.hasOwnProperty.call(values, name)) return { found: true, value: values[name] };
      if (name === 'page' && ctx.page) return { found: true, value: ctx.page as any };
      // a dataset column referenced while no record is selected resolves to empty
      if (columnKeys.has(name)) return { found: true, value: '' };
      return { found: false, value: null };
    },
    fo: ctx.fo,
    now,
  };
  const ds = new Map((ctx.datasets || []).map((t) => [t.id, t]));
  for (const v of order) {
    if (cycles.has(v.name)) { errors[v.name] = 'Circular reference between variables'; values[v.name] = ''; continue; }
    try {
      let out: Value = '';
      switch (v.kind) {
        case 'static':
          out = v.value;
          break;
        case 'formula':
          out = evaluate(v.value, scope);
          if (v.format && out instanceof Date) out = formatDate(out, v.format);
          break;
        case 'date': {
          const src = v.value.trim() || 'today';
          // "today+7d" / "now+2h" -> shift relative to today/now; plain dates and words parse directly
          let d: Date | null = parseDate(src.replace(/^(today|now)\s*(?=[+-])/i, ''), now);
          if (!d) { const r = evaluate(src, scope); d = r instanceof Date ? r : parseDate(r, now); }
          if (!d) throw new Error(`"${src}" is not a date`);
          out = formatDate(d, v.format || ctx.fo.dateFormat);
          break;
        }
        case 'random':
          out = randomValue(v.value, v.options || []);
          break;
        case 'list':
          out = (v.options || []).join(', ');
          break;
        case 'counter':
          out = String((v.counter ?? Number(v.value || 1)) || 1);
          break;
        case 'dataset': {
          const t = v.datasetId ? ds.get(v.datasetId) : undefined;
          if (!t) throw new Error('Dataset not found');
          const row = record && record.__id && t.rows.find((r) => r.id === record.__id) ? t.rows.find((r) => r.id === record.__id)! : activeRecord(t);
          if (!row) throw new Error(`Dataset "${t.name}" has no records`);
          const col = t.columns.find((c) => c.key === v.column || c.name === v.column);
          if (!col) throw new Error(`Column "${v.column}" not found in "${t.name}"`);
          out = (row.values[col.key] ?? '') as Value;
          break;
        }
        case 'conditional': {
          let hit = false;
          for (const b of v.branches || []) {
            if (!b.when.trim()) continue;
            if (truthy(evaluate(b.when, scope))) { out = b.then.startsWith('=') ? evaluate(b.then.slice(1), scope) : b.then; hit = true; break; }
          }
          if (!hit) out = v.value.startsWith('=') ? evaluate(v.value.slice(1), scope) : v.value;
          break;
        }
        case 'secret': {
          const key = v.value.replace(/^vault\./, '');
          if (!ctx.vault) throw new Error('Vault is locked — unlock it in K-Flow to use secret variables');
          if (!(key in ctx.vault)) throw new Error(`Vault entry "${key}" not found`);
          out = ctx.vault[key];
          break;
        }
      }
      values[v.name] = out;
    } catch (e: any) {
      errors[v.name] = e?.message || String(e);
      values[v.name] = '';
    }
  }
  return { values, errors };
}

/** Values as display strings (variables page / preview). */
export function displayValues(r: ResolvedVars, fo: FormatOptions): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.values)) if (k !== 'row' && k !== 'record' && k !== 'vault') o[k] = toText(v, fo);
  return o;
}

export function formatOptionsFrom(s: Pick<Settings, 'locale' | 'currency' | 'dateFormat' | 'timeFormat'>): FormatOptions {
  return { locale: s.locale, currency: s.currency, dateFormat: s.dateFormat, timeFormat: s.timeFormat };
}
