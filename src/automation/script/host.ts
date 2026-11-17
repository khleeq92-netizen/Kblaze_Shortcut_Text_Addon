// Script host: executes instrumented user code inside the sval interpreter with
// a small, explicit `kf` API. In the browser it is injected into the page's MAIN
// world (no extension privileges, unaffected by the page's CSP because nothing
// is eval'd). The same host powers the dashboard "dry run" against a detached
// sandbox document and the unit tests.
import Sval from 'sval';
import type { ElementTarget } from '../../shared/types';
import { resolveTarget, waitForTarget, detectFields, isVisible, queryBy } from '../dom';
import { setValue } from '../setters';
import { isSubmitLike, isCaptchaField } from '../safety';
import { formatDate, parseDate } from '../../engine/dates';

export interface ScriptPayload {
  code: string; // instrumented
  libraries?: { name: string; code: string }[]; // instrumented
  vars: Record<string, any>;
  record?: Record<string, any> | null;
  timeoutMs: number;
  maxLoopIterations: number;
  name?: string;
}
export interface ScriptResult {
  ok: boolean;
  result?: any;
  logs: { level: 'log' | 'warn' | 'error' | 'info'; text: string; at: number; line?: number }[];
  vars: Record<string, any>;
  error?: { message: string; line?: number };
  durationMs: number;
  steps: number;
}

class Halt extends Error {}

/** Only standard ECMAScript built-ins survive in the sandbox global. sval copies every
 *  enumerable property of the real global object (and keeps a hidden reference to it);
 *  without this, scripts could reach window.chrome, storage, fetch, etc. */
const SAFE_GLOBALS = new Set([
  'Object', 'Function', 'Array', 'Number', 'parseFloat', 'parseInt', 'Infinity', 'NaN', 'undefined', 'Boolean', 'String', 'Symbol', 'Date', 'Promise', 'RegExp',
  'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'JSON', 'Math', 'Intl', 'ArrayBuffer',
  'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'Uint8ClampedArray', 'BigInt64Array', 'BigUint64Array', 'DataView',
  'Map', 'BigInt', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'Reflect', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'isFinite', 'isNaN', 'globalThis', 'window', 'self',
]);
function sanitizeGlobal(interp: any) {
  interp.run('exports.__kfGlobal = globalThis;');
  const g = interp.exports.__kfGlobal;
  delete interp.exports.__kfGlobal;
  const real = globalThis as any;
  for (const k of Reflect.ownKeys(g)) {
    try {
      const v = g[k as any];
      if (typeof k !== 'string' || !SAFE_GLOBALS.has(k) || (v === real && k !== 'globalThis')) delete g[k as any];
    } catch { try { delete g[k as any]; } catch { /* non-configurable */ } }
  }
  for (const k of ['globalThis', 'window', 'self']) if (g[k] === real) delete g[k];
}

function safeJson(v: any, depth = 0): any {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v === 'string') return v.length > 20000 ? v.slice(0, 20000) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'function') return `[function ${v.name || ''}]`;
  if (typeof Element !== 'undefined' && v instanceof Element) return `<${v.tagName.toLowerCase()}${v.id ? '#' + v.id : ''}>`;
  if (depth > 4) return '[…]';
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => safeJson(x, depth + 1));
  if (typeof v === 'object') { const o: any = {}; for (const k of Object.keys(v).slice(0, 200)) o[k] = safeJson(v[k], depth + 1); return o; }
  return String(v);
}

function fmt(args: any[]): string {
  return args.map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(safeJson(a)); } catch { return String(a); } })())).join(' ').slice(0, 5000);
}

function toTarget(t: string | ElementTarget): ElementTarget {
  if (typeof t !== 'string') return t;
  return { by: 'auto', value: t };
}

