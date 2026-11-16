import { icon } from '../icons.js';
import { api, esc, fmtDate, fmtDateTime, badge, table, loading, $ } from '../lib.js';

export async function render(el, route) {
  let status = route.query.status || '';
  let q = '';
  const draw = async () => {
    const statuses = status ? [status] : ['Draft', 'Awaiting Approval', 'Approved', 'Generated'];
    const rows = (await api('letters', 'list', { statuses, q })).filter((r) => r.archive_status !== 'Complete');
    el.innerHTML = `<div class="page-head"><div><h1>Drafts</h1><p>Letters that are not yet finalized. Drafts do not use outward numbers until the Word document is generated.</p></div>
      <div class="actions"><a class="btn accent" href="#/letter/new">${icon('plus')}New Letter</a></div></div>
      <div class="card"><div class="filters">
        <div class="field wide"><label>Search</label><input class="input" id="q" value="${esc(q)}" placeholder="Subject, recipient, summary…"></div>
        <div class="field"><label>Status</label><select class="input" id="st">${[['', 'All unfinished'], ['Draft', 'Draft'], ['Awaiting Approval', 'Awaiting Approval'], ['Approved', 'Approved'], ['Generated', 'Word document generated']].map(([v, l]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div><div id="t"></div></div>`;
    table($('#t', el), {
      rows, onRow: (r) => { location.hash = `#/letter/${r.id}`; }, empty: 'No drafts. Create a new letter to get started.', sortKey: 'updated',
      columns: [
        { key: 'subject', label: 'Subject', render: (r) => `<b>${esc(r.subject || '(no subject yet)')}</b><div class="sub">${esc(r.category_name || '')}${r.subcategory_name ? ' › ' + esc(r.subcategory_name) : ''}</div>` },
        { key: 'recipient_office', label: 'Recipient', render: (r) => esc([r.recipient_designation, r.recipient_office].filter(Boolean).join(', ')) },
        { key: 'letter_date', label: 'Letter date', render: (r) => fmtDate(r.letter_date), cls: 'nowrap' },
        { key: 'outward_no', label: 'Outward No.', render: (r) => (r.outward_no ? `<span class="num">${esc(r.outward_no)}</span>` : '<span class="muted">—</span>'), cls: 'nowrap' },
        { key: 'status', label: 'Status', render: (r) => badge(r.status) + (r.archive_status === 'Incomplete' ? ' ' + badge('PDF pending', 'err') : '') },
        { key: 'updated', label: 'Last change', sortValue: (r) => r.updated_at || r.created_at, render: (r) => `<span class="muted nowrap">${fmtDateTime(r.updated_at || r.created_at)}</span>` },
      ],
    });
    const qi = $('#q', el);
    qi.oninput = () => { clearTimeout(qi._t); qi._t = setTimeout(() => { q = qi.value; draw().then(() => { const n = $('#q', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 300); };
    $('#st', el).onchange = (e) => { status = e.target.value; draw(); };
  };
  loading(el);
  await draw();
  return { title: 'Drafts', refresh: draw };
}
