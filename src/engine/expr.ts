// K-Flow formula language: a small, safe (no eval) expression language.
//   numbers 12.5   strings "a" 'b'   true false null   lists [1,2]
//   + - * / % ^   & (concat)   = == != <> < <= > >=   and or not   ?: none
//   name, name.field, list.field (maps over lists), fn(args)
import { Value, toNumber, toText, truthy, isList, isObject, isNumeric, formatValue, titleCase, FormatOptions } from './values';
import { parseDate, shiftDate, dateDiff, formatDate, addMonths, addBusinessDays, toISODate } from './dates';

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' }
  | { t: 'list'; items: Node[] }
  | { t: 'name'; name: string }
  | { t: 'member'; obj: Node; prop: string }
  | { t: 'index'; obj: Node; index: Node }
  | { t: 'call'; fn: string; args: Node[] }
  | { t: 'unary'; op: string; arg: Node }
  | { t: 'bin'; op: string; left: Node; right: Node };

type Tok = { k: 'num' | 'str' | 'id' | 'op' | 'eof'; v: string; pos: number };

export class ExprError extends Error {}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || ''))) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      toks.push({ k: 'num', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'" || c === '“' || c === '”') {
      const close = c === '“' ? '”' : c;
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== close && !(close === '”' && src[j] === '"')) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[j + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2;
        } else s += src[j++];
      }
      if (j >= src.length) throw new ExprError(`Unterminated text starting at position ${i + 1}`);
      toks.push({ k: 'str', v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_$]/u.test(c)) {
      const m = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(src.slice(i))!;
      toks.push({ k: 'id', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<>', '<=', '>=', '&&', '||'].includes(two)) { toks.push({ k: 'op', v: two, pos: i }); i += 2; continue; }
    if ('+-*/%^&=<>!(),.[]?:'.includes(c)) { toks.push({ k: 'op', v: c, pos: i }); i++; continue; }
    throw new ExprError(`Unexpected character "${c}" at position ${i + 1}`);
  }
  toks.push({ k: 'eof', v: '', pos: src.length });
  return toks;
}

const BIN_PREC: Record<string, number> = {
  or: 1, '||': 1, and: 2, '&&': 2,
  '=': 4, '==': 4, '!=': 4, '<>': 4, '<': 4, '<=': 4, '>': 4, '>=': 4,
  '&': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, '^': 8,
};

export function parseExpr(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (v: string) => {
    const t = next();
    if (t.v !== v) throw new ExprError(`Expected "${v}" at position ${t.pos + 1}${t.k === 'eof' ? ' (end of formula)' : ''}`);
  };
  const binOp = (t: Tok): string | null => {
    if (t.k === 'op' && t.v in BIN_PREC) return t.v;
    if (t.k === 'id' && (t.v.toLowerCase() === 'and' || t.v.toLowerCase() === 'or')) return t.v.toLowerCase();
    return null;
  };

  function parse(minPrec: number): Node {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t.k === 'op' && t.v === '?' && minPrec <= 0) {
        next();
        const a = parse(0);
        expect(':');
        const b = parse(0);
        left = { t: 'call', fn: 'if', args: [left, a, b] };
        continue;
      }
      const op = binOp(t);
      if (!op) break;
      const prec = BIN_PREC[op];
      if (prec < minPrec) break;
      next();
      const right = parse(op === '^' ? prec : prec + 1);
      left = { t: 'bin', op, left, right };
    }
    return left;
  }
  function unary(): Node {
    const t = peek();
    if (t.k === 'op' && (t.v === '-' || t.v === '+' || t.v === '!')) { next(); return { t: 'unary', op: t.v === '!' ? 'not' : t.v, arg: unary() }; }
    if (t.k === 'id' && t.v.toLowerCase() === 'not') { next(); return { t: 'unary', op: 'not', arg: parse(3) }; }
    return postfix(primary());
  }
  function postfix(n: Node): Node {
    for (;;) {
      const t = peek();
      if (t.k === 'op' && t.v === '.') {
        next();
        const id = next();
        if (id.k !== 'id' && id.k !== 'num') throw new ExprError(`Expected a field name after "." at position ${id.pos + 1}`);
        n = { t: 'member', obj: n, prop: id.v };
      } else if (t.k === 'op' && t.v === '[') {
        next();
        const idx = parse(0);
        expect(']');
        n = { t: 'index', obj: n, index: idx };
      } else return n;
    }
  }
  function primary(): Node {
    const t = next();
    if (t.k === 'num') return { t: 'num', v: parseFloat(t.v) };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'id') {
      const lw = t.v.toLowerCase();
      if (lw === 'true' || lw === 'yes') return { t: 'bool', v: true };
      if (lw === 'false' || lw === 'no') return { t: 'bool', v: false };
      if (lw === 'null') return { t: 'null' };
      if (peek().v === '(' && peek().k === 'op') {
        next();
        const args: Node[] = [];
        if (!(peek().k === 'op' && peek().v === ')')) {
          for (;;) {
            args.push(parse(0));
            if (peek().k === 'op' && peek().v === ',') { next(); continue; }
            break;
          }
        }
        expect(')');
        return { t: 'call', fn: lw, args };
      }
      return { t: 'name', name: t.v };
    }
    if (t.k === 'op' && t.v === '(') { const e = parse(0); expect(')'); return e; }
    if (t.k === 'op' && t.v === '[') {
      const items: Node[] = [];
      if (!(peek().k === 'op' && peek().v === ']')) {
        for (;;) {
          items.push(parse(0));
          if (peek().k === 'op' && peek().v === ',') { next(); continue; }
          break;
        }
      }
      expect(']');
      return { t: 'list', items };
    }
    throw new ExprError(t.k === 'eof' ? 'Formula ended unexpectedly' : `Unexpected "${t.v}" at position ${t.pos + 1}`);
  }
  const node = parse(0);
  if (peek().k !== 'eof') throw new ExprError(`Unexpected "${peek().v}" at position ${peek().pos + 1}`);
  return node;
}