export async function runScriptPayload(p: ScriptPayload, doc: Document): Promise<ScriptResult> {
  const t0 = Date.now();
  const deadline = t0 + Math.max(100, Math.min(p.timeoutMs || 30000, 10 * 60_000));
  const maxIter = Math.max(1, Math.min(p.maxLoopIterations || 10000, 10_000_000));
  const logs: ScriptResult['logs'] = [];
  const vars: Record<string, any> = { ...(p.vars || {}) };
  const counters = new Map<number, number>();
  let line = 0;
  let steps = 0;
  const log = (level: ScriptResult['logs'][0]['level']) => (...a: any[]) => { if (logs.length < 1000) logs.push({ level, text: fmt(a), at: Date.now() - t0, line }); };
  const check = () => { if (Date.now() > deadline) throw new Halt(`Script timed out after ${Math.round((deadline - t0) / 1000)} s`); };
  const el = (t: string | ElementTarget | Element, clickable = false) => {
    if (typeof t === 'object' && t && (t as any).nodeType === 1) return t as Element;
    const e = resolveTarget(doc, toTarget(t as any), { clickable }) || (clickable ? null : resolveTarget(doc, toTarget(t as any), { clickable: true }));
    if (!e) throw new Error(`Element not found: ${typeof t === 'string' ? t : (t as ElementTarget).value}`);
    return e;
  };
  const sleep = async (ms: number) => {
    check();
    const want = Math.max(0, Math.min(Number(ms) || 0, 60_000));
    await new Promise<void>((r) => setTimeout(r, Math.min(want, Math.max(0, deadline - Date.now()) + 5)));
    check();
  };

  const kf = Object.freeze({
    vars,
    record: p.record ? Object.freeze({ ...p.record }) : null,
    get url() { return doc.defaultView?.location?.href || ''; },
    get title() { return doc.title; },
    get ready() { return doc.readyState; },
    log: log('log'), info: log('info'), warn: log('warn'), error: log('error'),
    inspect: (v: any, label?: string) => { logs.push({ level: 'info', text: `${label ? label + ' = ' : ''}${JSON.stringify(safeJson(v), null, 2)}`.slice(0, 8000), at: Date.now() - t0, line }); return v; },
    setVar: (name: string, value: any) => { if (!/^[A-Za-z_]\w{0,63}$/.test(String(name))) throw new Error(`Invalid variable name "${name}"`); vars[name] = safeJson(value); return value; },
    getVar: (name: string) => vars[name],
    $: (sel: string) => queryBy(doc, 'css', sel)[0] || null,
    $$: (sel: string) => queryBy(doc, 'css', sel),
    find: (t: string | ElementTarget) => resolveTarget(doc, toTarget(t), { clickable: true }),
    exists: (t: string | ElementTarget) => !!resolveTarget(doc, toTarget(t), { clickable: true }),
    visible: (t: string | ElementTarget) => { const e = resolveTarget(doc, toTarget(t), { clickable: true }); return !!e && isVisible(e); },
    text: (t: string | ElementTarget | Element) => (el(t, true).textContent || '').trim(),
    value: (t: string | ElementTarget | Element) => String((el(t) as HTMLInputElement).value ?? ''),
    waitFor: async (t: string | ElementTarget, ms = 10000) => {
      check();
      const e = await waitForTarget(doc, toTarget(t), Math.min(ms, deadline - Date.now()), { clickable: true });
      if (!e) throw new Error(`Timed out waiting for ${typeof t === 'string' ? t : t.value}`);
      return e;
    },
    sleep,
    fill: async (t: string | ElementTarget | Element, value: any) => {
      const e = el(t);
      if (isCaptchaField(e)) throw new Error('K-Flow never fills CAPTCHA fields');
      const r = await setValue(e, String(value ?? ''), { action: 'fill' });
      if (!r.ok) throw new Error(r.message || 'Could not fill');
      return true;
    },
    select: async (t: string | ElementTarget | Element, value: any) => { const r = await setValue(el(t), String(value ?? ''), { action: 'select' }); if (!r.ok) throw new Error(r.message); return true; },
    check: async (t: string | ElementTarget | Element, on = true) => { const r = await setValue(el(t), '', { action: on ? 'check' : 'uncheck' }); if (!r.ok) throw new Error(r.message); return true; },
    click: (t: string | ElementTarget | Element) => {
      const e = el(t, true);
      if (isSubmitLike(e)) throw new Error('kf.click() does not press submit/pay/delete-type buttons. Use a macro "Click" step, which asks for your confirmation.');
      (e as HTMLElement).click();
      return true;
    },
    fields: () => detectFields(doc).map((f) => ({ label: f.label, name: f.name, id: f.id, kind: f.kind, css: f.css, required: f.required, options: f.options?.map((o) => o.label) })),
    today: (format = 'DD/MM/YYYY') => formatDate(new Date(), format),
    formatDate: (v: any, format = 'DD/MM/YYYY') => { const d = parseDate(v); if (!d) throw new Error(`Not a date: ${v}`); return formatDate(d, format); },
    loop: async (n: number, fn: (i: number) => any) => {
      const count = Math.min(Math.max(0, Math.floor(Number(n) || 0)), maxIter);
      for (let i = 0; i < count; i++) { check(); await fn(i); }
      return count;
    },
    assert: (cond: any, msg = 'Assertion failed') => { if (!cond) throw new Error(msg); },
    stop: (msg = 'Stopped by script') => { throw new Halt(msg); },
  });

  const interp = new Sval({ ecmaVer: 'latest' as any, sandBox: true });
  sanitizeGlobal(interp);
  interp.import({
    kf,
    console: Object.freeze({ log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('log') }),
    __kfL: (n: number) => { line = n; if (++steps % 256 === 0) check(); },
    __kfG: (id: number, ln: number) => {
      const c = (counters.get(id) || 0) + 1;
      counters.set(id, c);
      if (c > maxIter) { line = ln; throw new Halt(`Loop on line ${ln} exceeded ${maxIter} iterations (raise "Max loop iterations" if this is intended)`); }
      if (c % 128 === 0) check();
    },
    document: doc,
    JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Map, Set, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: (fn: any, ms: number) => setTimeout(fn, Math.min(Number(ms) || 0, 60_000)),
  });

  try {
    for (const lib of p.libraries || []) interp.run(lib.code);
    // Wrap so top-level await and `return` work; the result promise is exported.
    interp.run(`exports.__result = (async () => {\n${p.code}\n})();`);
    const result = await Promise.race([
      (interp.exports as any).__result,
      new Promise((_, rej) => setTimeout(() => rej(new Halt(`Script timed out after ${Math.round((deadline - t0) / 1000)} s`)), Math.max(0, deadline - Date.now()) + 50)),
    ]);
    return { ok: true, result: safeJson(result), logs, vars: safeJson(vars), durationMs: Date.now() - t0, steps };
  } catch (e: any) {
    const message = e instanceof Halt ? e.message : `${e?.name && e.name !== 'Error' ? e.name + ': ' : ''}${e?.message || String(e)}`;
    logs.push({ level: 'error', text: message, at: Date.now() - t0, line });
    return { ok: false, error: { message, line: line || undefined }, logs, vars: safeJson(vars), durationMs: Date.now() - t0, steps };
  }
}
