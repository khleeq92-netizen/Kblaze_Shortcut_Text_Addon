// Dependency-free date utilities for the template engine.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/**
 * Formats a date with tokens: YYYY YY MMMM MMM MM M DDDD(ordinal: Do) DD D dddd ddd HH H hh h mm m ss s A a Z
 * Text inside [brackets] is output literally.
 */
export function formatDate(d: Date, fmt: string): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const tokens: Record<string, () => string> = {
    YYYY: () => String(d.getFullYear()),
    YY: () => String(d.getFullYear()).slice(-2),
    MMMM: () => MONTHS[d.getMonth()],
    MMM: () => MONTHS[d.getMonth()].slice(0, 3),
    MM: () => pad(d.getMonth() + 1),
    M: () => String(d.getMonth() + 1),
    Do: () => ordinal(d.getDate()),
    DD: () => pad(d.getDate()),
    D: () => String(d.getDate()),
    dddd: () => DAYS[d.getDay()],
    ddd: () => DAYS[d.getDay()].slice(0, 3),
    HH: () => pad(d.getHours()),
    H: () => String(d.getHours()),
    hh: () => pad(d.getHours() % 12 || 12),
    h: () => String(d.getHours() % 12 || 12),
    mm: () => pad(d.getMinutes()),
    m: () => String(d.getMinutes()),
    ss: () => pad(d.getSeconds()),
    s: () => String(d.getSeconds()),
    A: () => (d.getHours() < 12 ? 'AM' : 'PM'),
    a: () => (d.getHours() < 12 ? 'am' : 'pm'),
    Q: () => String(Math.floor(d.getMonth() / 3) + 1),
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a|Q/g, (m, lit) => (lit !== undefined ? lit : tokens[m]()));
}

/** Applies shifts such as "+3d", "-2w", "+1M", "+1y +2h", "+30m" ("m" = minutes, "M" = months). */
export function shiftDate(d: Date, shift: string): Date {
  const out = new Date(d.getTime());
  const re = /([+-])\s*(\d+)\s*(y|M|w|d|h|m|s|bd)/g;
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(shift))) {
    any = true;
    const n = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
    switch (m[3]) {
      case 'y': out.setFullYear(out.getFullYear() + n); break;
      case 'M': addMonths(out, n); break;
      case 'w': out.setDate(out.getDate() + 7 * n); break;
      case 'd': out.setDate(out.getDate() + n); break;
      case 'bd': addBusinessDays(out, n); break;
      case 'h': out.setHours(out.getHours() + n); break;
      case 'm': out.setMinutes(out.getMinutes() + n); break;
      case 's': out.setSeconds(out.getSeconds() + n); break;
    }
  }
  if (!any && shift.trim()) throw new Error(`Invalid date shift "${shift}". Use e.g. +3d, -1w, +1M, +2bd`);
  return out;
}

export function addMonths(d: Date, n: number) {
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}
export function addBusinessDays(d: Date, n: number) {
  const step = n < 0 ? -1 : 1;
  let left = Math.abs(n);
  while (left > 0) {
    d.setDate(d.getDate() + step);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** Parses ISO (YYYY-MM-DD[THH:mm]), "today", "now", "tomorrow", "yesterday", shifts and Date-parsable strings. */
export function parseDate(v: unknown, now = new Date()): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (lower === 'now') return new Date(now.getTime());
  if (lower === 'today') return startOfDay;
  if (lower === 'tomorrow') return shiftDate(startOfDay, '+1d');
  if (lower === 'yesterday') return shiftDate(startOfDay, '-1d');
  if (/^[+-]\s*\d/.test(s)) return shiftDate(/[hms]\b/.test(s) && !/bd/.test(s) ? now : startOfDay, s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] || 0), +(iso[5] || 0), +(iso[6] || 0));
  const time = /^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/i.exec(s);
  if (time) {
    let h = +time[1];
    if (time[3]) h = (h % 12) + (time[3].toLowerCase() === 'pm' ? 12 : 0);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, +time[2]);
  }
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toISOTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateDiff(a: Date, b: Date, unit = 'days'): number {
  const ms = b.getTime() - a.getTime();
  switch (unit.toLowerCase()) {
    case 'seconds': return Math.floor(ms / 1000);
    case 'minutes': return Math.floor(ms / 60000);
    case 'hours': return Math.floor(ms / 3600000);
    case 'weeks': return Math.floor(ms / (7 * 86400000));
    case 'months': return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
    case 'years': return Math.floor(((b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0)) / 12);
    default: {
      const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
      const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
      return Math.round((db - da) / 86400000);
    }
  }
}
