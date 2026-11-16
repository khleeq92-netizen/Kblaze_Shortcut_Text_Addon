'use strict';
const fs = require('fs');
const path = require('path');
const { UserError, formatDate, todayISO, academicYearRange, sanitizeFileName, uniquePath, nowLocal } = require('../util');

const OUT_COLS = [
  { key: 'outward_no', label: 'Outward No.', width: 16 },
  { key: 'letter_date', label: 'Letter Date', width: 11, date: true },
  { key: 'recipient', label: 'To (Recipient)', width: 30 },
  { key: 'subject', label: 'Subject', width: 40 },
  { key: 'summary', label: 'Summary', width: 30 },
  { key: 'category_name', label: 'Category', width: 18 },
  { key: 'reference_no', label: 'Reference', width: 14 },
  { key: 'dispatch_mode', label: 'Dispatch Mode', width: 13 },
  { key: 'dispatch_date', label: 'Dispatch Date', width: 11, date: true },
  { key: 'tracking_no', label: 'Tracking No.', width: 14 },
  { key: 'enclosure_count', label: 'Encl.', width: 6 },
  { key: 'status', label: 'Status', width: 14 },
  { key: 'ack_status', label: 'Ack.', width: 10 },
  { key: 'remarks', label: 'Remarks', width: 18 },
];

const INW_COLS = [
  { key: 'inward_no', label: 'Inward No.', width: 15 },
  { key: 'date_received', label: 'Received', width: 11, date: true },
  { key: 'sender', label: 'From (Sender)', width: 30 },
  { key: 'subject', label: 'Subject', width: 40 },
  { key: 'summary', label: 'Summary', width: 28 },
  { key: 'category_name', label: 'Category', width: 18 },
  { key: 'reference_no', label: 'Reference', width: 14 },
  { key: 'received_through', label: 'Received Through', width: 14 },
  { key: 'assigned_to', label: 'Assigned To', width: 14 },
  { key: 'reply_deadline', label: 'Reply By', width: 11, date: true },
  { key: 'status', label: 'Status', width: 13 },
  { key: 'replies', label: 'Reply Outward No.', width: 16 },
];

const REPORTS = {
  outward: { title: 'Outward Register', kind: 'outward' },
  outward_daily: { title: 'Daily Outward Register', kind: 'outward' },
  outward_monthly: { title: 'Monthly Outward Register', kind: 'outward' },
  outward_yearly: { title: 'Yearly Outward Register', kind: 'outward' },
  outward_academic: { title: 'Academic-Year Outward Register', kind: 'outward' },
  category_wise: { title: 'Category-Wise Correspondence', kind: 'outward', group: 'category_name' },
  recipient_wise: { title: 'Recipient-Wise Correspondence', kind: 'outward', group: 'recipient' },
  inward: { title: 'Inward Register', kind: 'inward' },
  pending_inward: { title: 'Pending Inward Actions', kind: 'inward', pending: true },
  pending_ack: { title: 'Pending Acknowledgements', kind: 'outward', pendingAck: true },
  cancelled: { title: 'Cancelled Letters', kind: 'outward', cancelled: true },
  dispatch: { title: 'Dispatch Report', kind: 'outward', dispatch: true },
  archive: { title: 'Letter Archive Report', kind: 'archive' },
};

class Reports {
  constructor(app) { this.app = app; this.db = app.db; }

