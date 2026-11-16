import { icon } from '../icons.js';
import { api, tryApi, esc, fmtDate, badge, table, loading, $, $$, state, catOptions, toast, wireFiles } from '../lib.js';

export async function render(el, route) {
  const years = await api('search', 'academicYears');
  const f = { q: route.query.q || '', type: 'all', from: '', to: '', dateField: 'letter', academicYear: '', categoryId: '', status: '' };
  const draw = async () => {
    const [rows, recent] = await Promise.all([api('search', 'run', { ...f, categoryId: f.categoryId ? Number(f.categoryId) : null }), api('search', 'recent')]);
    el.innerHTML = `<div class="page-head"><div><h1>Archive & Search</h1><p>Find any letter sent or received – by number, subject, recipient, sender, summary, reference, date or academic year.</p></div>
      <div class="actions"><button class="btn" id="b-docs">${icon('folder')}Open documents folder</button></div></div>
      <div class="card"><div class="filters">
        <div class="field wide"><label>Search</label><input class="input" id="q" value="${esc(f.q)}" placeholder="e.g. OUT/015, mark memo, Divisional Board, 2026-27"></div>
        <div class="field"><label>Records</label><select class="input" data-f="type">${[['all', 'Outward + inward'], ['outward', 'Outward letters'], ['inward', 'Inward letters'], ['drafts', 'Drafts'], ['deleted', 'Deleted records (recover)']].map(([v, l]) => `<option value="${v}" ${v === f.type ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Academic year</label><select class="input" data-f="academicYear"><option value="">All</option>${years.map((y) => `<option ${y === f.academicYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
        <div class="field"><label>Date of</label><select class="input" data-f="dateField"><option value="letter">Letter / received</option><option value="dispatch" ${f.dateField === 'dispatch' ? 'selected' : ''}>Dispatch</option></select></div>
        <div class="field"><label>From</label><input type="date" class="input" data-f="from" value="${f.from}"></div>
        <div class="field"><label>To</label><input type="date" class="input" data-f="to" value="${f.to}"></div>
        <div class="field"><label>Category</label><select class="input" data-f="categoryId"><option value="">All</option>${catOptions(true).map(([v, l]) => `<option value="${v}" ${String(v) === String(f.categoryId) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      </div>
      ${recent.length ? `<div style="padding:10px 14px;border-bottom:1px solid var(--border)" class="inline"><span class="muted" style="font-size:12px">Recent:</span><div class="chips">${recent.map((r) => `<span class="chip" data-q="${esc(r.q)}">${esc(r.q)}</span>`).join('')}</div><a style="font-size:12px" id="clr">clear</a></div>` : ''}
      <div id="t"></div><div class="muted" style="padding:10px 14px;font-size:12px">${rows.length} result(s)${rows.length >= 300 ? ' – showing the first 300, refine the search' : ''}</div></div>`;
    table($('#t', el), {
      rows, empty: f.q ? `Nothing found for “${f.q}”.` : 'No records.',
      onRow: (r) => { location.hash = r.type === 'inward' ? `#/inward/${r.id}` : `#/letter/${r.id}`; },
      columns: [
        { key: 'type', label: 'Type', render: (r) => badge(r.type === 'inward' ? 'Inward' : r.type === 'draft' ? 'Draft' : 'Outward', r.type === 'inward' ? 'violet' : r.type === 'draft' ? '' : 'info') },
        { key: 'number', label: 'Number', cls: 'num', render: (r) => esc(r.number || '—') },
        { key: 'date', label: 'Date', cls: 'nowrap', render: (r) => fmtDate(r.date) },
        { key: 'party', label: 'To / From', render: (r) => esc(r.party) },
        { key: 'subject', label: 'Subject', render: (r) => `<b>${esc(r.subject || '')}</b>${r.summary ? `<div class="sub">${esc(r.summary)}</div>` : ''}${r.reference ? `<div class="sub">Ref: ${esc(r.reference)}</div>` : ''}` },
        { key: 'category', label: 'Category', render: (r) => esc(r.category || '') },
        { key: 'status', label: 'Status', render: (r) => badge(r.status) + (r.deleted ? ' ' + badge('Deleted', 'err') : '') },
        { key: 'files', label: '', sort: false, cls: 'nowrap', render: (r) => (r.deleted ? `<button class="btn sm" data-restore="${r.type}:${r.id}">${icon('refresh')}Recover</button>` : `${r.docx ? `<button class="btn sm" data-open="${esc(r.docx)}" title="Open DOCX">${icon('word')}</button>` : ''} ${r.pdf ? `<button class="btn sm" data-open="${esc(r.pdf)}" title="Open PDF">${icon('pdf')}</button>` : ''} ${r.folder ? `<button class="btn sm ghost" data-folder="${esc(r.pdf || r.docx || '')}" title="Open archive folder">${icon('folder')}</button>` : ''}`) },
      ],
    });
    wireFiles(el);
    const qi = $('#q', el);
    qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length);
    qi.oninput = () => { clearTimeout(qi._t); qi._t = setTimeout(() => { f.q = qi.value; draw(); }, 400); };
    $$('[data-f]', el).forEach((i) => { i.onchange = () => { f[i.dataset.f] = i.value; draw(); }; });
    $$('[data-q]', el).forEach((c) => { c.onclick = () => { f.q = c.dataset.q; draw(); }; });
    const clr = $('#clr', el); if (clr) clr.onclick = async () => { await api('search', 'clearRecent'); draw(); };
    $('#b-docs', el).onclick = () => tryApi('sys', 'openFolder', state.info.documentsRoot);
    $$('[data-restore]', el).forEach((b) => { b.onclick = async (e) => {
      e.stopPropagation();
      const [type, id] = b.dataset.restore.split(':');
      const r = await tryApi(type === 'inward' ? 'inward' : 'letters', 'restore', Number(id));
      if (r) { toast('Record recovered.', 'success'); draw(); }
    }; });
  };
  loading(el);
  await draw();
  return { title: 'Archive & Search', refresh: draw };
}
