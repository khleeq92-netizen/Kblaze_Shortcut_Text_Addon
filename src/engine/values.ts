// Value model + coercion and formatting rules shared by the expression evaluator
// and the template renderer.
import { formatDate, parseDate } from './dates';

export type Value = string | number | boolean | Date | null | Value[] | { [k: string]: Value };

export interface FormatOptions {
  locale: string;
  currency: string;
  dateFormat: string;
  timeFormat: string;
}

export function isList(v: Value): v is Value[] {
  return Array.isArray(v);
}
export function isObject(v: Value): v is { [k: string]: Value } {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/** Lenient numeric parse: accepts "1,234.50", "$99", "15%", " 3 ". Returns NaN when not numeric. */
export function toNumber(v: Value): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined) return 0;
  if (v instanceof Date) return v.getTime();
  if (Array.isArray(v)) return v.length === 1 ? toNumber(v[0]) : NaN;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return 0;
    const pct = s.endsWith('%');
    const cleaned = s.replace(/[%\s ]/g, '').replace(/^[^\d+\-.(]+/, '').replace(/[^\d.]+$/, '').replace(/,(?=\d{3}(\D|$))/g, '');
    const neg = /^\(.*\)$/.test(cleaned);
    const n = Number(neg ? '-' + cleaned.slice(1, -1) : cleaned);
    if (cleaned === '' || isNaN(n)) return NaN;
    return pct ? n / 100 : n;
  }
  return NaN;
}

export function isNumeric(v: Value): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim() !== '' && !isNaN(toNumber(v));
  return false;
}

export function truthy(v: Value): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !isNaN(v);
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return !(s === '' || s === 'false' || s === 'no' || s === 'off' || s === '0');
  }
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function cleanNumber(n: number): string {
  if (!Number.isFinite(n)) return isNaN(n) ? 'NaN' : n > 0 ? '∞' : '-∞';
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
}

export function toText(v: Value, fo?: FormatOptions): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return cleanNumber(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v instanceof Date) {
    const hasTime = v.getHours() !== 0 || v.getMinutes() !== 0;
    return formatDate(v, fo ? (hasTime && (v as any).__time ? `${fo.dateFormat} ${fo.timeFormat}` : fo.dateFormat) : 'YYYY-MM-DD');
  }
  if (Array.isArray(v)) return v.map((x) => toText(x, fo)).join(', ');
  if (isObject(v)) {
    if ('__label' in v) return toText(v.__label as Value, fo);
    return Object.values(v).filter((x) => typeof x !== 'object').map((x) => toText(x, fo)).join(', ');
  }
  return String(v);
}

/**
 * Applies a `format=` option. Supported:
 *  currency[:USD]  number[:decimals]  integer  percent[:decimals]  date:<pattern>  time  upper lower title
 *  or a bare date pattern like "DD/MM/YYYY".
 */
export function formatValue(v: Value, format: string | undefined, fo: FormatOptions): string {
  if (!format) return toText(v, fo);
  const [kind, ...rest] = format.split(':');
  const arg = rest.join(':').trim();
  const k = kind.trim().toLowerCase();
  const num = () => {
    const n = toNumber(v);
    if (isNaN(n)) throw new Error(`Cannot format "${toText(v)}" as a number`);
    return n;
  };
  switch (k) {
    case 'currency':
      return new Intl.NumberFormat(fo.locale, { style: 'currency', currency: (arg || fo.currency).toUpperCase() }).format(num());
    case 'number':
    case 'decimal': {
      const d = arg === '' ? undefined : parseInt(arg, 10);
      return new Intl.NumberFormat(fo.locale, d === undefined ? { maximumFractionDigits: 10 } : { minimumFractionDigits: d, maximumFractionDigits: d }).format(num());
    }
    case 'integer':
      return new Intl.NumberFormat(fo.locale, { maximumFractionDigits: 0 }).format(num());
    case 'plain':
      return cleanNumber(num());
    case 'percent': {
      const d = arg === '' ? 0 : parseInt(arg, 10);
      return new Intl.NumberFormat(fo.locale, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(num());
    }
    case 'upper': return toText(v, fo).toUpperCase();
    case 'lower': return toText(v, fo).toLowerCase();
    case 'title': return titleCase(toText(v, fo));
    case 'date': {
      const d = parseDate(v as any);
      return d ? formatDate(d, arg || fo.dateFormat) : toText(v, fo);
    }
    case 'time': {
      const d = parseDate(v as any);
      return d ? formatDate(d, arg || fo.timeFormat) : toText(v, fo);
    }
    case 'datetime': {
      const d = parseDate(v as any);
      return d ? formatDate(d, arg || `${fo.dateFormat} ${fo.timeFormat}`) : toText(v, fo);
    }
    default: {
      // Treat as a date pattern if the value looks like a date.
      const d = v instanceof Date ? v : typeof v === 'string' ? parseDate(v) : null;
      if (d) return formatDate(d, format);
      return toText(v, fo);
    }
  }
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s\-_/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}