/** Names referenced by an expression (top-level identifiers only). */
export function exprNames(n: Node, out = new Set<string>()): Set<string> {
  switch (n.t) {
    case 'name': out.add(n.name); break;
    case 'member': exprNames(n.obj, out); break;
    case 'index': exprNames(n.obj, out); exprNames(n.index, out); break;
    case 'call': n.args.forEach((a) => exprNames(a, out)); break;
    case 'unary': exprNames(n.arg, out); break;
    case 'bin': exprNames(n.left, out); exprNames(n.right, out); break;
    case 'list': n.items.forEach((a) => exprNames(a, out)); break;
  }
  return out;
}

export interface EvalScope {
  lookup(name: string): { found: boolean; value: Value };
  fo: FormatOptions;
  now: Date;
}

function getProp(obj: Value, prop: string): Value {
  if (isList(obj)) {
    if (prop === 'length' || prop === 'count') return obj.length;
    return obj.map((o) => getProp(o, prop));
  }
  if (isObject(obj)) {
    if (prop in obj) return obj[prop];
    const key = Object.keys(obj).find((k) => k.toLowerCase() === prop.toLowerCase());
    return key ? obj[key] : null;
  }
  if (typeof obj === 'string' && (prop === 'length')) return obj.length;
  return null;
}

function num(v: Value, what = 'value'): number {
  const n = toNumber(v);
  if (isNaN(n)) throw new ExprError(`"${toText(v)}" is not a number (${what})`);
  return n;
}

