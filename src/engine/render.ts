// Template renderer: evaluates a parsed template against form values and context,
// producing text + HTML output, the list of form fields to show, and validation.
import { parseTemplate, TNode, CommandArgs, TemplateError, splitTop } from './template';
import { evaluate, EvalScope, parseExpr, exprNames } from './expr';

function namesIn(src: string | undefined): string[] {
  if (!src) return [];
  try { return [...exprNames(parseExpr(src.startsWith('=') ? src.slice(1) : src))]; } catch { return []; }
}
import { Value, formatValue, toText, toNumber, truthy, FormatOptions, isList, isObject, titleCase } from './values';
import { parseDate, shiftDate, formatDate, toISODate, toISOTime } from './dates';
import { escapeHtml, textToHtml, htmlToText } from '../shared/html';

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'toggle' | 'date' | 'time' | 'datetime' | 'number' | 'currency' | 'pick' | 'section';

export interface FieldDef {
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  defaultRaw?: string;
  options?: string[];
  multiple?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  message?: string;
  rows?: number;
  currency?: string;
  table?: string;
  display?: string;
  hint?: string;
  depth: number;
  /** Raw form value currently in effect (string | boolean | string[]) */
  value: any;
  error?: string;
  /** Source offsets of the defining command (for the visual editor). */
  start?: number;
  end?: number;
  implicit?: boolean;
}

export interface RepeatItem {
  type: 'repeat';
  name: string;
  label: string;
  min: number;
  max: number;
  depth: number;
  rows: FieldDef[][];
}

export type FormItem = FieldDef | RepeatItem;

export interface PickOption { id: string; label: string }

export interface RenderContext {
  values?: Record<string, any>;
  profile?: Record<string, string>;
  data?: Record<string, { label?: string; rows: Record<string, any>[]; columns?: string[] }>;
  page?: { url: string; title: string; host: string };
  resolveSnippet?: (shortcut: string) => { content: string; contentType: 'text' | 'html' } | null;
  fo?: Partial<FormatOptions>;
  now?: Date;
  features?: { forms?: boolean; formulas?: boolean; conditionals?: boolean };
}

export interface RenderResult {
  text: string;
  html: string;
  /** Caret position (characters from the start of `text`) requested by {{cursor}} */
  cursor: number | null;
  form: FormItem[];
  errors: string[];
  validation: string[];
  needsForm: boolean;
  /** Rich output differs meaningfully from text (formatting, links, tables). */
  isRich: boolean;
}

const CURSOR = '⁣⁣QTHCURSOR⁣⁣';
const FIELD_CMDS: Record<string, FieldType> = {
  text: 'text', input: 'text', textarea: 'textarea', paragraph: 'textarea', multiline: 'textarea',
  select: 'select', dropdown: 'select', choice: 'select', checkbox: 'checkbox', toggle: 'toggle', switch: 'toggle',
  date: 'date', time: 'time', datetime: 'datetime', number: 'number', currency: 'currency', money: 'currency', pick: 'pick',
};
const BUILTIN_ROOTS = new Set(['me', 'data', 'page', 'index', 'rownumber']);
const NAME_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

