import { icon } from '../icons.js';
import { api, tryApi, esc, fmtDate, badge, table, loading, $, state, catOptions, toast, busy, wireFiles, modal, formHtml, readForm, confirmBox } from '../lib.js';

export async function render(el, route) {
  const years = await api('search', 'academicYears');
  const f = { q: route.query.q || '', from: '', to: '', academicYear: route.query.ay || '', categoryId: route.query.category || '', status: route.query.status || '', sort: 'number_desc' };
  const archiveFilter = route.query.archive || '';

  const draw = async () => {
    const rep = await api('reports', 'run', 'outward', { ...f, categoryId: f.categoryId ? Number(f.categoryId) : null });
    let rows = rep.rows;
    if (archiveFilter) rows = rows.filter((r) => r.archive_status === archiveFilter);
    el.innerHTML = `<div class="page-head"><div><h1>Outward Register</h1><p>Every outgoing letter with its outward number, recipient, subject, dispatch details and archived DOCX/PDF.</p></div>
      <div class="actions">
        <button class="btn" data-exp="xlsx">${icon('download')}Excel</button><button class="btn" data-exp="pdf">${icon('pdf')}PDF</button><button class="btn" data-exp="csv">${icon('download')}CSV</button>
        <button class="btn" id="b-ext">${icon('upload')}Record existing letter</button>
        <a class="btn accent" href="#/letter/new">${icon('plus')}New Letter</a></div></div>
      ${archiveFilter ? `<div class="callout warn">${icon('alert')}<div>Showing only letters whose archive is <b>${esc(archiveFilter)}</b>. <a href="#/outward">Show all</a></div></div><br>` : ''}
      <div class="card"><div class="filters">
        <div class="field wide"><label>Search (number, subject, recipient, summary, reference)</label><input class="input" id="q" value="${esc(f.q)}"></div>
        <div class="field"><label>Academic year</label><select class="input" id="ay"><option value="">All years</option>${years.map((y) => `<option ${y === f.academicYear ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></div>
        <div class="field"><label>From</label><input type="date" class="input" id="from" value="${f.from}"></div>
        <div class="field"><label>To</label><input type="date" class="input" id="to" value="${f.to}"></div>
        <div class="field"><label>Category</label><select class="input" id="cat"><option value="">All categories</option>${catOptions(true).map(([v, l]) => `<option value="${v}" ${String(v) === String(f.categoryId) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select class="input" id="st"><option value="">Any status</option>${['Generated', 'Finalized', 'Ready for Dispatch', 'Dispatched', 'Delivered', 'Acknowledgement Pending', 'Closed', 'Cancelled'].map((s) => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Sort</label><select class="input" id="sort">${[['number_desc', 'Number (newest first)'], ['number_asc', 'Number (oldest first)'], ['date_desc', 'Date (newest first)'], ['date_asc', 'Date (oldest first)']].map(([v, l]) => `<option value="${v}" ${v === f.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div><div id="t"></div><div class="muted" style="padding:10px 14px;font-size:12px">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</div></div>`;
    table($('#t', el), {
      rows, register: true, onRow: (r) => { location.hash = `#/letter/${r.id}`; }, empty: 'No outward letters match these filters.',
      columns: [
        { key: 'outward_no', label: 'Outward No.', cls: 'num', sort: false, render: (r) => `${esc(r.outward_no)}${r.number_override ? ' <span title="Manually assigned number" class="badge warn plain">M</span>' : ''}` },
        { key: 'letter_date', label: 'Date', cls: 'nowrap', render: (r) => fmtDate(r.letter_date) },
        { key: 'recipient', label: 'To', render: (r) => esc(r.recipient) },
        { key: 'subject', label: 'Subject / Summary', render: (r) => `<b>${esc(r.subject)}</b>${r.summary ? `<div class="sub">${esc(r.summary)}</div>` : ''}${r.reference_no ? `<div class="sub">Ref: ${esc(r.reference_no)}</div>` : ''}` },
        { key: 'category_name', label: 'Category', render: (r) => `${esc(r.category_name || '')}${r.subcategory_name ? `<div class="sub">${esc(r.subcategory_name)}</div>` : ''}` },
        { key: 'dispatch_mode', label: 'Dispatch', render: (r) => (r.dispatch_date ? `${esc(r.dispatch_mode || '')}<div class="sub">${fmtDate(r.dispatch_date)}${r.tracking_no ? ' · ' + esc(r.tracking_no) : ''}</div>` : '<span class="muted">—</span>') },
        { key: 'status', label: 'Status', render: (r) => `${badge(r.status)}${r.archive_status === 'Incomplete' ? '<div style="margin-top:4px">' + badge('PDF pending', 'err') + '</div>' : ''}${r.ack_status ? `<div style="margin-top:4px">${badge('Ack. ' + r.ack_status, r.ack_status === 'Received' ? 'ok' : 'warn')}</div>` : ''}` },
        { key: 'files', label: 'Files', sort: false, cls: 'nowrap', render: (r) => `${r.docx_abs ? `<button class="btn sm" data-open="${esc(r.docx_abs)}" title="Open DOCX">${icon('word')}</button>` : ''} ${r.pdf_abs ? `<button class="btn sm" data-open="${esc(r.pdf_abs)}" title="Open PDF">${icon('pdf')}</button> <button class="btn sm ghost" data-print="${esc(r.pdf_abs)}" title="Reprint">${icon('print')}</button>` : ''}` },
      ],
    });
    wireFiles(el);
    const bindF = (id, key, ev = 'change') => { $(id, el).addEventListener(ev, (e) => { f[key] = e.target.value; if (key === 'from' || key === 'to') f.academicYear = f.academicYear; draw(); }); };
    const qi = $('#q', el);
    qi.oninput = () => { clearTimeout(qi._t); qi._t = setTimeout(() => { f.q = qi.value; draw().then(() => { const n = $('#q', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 350); };
    bindF('#ay', 'academicYear'); bindF('#from', 'from'); bindF('#to', 'to'); bindF('#cat', 'categoryId'); bindF('#st', 'status'); bindF('#sort', 'sort');
    el.querySelectorAll('[data-exp]').forEach((b) => { b.onclick = () => exportReport('outward', { ...f, categoryId: f.categoryId ? Number(f.categoryId) : null }, b.dataset.exp); });
    $('#b-ext', el).onclick = recordExternal;
  };
  loading(el);
  await draw();
  return { title: 'Outward Register', crumb: 'Most important register', refresh: draw };
}

export async function exportReport(key, filters, format) {
  const r = await busy('Exporting…', () => tryApi('sys', 'exportReport', key, filters, format));
  if (r) {
    toast(`Exported ${r.rows} record(s).`, 'success');
    tryApi('sys', 'openPath', r.path);
  }
}

/** Register a letter that was prepared outside EduDesk (old Word file or signed scan). */
async function recordExternal() {
  const file = await api('sys', 'pickFile', { title: 'Choose the letter (.docx or .pdf)', filters: [{ name: 'Letters', extensions: ['docx', 'pdf'] }] });
  if (!file) return;
  const body = `<div class="callout info">${icon('info')}<div>Use this for letters typed earlier in Word or signed and scanned. EduDesk gives it the next outward number (or the number you enter) and archives it. A .docx file is archived as DOCX + PDF.</div></div><br>
    <p class="muted">File: ${esc(file)}</p>${formHtml([
    { name: 'category_id', label: 'Category', type: 'select', options: [['', '— Select —'], ...catOptions()], required: true },
    { name: 'letter_date', label: 'Letter date', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
    { name: 'subject', label: 'Subject', required: true, full: true },
    { name: 'recipient_designation', label: 'Recipient designation' },
    { name: 'recipient_office', label: 'Recipient office', required: true },
    { name: 'summary', label: 'Short summary', full: true },
    { name: 'manual_outward_no', label: 'Outward number (leave empty for the next number)', hint: 'Entering a number requires the manual override permission.' },
    { name: 'override_reason', label: 'Reason (when entering a number)' },
  ], {})}`;
  const r = await modal({
    title: 'Record existing letter', size: 'wide', body, actions: [{ label: 'Cancel', value: null }, {
      label: 'Archive & add to register', kind: 'primary', onClick: async (mb) => {
        const v = readForm(mb);
        v.category_id = Number(v.category_id) || null;
        return busy('Archiving…', () => api('letters', 'recordExternal', v, file));
      },
    }],
  });
  if (r && r.ok) { toast(`Recorded as ${r.letter.outward_no}.`, 'success'); location.hash = `#/letter/${r.letter.id}`; } else if (r && !r.ok) toast(r.error, 'error');
}