function arith(op: string, a: Value, b: Value): Value {
  if (isList(a) || isList(b)) {
    const la = isList(a) ? a : null;
    const lb = isList(b) ? b : null;
    const len = Math.max(la?.length ?? 0, lb?.length ?? 0);
    return Array.from({ length: len }, (_, i) => arith(op, la ? la[i] ?? null : a, lb ? lb[i] ?? null : b));
  }
  // Date arithmetic: date +/- number of days, date - date = days.
  if (a instanceof Date && (op === '+' || op === '-') && !(b instanceof Date)) {
    const d = new Date(a.getTime());
    d.setDate(d.getDate() + (op === '+' ? 1 : -1) * num(b, 'days'));
    return d;
  }
  if (a instanceof Date && b instanceof Date && op === '-') return dateDiff(b, a, 'days');
  const x = num(a, 'left side of ' + op);
  const y = num(b, 'right side of ' + op);
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': if (y === 0) throw new ExprError('Division by zero'); return x / y;
    case '%': return x % y;
    case '^': return Math.pow(x, y);
  }
  throw new ExprError('Unknown operator ' + op);
}

export function equals(a: Value, b: Value): boolean {
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '';
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
  if (a instanceof Date || b instanceof Date) {
    const da = parseDate(a as any); const db = parseDate(b as any);
    return !!da && !!db && toISODate(da) === toISODate(db);
  }
  if (isNumeric(a) && isNumeric(b)) return Math.abs(toNumber(a) - toNumber(b)) < 1e-9;
  return toText(a).trim().toLowerCase() === toText(b).trim().toLowerCase();
}

function compare(a: Value, b: Value): number {
  if (a instanceof Date || b instanceof Date) {
    const da = parseDate(a as any); const db = parseDate(b as any);
    if (!da || !db) throw new ExprError('Cannot compare a date with a non-date');
    return da.getTime() - db.getTime();
  }
  if (isNumeric(a) && isNumeric(b)) return toNumber(a) - toNumber(b);
  return toText(a).localeCompare(toText(b));
}

function flat(args: Value[]): Value[] {
  return args.flatMap((a) => (isList(a) ? flat(a) : [a]));
}
function nums(args: Value[]): number[] {
  return flat(args).filter((v) => v !== null && v !== '').map((v) => num(v));
}
function dateArg(v: Value, now: Date, name: string): Date {
  const d = parseDate(v as any, now);
  if (!d) throw new ExprError(`${name}: "${toText(v)}" is not a valid date`);
  return d;
}
function rowsOf(v: Value, fn: string): { [k: string]: Value }[] {
  if (!isList(v)) throw new ExprError(`${fn}: first argument must be a list or table`);
  return v.filter(isObject) as any;
}

type Fn = (args: Value[], s: EvalScope) => Value;
export const FUNCTIONS: Record<string, { fn: Fn; sig: string; doc: string; group: string }> = {};
function def(name: string, group: string, sig: string, doc: string, fn: Fn) {
  FUNCTIONS[name] = { fn, sig, doc, group };
}

