// Reusable data-source abstraction. Every source produces "sheets" (a header row
// + data rows of strings); one converter turns a sheet into a typed DataTable.
// Adding a new integration = implementing DataSourceAdapter.
import type { DataTable, DataColumn, ColumnType, DataSourceRef } from '../shared/types';
import { uid, slugKey } from '../shared/ids';
import { readXlsx, type Sheet } from './xlsx';
import { looksSensitiveColumn, looksLikeAadhaar } from '../automation/safety';

export interface ImportedSheet extends Sheet { source: DataSourceRef }

export interface DataSourceAdapter<I = unknown> {
  kind: DataSourceRef['kind'];
  label: string;
  /** Accepted file extensions (file-based sources). */
  accept?: string;
  load(input: I): Promise<ImportedSheet[]>;
}

// ------------------------------------------------------------------ CSV / TSV
export function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t', '|'].map((d) => ({ d, n: (head.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n ? counts[0].d : ',';
}

export function parseDelimited(text: string, delimiter?: string): string[][] {
  const d = delimiter || detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

export const csvSource: DataSourceAdapter<{ name: string; text: string }> = {
  kind: 'csv',
  label: 'CSV / TSV file',
  accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values',
  async load({ name, text }) {
    return [{ name: name.replace(/\.(csv|tsv|txt)$/i, ''), rows: parseDelimited(text), source: { kind: 'csv', ref: name, importedAt: Date.now() } }];
  },
};

export const xlsxSource: DataSourceAdapter<{ name: string; bytes: Uint8Array }> = {
  kind: 'xlsx',
  label: 'Excel workbook (.xlsx)',
  accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  async load({ name, bytes }) {
    return readXlsx(bytes).filter((s) => s.rows.length).map((s) => ({ ...s, source: { kind: 'xlsx', ref: name, sheet: s.name, importedAt: Date.now() } }));
  },
};

export const jsonSource: DataSourceAdapter<{ name: string; text: string }> = {
  kind: 'json',
  label: 'JSON (array of objects)',
  accept: '.json,application/json',
  async load({ name, text }) {
    let data: any;
    try { data = JSON.parse(text); } catch (e: any) { throw new Error(`Invalid JSON: ${e.message}`); }
    const arr: any[] = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.data) ? data.data : null as any;
    if (!arr) throw new Error('JSON must be an array of objects (or { "rows": [...] })');
    const keys: string[] = [];
    for (const o of arr.slice(0, 5000)) if (o && typeof o === 'object') for (const k of Object.keys(o.values && typeof o.values === 'object' ? o.values : o)) if (!keys.includes(k) && k !== 'id') keys.push(k);
    const rows = [keys, ...arr.map((o) => { const src = o?.values && typeof o.values === 'object' ? o.values : o; return keys.map((k) => (src?.[k] === null || src?.[k] === undefined ? '' : typeof src[k] === 'object' ? JSON.stringify(src[k]) : String(src[k]))); })];
    return [{ name: name.replace(/\.json$/i, ''), rows, source: { kind: 'json', ref: name, importedAt: Date.now() } }];
  },
};

