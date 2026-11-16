import { icon } from '../icons.js';
import { api, esc, fmtDate, badge, state, loading, fmtDateTime } from '../lib.js';

export const title = 'Dashboard';

export async function render(el) {
  const draw = async () => {
    const s = await api('dashboard', 'stats');
    const c = state.settings.college;
    const tile = (tone, ic, v, l, href) => `<div class="card stat tone-${tone}" data-href="${href}"><div class="ic">${icon(ic)}</div><div><div class="v">${v}</div><div class="l">${esc(l)}</div></div></div>`;
    const months = s.monthly;
    const max = Math.max(1, ...months.map((m) => m.n));
    el.innerHTML = `
      <div class="page-head"><div><h1>${esc(c.name || 'Welcome to EduDesk')}</h1><p>Academic year ${esc(s.academicYear)} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
        <div class="actions">
          <a class="btn" href="#/inward/new">${icon('inbox')}Add Inward Entry</a>
          <a class="btn" href="#/udise">${icon('form')}UDISE S02 / S03</a>
          <a class="btn accent" href="#/letter/new">${icon('pen')}Create New Letter</a>
        </div></div>
      ${!c.name ? `<div class="callout warn">${icon('alert')}<div>Your college profile is not set up yet. <a href="#/settings/college">Enter the college details</a> so they appear on letters and UDISE forms.</div></div><br>` : ''}
      ${s.archiveIncomplete ? `<div class="callout err">${icon('alert')}<div><b>${s.archiveIncomplete} letter(s) have an incomplete archive</b> (PDF not created). <a href="#/outward?archive=Incomplete">Open them and retry PDF generation.</a></div></div><br>` : ''}
      ${!s.lastBackup ? `<div class="callout warn">${icon('shield')}<div>No verified backup exists yet. <a href="#/settings/backup">Create a backup now</a> (an external drive is recommended).</div></div><br>` : ''}
      <div class="grid g4">
        ${tile('blue', 'outbox', s.totalOutward, 'Total outward letters', '#/outward')}
        ${tile('slate', 'inbox', s.totalInward, 'Total inward letters', '#/inward')}
        ${tile('green', 'send', s.dispatchedThisMonth, 'Dispatched this month', '#/dispatch')}
        ${tile('slate', 'drafts', s.drafts, 'Drafts in progress', '#/drafts')}
        ${tile('amber', 'clock', s.pendingApprovals, 'Pending approvals', '#/drafts?status=Awaiting Approval')}
        ${tile('violet', 'truck', s.readyForDispatch, 'Ready for dispatch', '#/dispatch')}
        ${tile('amber', 'check', s.ackPending, 'Acknowledgements pending', '#/dispatch?tab=ack')}
        ${tile(s.overdueReplies ? 'red' : 'blue', 'alert', `${s.pendingInward}${s.overdueReplies ? ` <small style="font-size:13px;color:var(--err)">(${s.overdueReplies} overdue)</small>` : ''}`, 'Pending inward actions', '#/inward?pending=1')}
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="hd"><h3>Recently created letters</h3><div class="actions"><a class="btn sm ghost" href="#/outward">Outward register →</a></div></div>
          <div class="bd" style="padding:4px 16px">${s.recentLetters.length ? s.recentLetters.map((l) => `<div class="list-row" data-href="#/letter/${l.id}">
            <div class="main-t"><div><b class="num" style="color:var(--brand)">${esc(l.outward_no || 'Draft')}</b> · ${esc(l.subject || '(no subject)')}</div><div class="muted" style="font-size:12px">${esc([l.recipient_designation, l.recipient_office].filter(Boolean).join(', '))} · ${fmtDate(l.letter_date)}</div></div>
            ${badge(l.status)}</div>`).join('') : `<div class="empty">${icon('pen')}<h4>No letters yet</h4><a href="#/letter/new">Create the first letter</a></div>`}</div></div>
        <div class="card"><div class="hd"><h3>Recently received letters</h3><div class="actions"><a class="btn sm ghost" href="#/inward">Inward register →</a></div></div>
          <div class="bd" style="padding:4px 16px">${s.recentInward.length ? s.recentInward.map((i) => `<div class="list-row" data-href="#/inward/${i.id}">
            <div class="main-t"><div><b class="num" style="color:var(--brand)">${esc(i.inward_no)}</b> · ${esc(i.subject)}</div><div class="muted" style="font-size:12px">${esc(i.sender_office || i.sender_name || '')} · received ${fmtDate(i.date_received)}${i.reply_deadline ? ` · reply by ${fmtDate(i.reply_deadline)}` : ''}</div></div>
            ${badge(i.status)}</div>`).join('') : `<div class="empty">${icon('inbox')}<h4>No inward letters yet</h4><a href="#/inward/new">Add an inward entry</a></div>`}</div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><div class="hd"><h3>Outward letters this academic year</h3></div><div class="bd">
          ${months.length ? `<div class="bars">${months.map((m) => `<div class="b" style="height:${Math.round((m.n / max) * 100)}%"><span>${m.n}</span></div>`).join('')}</div>
          <div class="bars-l">${months.map((m) => `<span>${esc(new Date(m.m + '-01').toLocaleDateString('en-IN', { month: 'short' }))}</span>`).join('')}</div>` : '<div class="muted">No outward letters this academic year yet.</div>'}
        </div></div>
        <div class="card"><div class="hd"><h3>Overdue replies</h3></div><div class="bd" style="padding:4px 16px">
          ${s.overdueList.length ? s.overdueList.map((i) => `<div class="list-row" data-href="#/inward/${i.id}"><div class="main-t"><div><b>${esc(i.inward_no)}</b> · ${esc(i.subject)}</div><div class="muted" style="font-size:12px">${esc(i.sender_office || '')}</div></div>${badge('Due ' + fmtDate(i.reply_deadline), 'err')}</div>`).join('') : `<div class="empty">${icon('ok')}<h4>No overdue replies</h4></div>`}
          <div class="muted" style="font-size:12px;padding:10px 0">${s.lastBackup ? `Last verified backup: ${fmtDateTime(s.lastBackup.created_at)}` : 'No verified backup yet.'}</div>
        </div></div>
      </div>`;
    el.querySelectorAll('[data-href]').forEach((x) => { x.onclick = () => { location.hash = x.dataset.href; }; });
  };
  loading(el);
  await draw();
  return { title: 'Dashboard', refresh: draw };
}