// ---- Text
def('upper', 'Text', 'upper(text)', 'UPPERCASE text', ([a]) => toText(a).toUpperCase());
def('lower', 'Text', 'lower(text)', 'lowercase text', ([a]) => toText(a).toLowerCase());
def('title', 'Text', 'title(text)', 'Title Case Each Word', ([a]) => titleCase(toText(a)));
def('capitalize', 'Text', 'capitalize(text)', 'Capitalize the first letter', ([a]) => { const s = toText(a); return s.charAt(0).toUpperCase() + s.slice(1); });
def('trim', 'Text', 'trim(text)', 'Remove surrounding spaces', ([a]) => toText(a).trim());
def('len', 'Text', 'len(text)', 'Number of characters (or items in a list)', ([a]) => (isList(a) ? a.length : toText(a).length));
def('replace', 'Text', 'replace(text, find, with)', 'Replace every occurrence of find', ([a, f, w]) => toText(a).split(toText(f)).join(toText(w)));
def('left', 'Text', 'left(text, n)', 'First n characters', ([a, n]) => toText(a).slice(0, num(n)));
def('right', 'Text', 'right(text, n)', 'Last n characters', ([a, n]) => { const s = toText(a); const k = num(n); return k <= 0 ? '' : s.slice(-k); });
def('mid', 'Text', 'mid(text, start, length)', 'Substring (start at 1)', ([a, st, l]) => toText(a).substr(num(st) - 1, l === undefined ? undefined : num(l)));
def('contains', 'Text', 'contains(text, part)', 'True if text contains part (case-insensitive) or list contains item', ([a, b]) => (isList(a) ? a.some((x) => equals(x, b)) : toText(a).toLowerCase().includes(toText(b).toLowerCase())));
def('startswith', 'Text', 'startswith(text, part)', 'True if text starts with part', ([a, b]) => toText(a).toLowerCase().startsWith(toText(b).toLowerCase()));
def('endswith', 'Text', 'endswith(text, part)', 'True if text ends with part', ([a, b]) => toText(a).toLowerCase().endsWith(toText(b).toLowerCase()));
def('split', 'Text', 'split(text, separator)', 'Split text into a list', ([a, b]) => toText(a).split(b === undefined ? ',' : toText(b)).map((s) => s.trim()));
def('join', 'Text', 'join(list, separator)', 'Join list items into text', ([a, b], s) => (isList(a) ? a : [a]).map((x) => toText(x, s.fo)).join(b === undefined ? ', ' : toText(b)));
def('concat', 'Text', 'concat(a, b, ...)', 'Join values together', (args, s) => flat(args).map((x) => toText(x, s.fo)).join(''));
def('repeat', 'Text', 'repeat(text, n)', 'Repeat text n times', ([a, n]) => toText(a).repeat(Math.max(0, Math.min(1000, num(n)))));
def('pad', 'Text', 'pad(text, length, char)', 'Left-pad to a length', ([a, n, c]) => toText(a).padStart(num(n), c === undefined ? ' ' : toText(c)));
def('truncate', 'Text', 'truncate(text, n)', 'Shorten to n characters with …', ([a, n]) => { const s = toText(a); const k = num(n); return s.length > k ? s.slice(0, Math.max(0, k - 1)) + '…' : s; });
def('initials', 'Text', 'initials(name)', 'Initials of a name: "Ada Lovelace" → "AL"', ([a]) => toText(a).split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join(''));
def('firstname', 'Text', 'firstname(name)', 'First word of a full name', ([a]) => toText(a).trim().split(/\s+/)[0] || '');
def('lastname', 'Text', 'lastname(name)', 'Last word of a full name', ([a]) => { const p = toText(a).trim().split(/\s+/); return p.length > 1 ? p[p.length - 1] : ''; });
def('urlencode', 'Text', 'urlencode(text)', 'Encode text for use inside a link', ([a]) => encodeURIComponent(toText(a)));
def('text', 'Text', 'text(value)', 'Convert to text', ([a], s) => toText(a, s.fo));
def('format', 'Text', 'format(value, "currency:EUR")', 'Format a value (currency, number:2, percent, date:DD/MM/YYYY, upper …)', ([a, f], s) => formatValue(a, toText(f), s.fo));

// ---- Logic
def('if', 'Logic', 'if(condition, then, else)', 'Choose a value based on a condition', ([c, a, b]) => (truthy(c) ? a ?? '' : b ?? ''));
def('and', 'Logic', 'and(a, b, ...)', 'True if all are true', (args) => args.every(truthy));
def('or', 'Logic', 'or(a, b, ...)', 'True if any is true', (args) => args.some(truthy));
def('not', 'Logic', 'not(a)', 'Negate', ([a]) => !truthy(a));
def('isempty', 'Logic', 'isempty(value)', 'True if blank', ([a]) => a === null || a === undefined || (typeof a === 'string' && a.trim() === '') || (isList(a) && a.length === 0));
def('coalesce', 'Logic', 'coalesce(a, b, ...)', 'First non-blank value', (args) => args.find((a) => !(a === null || a === undefined || a === '')) ?? '');
def('choose', 'Logic', 'choose(value, "a", "A", "b", "B", default)', 'Map a value to a result', ([v, ...pairs]) => {
  for (let i = 0; i + 1 < pairs.length; i += 2) if (equals(v, pairs[i])) return pairs[i + 1];
  return pairs.length % 2 ? pairs[pairs.length - 1] : '';
});
def('matches', 'Logic', 'matches(text, pattern)', 'True if text matches a regular expression', ([a, p]) => {
  const pat = toText(p);
  if (pat.length > 300) throw new ExprError('matches: pattern too long');
  try { return new RegExp(pat, 'i').test(toText(a)); } catch { throw new ExprError('matches: invalid pattern'); }
});
def('isemail', 'Logic', 'isemail(text)', 'True if text looks like an e-mail address', ([a]) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(toText(a).trim()));
def('isnumber', 'Logic', 'isnumber(value)', 'True if value is numeric', ([a]) => isNumeric(a));

