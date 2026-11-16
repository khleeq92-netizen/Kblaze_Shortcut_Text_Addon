import { icon } from '../icons.js';
import { api, tryApi, esc, fmtDate, badge, table, loading, $, toast } from '../lib.js';
import { dispatchDialog } from './letter.js';
import { exportReport } from './outward.js';

const TABS = [
  ['ready', 'Ready for dispatch', (r) => r.dispatch_status === 'Ready for Dispatch' && r.status !== 'Cancelled'],
  ['sent', 'Dispatched / in transit', (r) => ['Dispatched'].includes(r.dispatch_status)],
  ['ack', 'Acknowledgement pending', (r) => r.status !== 'Cancelled' && !r.ack_received_date && (r.ack_status === 'Pending' || ['Delivered', 'Acknowledgement Pending'].includes(r.dispatch_status))],
  ['done', 'Delivered / closed', (r) => ['Delivered', 'Closed'].includes(r.dispatch_status) && (r.ack_received_date || r.dispatch_status === 'Closed')],
  ['all', 'All', () => true],
];

export async function render(el, route) {
  let tab = route.query.tab || 'ready';
  const draw = async () => {
    const rep = await api('reports', 'run', 'outward', { sort: 'date_desc' });
    const rows = rep.rows.filter((r) => r.archive_status === 'Complete');
    const flt = (TABS.find((t) => t[0] === tab) || TABS[0])[2];
    const list = rows.filter(flt);
    el.innerHTML = `<div class="page-head"><div><h1>Dispatch Management</h1><p>Record how each finalized letter was sent, track delivery and acknowledgements.</p></div>
      <div class="actions"><button class="btn" id="b-rep">${icon('download')}Dispatch report (Excel)</button><button class="btn" id="b-ackrep">${icon('download')}Pending acknowledgements</button></div></div>
      <div class="tabs">${TABS.map(([k, l, fn]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${esc(l)} <span class="badge plain">${rows.filter(fn).length}</span></button>`).join('')}</div>
      <div class="card"><div id="t"></div></div>`;
    table($('#t', el), {
      rows: list, empty: 'Nothing here.', onRow: (r) => { location.hash = `#/letter/${r.id}`; },
      columns: [
        { key: 'outward_no', label: 'Outward No.', cls: 'num' },
        { key: 'letter_date', label: 'Date', render: (r) => fmtDate(r.letter_date), cls: 'nowrap' },
        { key: 'recipient', label: 'To', render: (r) => esc(r.recipient) },
        { key: 'subject', label: 'Subject', render: (r) => esc(r.subject) },
        { key: 'dispatch_mode', label: 'Mode', render: (r) => esc(r.dispatch_mode || '—') + (r.tracking_no ? `<div class="sub">${esc(r.tracking_no)}${r.courier_service ? ' · ' + esc(r.courier_service) : ''}</div>` : '') },
        { key: 'dispatch_date', label: 'Dispatched', render: (r) => fmtDate(r.dispatch_date) || '—', cls: 'nowrap' },
        { key: 'dispatch_status', label: 'Status', render: (r) => badge(r.dispatch_status) + (r.ack_status ? `<div style="margin-top:4px">${badge('Ack. ' + r.ack_status, r.ack_status === 'Received' ? 'ok' : 'warn')}</div>` : '') },
        { key: 'act', label: '', sort: false, render: (r) => `<button class="btn sm" data-d="${r.id}">${icon('truck')}Update</button>` },
      ],
    });
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
    el.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async (e) => { e.stopPropagation(); const l = await api('letters', 'get', Number(b.dataset.d)); if (await dispatchDialog(l)) draw(); }; });
    $('#b-rep', el).onclick = () => exportReport('dispatch', {}, 'xlsx');
    $('#b-ackrep', el).onclick = () => exportReport('pending_ack', {}, 'xlsx');
  };
  loading(el);
  await draw();
  return { title: 'Dispatch Management', refresh: draw };
}