  list() { return Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title, kind: r.kind })); }

  resolveRange(f) {
    let { from, to } = f;
    if (f.academicYear && !from && !to) ({ from, to } = academicYearRange(f.academicYear, this.app.settings.get('academic').startMonth));
    return { from, to };
  }

  outwardRows(f, def = {}) {
    const where = ['l.outward_no IS NOT NULL', 'l.deleted_at IS NULL'];
    const params = [];
    const { from, to } = this.resolveRange(f);
    const dateCol = def.dispatch ? 'l.dispatch_date' : 'l.letter_date';
    if (from) { where.push(`${dateCol} >= ?`); params.push(from); }
    if (to) { where.push(`${dateCol} <= ?`); params.push(to); }
    if (f.academicYear && (f.from || f.to)) { where.push('l.academic_year = ?'); params.push(f.academicYear); }
    if (f.categoryId) { where.push('l.category_id = ?'); params.push(f.categoryId); }
    if (f.recipient) { where.push('(l.recipient_office LIKE ? OR l.recipient_name LIKE ? OR l.recipient_designation LIKE ?)'); params.push(`%${f.recipient}%`, `%${f.recipient}%`, `%${f.recipient}%`); }
    if (f.status) { where.push('(l.status = ? OR l.dispatch_status = ?)'); params.push(f.status, f.status); }
    if (f.q) {
      where.push('(l.outward_no LIKE ? OR l.subject LIKE ? OR l.summary LIKE ? OR l.reference_no LIKE ? OR l.recipient_office LIKE ? OR l.recipient_name LIKE ?)');
      for (let i = 0; i < 6; i++) params.push(`%${f.q}%`);
    }
    if (def.cancelled) where.push("l.status = 'Cancelled'");
    else if (!f.includeCancelled && (def.pendingAck || def.dispatch)) where.push("l.status <> 'Cancelled'");
    if (def.pendingAck) where.push("(l.ack_status = 'Pending' OR l.dispatch_status IN ('Delivered','Acknowledgement Pending')) AND l.ack_received_date IS NULL");
    if (def.dispatch) where.push('l.dispatch_date IS NOT NULL');
    const order = f.sort === 'number_asc' ? 'l.academic_year, l.outward_seq, l.id' : f.sort === 'date_asc' ? 'l.letter_date, l.id' : f.sort === 'number_desc' ? 'l.academic_year DESC, l.outward_seq DESC, l.id DESC' : 'l.letter_date DESC, l.id DESC';
    return this.db.all(`SELECT l.* FROM letters l WHERE ${where.join(' AND ')} ORDER BY ${order}`, params).map((r) => ({
      ...r,
      recipient: [r.recipient_name, r.recipient_designation, r.recipient_office].filter(Boolean).join(', '),
      docx_abs: this.app.resolve(r.docx_path), pdf_abs: this.app.resolve(r.pdf_path),
    }));
  }

  inwardRows(f, def = {}) {
    const where = ['i.deleted_at IS NULL'];
    const params = [];
    const { from, to } = this.resolveRange(f);
    if (from) { where.push('i.date_received >= ?'); params.push(from); }
    if (to) { where.push('i.date_received <= ?'); params.push(to); }
    if (f.categoryId) { where.push('i.category_id = ?'); params.push(f.categoryId); }
    if (f.recipient) { where.push('(i.sender_office LIKE ? OR i.sender_name LIKE ?)'); params.push(`%${f.recipient}%`, `%${f.recipient}%`); }
    if (f.status) { where.push('i.status = ?'); params.push(f.status); }
    if (f.q) {
      where.push('(i.inward_no LIKE ? OR i.subject LIKE ? OR i.summary LIKE ? OR i.reference_no LIKE ? OR i.sender_office LIKE ? OR i.sender_name LIKE ?)');
      for (let k = 0; k < 6; k++) params.push(`%${f.q}%`);
    }
    if (def.pending) where.push("i.status NOT IN ('Replied','Completed','Archived')");
    const rows = this.db.all(`SELECT i.*, (SELECT group_concat(outward_no, ', ') FROM letters WHERE inward_id = i.id AND outward_no IS NOT NULL AND deleted_at IS NULL) AS replies
      FROM inward i WHERE ${where.join(' AND ')} ORDER BY ${f.sort === 'date_asc' ? 'i.date_received, i.id' : 'i.date_received DESC, i.id DESC'}`, params);
    const today = todayISO();
    return rows.map((r) => ({ ...r, sender: [r.sender_name, r.sender_designation, r.sender_office].filter(Boolean).join(', '), overdue: !!(r.reply_required && r.reply_deadline && r.reply_deadline < today && !['Replied', 'Completed', 'Archived'].includes(r.status)) }));
  }

  /** Run a report: returns { title, subtitle, columns, rows, groups? }. */
  run(key, filters = {}) {
    this.app.require('registers.view');
    const def = REPORTS[key];
    if (!def) throw new UserError('Unknown report.');
    const f = { ...filters };
    const today = todayISO();
    if (key === 'outward_daily' && !f.from) { f.from = f.date || today; f.to = f.date || today; }
    if (key === 'outward_monthly' && !f.from) { const m = (f.month || today.slice(0, 7)); f.from = `${m}-01`; f.to = `${m}-31`; }
    if (key === 'outward_yearly' && !f.from) { const y = f.year || today.slice(0, 4); f.from = `${y}-01-01`; f.to = `${y}-12-31`; }
    if (key === 'outward_academic' && !f.academicYear) f.academicYear = require('../util').academicYear(today, this.app.settings.get('academic').startMonth);
    let columns;
    let rows;
    if (def.kind === 'inward') { columns = INW_COLS; rows = this.inwardRows(f, def); } else if (def.kind === 'archive') {
      columns = [
        { key: 'outward_no', label: 'Outward No.', width: 16 }, { key: 'letter_date', label: 'Date', width: 11, date: true },
        { key: 'subject', label: 'Subject', width: 40 }, { key: 'category_name', label: 'Category', width: 18 },
        { key: 'archive_status', label: 'Archive', width: 11 }, { key: 'docx_file', label: 'DOCX file', width: 40 }, { key: 'pdf_file', label: 'PDF file', width: 40 },
        { key: 'current_version', label: 'Ver.', width: 5 },
      ];
      rows = this.outwardRows(f, def).map((r) => ({ ...r, docx_file: r.docx_abs || '', pdf_file: r.pdf_abs || '', docx_exists: r.docx_abs ? fs.existsSync(r.docx_abs) : false, pdf_exists: r.pdf_abs ? fs.existsSync(r.pdf_abs) : false }));
    } else { columns = OUT_COLS; rows = this.outwardRows(f, def); }
    let groups = null;
    if (def.group) {
      const m = new Map();
      for (const r of rows) {
        const g = r[def.group] || '(none)';
        if (!m.has(g)) m.set(g, []);
        m.get(g).push(r);
      }
      groups = [...m.entries()].map(([name, items]) => ({ name, count: items.length })).sort((a, b) => b.count - a.count);
    }
    const { from, to } = this.resolveRange(f);
    const fmt = this.app.settings.get('letter').dateFormat;
    const parts = [];
    if (f.academicYear) parts.push(`Academic Year ${f.academicYear}`);
    if (from || to) parts.push(`${from ? formatDate(from, fmt) : '…'} to ${to ? formatDate(to, fmt) : '…'}`);
    if (f.categoryId) { const c = this.db.get('SELECT name FROM categories WHERE id=?', [f.categoryId]); if (c) parts.push(c.name); }
    if (f.status) parts.push(`Status: ${f.status}`);
    if (f.recipient) parts.push(`Recipient/Sender: ${f.recipient}`);
    return { key, title: def.title, subtitle: parts.join(' · '), columns, rows, groups, generatedAt: nowLocal() };
  }

  cell(r, c) {
    const v = r[c.key];
    if (v == null) return '';
    if (c.date) return formatDate(v, this.app.settings.get('letter').dateFormat);
    return String(v);
  }

  // ------------------------------------------------------------------ exports
  async export(key, filters, format, destPath) {
    this.app.require('reports.export');
    const rep = this.run(key, filters);
    const base = `${sanitizeFileName(rep.title, 50)}_${todayISO()}`;
    const out = destPath || uniquePath(path.join(this.app.exportsDir(), `${base}.${format}`));
    if (format === 'csv') this.writeCsv(rep, out);
    else if (format === 'xlsx') await this.writeXlsx(rep, out);
    else if (format === 'pdf') await this.writePdf(rep, out);
    else throw new UserError('Choose CSV, Excel or PDF.');
    this.app.audit(this.app.currentUser().username, 'report.export', 'report', null, { key, format, rows: rep.rows.length, file: out });
    return { path: out, rows: rep.rows.length };
  }

  writeCsv(rep, out) {
    const esc = (s) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [rep.columns.map((c) => esc(c.label)).join(',')];
    for (const r of rep.rows) lines.push(rep.columns.map((c) => esc(this.cell(r, c))).join(','));
    fs.writeFileSync(out, '﻿' + lines.join('\r\n'), 'utf8');
  }

  async writeXlsx(rep, out) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduDesk Correspondence Manager';
    const ws = wb.addWorksheet(rep.title.slice(0, 30), { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const college = this.app.settings.get('college');
    const n = rep.columns.length;
    ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = college.name || 'EduDesk';
    ws.getCell(1, 1).font = { bold: true, size: 14 }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
    ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = rep.title + (rep.subtitle ? ` — ${rep.subtitle}` : '');
    ws.getCell(2, 1).font = { bold: true, size: 12 }; ws.getCell(2, 1).alignment = { horizontal: 'center' };
    ws.mergeCells(3, 1, 3, n); ws.getCell(3, 1).value = `Generated ${rep.generatedAt} · ${rep.rows.length} record(s)`;
    ws.getCell(3, 1).font = { italic: true, size: 9, color: { argb: 'FF666666' } }; ws.getCell(3, 1).alignment = { horizontal: 'center' };
    const header = ws.getRow(5);
    rep.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      ws.getColumn(i + 1).width = c.width || 14;
    });
    rep.rows.forEach((r, ri) => {
      const row = ws.getRow(6 + ri);
      rep.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = this.cell(r, c);
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } }, left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } };
        if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6FA' } };
      });
    });
    ws.views = [{ state: 'frozen', ySplit: 5 }];
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + rep.rows.length, column: n } };
    if (rep.groups) {
      const gs = wb.addWorksheet('Summary');
      gs.columns = [{ header: 'Group', key: 'name', width: 50 }, { header: 'Letters', key: 'count', width: 12 }];
      gs.getRow(1).font = { bold: true };
      rep.groups.forEach((g) => gs.addRow(g));
    }
    await wb.xlsx.writeFile(out);
  }

  reportHtml(rep) {
    const college = this.app.settings.get('college');
    const e = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const d = (v) => this.cell({ v }, { key: 'v', date: true });
    const small = (s) => (s ? `<div class="sm">${e(s)}</div>` : '');
    // Printed registers merge secondary details under the main value so columns stay readable.
    const isOut = REPORTS[rep.key] && REPORTS[rep.key].kind === 'outward';
    const isIn = REPORTS[rep.key] && REPORTS[rep.key].kind === 'inward';
    const cols = isOut ? [
      { label: 'Outward No.', cls: 'nw b', html: (r) => e(r.outward_no) },
      { label: 'Date', cls: 'nw', html: (r) => e(d(r.letter_date)) },
      { label: 'To (Recipient)', html: (r) => e(r.recipient) },
      { label: 'Subject', w: '27%', html: (r) => `<b>${e(r.subject)}</b>${small(r.summary)}${r.reference_no ? small('Ref: ' + r.reference_no) : ''}` },
      { label: 'Category', html: (r) => e(r.category_name) + small(r.subcategory_name) },
      { label: 'Dispatch', html: (r) => (r.dispatch_date ? `${e(r.dispatch_mode || '')}${small(d(r.dispatch_date))}${r.tracking_no ? `<div class="sm nw">${e(r.tracking_no)}</div>` : ''}` : '—') },
      { label: 'Encl.', cls: 'nw', html: (r) => e(r.enclosure_count || '') },
      { label: 'Status', cls: 'nw', html: (r) => e(r.status) + (r.ack_status ? small('Ack. ' + r.ack_status) : '') + (r.remarks ? small(r.remarks) : '') },
    ] : isIn ? [
      { label: 'Inward No.', cls: 'nw b', html: (r) => e(r.inward_no) },
      { label: 'Received', cls: 'nw', html: (r) => e(d(r.date_received)) },
      { label: 'From (Sender)', html: (r) => e(r.sender) },
      { label: 'Subject', w: '30%', html: (r) => `<b>${e(r.subject)}</b>${small(r.summary)}${r.reference_no ? small('Ref: ' + r.reference_no) : ''}` },
      { label: 'Category', html: (r) => e(r.category_name) },
      { label: 'Action', html: (r) => e(r.assigned_to || '—') + (r.reply_deadline ? small('Reply by ' + d(r.reply_deadline)) : '') },
      { label: 'Status', cls: 'nw', html: (r) => e(r.status) + (r.replies ? small('Reply: ' + r.replies) : '') },
    ] : rep.columns.map((c) => ({ label: c.label, cls: c.date ? 'nw' : '', html: (r) => e(this.cell(r, c)) }));
    const groups = rep.groups ? `<h3>Summary</h3><table class="sum"><tr><th>Group</th><th>Letters</th></tr>${rep.groups.map((g) => `<tr><td>${e(g.name)}</td><td>${g.count}</td></tr>`).join('')}</table>` : '';
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: A4 landscape; margin: 12mm 10mm 14mm; }
      body { font-family: 'Segoe UI', 'Nirmala UI', 'Noto Sans Devanagari', Arial, sans-serif; font-size: 8.5pt; color: #111; }
      .head { text-align: center; border-bottom: 2px solid #1F4E79; padding-bottom: 6px; margin-bottom: 8px; }
      .head h1 { font-size: 15pt; margin: 0; } .head .addr { font-size: 8.5pt; color: #333; }
      h2 { font-size: 12pt; margin: 6px 0 2px; text-align: center; letter-spacing: .5px; text-transform: uppercase; }
      .sub { text-align: center; color: #444; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; }
      th { background: #1F4E79; color: #fff; padding: 4px 3px; border: 1px solid #1F4E79; font-weight: 600; }
      td { border: 1px solid #9aa7b5; padding: 3px 4px; vertical-align: top; overflow-wrap: anywhere; }
      td.nw { white-space: nowrap; overflow-wrap: normal; } td.b { font-weight: 600; color: #1F4E79; }
      td .sm { font-size: 7.5pt; color: #555; margin-top: 1px; } .sm.nw { white-space: nowrap; }
      tr:nth-child(even) td { background: #f3f6fa; }
      thead { display: table-header-group; } tr { page-break-inside: avoid; }
      .foot { margin-top: 10px; font-size: 8pt; color: #555; display: flex; justify-content: space-between; }
      .sum { width: 50%; margin-top: 6px; } .sign { margin-top: 30px; text-align: right; font-size: 9pt; }
    </style></head><body>
      <div class="head"><h1>${e(college.name || 'Institution name (set in Settings → College Profile)')}</h1><div class="addr">${e(college.address || '')}${college.udise_code ? ' · UDISE: ' + e(college.udise_code) : ''}${college.index_no ? ' · Index No.: ' + e(college.index_no) : ''}</div></div>
      <h2>${e(rep.title)}</h2><div class="sub">${e(rep.subtitle || '')}</div>
      <table><thead><tr><th>Sr.</th>${cols.map((c) => `<th${c.w ? ` style="width:${c.w}"` : ''}>${e(c.label)}</th>`).join('')}</tr></thead><tbody>
      ${rep.rows.map((r, i) => `<tr><td>${i + 1}</td>${cols.map((c) => `<td class="${c.cls || ''}">${c.html(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" style="text-align:center;padding:12px">No records for the selected filters.</td></tr>`}
      </tbody></table>${groups}
      <div class="foot"><span>Total records: ${rep.rows.length}</span><span>Generated by EduDesk Correspondence Manager on ${e(rep.generatedAt)}</span></div>
      <div class="sign">Signature of Head of Institution</div>
    </body></html>`;
  }

  async writePdf(rep, out) {
    if (!this.app.hooks.htmlToPdf) throw new UserError('PDF export is available in the desktop application.');
    await this.app.hooks.htmlToPdf(this.reportHtml(rep), out, { landscape: true });
    if (!fs.existsSync(out) || fs.statSync(out).size === 0) throw new UserError('PDF export failed.');
  }
}

Reports.REPORTS = REPORTS;
module.exports = Reports;