// ---- Math
def('round', 'Math', 'round(n, decimals)', 'Round to decimals (default 0)', ([a, d]) => { const k = Math.pow(10, d === undefined ? 0 : num(d)); return Math.round(num(a) * k + Number.EPSILON) / k; });
def('floor', 'Math', 'floor(n)', 'Round down', ([a]) => Math.floor(num(a)));
def('ceil', 'Math', 'ceil(n)', 'Round up', ([a]) => Math.ceil(num(a)));
def('abs', 'Math', 'abs(n)', 'Absolute value', ([a]) => Math.abs(num(a)));
def('sqrt', 'Math', 'sqrt(n)', 'Square root', ([a]) => Math.sqrt(num(a)));
def('min', 'Math', 'min(a, b, ...)', 'Smallest number (lists allowed)', (args) => Math.min(...nums(args)));
def('max', 'Math', 'max(a, b, ...)', 'Largest number (lists allowed)', (args) => Math.max(...nums(args)));
def('sum', 'Math', 'sum(list or numbers)', 'Total', (args) => nums(args).reduce((a, b) => a + b, 0));
def('avg', 'Math', 'avg(list or numbers)', 'Average', (args) => { const n = nums(args); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0; });
def('count', 'Math', 'count(list)', 'Number of items', (args) => flat(args).filter((v) => v !== null && v !== '').length);
def('number', 'Math', 'number(value)', 'Convert to number', ([a]) => num(a));
def('percent', 'Math', 'percent(part, whole)', 'part as a percentage of whole (0-100)', ([a, b]) => { const w = num(b); if (w === 0) throw new ExprError('percent: whole is zero'); return (num(a) / w) * 100; });
def('percentof', 'Math', 'percentof(pct, amount)', 'pct % of amount', ([p, a]) => (num(p) / 100) * num(a));
def('addpercent', 'Math', 'addpercent(amount, pct)', 'amount increased by pct % (e.g. tax)', ([a, p]) => num(a) * (1 + num(p) / 100));
def('discount', 'Math', 'discount(amount, pct)', 'amount reduced by pct %', ([a, p]) => num(a) * (1 - num(p) / 100));
def('currency', 'Math', 'currency(amount, "USD")', 'Format as currency', ([a, c], s) => formatValue(a, 'currency' + (c ? ':' + toText(c) : ''), s.fo));
def('random', 'Math', 'random(min, max)', 'Random whole number between min and max', ([a, b]) => { const lo = num(a ?? 0); const hi = num(b ?? 100); return Math.floor(lo + Math.random() * (hi - lo + 1)); });

