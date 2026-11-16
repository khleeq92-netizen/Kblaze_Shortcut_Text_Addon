import { icon } from '../icons.js';
import { api, tryApi, esc, fmtDate, fmtDateTime, badge, table, loading, $, $$, state, catOptions, toast, formHtml, readForm, validateRequired, fileRow, wireFiles, today, promptBox, confirmBox } from '../lib.js';
import { exportReport } from './outward.js';

export async function render(el, route) {
  const sub = route.parts[1];
  if (sub === 'new' || (sub && /^\d+$/.test(sub))) return renderEntry(el, sub === 'new' ? null : Number(sub));
  return renderList(el, route);
}

async function renderList(el, route) {
  const f = { q: '', from: '', to: '', status: '', categoryId: '', pending: route.query.pending === '1' };
  const years = await api('search', 'academicYears');
  const draw = async () => {
    const rep = await api('reports', 'run', f.pending ? 'pending_inward' : 'inward', { ...f, categoryId: f.categoryId ? Number(f.categoryId) : null });
    el.innerHTML = `<div class="page-head"><div><h1>Inward Register</h1><p>Letters received by the college, with scans, assigned staff, deadlines and linked replies.</p></div>
      <div class="actions"><button class="btn" data-exp="xlsx">${icon('download')}Excel</button><button class="btn" data-exp="pdf">${icon('pdf')}PDF</button><button class="btn" data-exp="csv">${icon('download')}CSV</button>
      <a class="btn accent" href="#/inward/new">${icon('plus')}Add Inward Entry</a></div></div>
      <div class="card"><div class="filters">
        <div class="field wide"><label>Search</label><input class="input" id="q" value="${esc(f.q)}" placeholder="Inward no., subject, sender, reference…"></div>
        <div class="field"><label>Academic year</label><select class="input" id="ay"><option value="">All</option>${years.map((y) => `<option ${y === f.academicYear ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></div>
        <div class="field"><label>From</label><input type="date" class="input" id="from" value="${f.from}"></div>
        <div class="field"><label>To</label><input type="date" class="input" id="to" value="${f.to}"></div>
        <div class="field"><label>Category</label><select class="input" id="cat"><option value="">All</option>${catOptions(true).map(([v, l]) => `<option value="${v}" ${String(v) === String(f.categoryId) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select class="input" id="st"><option value="">Any</option>${state.info.inwardStatuses.map((s) => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" id="pend" ${f.pending ? 'checked' : ''}> Pending actions only</label></div>
      </div><div id="t"></div><div class="muted" style="padding:10px 14px;font-size:12px">${rep.rows.length} entr${rep.rows.length === 1 ? 'y' : 'ies'}</div></div>`;
    table($('#t', el), {
      rows: rep.rows, register: true, onRow: (r) => { location.hash = `#/inward/${r.id}`; }, empty: 'No inward letters match these filters.',
      columns: [
        { key: 'inward_no', label: 'Inward No.', cls: 'num' },
        { key: 'date_received', label: 'Received', render: (r) => fmtDate(r.date_received), cls: 'nowrap' },
        { key: 'sender', label: 'From', render: (r) => esc(r.sender) },
        { key: 'subject', label: 'Subject', render: (r) => `<b>${esc(r.subject)}</b>${r.summary ? `<div class="sub">${esc(r.summary)}</div>` : ''}${r.reference_no ? `<div class="sub">Ref: ${esc(r.reference_no)}</div>` : ''}` },
        { key: 'assigned_to', label: 'Assigned', render: (r) => esc(r.assigned_to || '—') },
        { key: 'reply_deadline', label: 'Reply by', cls: 'nowrap', render: (r) => (r.reply_required ? `${r.overdue ? badge(fmtDate(r.reply_deadline) || 'Overdue', 'err') : esc(fmtDate(r.reply_deadline) || 'Required')}` : '<span class="muted">Not needed</span>') },
        { key: 'status', label: 'Status', render: (r) => badge(r.status) },
        { key: 'replies', label: 'Reply No.', render: (r) => (r.replies ? `<span class="num">${esc(r.replies)}</span>` : '<span class="muted">—</span>') },
      ],
    });
    const qi = $('#q', el);
    qi.oninput = () => { clearTimeout(qi._t); qi._t = setTimeout(() => { f.q = qi.value; draw().then(() => { const n = $('#q', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 350); };
    for (const [id, k] of [['#ay', 'academicYear'], ['#from', 'from'], ['#to', 'to'], ['#cat', 'categoryId'], ['#st', 'status']]) $(id, el).onchange = (e) => { f[k] = e.target.value; draw(); };
    $('#pend', el).onchange = (e) => { f.pending = e.target.checked; draw(); };
    $$('[data-exp]', el).forEach((b) => { b.onclick = () => exportReport(f.pending ? 'pending_inward' : 'inward', { ...f, categoryId: f.categoryId ? Number(f.categoryId) : null }, b.dataset.exp); });
  };
  loading(el);
  await draw();
  return { title: 'Inward Register', refresh: draw };
}

async function renderEntry(el, id) {
  let rec = id ? await api('inward', 'get', id) : null;
  let dirty = false;
  const draw = () => {
    const v = rec || { date_received: today(), received_through: 'By Hand', status: 'Received' };
    el.innerHTML = `<div class="page-head"><div><h1>${rec ? `Inward ${esc(rec.inward_no)}` : 'Add Inward Entry'}</h1><p>${rec ? `${badge(rec.status)} ${rec.deleted_at ? badge('Deleted', 'err') : ''} · recorded ${fmtDateTime(rec.created_at)}` : 'The inward number is assigned automatically when you save.'}</p></div>
      <div class="actions">${rec ? `<button class="btn accent" id="b-reply">${icon('pen')}Draft reply letter</button>` : ''}</div></div>
      <div class="split"><div>
        <div class="card"><div class="hd"><h3>${icon('inbox')} Letter received</h3></div><div class="bd" id="frm">${formHtml([
          { name: 'date_received', label: 'Date received', type: 'date', required: true },
          { name: 'letter_date', label: 'Date on the letter', type: 'date' },
          { name: 'sender_office', label: 'Department / office', required: true, placeholder: 'e.g. Divisional Board' },
          { name: 'sender_name', label: 'Sender name' },
          { name: 'sender_designation', label: 'Sender designation' },
          { name: 'reference_no', label: 'Their reference / letter no.' },
          { name: 'subject', label: 'Subject', required: true, full: true },
          { name: 'summary', label: 'Short summary', type: 'textarea', rows: 2, full: true },
          { name: 'category_id', label: 'Category', type: 'select', options: [['', '— Select —'], ...catOptions(!!rec)] },
          { name: 'received_through', label: 'Received through', type: 'select', options: state.info.inwardChannels.map((c) => [c, c]) },
          { type: 'section', label: 'Action' },
          { name: 'assigned_to', label: 'Assigned staff member' },
          { name: 'status', label: 'Status', type: 'select', options: state.info.inwardStatuses.map((s) => [s, s]) },
          { name: 'action_required', label: 'Action required', type: 'textarea', rows: 2, full: true },
          { name: 'reply_required', label: 'Reply required', type: 'checkbox' },
          { name: 'reply_deadline', label: 'Reply deadline', type: 'date' },
          { name: 'remarks', label: 'Remarks', type: 'textarea', rows: 2, full: true },
        ], v)}</div></div>
      </div><div>
        <div class="card"><div class="hd"><h3>Actions</h3></div><div class="bd"><div class="wf-actions">
          <button class="btn primary" id="b-save">${icon('save')}${rec ? 'Save changes' : 'Save & assign inward number'}</button>
          ${rec ? `<button class="btn" id="b-scan">${icon('upload')}Attach scan / document</button>` : ''}
          ${rec && !rec.deleted_at ? `<button class="btn danger" id="b-del">${icon('trash')}Delete entry</button>` : ''}
          ${rec && rec.deleted_at ? `<button class="btn" id="b-restore">${icon('refresh')}Restore entry</button>` : ''}
        </div></div></div>
        ${rec ? `<div class="card"><div class="hd"><h3>${icon('folder')} Scanned documents</h3></div><div class="bd"><div class="files">${rec.attachments.map((a) => fileRow(a.abs_path, { label: a.label, sub: a.exists ? fmtDateTime(a.created_at) : 'FILE MISSING' })).join('') || '<div class="dropzone" id="dz">Drop a scanned PDF or image here, or click “Attach scan”.</div>'}</div></div></div>
        <div class="card"><div class="hd"><h3>${icon('link')} Correspondence history</h3></div><div class="bd">
          <div class="timeline"><div class="ev"><div class="when">${fmtDate(rec.date_received)}</div><div><b>Received</b> ${esc(rec.inward_no)} from ${esc(rec.sender_office || rec.sender_name || '')}</div></div>
          ${rec.replies.map((r) => `<div class="ev"><div class="when">${fmtDate(r.letter_date)}</div><div><b>Reply</b> <a href="#/letter/${r.id}">${esc(r.outward_no || 'Draft')}</a> – ${esc(r.subject)} ${badge(r.status)}${r.pdf_abs ? ` <button class="btn sm" data-open="${esc(r.pdf_abs)}">PDF</button>` : ''}</div></div>`).join('')}</div>
          ${rec.replies.length ? '' : '<p class="muted">No reply linked yet.</p>'}</div></div>` : ''}
      </div></div>`;
    $$('#frm [name]', el).forEach((x) => x.addEventListener('input', () => { dirty = true; }));
    $('#b-save', el).onclick = save;
    const on = (s, fn) => { const b = $(s, el); if (b) b.onclick = fn; };
    on('#b-reply', async () => { if (dirty && !(await save())) return; location.hash = `#/letter/new?inward=${rec.id}`; });
    on('#b-scan', async () => {
      const files = await api('sys', 'pickFile', { title: 'Choose scanned letter', multi: true, filters: [{ name: 'Scans & documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff', 'docx', 'xlsx'] }] });
      if (!files) return;
      for (const f of files) { const r = await tryApi('inward', 'addAttachment', rec.id, f); if (r) rec = r; }
      draw();
    });
    on('#b-del', async () => { const reason = await promptBox('Delete inward entry', 'Reason', { hint: 'The entry can be restored from Archive & Search → Deleted records.' }); if (!reason) return; if ((await tryApi('inward', 'softDelete', rec.id, reason)) !== undefined) location.hash = '#/inward'; });
    on('#b-restore', async () => { const r = await tryApi('inward', 'restore', rec.id); if (r) { rec = r; draw(); } });
    const dz = $('#dz', el);
    if (dz) {
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = async (e) => { e.preventDefault(); for (const file of e.dataTransfer.files) { const r = await tryApi('inward', 'addAttachment', rec.id, window.edudesk.pathForFile(file)); if (r) rec = r; } draw(); };
    }
    wireFiles(el);
  };
  async function save() {
    if (!validateRequired($('#frm', el))) return false;
    const data = readForm($('#frm', el));
    data.category_id = data.category_id ? Number(data.category_id) : null;
    if (rec) data.id = rec.id;
    const r = await tryApi('inward', 'save', data);
    if (!r) return false;
    const isNew = !rec;
    rec = r; dirty = false;
    toast(isNew ? `Saved as inward ${r.inward_no}.` : 'Saved.', 'success');
    if (isNew) history.replaceState(null, '', `#/inward/${r.id}`);
    draw();
    return true;
  }
  draw();
  return {
    title: rec ? `Inward ${rec.inward_no}` : 'Add Inward Entry', crumb: 'Inward Register',
    canLeave: async () => !dirty || confirmBox('Unsaved changes', 'Leave without saving?', { okLabel: 'Leave', kind: 'danger' }),
  };
}
