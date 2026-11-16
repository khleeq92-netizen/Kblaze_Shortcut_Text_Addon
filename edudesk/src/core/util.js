'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Local date as YYYY-MM-DD. */
function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nowLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${todayISO(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseISO(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}

/**
 * Format an ISO date with tokens DD, MM, YYYY, YY, MMM (Jan), MMMM (January).
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function formatDate(iso, fmt = 'DD/MM/YYYY') {
  const p = parseISO(iso);
  if (!p) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return fmt.replace(/YYYY|YY|MMMM|MMM|MM|DD|D/g, (t) => {
    switch (t) {
      case 'YYYY': return String(p.y);
      case 'YY': return String(p.y).slice(-2);
      case 'MMMM': return MONTHS[p.m - 1];
      case 'MMM': return MONTHS[p.m - 1].slice(0, 3);
      case 'MM': return pad(p.m);
      case 'DD': return pad(p.d);
      case 'D': return String(p.d);
      default: return t;
    }
  });
}

/** Academic year label (e.g. 2026-27) for a date; startMonth is 1-12 (June = 6). */
function academicYear(iso, startMonth = 6) {
  const p = parseISO(iso) || parseISO(todayISO());
  const startYear = p.m >= startMonth ? p.y : p.y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function academicYearRange(label, startMonth = 6) {
  const y = parseInt(String(label).slice(0, 4), 10);
  const pad = (n) => String(n).padStart(2, '0');
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? y : y + 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  return { from: `${y}-${pad(startMonth)}-01`, to: `${endYear}-${pad(endMonth)}-${pad(lastDay)}` };
}

/** Make a string safe for Windows file names. */
function sanitizeFileName(name, maxLen = 80) {
  let s = String(name || '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/[\s_]+/g, '_')
    .replace(/^[._\s]+|[._\s]+$/g, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`;
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/[._]+$/, '');
  return s || 'Untitled';
}

/** Short subject for file names: first few words, ASCII-friendly where possible. */
function shortSubject(subject, words = 5) {
  const cleaned = String(subject || '')
    .replace(/^(sub(ject)?\.?|विषय)\s*[:\-–]+\s*/i, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => !/^(for|the|of|to|a|an|and|regarding|बाबत)$/i.test(w))
    .slice(0, words)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('_');
  return sanitizeFileName(cleaned || 'Letter', 60);
}

/** Return a path that does not exist yet by appending _2, _3 ... */
function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const dir = path.dirname(p);
  const ext = path.extname(p);
  const base = path.basename(p, ext);
  for (let i = 2; i < 10000; i++) {
    const c = path.join(dir, `${base}_${i}${ext}`);
    if (!fs.existsSync(c)) return c;
  }
  throw new Error(`Could not find a free file name for ${p}`);
}

function sha256File(p) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function sha256Buffer(b) {
  return crypto.createHash('sha256').update(b).digest('hex');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/** Copy without ever overwriting an existing file; returns the final path. */
function safeCopy(src, dest) {
  ensureDir(path.dirname(dest));
  const target = uniquePath(dest);
  fs.copyFileSync(src, target, fs.constants.COPYFILE_EXCL);
  return target;
}

function fileSize(p) {
  try { return fs.statSync(p).size; } catch (_) { return -1; }
}

function json(v, fallback) {
  if (v == null || v === '') return fallback;
  try { return JSON.parse(v); } catch (_) { return fallback; }
}

function applyFilePattern(pattern, values) {
  return pattern.replace(/\{(\w+)\}/g, (_, k) => (values[k] != null ? String(values[k]) : ''));
}

class UserError extends Error {
  constructor(message, code) {
    super(message);
    this.userFacing = true;
    this.code = code || 'USER_ERROR';
  }
}

module.exports = {
  todayISO, nowLocal, parseISO, formatDate, academicYear, academicYearRange,
  sanitizeFileName, shortSubject, uniquePath, sha256File, sha256Buffer, ensureDir,
  safeCopy, fileSize, json, applyFilePattern, UserError, MONTHS,
};