// ---- Dates
def('today', 'Date', 'today()', 'Today (midnight)', (_a, s) => new Date(s.now.getFullYear(), s.now.getMonth(), s.now.getDate()));
def('now', 'Date', 'now()', 'Current date and time', (_a, s) => { const d = new Date(s.now.getTime()); (d as any).__time = true; return d; });
def('date', 'Date', 'date("2025-01-31" | "+3d")', 'Make a date from text or a shift', ([a], s) => dateArg(a ?? 'today', s.now, 'date'));
def('adddays', 'Date', 'adddays(date, n)', 'Add (or subtract) days', ([d, n], s) => { const x = new Date(dateArg(d, s.now, 'adddays')); x.setDate(x.getDate() + num(n)); return x; });
def('addhours', 'Date', 'addhours(date, n)', 'Add hours', ([d, n], s) => { const x = new Date(dateArg(d, s.now, 'addhours').getTime() + num(n) * 3600000); (x as any).__time = true; return x; });
def('addminutes', 'Date', 'addminutes(date, n)', 'Add minutes', ([d, n], s) => { const x = new Date(dateArg(d, s.now, 'addminutes').getTime() + num(n) * 60000); (x as any).__time = true; return x; });
def('addweeks', 'Date', 'addweeks(date, n)', 'Add weeks', ([d, n], s) => { const x = new Date(dateArg(d, s.now, 'addweeks')); x.setDate(x.getDate() + 7 * num(n)); return x; });
def('addmonths', 'Date', 'addmonths(date, n)', 'Add months (clamps to month end)', ([d, n], s) => addMonths(new Date(dateArg(d, s.now, 'addmonths')), num(n)));
def('addyears', 'Date', 'addyears(date, n)', 'Add years', ([d, n], s) => addMonths(new Date(dateArg(d, s.now, 'addyears')), 12 * num(n)));
def('addbusinessdays', 'Date', 'addbusinessdays(date, n)', 'Add working days (skips weekends)', ([d, n], s) => addBusinessDays(new Date(dateArg(d, s.now, 'addbusinessdays')), num(n)));
def('shift', 'Date', 'shift(date, "+1M +2d")', 'Shift a date using shift syntax', ([d, sh], s) => shiftDate(dateArg(d, s.now, 'shift'), toText(sh)));
def('datediff', 'Date', 'datediff(start, end, "days")', 'Difference in days|weeks|months|years|hours|minutes', ([a, b, u], s) => dateDiff(dateArg(a, s.now, 'datediff'), dateArg(b, s.now, 'datediff'), u ? toText(u) : 'days'));
def('formatdate', 'Date', 'formatdate(date, "DD/MM/YYYY")', 'Format a date', ([d, f], s) => formatDate(dateArg(d, s.now, 'formatdate'), f === undefined ? s.fo.dateFormat : toText(f)));
def('weekday', 'Date', 'weekday(date)', 'Day name, e.g. Monday', ([d], s) => formatDate(dateArg(d ?? 'today', s.now, 'weekday'), 'dddd'));
def('year', 'Date', 'year(date)', 'Year number', ([d], s) => dateArg(d ?? 'today', s.now, 'year').getFullYear());
def('month', 'Date', 'month(date)', 'Month number 1-12', ([d], s) => dateArg(d ?? 'today', s.now, 'month').getMonth() + 1);
def('day', 'Date', 'day(date)', 'Day of month', ([d], s) => dateArg(d ?? 'today', s.now, 'day').getDate());
def('endofmonth', 'Date', 'endofmonth(date)', 'Last day of the month', ([d], s) => { const x = dateArg(d ?? 'today', s.now, 'endofmonth'); return new Date(x.getFullYear(), x.getMonth() + 1, 0); });
def('greeting', 'Date', 'greeting()', 'Good morning / afternoon / evening', (_a, s) => { const h = s.now.getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; });