export function humanize(name: string) {
  const s = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function splitOptions(s: string): string[] {
  const sep = s.includes('|') ? '|' : ',';
  return splitTop(s, sep).map((x) => x.trim().replace(/^["']|["']$/g, '')).filter((x) => x !== '');
}

interface Defs {
  fields: Map<string, { type: FieldType; args: CommandArgs; start: number; end: number }>;
  sets: Set<string>;
  repeats: Map<string, { fields: Map<string, { type: FieldType; args: CommandArgs; start: number; end: number }>; sets: Set<string> }>;
  implicit: Set<string>;
  pendingRefs: { name: string; repeat: string | null }[];
}

/** Pre-pass: find every field/variable definition so references can resolve regardless of order. */
function collectDefs(nodes: TNode[], ctx: RenderContext, defs: Defs, repeat: string | null, depth: number, seenSnippets: Set<string>) {
  const target = () => (repeat ? defs.repeats.get(repeat)! : defs);
  const walk = (ns: TNode[]) => {
    for (const n of ns) {
      if (n.k === 'cmd') {
        const ft = FIELD_CMDS[n.name];
        if (ft && n.args.main) target().fields.has(n.args.main) || target().fields.set(n.args.main, { type: ft, args: n.args, start: n.start, end: n.end });
        else if (n.name === 'set') { const nm = n.args.main.split('=')[0].trim(); if (nm) target().sets.add(nm); }
        else if (n.name === 'ref') defs.pendingRefs.push({ name: n.args.main.split('.')[0], repeat });
        if (n.name === '=' || n.name === 'validate' || ['upper', 'lower', 'title', 'capitalize', 'trim', 'replace'].includes(n.name)) namesIn(n.args.main).forEach((nm) => defs.pendingRefs.push({ name: nm, repeat }));
        if (n.name === 'set') namesIn(n.args.main.split('=').slice(1).join('=')).forEach((nm) => defs.pendingRefs.push({ name: nm, repeat }));
        for (const v of [n.args.main, ...Object.values(n.args.opts)]) if (n.name !== '=' && v.startsWith('=')) namesIn(v).forEach((nm) => defs.pendingRefs.push({ name: nm, repeat }));
        else if ((n.name === 'snippet' || n.name === 'include') && ctx.resolveSnippet && depth < 5 && !seenSnippets.has(n.args.main)) {
          const sn = ctx.resolveSnippet(n.args.main);
          if (sn) {
            seenSnippets.add(n.args.main);
            try { collectDefs(parseTemplate(sn.content, sn.contentType === 'html'), ctx, defs, repeat, depth + 1, seenSnippets); } catch { /* reported at render */ }
            seenSnippets.delete(n.args.main);
          }
        }
      } else if (n.k === 'if') {
        n.branches.forEach((b) => { namesIn(b.cond).forEach((nm) => defs.pendingRefs.push({ name: nm, repeat })); walk(b.body); });
        if (n.elseBody) walk(n.elseBody);
      }
      else if (n.k === 'section') { defs.fields.has(n.args.main) || target().fields.set(n.args.main, { type: 'section', args: n.args, start: n.start, end: n.end }); walk(n.body); }
      else if (n.k === 'repeat') {
        if (/^\d+$/.test(n.args.main) || n.args.opts.count) walk(n.body);
        else {
          if (!defs.repeats.has(n.args.main)) defs.repeats.set(n.args.main, { fields: new Map(), sets: new Set() });
          collectDefs(n.body, ctx, defs, n.args.main, depth, seenSnippets);
        }
      }
    }
  };
  walk(nodes);
}

function resolveImplicit(defs: Defs) {
  for (const { name: r, repeat } of defs.pendingRefs) {
    if (defs.fields.has(r) || defs.sets.has(r) || defs.repeats.has(r) || defs.implicit.has(r) || BUILTIN_ROOTS.has(r)) continue;
    if (repeat) {
      const scope = defs.repeats.get(repeat)!;
      if (!scope.fields.has(r) && !scope.sets.has(r)) scope.fields.set(r, { type: 'text', args: { main: r, opts: {}, flags: new Set() }, start: -1, end: -1 });
    } else defs.implicit.add(r);
  }
}

export function render(source: string, contentType: 'text' | 'html', ctx: RenderContext = {}): RenderResult {
  const html = contentType === 'html';
  let mode = html;
  const fo: FormatOptions = { locale: 'en-US', currency: 'USD', dateFormat: 'DD MMM YYYY', timeFormat: 'h:mm A', ...(ctx.fo || {}) };
  const now = ctx.now || new Date();
  const values = ctx.values || {};
  const features = { forms: true, formulas: true, conditionals: true, ...(ctx.features || {}) };
  const errors: string[] = [];
  const validation: string[] = [];
  const form: FormItem[] = [];
  const registered = new Set<string>();
  let isRich = false;

  let ast: TNode[];
  try {
    ast = parseTemplate(source, html);
  } catch (e: any) {
    return { text: '', html: '', cursor: null, form: [], errors: [e.message], validation: [], needsForm: false, isRich: false };
  }
  const defs: Defs = { fields: new Map(), sets: new Set(), repeats: new Map(), implicit: new Set(), pendingRefs: [] };
  collectDefs(ast, ctx, defs, null, 0, new Set());
  resolveImplicit(defs);

  const vars: Record<string, Value> = {};
  const dataObj: Record<string, Value> = {};
  for (const [k, t] of Object.entries(ctx.data || {})) dataObj[k] = t.rows.map((r) => ({ ...r })) as Value;
  const profile = (ctx.profile || {}) as Record<string, Value>;
  const page = (ctx.page || { url: '', title: '', host: '' }) as Record<string, Value>;

  interface Frame { repeat: string; row: Record<string, any>; rowVars: Record<string, Value>; index: number; formRow: FieldDef[] }
  const frames: Frame[] = [];
  /** Innermost frame that owns form values (static repeats and tables do not). */
  const dataFrame = (): Frame | undefined => { for (let i = frames.length - 1; i >= 0; i--) if (!frames[i].repeat.startsWith('__')) return frames[i]; return undefined; };

  // ----- value resolution
  function defaultFor(type: FieldType, args: CommandArgs): any {
    const d = args.opts.default ?? args.opts.value_default;
    switch (type) {
      case 'checkbox': case 'toggle': case 'section':
        return d !== undefined ? truthy(d) : args.flags.has('checked') || args.flags.has('on');
      case 'date': {
        const dd = parseDate(d ?? '', now);
        return dd ? toISODate(dd) : '';
      }
      case 'time': {
        if (d === undefined) return '';
        const dd = parseDate(d === 'now' ? 'now' : d, now);
        return dd ? toISOTime(dd) : '';
      }
      case 'datetime': {
        const dd = d ? parseDate(d, now) : null;
        return dd ? `${toISODate(dd)}T${toISOTime(dd)}` : '';
      }
      case 'select':
        if (args.flags.has('multiple')) return d ? splitOptions(d) : [];
        return d ?? (args.flags.has('required') || args.opts.required ? '' : splitOptions(args.opts.options || '')[0] ?? '');
      default:
        return d ?? '';
    }
  }

  function typedValue(type: FieldType, raw: any, args: CommandArgs): Value {
    switch (type) {
      case 'checkbox': case 'toggle': case 'section': return !!raw && raw !== 'false';
      case 'number': case 'currency': {
        if (raw === '' || raw === null || raw === undefined) return null;
        const n = toNumber(raw);
        return isNaN(n) ? String(raw) : n;
      }
      case 'date': case 'datetime': {
        const d = raw ? parseDate(raw, now) : null;
        if (d && type === 'datetime') (d as any).__time = true;
        return d;
      }
      case 'time': {
        const d = raw ? parseDate(raw, now) : null;
        if (d) (d as any).__time = true;
        return d;
      }
      case 'pick': {
        const t = ctx.data?.[args.opts.table || ''];
        const row = t?.rows.find((r) => r.__id === raw || r.id === raw);
        if (!row) return null;
        const disp = args.opts.display || t?.columns?.[0] || Object.keys(row)[0];
        return { ...row, __label: row[disp] ?? '' } as Value;
      }
      case 'select': return Array.isArray(raw) ? raw : raw ?? '';
      default: return raw ?? '';
    }
  }

  function rawFieldValue(name: string, type: FieldType, args: CommandArgs, frame?: Frame): any {
    const src = frame ? frame.row : values;
    return src[name] !== undefined ? src[name] : defaultFor(type, args);
  }

  function lookup(name: string): { found: boolean; value: Value } {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      if (name in f.rowVars) return { found: true, value: f.rowVars[name] };
      if (name === 'index' || name === 'rownumber') return { found: true, value: f.index + 1 };
      const rd = defs.repeats.get(f.repeat)?.fields.get(name);
      if (rd && rd.start >= 0 && f === dataFrame()) { try { register(name, rd.type, rd.args, frames.length, rd.start, rd.end); } catch { /* forms disabled */ } }
      if (rd) return { found: true, value: typedValue(rd.type, rawFieldValue(name, rd.type, rd.args, f), rd.args) };
    }
    if (name in vars) return { found: true, value: vars[name] };
    if (defs.sets.has(name)) return { found: true, value: '' };
    const fd = defs.fields.get(name);
    // A field referenced before (or outside the branch of) its definition still belongs in the form.
    if (fd) { try { register(name, fd.type, fd.args, 0, fd.start, fd.end, false, true); } catch { /* forms disabled */ } }
    if (fd) return { found: true, value: typedValue(fd.type, rawFieldValue(name, fd.type, fd.args), fd.args) };
    if (defs.implicit.has(name)) {
      try { register(name, 'text', { main: name, opts: {}, flags: new Set() }, 0, undefined, undefined, true, true); } catch { /* forms disabled */ }
      return { found: true, value: values[name] ?? '' };
    }
    const rp = defs.repeats.get(name);
    if (rp) {
      const rows: any[] = repeatRows(name, { main: name, opts: {}, flags: new Set() });
      return {
        found: true,
        value: rows.map((row, i) => {
          const o: Record<string, Value> = { index: i + 1 };
          for (const [fname, d] of rp.fields) o[fname] = typedValue(d.type, row[fname] !== undefined ? row[fname] : defaultFor(d.type, d.args), d.args);
          return o;
        }),
      };
    }
    if (name === 'me') return { found: true, value: profile };
    if (name === 'data') return { found: true, value: dataObj };
    if (name === 'page') return { found: true, value: page };
    return { found: false, value: null };
  }

  const scope: EvalScope = { lookup, fo, now };
  const ev = (src: string): Value => {
    if (!features.formulas) throw new Error('Formulas require the Pro plan');
    return evaluate(src, scope);
  };
  /** Option values beginning with "=" are formulas. */
  const optVal = (v: string | undefined): string => (v === undefined ? '' : v.startsWith('=') ? toText(ev(v.slice(1)), fo) : v);

  function repeatRows(name: string, args: CommandArgs): any[] {
    const min = Math.max(0, parseInt(args.opts.min ?? '1', 10) || 0);
    const v = values[name];
    if (Array.isArray(v)) return v;
    return Array.from({ length: Math.max(min, 1) }, () => ({}));
  }

  // ----- form registration
  function register(name: string, type: FieldType, args: CommandArgs, depth: number, start?: number, end?: number, implicit = false, topLevel = false) {
    if (!features.forms) throw new Error('Dynamic form fields require an upgraded plan');
    const frame = topLevel ? undefined : dataFrame();
    const key = frame ? `${frame.repeat}#${frame.index}.${name}` : name;
    if (registered.has(key)) return;
    registered.add(key);
    const raw = rawFieldValue(name, type, args, frame);
    const o = args.opts;
    const fd: FieldDef = {
      name, type, depth, value: raw, implicit, start, end,
      label: o.label || humanize(name),
      required: args.flags.has('required') || truthy(o.required ?? ''),
      defaultRaw: o.default,
      options: type === 'select' ? splitOptions(optVal(o.options) || '') : undefined,
      multiple: args.flags.has('multiple'),
      placeholder: o.placeholder,
      min: o.min !== undefined ? toNumber(o.min) : undefined,
      max: o.max !== undefined ? toNumber(o.max) : undefined,
      step: o.step !== undefined ? toNumber(o.step) : undefined,
      minLength: o.minlength !== undefined ? parseInt(o.minlength, 10) : undefined,
      maxLength: o.maxlength !== undefined ? parseInt(o.maxlength, 10) : undefined,
      pattern: o.pattern,
      message: o.message,
      rows: o.rows ? parseInt(o.rows, 10) : undefined,
      currency: o.currency,
      table: o.table,
      display: o.display,
      hint: o.hint || o.help,
    };
    if (type === 'pick') {
      const t = ctx.data?.[o.table || ''];
      if (!t) throw new Error(`Data Hub table "${o.table}" was not found`);
      const disp = o.display || t.columns?.[0] || 'name';
      fd.options = t.rows.map((r) => `${r.__id}\u0000${toText(r[disp] ?? '')}`);
    }
    // validation
    const err = validateField(fd);
    if (err) { fd.error = err; validation.push(`${fd.label}: ${err}`); }
    if (frame) frame.formRow.push(fd);
    else form.push(fd);
  }

  function validateField(f: FieldDef): string | undefined {
    const v = f.value;
    const empty = v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || ((f.type === 'checkbox' || f.type === 'toggle') && f.required && !v);
    if (f.required && empty) return f.message || 'This field is required';
    if (empty) return;
    if (f.type === 'number' || f.type === 'currency') {
      const n = toNumber(v);
      if (isNaN(n)) return 'Enter a valid number';
      if (f.min !== undefined && n < f.min) return f.message || `Must be at least ${f.min}`;
      if (f.max !== undefined && n > f.max) return f.message || `Must be at most ${f.max}`;
    }
    if (typeof v === 'string') {
      if (f.minLength !== undefined && v.length < f.minLength) return f.message || `Use at least ${f.minLength} characters`;
      if (f.maxLength !== undefined && v.length > f.maxLength) return f.message || `Use at most ${f.maxLength} characters`;
      if (f.pattern) {
        const named: Record<string, RegExp> = { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, phone: /^\+?[\d\s().-]{6,20}$/, url: /^https?:\/\/\S+$/i, digits: /^\d+$/ };
        let re = named[f.pattern.toLowerCase()];
        if (!re) { try { re = new RegExp(`^(?:${f.pattern})$`); } catch { return 'Invalid validation pattern'; } }
        if (!re.test(v.trim())) return f.message || `Invalid format${named[f.pattern.toLowerCase()] ? ` (${f.pattern})` : ''}`;
      }
    }
  }

  // ----- output helpers
  let buf = '';
  const emitText = (s: string) => { buf += mode ? textToHtml(s) : s; };
  const emitHtml = (h: string, plain: string) => { if (mode) { buf += h; isRich = true; } else buf += plain; };

  function fieldOutput(type: FieldType, value: Value, args: CommandArgs): string {
    const fmt = args.opts.format;
    switch (type) {
      case 'checkbox': case 'toggle':
        return truthy(value) ? optVal(args.opts.value ?? args.opts.on ?? '') : optVal(args.opts.off ?? '');
      case 'currency':
        return value === null || value === '' ? '' : typeof value === 'number' ? formatValue(value, fmt || `currency:${args.opts.currency || fo.currency}`, fo) : toText(value, fo);
      case 'number':
        return value === null ? '' : formatValue(value, fmt, fo);
      case 'date':
        return value ? formatDate(value as Date, fmt || fo.dateFormat) : '';
      case 'time':
        return value ? formatDate(value as Date, fmt || fo.timeFormat) : '';
      case 'datetime':
        return value ? formatDate(value as Date, fmt || `${fo.dateFormat} ${fo.timeFormat}`) : '';
      case 'select':
        return Array.isArray(value) ? value.join(args.opts.separator ?? ', ') : formatValue(value, fmt, fo);
      default:
        return formatValue(value, fmt, fo);
    }
  }

  function renderTable(args: CommandArgs) {
    const src = ev(args.main);
    if (!isList(src)) throw new Error('{{table}} source must be a list (a repeat section or data.<table>)');
    let rows = src.filter((r) => isObject(r)) as Record<string, Value>[];
    const colSpec = args.opts.columns ? splitTop(args.opts.columns, '|').map((c) => c.trim()).filter(Boolean) : Object.keys(rows[0] || {}).filter((k) => !k.startsWith('__') && k !== 'index');
    const cols = colSpec.map((c) => {
      const i = c.indexOf(':');
      return i > 0 ? { header: c.slice(0, i).trim(), expr: c.slice(i + 1).trim() } : { header: humanize(c), expr: c };
    });
    const withRow = <T,>(row: Record<string, Value>, i: number, fn: () => T): T => {
      frames.push({ repeat: '__table', row: {}, rowVars: { ...row, index: i + 1 }, index: i, formRow: [] });
      try { return fn(); } finally { frames.pop(); }
    };
    if (args.opts.where) rows = rows.filter((r, i) => withRow(r, i, () => truthy(ev(args.opts.where))));
    if (args.opts.limit) rows = rows.slice(0, parseInt(args.opts.limit, 10) || rows.length);
    const fmts = (args.opts.formats || '').split('|').map((f) => f.trim());
    const cells = rows.map((r, i) => cols.map((c, ci) => withRow(r, i, () => formatValue(ev(c.expr), fmts[ci] || undefined, fo))));
    const totalRow: string[] | null = args.opts.total
      ? cols.map((c, ci) => {
          const wanted = splitTop(args.opts.total, '|').map((x) => x.trim().toLowerCase());
          if (ci === 0 && !wanted.includes(c.header.toLowerCase())) return args.opts.totallabel || 'Total';
          if (!wanted.includes(c.header.toLowerCase())) return '';
          const sum = rows.reduce((acc, r, i) => acc + (toNumber(withRow(r, i, () => ev(c.expr))) || 0), 0);
          return formatValue(sum, fmts[ci] || undefined, fo);
        })
      : null;
    const headers = cols.map((c) => c.header);
    const all = [headers, ...cells, ...(totalRow ? [totalRow] : [])];
    const widths = headers.map((_, ci) => Math.max(...all.map((r) => (r[ci] || '').length)));
    const line = (r: string[]) => '| ' + r.map((v, ci) => (v || '').padEnd(widths[ci])).join(' | ') + ' |';
    const plain = [line(headers), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...cells.map(line), ...(totalRow ? [line(totalRow)] : [])].join('\n');
    const td = 'style="border:1px solid #bbb;padding:4px 8px"';
    const h = `<table style="border-collapse:collapse"><thead><tr>${headers.map((x) => `<th ${td}>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${cells.map((r) => `<tr>${r.map((v) => `<td ${td}>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}${totalRow ? `<tr>${totalRow.map((v) => `<td ${td}><b>${escapeHtml(v)}</b></td>`).join('')}</tr>` : ''}</tbody></table>`;
    emitHtml(h, plain);
  }

  function renderNodes(nodes: TNode[], depth: number, snippetDepth: number) {
    for (const n of nodes) {
      try {
        renderNode(n, depth, snippetDepth);
      } catch (e: any) {
        const msg = e instanceof TemplateError || e instanceof Error ? e.message : String(e);
        const label = n.k === 'cmd' ? `{{${n.raw}}}` : n.k === 'if' ? '{{if}}' : `{{${n.k}}}`;
        errors.push(`${label}: ${msg}`);
      }
    }
  }

  function renderNode(n: TNode, depth: number, sd: number) {
    const frame = dataFrame();
    switch (n.k) {
      case 'text':
        buf += n.text;
        return;
      case 'if': {
        if (!features.conditionals) throw new Error('Conditional rules require the Pro plan');
        for (const b of n.branches) {
          if (truthy(evaluate(b.cond, scope))) { renderNodes(b.body, depth, sd); return; }
        }
        if (n.elseBody) renderNodes(n.elseBody, depth, sd);
        return;
      }
      case 'section': {
        const name = n.args.main;
        if (!NAME_RE.test(name)) throw new Error('Section needs a name, e.g. {{section: extras; label=Add extras?}}');
        register(name, 'section', n.args, depth, n.start, n.end);
        const on = truthy(typedValue('section', rawFieldValue(name, 'section', n.args, frame), n.args));
        if (on) renderNodes(n.body, depth + 1, sd);
        return;
      }
      case 'repeat': {
        const main = n.args.main;
        const sep = n.args.opts.separator ?? '';
        const staticCount = /^\d+$/.test(main) ? parseInt(main, 10) : n.args.opts.count ? Math.round(toNumber(ev(n.args.opts.count))) : null;
        if (staticCount !== null) {
          const c = Math.max(0, Math.min(500, isNaN(staticCount) ? 0 : staticCount));
          for (let i = 0; i < c; i++) {
            if (i && sep) emitText(sep);
            frames.push({ repeat: '__static', row: {}, rowVars: { index: i + 1 }, index: i, formRow: [] });
            try { renderNodes(n.body, depth, sd); } finally { frames.pop(); }
          }
          return;
        }
        if (!NAME_RE.test(main)) throw new Error('Repeat needs a name, e.g. {{repeat: items; label=Item}}');
        if (!features.forms) throw new Error('Repeating sections require an upgraded plan');
        const rows = repeatRows(main, n.args);
        const item: RepeatItem = {
          type: 'repeat', name: main, label: n.args.opts.label || humanize(main),
          min: parseInt(n.args.opts.min ?? '1', 10) || 0, max: parseInt(n.args.opts.max ?? '50', 10) || 50, depth, rows: [],
        };
        form.push(item);
        rows.forEach((row, i) => {
          if (i && sep) emitText(sep);
          const f: Frame = { repeat: main, row: row || {}, rowVars: {}, index: i, formRow: [] };
          frames.push(f);
          try { renderNodes(n.body, depth + 1, sd); } finally { frames.pop(); item.rows.push(f.formRow); }
        });
        return;
      }
      case 'cmd':
        break;
    }
    const { name, args } = n;
    const ft = FIELD_CMDS[name];
    if (ft && (args.main || !['date', 'time'].includes(name))) {
      const fname = args.main;
      if (!fname || !NAME_RE.test(fname)) throw new Error(`Field name "${fname}" may only contain letters, numbers and _ (use label=… for display text)`);
      register(fname, ft, args, depth, n.start, n.end);
      if (args.flags.has('hidden') || args.opts.show === 'no' || args.opts.show === 'false') return;
      const v = lookup(fname).value;
      emitText(fieldOutput(ft, v, args));
      return;
    }
    switch (name) {
      case '#': return;
      case 'ref': {
        const path = args.main;
        const root = path.split('.')[0];
        const isImplicit = defs.implicit.has(root) || (frame && defs.repeats.get(frame.repeat)?.fields.get(root)?.start === -1);
        if (isImplicit && !path.includes('.')) {
          register(root, 'text', args, depth, n.start, n.end, true);
        }
        let v: Value;
        if (path.includes('.')) v = evaluate(path, scope);
        else {
          const r = lookup(root);
          if (!r.found) throw new Error(`Unknown name "${root}"`);
          v = r.value;
          const fd = defs.fields.get(root) || (frame ? defs.repeats.get(frame.repeat)?.fields.get(root) : undefined);
          if (fd && !args.opts.format) { emitText(fieldOutput(fd.type, v, { ...fd.args, opts: { ...fd.args.opts } })); return; }
        }
        emitText(formatValue(v, args.opts.format, fo));
        return;
      }
      case '=': {
        const v = ev(args.main);
        emitText(formatValue(v, args.opts.format, fo));
        return;
      }
      case 'set': {
        const eq = args.main.indexOf('=');
        if (eq < 1) throw new Error('Use {{set: name = formula}}');
        const vn = args.main.slice(0, eq).trim();
        if (!NAME_RE.test(vn)) throw new Error(`Invalid variable name "${vn}"`);
        const v = ev(args.main.slice(eq + 1));
        if (frame) frame.rowVars[vn] = v;
        else vars[vn] = v;
        return;
      }
      case 'upper': case 'lower': case 'title': case 'capitalize': case 'trim': {
        const t = toText(evaluate(args.main, scope), fo);
        emitText(name === 'upper' ? t.toUpperCase() : name === 'lower' ? t.toLowerCase() : name === 'title' ? titleCase(t) : name === 'trim' ? t.trim() : t.charAt(0).toUpperCase() + t.slice(1));
        return;
      }
      case 'replace': {
        const t = toText(evaluate(args.main, scope), fo);
        emitText(t.split(args.opts.find ?? '').join(args.opts.with ?? args.opts.by ?? ''));
        return;
      }
      case 'today': case 'date': case 'now': case 'time': {
        let d = new Date(now.getTime());
        if (name === 'today' || name === 'date') d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (args.opts.shift) d = shiftDate(name === 'today' || name === 'date' ? d : d, args.opts.shift);
        if (args.main && name !== 'date') d = shiftDate(d, args.main);
        const fmt = args.opts.format || (name === 'time' ? fo.timeFormat : name === 'now' ? `${fo.dateFormat} ${fo.timeFormat}` : fo.dateFormat);
        emitText(formatDate(d, fmt));
        return;
      }
      case 'cursor':
        buf += CURSOR;
        return;
      case 'link': {
        const url = optVal(args.opts.url ?? (args.main.startsWith('=') ? args.main : args.main));
        const label = optVal(args.opts.text ?? '') || url;
        if (!/^(https?:|mailto:|tel:)/i.test(url)) throw new Error(`Links must start with https://, http://, mailto: or tel: (got "${url}")`);
        const plainMode = args.opts.plain || 'both';
        const plain = label === url || plainMode === 'url' ? url : plainMode === 'text' ? label : `${label} (${url})`;
        emitHtml(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`, plain);
        return;
      }
      case 'table':
        renderTable(args);
        return;
      case 'snippet': case 'include': {
        if (sd >= 5) throw new Error('Snippets are nested too deeply (max 5)');
        const sn = ctx.resolveSnippet?.(args.main);
        if (!sn) throw new Error(`No snippet with shortcut "${args.main}"`);
        const subHtml = sn.contentType === 'html';
        const sub = parseTemplate(sn.content, subHtml);
        if (subHtml === mode) { renderNodes(sub, depth, sd + 1); return; }
        const before = buf;
        const savedMode = mode;
        buf = '';
        mode = subHtml;
        try { renderNodes(sub, depth, sd + 1); } finally { mode = savedMode; }
        const out = buf;
        buf = before + (subHtml ? htmlToText(out) : textToHtml(out));
        return;
      }
      case 'validate': {
        const ok = truthy(evaluate(args.main, scope));
        if (!ok) validation.push(args.opts.message || `Check failed: ${args.main}`);
        return;
      }
      case 'index': {
        if (!frames.length) throw new Error('{{index}} can only be used inside {{repeat}}');
        emitText(String(frames[frames.length - 1].index + 1));
        return;
      }
      case 'else': case 'endif': case 'elseif': case 'endrepeat': case 'endsection':
        throw new Error('Misplaced block command');
      default:
        throw new Error(`Unknown command "${name}". See the syntax guide for available commands.`);
    }
  }
  renderNodes(ast, 0, 0);

  let text: string;
  let outHtml: string;
  if (html) {
    outHtml = buf;
    text = htmlToText(buf);
  } else {
    text = buf;
    outHtml = textToHtml(buf);
  }
  let cursor: number | null = null;
  const ci = text.indexOf(CURSOR);
  if (ci >= 0) cursor = ci;
  text = text.split(CURSOR).join('');
  outHtml = outHtml.split(CURSOR).join('');
  const needsForm = form.length > 0;
  return { text, html: outHtml, cursor, form, errors, validation, needsForm, isRich: html };
}

/** Lists names referenced inside a formula (used by the visual builder). */
export function formulaNames(src: string): string[] {
  try { return [...exprNames(parseExpr(src))]; } catch { return []; }
}

/** Static analysis helper for the dashboard: does the template need a form? */
export function analyze(source: string, contentType: 'text' | 'html', ctx: RenderContext = {}) {
  const r = render(source, contentType, ctx);
  return { fields: r.form, errors: r.errors, needsForm: r.needsForm };
}
