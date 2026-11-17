// Minimal, dependency-light XLSX reader/writer (Office Open XML).
// Reads: shared strings, inline strings, numbers, booleans, formulas' cached
// values, dates (built-in + custom date formats, 1900/1904 systems), multiple sheets.
// Writes: simple multi-sheet workbooks (used for execution reports / exports).
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

export interface Sheet { name: string; rows: string[][] }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(cp) ? String.fromCodePoint(cp) : m; }
    return ENT[e.toLowerCase()] ?? m;
  }).replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
export function encodeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? decodeXml(m[1]) : undefined;
}

/** Concatenates all <t> texts inside a fragment (rich text runs), ignoring phonetic runs. */
function textOfSi(frag: string): string {
  const noPh = frag.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noPh))) out += m[1] ? decodeXml(m[1]) : '';
  return out;
}

export function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() || 'A';
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
export function colName(i: number): string {
  let s = '';
  i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const TIME_ONLY = new Set([18, 19, 20, 21, 45, 46, 47]);
function isDateFormat(code: string): boolean {
  const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  return /[dmyhs]/i.test(c) && !/^general$/i.test(c.trim()) && !/0|#/.test(c.replace(/[dmyhs:./ \-,]/gi, ''));
}

const pad = (n: number) => String(n).padStart(2, '0');
export function serialToISO(serial: number, date1904 = false, timeOnly = false): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = Math.round(serial * 86400000);
  const d = new Date(epoch + ms);
  const datePart = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hasTime = Math.abs(serial % 1) > 1e-9;
  const timePart = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (timeOnly) return timePart;
  return hasTime ? `${datePart} ${timePart}` : datePart;
}

function numToText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  // avoid 0.30000000000000004 style artefacts and scientific notation for ids
  if (Number.isInteger(n)) return Math.abs(n) >= 1e21 ? v : n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 });
  return String(Number(n.toPrecision(15)));
}

export function readXlsx(data: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(data); } catch { throw new Error('This file is not a valid .xlsx workbook (older .xls files must be saved as .xlsx or CSV first)'); }
  const txt = (p: string) => (files[p] ? strFromU8(files[p]) : '');
  const wb = txt('xl/workbook.xml');
  if (!wb) throw new Error('Workbook part missing — is this an Excel .xlsx file?');
  const date1904 = /date1904="(1|true)"/.test(wb);
  const rels = txt('xl/_rels/workbook.xml.rels');
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) relMap.set(id, target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, ''));
  }
  const shared: string[] = [];
  for (const m of txt('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOfSi(m[1]));
  // styles: cellXfs index -> numFmtId, custom formats
  const styles = txt('xl/styles.xml');
  const customFmt = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b([^>]*)\/?>/g)) { const id = Number(attr(m[1], 'numFmtId')); const code = attr(m[1], 'formatCode') || ''; customFmt.set(id, code); }
  const xfs: number[] = [];
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] || '';
  for (const m of cellXfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) xfs.push(Number(attr(m[1], 'numFmtId') || 0));
  const dateStyle = (s: number | undefined): 'date' | 'time' | null => {
    if (s === undefined || Number.isNaN(s)) return null;
    const id = xfs[s];
    if (id === undefined) return null;
    if (TIME_ONLY.has(id)) return 'time';
    if (BUILTIN_DATE_FMTS.has(id)) return 'date';
    const code = customFmt.get(id);
    if (code && isDateFormat(code)) return /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) ? 'date' : 'time';
    return null;
  };

  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], 'name') || `Sheet${sheets.length + 1}`;
    const rid = attr(m[1], 'r:id') || attr(m[1], 'id');
    const path = (rid && relMap.get(rid)) || `xl/worksheets/sheet${sheets.length + 1}.xml`;
    const xml = txt(path);
    if (!xml) { sheets.push({ name, rows: [] }); continue; }
    const grid: string[][] = [];
    let maxCol = 0;
    let autoRow = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(attr(rm[1], 'r')) || autoRow + 1;
      autoRow = r;
      const row: string[] = [];
      let autoCol = 0;
      for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const a = cm[1];
        const ref = attr(a, 'r');
        const ci = ref ? colIndex(ref) : autoCol;
        autoCol = ci + 1;
        const t = attr(a, 't') || 'n';
        const s = attr(a, 's');
        const body = cm[2] || '';
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let out = '';
        if (t === 's') out = v !== undefined ? shared[Number(v)] ?? '' : '';
        else if (t === 'inlineStr') out = textOfSi(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] || '');
        else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'str' || t === 'e') out = v !== undefined ? decodeXml(v) : '';
        else if (t === 'd') out = v ? decodeXml(v).slice(0, 10) : '';
        else if (v !== undefined) {
          const ds = dateStyle(s !== undefined ? Number(s) : undefined);
          out = ds && Number.isFinite(Number(v)) ? serialToISO(Number(v), date1904, ds === 'time') : numToText(decodeXml(v));
        }
        row[ci] = out;
        maxCol = Math.max(maxCol, ci + 1);
      }
      grid[r - 1] = row;
    }
    const rows: string[][] = [];
    for (let i = 0; i < grid.length; i++) {
      const row = grid[i] || [];
      rows.push(Array.from({ length: maxCol }, (_, j) => row[j] ?? ''));
    }
    // drop trailing empty rows
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
    sheets.push({ name, rows });
  }
  return sheets;
}

// ------------------------------------------------------------------ writer
function cellXml(ref: string, v: string | number | boolean | null | undefined, headerStyle: boolean): string {
  if (v === null || v === undefined || v === '') return '';
  const s = headerStyle ? ' s="1"' : '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"${s}><v>${v ? 1 : 0}</v></c>`;
  const str = String(v);
  // keep formula-looking strings inert: inline strings are never evaluated
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${encodeXml(str)}</t></is></c>`;
}

export function writeXlsx(sheets: { name: string; rows: (string | number | boolean | null | undefined)[][] }[]): Uint8Array {
  const safeName = (n: string, i: number) => (n.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || `Sheet${i + 1}`);
  const files: Record<string, Uint8Array> = {};
  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${encodeXml(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  files['xl/styles.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`);
  sheets.forEach((sh, i) => {
    const rowsXml = sh.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(`${colName(ci)}${ri + 1}`, v, ri === 0)).join('')}</row>`).join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`);
  });
  return zipSync(files, { level: 6 });
}