// ---- Lists & Data Hub
def('list', 'Lists', 'list(a, b, ...)', 'Make a list', (args) => args);
def('first', 'Lists', 'first(list)', 'First item', ([a]) => (isList(a) ? a[0] ?? null : a));
def('last', 'Lists', 'last(list)', 'Last item', ([a]) => (isList(a) ? a[a.length - 1] ?? null : a));
def('item', 'Lists', 'item(list, n)', 'Item number n (1-based)', ([a, n]) => (isList(a) ? a[num(n) - 1] ?? null : null));
def('unique', 'Lists', 'unique(list)', 'Remove duplicates', ([a]) => (isList(a) ? a.filter((x, i) => a.findIndex((y) => equals(x, y)) === i) : a));
def('sort', 'Lists', 'sort(list)', 'Sort ascending', ([a]) => (isList(a) ? [...a].sort(compare) : a));
def('filter', 'Lists', 'filter(table, "column", value)', 'Rows whose column equals value', ([t, c, v]) => rowsOf(t, 'filter').filter((r) => equals(getProp(r, toText(c)), v)));
def('lookup', 'Lists', 'lookup(table, "matchColumn", value, "resultColumn")', 'Find a row and return one column', ([t, c, v, r]) => {
  const row = rowsOf(t, 'lookup').find((x) => equals(getProp(x, toText(c)), v));
  return row ? (r === undefined ? row : getProp(row, toText(r))) : '';
});
function opMatch(v: Value, op: string, target: Value): boolean {
  switch (op) {
    case '>': return compare(v, target) > 0;
    case '>=': return compare(v, target) >= 0;
    case '<': return compare(v, target) < 0;
    case '<=': return compare(v, target) <= 0;
    case '!=': case '<>': return !equals(v, target);
    default: return equals(v, target);
  }
}
def('countif', 'Lists', 'countif(list, ">", 0)', 'Count items matching a comparison (= != > >= < <=)', ([l, op, t]) => (isList(l) ? l : [l]).filter((v) => opMatch(v, toText(op), t)).length);
def('sumif', 'Lists', 'sumif(list, ">", 0)', 'Sum items matching a comparison', ([l, op, t]) => (isList(l) ? l : [l]).filter((v) => opMatch(v, toText(op), t)).reduce((a: number, v) => a + num(v), 0));
def('pluck', 'Lists', 'pluck(table, "column")', 'One column of a table as a list', ([t, c]) => rowsOf(t, 'pluck').map((r) => getProp(r, toText(c))));

function evalNode(n: Node, s: EvalScope): Value {
  switch (n.t) {
    case 'num': return n.v;
    case 'str': return n.v;
    case 'bool': return n.v;
    case 'null': return null;
    case 'list': return n.items.map((x) => evalNode(x, s));
    case 'name': {
      const r = s.lookup(n.name);
      if (!r.found) throw new ExprError(`Unknown name "${n.name}"`);
      return r.value;
    }
    case 'member': return getProp(evalNode(n.obj, s), n.prop);
    case 'index': {
      const o = evalNode(n.obj, s);
      const i = evalNode(n.index, s);
      if (isList(o)) return o[num(i) - 1] ?? null;
      return getProp(o, toText(i));
    }
    case 'unary': {
      const v = evalNode(n.arg, s);
      if (n.op === 'not') return !truthy(v);
      if (n.op === '-') return isList(v) ? v.map((x) => -num(x)) : -num(v);
      return num(v);
    }
    case 'call': {
      const f = FUNCTIONS[n.fn];
      if (!f) throw new ExprError(`Unknown function "${n.fn}()"`);
      if (n.fn === 'if') {
        // Lazy evaluation so the untaken branch cannot raise errors.
        return truthy(evalNode(n.args[0], s)) ? (n.args[1] ? evalNode(n.args[1], s) : '') : n.args[2] ? evalNode(n.args[2], s) : '';
      }
      return f.fn(n.args.map((a) => evalNode(a, s)), s);
    }
    case 'bin': {
      if (n.op === 'and' || n.op === '&&') return truthy(evalNode(n.left, s)) && truthy(evalNode(n.right, s));
      if (n.op === 'or' || n.op === '||') return truthy(evalNode(n.left, s)) || truthy(evalNode(n.right, s));
      const a = evalNode(n.left, s);
      const b = evalNode(n.right, s);
      switch (n.op) {
        case '&': return toText(a, s.fo) + toText(b, s.fo);
        case '=': case '==': return equals(a, b);
        case '!=': case '<>': return !equals(a, b);
        case '<': return compare(a, b) < 0;
        case '<=': return compare(a, b) <= 0;
        case '>': return compare(a, b) > 0;
        case '>=': return compare(a, b) >= 0;
        default: return arith(n.op, a, b);
      }
    }
  }
}

const cache = new Map<string, Node>();
export function evaluate(src: string, scope: EvalScope): Value {
  let node = cache.get(src);
  if (!node) {
    node = parseExpr(src);
    if (cache.size > 500) cache.clear();
    cache.set(src, node);
  }
  return evalNode(node, scope);
}
