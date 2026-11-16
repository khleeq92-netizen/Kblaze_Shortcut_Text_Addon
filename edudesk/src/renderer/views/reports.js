import { icon } from '../icons.js';
import { api, esc, table, loading, $, $$, state, catOptions, fmtDate } from '../lib.js';
import { exportReport } from './outward.js';

export async function render(el, route) {
  const reports = await api('reports', 'list');
  const years = await api('search', 'academicYears');
  let key = route.query.r || 'outward_monthly';
  const f = { from: '', to: '', academicYear: '', categoryId: '', recipient: '', status: '', date: '', month: new Date().toISOString().slice(0, 7), year: String(new Date().getFullYear()) };

  const draw = async () => {
    const def = reports.find((r) => r.key === key);
    const filters = { ...f, categoryId: f.categoryId ? Number(f.categoryId) : null };
    for (const k of Object.keys(filters)) if (filters[k] === '') delete filters[k];
    if (key !== 'outward_monthly') delete filters.month;
    if (key !== 'outward_yearly') delete filters.year;
    const rep = await api('reports', 'run', key, filters);
    el.innerHTML = `<div class="page-head"><div><h1>Reports</h1><p>Professionally formatted registers and summaries, ready to print or share.</p></div>
      <div class="actions"><button class="btn" data-exp="xlsx">${icon('download')}Excel</button><button class="btn" data-exp="pdf">${icon('pdf')}PDF</button><button class="btn" data-exp="csv">${icon('download')}CSV</button></div></div>
      <div class="grid" style="grid-template-columns:260px 1fr">
        <div class="card"><div class="bd" style="padding:8px">${reports.map((r) => `<a class="list-row" style="padding:8px 10px;border-radius:7px;${r.key === key ? 'background:var(--brand-soft);font-weight:600' : ''}" data-r="${r.key}">${icon(r.kind === 'inward' ? 'inbox' : r.kind === 'archive' ? 'archive' : 'outbox')}<span>${esc(r.title)}</span></a>`).join('')}</div></div>
        <div class="card"><div class="filters">
          ${key === 'outward_daily' ? `<div class="field"><label>Date</label><input type="date" class="input" data-f="date" value="${f.date}"></div>` : ''}
          ${key === 'outward_monthly' ? `<div class="field"><label>Month</label><input type="month" class="input" data-f="month" value="${f.month}"></div>` : ''}
          ${key === 'outward_yearly' ? `<div class="field"><label>Year</label><input type="number" class="input" data-f="year" value="${f.year}"></div>` : ''}
          ${!['outward_daily', 'outward_monthly', 'outward_yearly'].includes(key) ? `<div class="field"><label>Academic year</label><select class="input" data-f="academicYear"><option value="">${key === 'outward_academic' ? 'Current' : 'All'}</option>${years.map((y) => `<option ${y === f.academicYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div class="field"><label>From</label><input type="date" class="input" data-f="from" value="${f.from}"></div><div class="field"><label>To</label><input type="date" class="input" data-f="to" value="${f.to}"></div>` : ''}
          <div class="field"><label>Category</label><select class="input" data-f="categoryId"><option value="">All</option>${catOptions(true).map(([v, l]) => `<option value="${v}" ${String(v) === String(f.categoryId) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field wide"><label>${def.kind === 'inward' ? 'Sender' : 'Recipient'}</label><input class="input" data-f="recipient" value="${esc(f.recipient)}"></div>
          <div class="field"><label>Status</label><input class="input" data-f="status" value="${esc(f.status)}" list="sts"><datalist id="sts">${[...state.info.dispatchStatuses, ...state.info.inwardStatuses, 'Finalized', 'Generated'].map((s) => `<option>${s}</option>`).join('')}</datalist></div>
        </div>
        <div style="padding:14px 16px 0"><h3>${esc(rep.title)}</h3><div class="muted">${esc(rep.subtitle || 'All records')} · ${rep.rows.length} record(s)</div></div>
        ${rep.groups ? `<div class="bd"><div class="chips">${rep.groups.map((g) => `<span class="badge info plain">${esc(g.name)}: ${g.count}</span>`).join('')}</div></div>` : ''}
        <div id="t" style="padding:12px 0 0"></div></div></div>`;
    table($('#t', el), {
      rows: rep.rows, register: true, empty: 'No records for these filters.',
      onRow: (r) => { location.hash = r.inward_no ? `#/inward/${r.id}` : `#/letter/${r.id}`; },
      columns: [{ key: '_sr', label: 'Sr.', sort: false, render: (r, i) => String(i + 1) }, ...rep.columns.filter((c) => !['summary', 'remarks', 'docx_file', 'pdf_file'].includes(c.key)).map((c) => ({ key: c.key, label: c.label, render: (r) => esc(c.date ? fmtDate(r[c.key]) : r[c.key] == null ? '' : r[c.key]) }))],
    });
    $$('[data-r]', el).forEach((a) => { a.onclick = () => { key = a.dataset.r; draw(); }; });
    $$('[data-f]', el).forEach((i) => { i.onchange = () => { f[i.dataset.f] = i.value; draw(); }; });
    $$('[data-exp]', el).forEach((b) => { b.onclick = () => { const x = { ...f, categoryId: f.categoryId ? Number(f.categoryId) : null }; for (const k of Object.keys(x)) if (x[k] === '') delete x[k]; exportReport(key, x, b.dataset.exp); }; });
  };
  loading(el);
  await draw();
  return { title: 'Reports', refresh: draw };
}
