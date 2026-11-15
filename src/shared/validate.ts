// Validation of imported data (files, share codes, cloud payloads). Never trust
// imported content: shape-check, clamp sizes and sanitize rich content.
import type { ExportBundle, Snippet, Folder, DataTable, Workflow, UserTemplate } from './types';
import { uid } from './ids';
import { sanitizeHtml } from './html';

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const str = (v: unknown, max = 200000) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class ImportError extends Error {}

export function normalizeSnippet(raw: any, now = Date.now()): Snippet {
  if (!raw || typeof raw !== 'object') throw new ImportError('Invalid snippet entry');
  const contentType = raw.contentType === 'html' ? 'html' : 'text';
  const content = str(raw.content ?? raw.text ?? raw.body);
  return {
    id: typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : uid('snp'),
    name: str(raw.name ?? raw.title, 200) || 'Untitled snippet',
    shortcut: str(raw.shortcut ?? raw.abbreviation ?? raw.trigger, 48).replace(/\s+/g, ''),
    content: contentType === 'html' ? sanitizeHtml(content) : content,
    contentType,
    folderId: typeof raw.folderId === 'string' ? raw.folderId : null,
    enabled: bool(raw.enabled, true),
    favorite: bool(raw.favorite, false),
    pinned: bool(raw.pinned, false),
    description: str(raw.description, 2000),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t: unknown) => typeof t === 'string').slice(0, 30).map((t: string) => t.slice(0, 40)) : [],
    trigger: ['immediate', 'delimiter'].includes(raw.trigger) ? raw.trigger : 'default',
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    teamId: null,
  };
}

export function normalizeFolder(raw: any, now = Date.now()): Folder {
  if (!raw || typeof raw !== 'object') throw new ImportError('Invalid folder entry');
  return {
    id: typeof raw.id === 'string' && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : uid('fld'),
    name: str(raw.name, 200) || 'Folder',
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    order: num(raw.order, 0),
    color: str(raw.color, 20) || undefined,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    teamId: null,
  };
}

export function normalizeTable(raw: any, now = Date.now()): DataTable {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) throw new ImportError('Invalid data table');
  const columns = raw.columns.slice(0, 100).map((c: any) => ({
    id: str(c.id, 64) || uid('col'),
    name: str(c.name, 100) || 'Column',
    key: (str(c.key, 64) || str(c.name, 64)).toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'col',
    type: ['text', 'number', 'email', 'phone', 'date', 'category', 'url', 'boolean'].includes(c.type) ? c.type : 'text',
    options: Array.isArray(c.options) ? c.options.map(String).slice(0, 200) : undefined,
  }));
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 50000).map((r: any) => {
    const values: Record<string, any> = {};
    const src = r?.values && typeof r.values === 'object' ? r.values : r;
    for (const c of columns) {
      const v = src?.[c.key];
      values[c.key] = v === undefined || v === null ? null : typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 5000);
    }
    return { id: str(r?.id, 64) || uid('row'), values };
  });
  return {
    id: str(raw.id, 64) || uid('tbl'),
    name: str(raw.name, 200) || 'Table',
    key: (str(raw.key, 64) || str(raw.name, 64)).toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'table',
    description: str(raw.description, 2000),
    columns,
    rows,
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    teamId: null,
  };
}

const STEP_TYPES = ['focus', 'type', 'tab', 'select', 'check', 'click', 'key', 'wait', 'waitFor', 'snippet', 'confirm'];
export function normalizeWorkflow(raw: any, now = Date.now()): Workflow {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) throw new ImportError('Invalid workflow');
  return {
    id: str(raw.id, 64) || uid('wf'),
    name: str(raw.name, 200) || 'Workflow',
    description: str(raw.description, 2000),
    enabled: bool(raw.enabled, true),
    siteFilter: str(raw.siteFilter, 200),
    steps: raw.steps.slice(0, 200).filter((s: any) => STEP_TYPES.includes(s?.type)).map((s: any) => ({
      id: str(s.id, 64) || uid('st'),
      type: s.type,
      target: s.target && ['focused', 'selector', 'label'].includes(s.target.kind) ? { kind: s.target.kind, value: str(s.target.value, 1000) } : undefined,
      value: str(s.value, 20000),
      snippetId: str(s.snippetId, 64) || undefined,
      ms: Math.min(60000, Math.max(0, num(s.ms, 500))),
      checked: bool(s.checked, true),
      requireConfirm: bool(s.requireConfirm, false),
      clear: bool(s.clear, false),
      note: str(s.note, 500),
    })),
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    teamId: null,
  };
}

export function normalizeTemplate(raw: any, now = Date.now()): UserTemplate {
  const s = normalizeSnippet(raw, now);
  return { id: str(raw.id, 64) || uid('tpl'), name: s.name, category: str(raw.category, 60) || 'My templates', description: s.description, shortcut: s.shortcut, content: s.content, contentType: s.contentType, createdAt: s.createdAt, updatedAt: s.updatedAt, teamId: null };
}

/** Accepts our own bundle format, a bare array of snippets, or a simple {shortcut: text} map. */
export function parseImport(text: string): ExportBundle {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError('File is too large (max 15 MB).');
  let data: any;
  try { data = JSON.parse(text); } catch { throw new ImportError('File is not valid JSON.'); }
  const now = Date.now();
  if (Array.isArray(data)) return { format: 'quicktext-hub', version: 1, exportedAt: now, snippets: data.slice(0, 20000).map((d) => normalizeSnippet(d, now)), folders: [] };
  if (data && typeof data === 'object' && !data.snippets && !data.format) {
    const entries = Object.entries(data).filter(([, v]) => typeof v === 'string');
    if (!entries.length) throw new ImportError('No snippets found in file.');
    return { format: 'quicktext-hub', version: 1, exportedAt: now, folders: [], snippets: entries.map(([k, v]) => normalizeSnippet({ shortcut: k, name: k, content: v }, now)) };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.snippets)) throw new ImportError('Unrecognised file format.');
  return {
    format: 'quicktext-hub',
    version: 1,
    exportedAt: num(data.exportedAt, now),
    snippets: data.snippets.slice(0, 20000).map((d: any) => normalizeSnippet(d, now)),
    folders: (Array.isArray(data.folders) ? data.folders : []).slice(0, 5000).map((d: any) => normalizeFolder(d, now)),
    tables: (Array.isArray(data.tables) ? data.tables : []).slice(0, 500).map((d: any) => normalizeTable(d, now)),
    workflows: (Array.isArray(data.workflows) ? data.workflows : []).slice(0, 1000).map((d: any) => normalizeWorkflow(d, now)),
    templates: (Array.isArray(data.templates) ? data.templates : []).slice(0, 5000).map((d: any) => normalizeTemplate(d, now)),
    settings: data.settings && typeof data.settings === 'object' ? data.settings : undefined,
  };
}

// ---------- CSV ----------
export function parseCSV(text: string): string[][] {
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
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
export function toCSV(rows: (string | number | boolean | null)[][]): string {
  return rows.map((r) => r.map((v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;
    return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  }).join(',')).join('\r\n');
}