// ------------------------------------------------------------------ typing
const RE = {
  number: /^-?(\d{1,3}(,\d{2,3})+|\d+)(\.\d+)?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^(\+?\d{1,3}[\s-]?)?(\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}$/,
  date: /^(\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/,
  url: /^https?:\/\/\S+$/i,
  bool: /^(true|false|yes|no|y|n)$/i,
};

export function guessColumnType(name: string, values: string[]): ColumnType {
  const v = values.map((x) => x.trim()).filter(Boolean).slice(0, 500);
  if (!v.length) return 'text';
  const all = (re: RegExp) => v.every((x) => re.test(x));
  // identifiers that look numeric must stay text (leading zeros, Aadhaar, mobile numbers, roll numbers)
  const idLike = /(id|no|number|code|roll|aadh?a?a?r|mobile|phone|contact|pin|udise|gr|reg)/i.test(name) || v.some((x) => /^0\d/.test(x) || x.replace(/\D/g, '').length >= 10);
  if (all(RE.email)) return 'email';
  if (all(RE.url)) return 'url';
  if (all(RE.date)) return 'date';
  if (/(mobile|phone|contact|whatsapp|tel)/i.test(name) && all(RE.phone)) return 'phone';
  if (all(RE.bool)) return 'boolean';
  if (!idLike && all(RE.number)) return 'number';
  const distinct = new Set(v.map((x) => x.toLowerCase()));
  if (v.length >= 4 && distinct.size <= Math.min(12, Math.max(2, v.length / 3))) return 'category';
  return 'text';
}

export function uniqueKeys(header: string[]): string[] {
  const used = new Set<string>();
  return header.map((h, i) => {
    const base = slugKey(h || `column_${i + 1}`) || `column_${i + 1}`;
    let k = base; let n = 2;
    while (used.has(k)) k = `${base}_${n++}`;
    used.add(k);
    return k;
  });
}

export interface SheetToTableOptions {
  name?: string;
  headerRow?: number; // 0-based
  workspaceId?: string;
  /** Map of column index -> new key (column mapping step). */
  keys?: Record<number, string>;
  skipColumns?: number[];
  autoSensitive?: boolean;
}

export function sheetToTable(sheet: ImportedSheet | (Sheet & { source?: DataSourceRef }), opts: SheetToTableOptions = {}): DataTable {
  const hr = Math.max(0, opts.headerRow ?? 0);
  if (sheet.rows.length <= hr) throw new Error(`"${sheet.name}" has no header row`);
  const header = sheet.rows[hr].map((h, i) => h.trim() || `Column ${i + 1}`);
  const keys = uniqueKeys(header).map((k, i) => opts.keys?.[i] || k);
  const keep = header.map((_, i) => !(opts.skipColumns || []).includes(i));
  const body = sheet.rows.slice(hr + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (body.length > 50000) throw new Error('Datasets are limited to 50,000 rows');
  const columns: DataColumn[] = [];
  header.forEach((h, i) => {
    if (!keep[i]) return;
    const vals = body.map((r) => String(r[i] ?? ''));
    const type = guessColumnType(h, vals);
    columns.push({ id: uid('col'), name: h, key: keys[i], type, options: type === 'category' ? [...new Set(vals.map((x) => x.trim()).filter(Boolean))].slice(0, 100) : undefined });
  });
  const idx = header.map((_, i) => i).filter((i) => keep[i]);
  const rows = body.map((r) => ({
    id: uid('row'),
    values: Object.fromEntries(columns.map((c, j) => {
      const raw = String(r[idx[j]] ?? '').trim();
      if (c.type === 'number' && raw) { const n = Number(raw.replace(/,/g, '')); return [c.key, Number.isFinite(n) ? n : raw]; }
      if (c.type === 'boolean') return [c.key, /^(true|yes|y)$/i.test(raw)];
      return [c.key, raw.slice(0, 5000)];
    })),
  }));
  const now = Date.now();
  const name = opts.name || sheet.name || 'Dataset';
  const sensitive = opts.autoSensitive === false ? [] : columns.filter((c) => looksSensitiveColumn(c.name) || rows.slice(0, 50).some((r) => looksLikeAadhaar(r.values[c.key]))).map((c) => c.key);
  const keyCol = columns.find((c) => /^(gr|reg|roll|student|admission|application|udise|enrol|sr|id)[\s_]*(no|number|id|code)?$/i.test(c.name.replace(/[^a-z ]/gi, '').trim()) || /(_id|_no)$/.test(c.key));
  return {
    id: uid('tbl'), name, key: slugKey(name), description: '', columns, rows,
    createdAt: now, updatedAt: now, workspaceId: opts.workspaceId, source: (sheet as any).source,
    keyColumn: keyCol?.key, requiredColumns: [], sensitiveColumns: sensitive, currentRowId: rows[0]?.id ?? null,
  };
}

// ------------------------------------------------------------------ quality
export interface QualityReport {
  rows: number;
  duplicates: { key: string; rowIds: string[] }[];
  missing: { rowId: string; rowIndex: number; columns: string[] }[];
  invalid: { rowId: string; rowIndex: number; column: string; value: string; problem: string }[];
  emptyColumns: string[];
}

export function checkQuality(t: DataTable, opts: { keyColumn?: string; required?: string[] } = {}): QualityReport {
  const keyCol = opts.keyColumn ?? t.keyColumn;
  const required = opts.required ?? t.requiredColumns ?? [];
  const rep: QualityReport = { rows: t.rows.length, duplicates: [], missing: [], invalid: [], emptyColumns: [] };
  if (keyCol) {
    const seen = new Map<string, string[]>();
    for (const r of t.rows) {
      const k = String(r.values[keyCol] ?? '').trim().toLowerCase();
      if (!k) continue;
      seen.set(k, [...(seen.get(k) || []), r.id]);
    }
    for (const [k, ids] of seen) if (ids.length > 1) rep.duplicates.push({ key: k, rowIds: ids });
  }
  t.rows.forEach((r, i) => {
    const miss = required.filter((c) => String(r.values[c] ?? '').trim() === '');
    if (miss.length) rep.missing.push({ rowId: r.id, rowIndex: i, columns: miss });
    for (const c of t.columns) {
      const v = String(r.values[c.key] ?? '').trim();
      if (!v || v.startsWith('enc:')) continue;
      let problem = '';
      if (c.type === 'email' && !RE.email.test(v)) problem = 'not an email address';
      else if (c.type === 'phone' && !RE.phone.test(v)) problem = 'not a phone number';
      else if (c.type === 'date' && !RE.date.test(v)) problem = 'not a date';
      else if (c.type === 'number' && typeof r.values[c.key] !== 'number' && !RE.number.test(v)) problem = 'not a number';
      else if (c.type === 'url' && !RE.url.test(v)) problem = 'not a URL';
      else if (/aadh?a?a?r/i.test(c.name) && !looksLikeAadhaar(v)) problem = 'Aadhaar must have 12 digits';
      else if (/e-?mail/i.test(c.name) && !RE.email.test(v)) problem = 'not an email address';
      else if (/(mobile|phone|whatsapp)/i.test(c.name) && v.replace(/\D/g, '').length !== 10 && v.replace(/\D/g, '').length !== 12) problem = 'mobile number should have 10 digits';
      if (problem) rep.invalid.push({ rowId: r.id, rowIndex: i, column: c.key, value: v, problem });
    }
  });
  rep.emptyColumns = t.columns.filter((c) => t.rows.length && t.rows.every((r) => String(r.values[c.key] ?? '').trim() === '')).map((c) => c.key);
  return rep;
}

/** Finds a record by key column value or any column match ("student-wise retrieval"). */
export function findRecords(t: DataTable, query: string, limit = 50) {
  const q = query.trim().toLowerCase();
  if (!q) return t.rows.slice(0, limit);
  const key = t.keyColumn;
  const exact = key ? t.rows.filter((r) => String(r.values[key] ?? '').toLowerCase() === q) : [];
  if (exact.length) return exact.slice(0, limit);
  return t.rows.filter((r) => Object.values(r.values).some((v) => String(v ?? '').toLowerCase().includes(q))).slice(0, limit);
}

export function recordLabel(t: DataTable, rowId?: string | null): string {
  const r = t.rows.find((x) => x.id === rowId);
  if (!r) return '';
  const nameCol = t.columns.find((c) => /name/i.test(c.name) && !(t.sensitiveColumns || []).includes(c.key));
  const keyCol = t.keyColumn ? t.columns.find((c) => c.key === t.keyColumn) : undefined;
  const parts = [keyCol ? r.values[keyCol.key] : null, nameCol ? r.values[nameCol.key] : null].filter((x) => x !== null && x !== undefined && String(x).trim() !== '');
  return parts.length ? parts.join(' · ') : `Row ${t.rows.indexOf(r) + 1}`;
}

export const ADAPTERS = { csv: csvSource, xlsx: xlsxSource, json: jsonSource };
