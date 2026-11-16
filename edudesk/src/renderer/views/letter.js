// Smart Letter Creator + letter lifecycle (Word integration, finalize & archive, dispatch, revisions).
import { icon } from '../icons.js';
import {
  api, tryApi, state, esc, $, $$, fmtDate, fmtDateTime, badge, toast, busy, modal, confirmBox, promptBox, formHtml, readForm,
  catOptions, subOptions, options, fileRow, wireFiles, today, loading, baseName,
} from '../lib.js';

const EDITABLE = ['Draft', 'Awaiting Approval', 'Approved', 'Generated'];
const LANGS = [['en', 'English'], ['mr', 'Marathi (मराठी)'], ['hi', 'Hindi (हिंदी)']];

export async function render(el, route) {
  let letter = null;
  let dirty = false;
  let poll = null;
  let templates = [];
  let recipients = [];

  const id = route.parts[1] && route.parts[1] !== 'new' ? Number(route.parts[1]) : null;
  loading(el);
  [templates, recipients] = await Promise.all([api('templates', 'list', {}), api('recipients', 'list', {})]);
  if (id) letter = await api('letters', 'get', id);
  else if (route.query.copy) letter = await api('letters', 'copyFrom', Number(route.query.copy));
  else if (route.query.inward) letter = await api('inward', 'createReply', Number(route.query.inward));
  if (letter && !id) { history.replaceState(null, '', `#/letter/${letter.id}`); }

  const wf = state.settings.workflow;

  function values() {
    const v = letter ? { ...letter } : {
      letter_date: today(), language: state.settings.letter.language,
      signatory_name: state.settings.letter.signatoryName || state.settings.college.principal_name,
      signatory_designation: state.settings.letter.signatoryDesignation || state.settings.college.principal_designation,
      template_id: route.query.template || state.settings.letter.defaultTemplateId || '',
    };
    return v;
  }

  function editable() { return !letter || (EDITABLE.includes(letter.status) && !letter.deleted_at); }

  function templateOptions(catId) {
    const list = templates.filter((t) => !catId || !t.category_id || String(t.category_id) === String(catId));
    return [['', '— Select template —'], ...list.map((t) => [t.id, `${t.name}${t.is_sample ? ' (sample)' : ''}${t.language !== 'en' ? ` [${t.language}]` : ''}`])];
  }

  function draw() {
    const v = values();
    const ro = !editable();
    const title = letter ? (letter.outward_no ? `Letter ${letter.outward_no}` : `Draft #${letter.id}`) : 'Create Letter';
    el.innerHTML = `
      <div class="page-head"><div><h1>${esc(title)}</h1><p>${letter ? `${badge(letter.status)} ${letter.archive_status !== 'None' ? badge(`Archive: ${letter.archive_status}`, letter.archive_status === 'Complete' ? 'ok' : 'err') : ''} ${letter.dispatch_status ? badge(letter.dispatch_status) : ''} ${letter.deleted_at ? badge('Deleted', 'err') : ''}` : 'Fill in the details, generate the Word document, review it in Word, then Finalize & Archive.'}</p></div>
        <div class="actions">${letter ? `<button class="btn" id="b-copy">${icon('copy')}Copy as new letter</button><button class="btn" id="b-history">${icon('history')}History</button>` : ''}</div></div>
      <div class="split">
        <div>
          ${letter && letter.extra && letter.extra.workStale && letter.status === 'Generated' ? `<div class="callout warn">${icon('alert')}<div>The letter details were changed after the Word document was generated. Click <b>Regenerate Word Document</b> before finalizing (your Word edits will be kept as a copy).</div></div><br>` : ''}
          ${letter && letter.pdf_status === 'Failed' ? `<div class="callout err">${icon('alert')}<div><b>PDF generation failed.</b> The final Word document is safely archived and the outward number is kept. ${esc(letter.pdf_error || '')}<br>Fix the cause (for example close Word dialogs or install LibreOffice) and click <b>Retry PDF Generation</b>.</div></div><br>` : ''}
          ${letter && letter.status === 'Cancelled' ? `<div class="callout err">${icon('ban')}<div><b>Cancelled</b> on ${fmtDateTime(letter.cancelled_at)} — ${esc(letter.cancel_reason || '')}. The outward number ${esc(letter.outward_no)} stays in the register.</div></div><br>` : ''}
          <div class="card"><div class="hd"><h3>${icon('template')} Classification & template</h3></div><div class="bd">
            ${formHtml([
              { name: 'category_id', label: 'Category', type: 'select', options: [['', '— Select category —'], ...catOptions(!!letter)], required: true },
              { name: 'subcategory_id', label: 'Subcategory', type: 'select', options: [['', '— None —'], ...subOptions(v.category_id, !!letter)] },
              { name: 'template_id', label: 'Letter template', type: 'select', options: templateOptions(v.category_id), required: true, hint: 'The template holds your letterhead and layout. Manage templates under Templates.' },
              { name: 'language', label: 'Letter language', type: 'select', options: LANGS },
            ], v)}
          </div></div>
          <div class="card"><div class="hd"><h3>${icon('users')} Recipient</h3><div class="actions">${ro ? '' : `<button class="btn sm" id="b-pick-rec">${icon('search')}Choose from directory</button><button class="btn sm ghost" id="b-save-rec" title="Save these recipient details to the directory">${icon('save')}Save to directory</button>`}</div></div><div class="bd">
            ${formHtml([
              { name: 'recipient_designation', label: 'Designation', placeholder: 'e.g. Block Education Officer' },
              { name: 'recipient_name', label: 'Recipient name', placeholder: 'Optional' },
              { name: 'recipient_office', label: 'Office name', placeholder: 'e.g. Panchayat Samiti, Sample Taluka' },
              { name: 'recipient_department', label: 'Department' },
              { name: 'recipient_address', label: 'Complete address', type: 'textarea', rows: 2, full: true },
            ], v)}
          </div></div>
          <div class="card"><div class="hd"><h3>${icon('pen')} Letter</h3><div class="actions">${ro ? '' : `<button class="btn sm" id="b-tpl-text">${icon('template')}Use template text</button><button class="btn sm" id="b-snippet">${icon('copy')}Insert saved text</button><button class="btn sm ghost" id="b-save-snippet">${icon('save')}Save text for reuse</button>`}</div></div><div class="bd">
            ${formHtml([
              { name: 'subject', label: 'Subject', required: true, full: true },
              { name: 'letter_date', label: 'Letter date', type: 'date', required: true },
              { name: 'reference_no', label: 'Reference no. (if any)', placeholder: 'Their letter no. / GR no.' },
              { name: 'body', label: 'Letter body', type: 'textarea', rows: 10, full: true, cls: 'body', hint: 'English, Marathi and Hindi are supported. Each new line becomes a new paragraph. Final formatting can be done in Microsoft Word.' },
              { name: 'summary', label: 'Short summary (for the outward register)', type: 'textarea', rows: 2, full: true, hint: 'One or two lines describing the purpose of the letter – shown in registers and search.' },
              { name: 'enclosures', label: 'Enclosures (one per line)', type: 'textarea', rows: 3 },
              { name: 'remarks', label: 'Remarks (internal)', type: 'textarea', rows: 3 },
              { name: 'signatory_name', label: 'Signatory name' },
              { name: 'signatory_designation', label: 'Signatory designation' },
            ], v)}
            ${letter && letter.inward ? `<div class="callout info" style="margin-top:12px">${icon('link')}<div>Reply to inward letter <a href="#/inward/${letter.inward.id}"><b>${esc(letter.inward.inward_no)}</b></a> – ${esc(letter.inward.subject)} (${esc(letter.inward.sender_office || '')})</div></div>` : ''}
          </div></div>
          ${letter ? detailCards() : ''}
        </div>
        <div>${workflowPanel()}</div>
      </div>`;
    if (ro) $$('.split > div:first-child [name]', el).forEach((x) => { if (!x.closest('.dispatch-form')) { x.setAttribute('disabled', ''); } });
    bind();
  }

  function stepsHtml() {
    const l = letter;
    const st = (cls, n, t, d) => `<div class="step ${cls}"><div class="dot">${cls === 'done' ? '✓' : cls === 'error' ? '!' : n}</div><div><div class="t">${esc(t)}</div><div class="d">${d}</div></div></div>`;
    if (!l) return st('current', 1, 'Draft', 'Fill in the letter and save it as a draft.');
    const generated = !!(l.work_docx_path || l.docx_path);
    const archived = l.archive_status === 'Complete';
    const steps = [st('done', 1, 'Draft saved', `Created ${fmtDateTime(l.created_at)}`)];
    if (wf.approvalRequired) {
      const appr = ['Approved', 'Generated', 'Finalized', 'Dispatched', 'Delivered', 'Closed'].includes(l.status) || archived;
      steps.push(st(appr ? 'done' : l.status === 'Awaiting Approval' ? 'current' : '', 2, 'Approval', appr ? `Approved${l.approved_by ? ' by ' + esc(l.approved_by) : ''}` : l.status === 'Awaiting Approval' ? 'Waiting for approval' : 'Send the draft for approval'));
    }
    steps.push(st(generated ? 'done' : 'current', steps.length + 1, 'Word document', generated ? `Outward No. <b>${esc(l.outward_no || '(assigned on finalize)')}</b>` : 'Generate the editable Word (.docx) document'));
    steps.push(st(archived ? 'done' : generated ? 'current' : '', steps.length + 1, 'Review in Word', archived ? 'Reviewed' : '<span id="work-status">Open in Word, make corrections, save and close.</span>'));
    steps.push(st(archived ? 'done' : l.archive_status === 'Incomplete' ? 'error' : '', steps.length + 1, 'Finalize & Archive', archived ? `DOCX + PDF archived ${fmtDateTime(l.finalized_at)}` : l.archive_status === 'Incomplete' ? 'DOCX saved – PDF pending' : 'Saves the final DOCX and a PDF made from it'));
    const disp = ['Dispatched', 'Delivered', 'Closed'].includes(l.dispatch_status);
    steps.push(st(disp ? 'done' : archived ? 'current' : '', steps.length + 1, 'Dispatch', l.dispatch_status ? esc(l.dispatch_status) + (l.dispatch_date ? ` · ${fmtDate(l.dispatch_date)}` : '') : 'Record how and when it was sent'));
    return steps.join('');
  }

  function workflowPanel() {
    const l = letter;
    const b = (id, label, ic, kind = '', extra = '') => `<button class="btn ${kind}" id="${id}" ${extra}>${icon(ic)}${esc(label)}</button>`;
    let actions = '';
    if (!l || EDITABLE.includes(l.status)) {
      if (!l || l.status !== 'Generated') {
        actions += b('b-save', 'Save Draft', 'save', 'primary') + b('b-preview', 'Preview', 'eye');
        if (l && wf.approvalRequired && l.status === 'Draft') actions += b('b-submit', 'Send for Approval', 'send');
        if (l && ['Awaiting Approval', 'Draft'].includes(l.status) && wf.approvalRequired) actions += b('b-approve', 'Approve', 'check', 'success');
        if (l && ['Awaiting Approval', 'Approved'].includes(l.status) && wf.approvalRequired) actions += b('b-sendback', 'Send Back to Draft', 'refresh');
        actions += b('b-generate', 'Generate Word Document', 'word', 'accent');
      } else {
        actions += b('b-open-word', 'Open in Word', 'word', 'accent') + b('b-finalize', 'Finalize & Archive', 'lock', 'success')
          + b('b-save', 'Save Changes to Details', 'save') + b('b-preview', 'Preview', 'eye') + b('b-generate', 'Regenerate Word Document', 'refresh');
      }
    } else if (l.archive_status === 'Incomplete' || (l.extra && l.extra.revisionDocx)) {
      actions += b('b-retry', 'Retry PDF Generation', 'refresh', 'accent');
    } else if (l.extra && l.extra.revisionPending) {
      actions += `<div class="callout warn">${icon('edit')}<div>Revision v${l.extra.revisionPending.version} in progress: ${esc(l.extra.revisionPending.reason)}</div></div>`
        + b('b-open-word', 'Open Revision in Word', 'word', 'accent') + b('b-finalize', 'Finalize Revision (new version)', 'lock', 'success') + b('b-discard-rev', 'Discard Revision', 'x', 'danger');
    }
    if (l && l.archive_status === 'Complete') {
      actions += (l.docx_abs ? b('b-open-docx', 'Open DOCX', 'word') : '') + b('b-open-pdf', 'Open PDF', 'pdf') + b('b-folder', 'Open Folder', 'folder')
        + b('b-print', 'Print', 'print') + b('b-export-pdf', 'Export PDF Copy', 'download');
      if (l.status !== 'Cancelled') actions += b('b-dispatch', 'Record Dispatch', 'truck', 'accent');
      if (l.status !== 'Cancelled' && !(l.extra && l.extra.revisionPending)) actions += b('b-revise', 'Create Revision', 'edit');
    }
    let more = '';
    if (l && l.outward_no && l.status !== 'Cancelled' && l.archive_status !== 'Complete') more += b('b-override', 'Change Outward Number…', 'edit', 'ghost');
    if (l && l.status !== 'Cancelled' && l.outward_no) more += b('b-cancel', 'Cancel Letter', 'ban', 'danger');
    if (l && !l.outward_no && !l.deleted_at) more += b('b-delete', 'Delete Draft', 'trash', 'danger');
    if (l && l.deleted_at) more += b('b-restore', 'Restore Draft', 'refresh');
    return `<div class="card" style="position:sticky;top:0"><div class="hd"><h3>Workflow</h3>${l && l.outward_no ? `<div class="actions"><span class="badge info plain" style="font-size:13px">${esc(l.outward_no)}</span></div>` : ''}</div>
      <div class="bd"><div class="steps">${stepsHtml()}</div></div>
      <div class="bd" style="border-top:1px solid var(--border)"><div class="wf-actions">${actions}</div>
      ${more ? `<div class="wf-actions" style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)">${more}</div>` : ''}
      <div class="muted" style="font-size:11.5px;margin-top:12px">${!l || EDITABLE.includes(l.status) ? 'Drafts do not use an outward number. The number is reserved when the Word document is generated' + (wf.assignNumberAt === 'finalize' ? ' — currently set to be assigned at finalization.' : '.') : 'Finalized letters are locked. Use “Create Revision” to issue a corrected version; all versions are kept.'}</div>
      </div></div>`;
  }

  function detailCards() {
    const l = letter;
    const files = [];
    if (l.docx_abs) files.push(fileRow(l.docx_abs, { label: `Final Word document${l.current_version > 1 ? ` (v${l.current_version})` : ''}`, actions: ['open', 'print', 'folder'] }));
    if (l.pdf_abs) files.push(fileRow(l.pdf_abs, { label: `Final PDF${l.current_version > 1 ? ` (v${l.current_version})` : ''}`, actions: ['open', 'print', 'folder'] }));
    if (l.work_abs && l.archive_status !== 'Complete') files.push(fileRow(l.work_abs, { label: 'Working Word document (being edited)', actions: ['folder'] }));
    for (const a of l.attachments) files.push(fileRow(a.abs_path, { label: a.label, sub: `${a.kind.replace(/_/g, ' ')} · ${a.exists ? a.abs_path : 'FILE MISSING'}` }));
    const versions = l.versions.length > 1 ? `<div class="card"><div class="hd"><h3>${icon('history')} Versions</h3></div><div class="bd"><table class="tbl"><tr><th>Ver.</th><th>Date</th><th>Reason</th><th>By</th><th>Files</th></tr>
      ${l.versions.map((v) => `<tr><td>v${v.version}</td><td class="nowrap">${fmtDateTime(v.created_at)}</td><td>${esc(v.reason || '')}</td><td>${esc(v.revised_by || '')}</td><td class="nowrap">${v.docx_abs ? `<button class="btn sm" data-open="${esc(v.docx_abs)}">DOCX</button>` : ''} ${v.pdf_abs ? `<button class="btn sm" data-open="${esc(v.pdf_abs)}">PDF</button>` : ''}</td></tr>`).join('')}</table></div></div>` : '';
    const disp = l.archive_status === 'Complete' ? `<div class="card"><div class="hd"><h3>${icon('truck')} Dispatch</h3><div class="actions"><button class="btn sm" id="b-ack">${icon('upload')}Upload acknowledgement</button></div></div><div class="bd">
      <dl class="kv"><dt>Status</dt><dd>${badge(l.dispatch_status || 'Ready for Dispatch')} ${l.ack_status ? badge('Ack. ' + l.ack_status, l.ack_status === 'Received' ? 'ok' : 'warn') : ''}</dd>
      <dt>Dispatch date</dt><dd>${fmtDate(l.dispatch_date) || '—'}</dd><dt>Mode</dt><dd>${esc(l.dispatch_mode || '—')}</dd>
      <dt>Tracking / courier</dt><dd>${esc([l.tracking_no, l.courier_service].filter(Boolean).join(' · ') || '—')}</dd><dt>Delivered</dt><dd>${fmtDate(l.delivered_date) || '—'}</dd>
      <dt>Acknowledgement</dt><dd>${fmtDate(l.ack_received_date) || '—'}</dd><dt>Remarks</dt><dd>${esc(l.dispatch_remarks || '—')}</dd></dl></div></div>` : '';
    const udise = l.udise ? `<div class="card"><div class="hd"><h3>${icon('form')} UDISE ${esc(l.udise.form_type)} submission</h3></div><div class="bd"><p style="margin-top:0">${l.udise.student_count} student(s) · status ${badge(l.udise.status)}</p>
      ${l.archive_status === 'Complete' ? '<div class="muted">The completed forms are archived with the covering letter – see Documents below.</div>' : `<div class="files">${l.udise.items.map((it) => fileRow(it.flat_abs, { label: `Form ${l.udise.form_type} – ${it.student_name}`, sub: 'Submission copy (will be archived with the covering letter)' }) + fileRow(it.editable_abs, { label: `Form ${l.udise.form_type} – ${it.student_name} (editable copy)`, sub: 'Editable copy' })).join('')}</div>`}</div></div>` : '';
    return `${udise}<div class="card"><div class="hd"><h3>${icon('folder')} Documents</h3><div class="actions">${l.status !== 'Cancelled' ? `<button class="btn sm" id="b-attach">${icon('upload')}Add supporting document</button>` : ''}</div></div><div class="bd"><div class="files">${files.join('') || '<div class="muted">No documents yet.</div>'}</div></div></div>${disp}${versions}`;
  }

  // ------------------------------------------------------------ actions
  function collect() {
    const f = readForm($('.split > div:first-child', el));
    const out = {};
    for (const k of ['category_id', 'subcategory_id', 'template_id', 'language', 'recipient_designation', 'recipient_name', 'recipient_office', 'recipient_department', 'recipient_address',
      'subject', 'letter_date', 'reference_no', 'body', 'summary', 'enclosures', 'remarks', 'signatory_name', 'signatory_designation']) if (k in f) out[k] = f[k];
    for (const k of ['category_id', 'subcategory_id', 'template_id']) out[k] = out[k] ? Number(out[k]) : null;
    return out;
  }

  async function save({ quiet = false } = {}) {
    if (!editable()) return letter;
    const data = collect();
    if (letter) data.id = letter.id;
    try {
      letter = await api('letters', 'saveDraft', data);
      dirty = false;
      if (!id && location.hash !== `#/letter/${letter.id}`) history.replaceState(null, '', `#/letter/${letter.id}`);
      if (!quiet) toast('Draft saved.', 'success');
      draw();
      return letter;
    } catch (e) { toast(e.message, 'error'); return null; }
  }

  async function generate() {
    if (dirty || !letter) { if (!(await save({ quiet: true }))) return; }
    let r = await busy('Generating the Word document…', () => tryApi('letters', 'generate', letter.id));
    if (r && r.needsConfirm) {
      if (!(await confirmBox('Replace edited document?', r.message, { okLabel: 'Regenerate', kind: 'danger' }))) return;
      r = await busy('Generating the Word document…', () => tryApi('letters', 'generate', letter.id, { confirmReplace: true }));
    }
    if (!r || !r.ok) return;
    letter = r.letter;
    draw();
    const open = await modal({
      title: 'Word document ready',
      body: `<div class="callout ok">${icon('ok')}<div>Outward number <b>${esc(letter.outward_no || '(assigned at finalization)')}</b> has been reserved and the document <b>${esc(baseName(r.path))}</b> was created.</div></div>
        <p>Next: open it in Microsoft Word, check and correct the letter, <b>save</b> and <b>close</b> Word, then come back and click <b>Finalize &amp; Archive</b>.</p>`,
      actions: [{ label: 'Later', value: false }, { label: 'Open in Word', kind: 'accent', icon: 'word', value: true }],
    });
    if (open) openWord();
  }

  async function openWord() {
    const r = await tryApi('letters', 'openInWord', letter.id);
    if (!r) return;
    if (!r.ok) return toast(r.error, 'error');
    toast(r.warning || 'Opened in Microsoft Word. Save and close Word when you are done, then click Finalize & Archive.', r.warning ? 'warn' : 'info', 8000);
    startPolling();
  }

  async function finalize(confirmUnmodified = false) {
    if (dirty && letter.status === 'Generated') {
      if (!(await confirmBox('Unsaved changes', 'You changed the letter details after generating the Word document. Save them and regenerate the Word document first?', { okLabel: 'Go back' }))) return;
      return;
    }
    let r = await busy('Finalizing: saving the final Word document and creating the PDF…', () => tryApi('letters', 'finalize', letter.id, { confirmUnmodified }));
    if (r && r.needsConfirm) {
      if (!(await confirmBox('No changes saved in Word', r.message, { okLabel: 'Finalize as it is' }))) return;
      r = await busy('Finalizing: saving the final Word document and creating the PDF…', () => tryApi('letters', 'finalize', letter.id, { confirmUnmodified: true }));
    }
    if (!r) { letter = await api('letters', 'get', letter.id); draw(); return; }
    letter = r.letter || (await api('letters', 'get', letter.id));
    draw();
    if (r.ok) showConfirmation(r.confirmation);
    else toast(`The Word document was archived, but the PDF could not be created.\n${r.error}\nUse “Retry PDF Generation”.`, 'error', 15000);
  }

  function showConfirmation(c) {
    modal({
      title: 'Letter finalized and archived', size: 'wide',
      body: `<div class="callout ok">${icon('ok')}<div><b>DOCX saved successfully · PDF saved successfully</b><br>Both files were verified (non-empty, readable, and the PDF was made from this exact Word document).</div></div><br>
        <dl class="kv"><dt>Outward number</dt><dd><b>${esc(c.outward_no)}</b></dd><dt>Letter date</dt><dd>${fmtDate(c.letter_date)}</dd><dt>Recipient</dt><dd>${esc(c.recipient)}</dd><dt>Subject</dt><dd>${esc(c.subject)}</dd>
        <dt>Archive location</dt><dd style="font-family:Consolas,monospace;font-size:12px">${esc(c.folder)}</dd></dl><br>
        <div class="files">${c.docx ? fileRow(c.docx, { actions: [] }) : ''}${fileRow(c.pdf, { actions: [] })}</div>`,
      actions: [
        ...(c.docx ? [{ label: 'Open DOCX', icon: 'word', onClick: () => { tryApi('sys', 'openPath', c.docx); return false; } }] : []),
        { label: 'Open PDF', icon: 'pdf', onClick: () => { tryApi('sys', 'openPath', c.pdf); return false; } },
        { label: 'Open Folder', icon: 'folder', onClick: () => { tryApi('sys', 'openFolder', c.folder); return false; } },
        { label: 'View Outward Register', icon: 'outbox', value: 'reg' },
        { label: 'Done', kind: 'primary', value: null },
      ],
    }).then((v) => { if (v === 'reg') location.hash = '#/outward'; });
  }

  function startPolling() {
    stopPolling();
    const tick = async () => {
      if (!letter || !letter.work_docx_path || letter.archive_status === 'Complete' && !(letter.extra && letter.extra.revisionPending)) return;
      const ws = await api('letters', 'workStatus', letter.id).catch(() => null);
      const s = $('#work-status', el);
      if (!ws || !s) return;
      if (!ws.exists) s.innerHTML = '<span style="color:var(--err)">Working document missing – regenerate it.</span>';
      else if (ws.locked) s.innerHTML = '<span style="color:var(--warn)">● Open in Word. Save and close it before finalizing.</span>';
      else if (ws.modified) s.innerHTML = `<span style="color:var(--ok)">✓ Edits saved in Word (${fmtDateTime(ws.savedAt)}). Ready to finalize.</span>`;
      else s.innerHTML = 'Not edited yet. Open in Word, make corrections, save and close.';
    };
    tick();
    poll = setInterval(tick, 4000);
  }
  function stopPolling() { if (poll) clearInterval(poll); poll = null; }

  async function pickRecipient() {
    const body = document.createElement('div');
    body.innerHTML = `<input class="input" id="rq" placeholder="Search office, designation, name…"><div id="rl" style="margin-top:10px;max-height:50vh;overflow:auto"></div>`;
    const list = (q) => {
      const ql = q.toLowerCase();
      const rows = recipients.filter((r) => !q || [r.office_name, r.designation, r.recipient_name, r.department, r.district].join(' ').toLowerCase().includes(ql));
      $('#rl', body).innerHTML = rows.map((r) => `<div class="list-row" data-id="${r.id}"><div class="main-t"><div><b>${esc(r.designation || r.recipient_name || r.office_name)}</b></div><div class="muted" style="font-size:12px">${esc([r.recipient_name, r.office_name, r.district].filter(Boolean).join(' · '))}</div></div><span class="badge plain">${esc(r.category_name || '')}</span></div>`).join('') || '<div class="empty">No matching recipients. <a href="#/recipients">Add one in the directory</a>.</div>';
    };
    list('');
    $('#rq', body).oninput = (e) => list(e.target.value);
    const chosen = await modal({ title: 'Choose recipient', body, size: 'wide', actions: [{ label: 'Cancel', value: null }], onMount: (mb, close) => { mb.addEventListener('click', (e) => { const row = e.target.closest('[data-id]'); if (row) close(Number(row.dataset.id)); }); } });
    if (!chosen) return;
    const r = recipients.find((x) => x.id === chosen);
    const addr = [r.address, [r.district, r.state].filter(Boolean).join(', ') + (r.pin_code ? ` - ${r.pin_code}` : '')].filter((x) => x && x.trim()).join('\n');
    const set = (n, val) => { const f = $(`[name="${n}"]`, el); if (f) f.value = val || ''; };
    set('recipient_designation', r.designation); set('recipient_name', r.recipient_name); set('recipient_office', r.office_name); set('recipient_department', r.department); set('recipient_address', addr);
    if (r.category_id && !$('[name="category_id"]', el).value) { $('[name="category_id"]', el).value = r.category_id; $('[name="category_id"]', el).dispatchEvent(new Event('change')); }
    dirty = true;
  }

  function bind() {
    const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
    $$('.split > div:first-child [name]', el).forEach((f) => f.addEventListener('input', () => { dirty = true; }));
    const cat = $('[name="category_id"]', el);
    if (cat) cat.onchange = () => {
      dirty = true;
      $('[name="subcategory_id"]', el).innerHTML = [['', '— None —'], ...subOptions(cat.value)].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
      const t = $('[name="template_id"]', el); const keep = t.value;
      t.innerHTML = templateOptions(cat.value).map(([v, l]) => `<option value="${v}" ${String(v) === keep ? 'selected' : ''}>${esc(l)}</option>`).join('');
    };
    const sub = $('[name="subcategory_id"]', el);
    if (sub) sub.onchange = () => {
      dirty = true;
      const match = templates.find((t) => String(t.subcategory_id) === sub.value);
      if (match && editable()) $('[name="template_id"]', el).value = match.id;
    };
    const tpl = $('[name="template_id"]', el);
    if (tpl) tpl.onchange = () => {
      dirty = true;
      const t = templates.find((x) => String(x.id) === tpl.value);
      if (t) {
        $('[name="language"]', el).value = t.language || 'en';
        const body = $('[name="body"]', el); const subj = $('[name="subject"]', el);
        if (!subj.value && t.default_subject) subj.value = t.default_subject;
        if (!body.value && t.default_body) body.value = t.default_body;
      }
    };
    on('#b-save', () => save());
    on('#b-preview', preview);
    on('#b-generate', generate);
    on('#b-open-word', openWord);
    on('#b-finalize', () => finalize());
    on('#b-retry', async () => {
      const r = await busy('Retrying PDF generation…', () => tryApi('letters', 'retryPdf', letter.id));
      letter = await api('letters', 'get', letter.id); draw();
      if (r && r.ok) showConfirmation(r.confirmation); else if (r) toast(r.error, 'error', 12000);
    });
    on('#b-submit', async () => { if (await save({ quiet: true })) { const r = await tryApi('letters', 'submitForApproval', letter.id); if (r) { letter = r; draw(); toast('Sent for approval.', 'success'); } } });
    on('#b-approve', async () => { if (await save({ quiet: true })) { const r = await tryApi('letters', 'approve', letter.id); if (r) { letter = r; draw(); toast('Letter approved.', 'success'); } } });
    on('#b-sendback', async () => { const reason = await promptBox('Send back to draft', 'Reason / instructions'); if (reason == null) return; const r = await tryApi('letters', 'sendBack', letter.id, reason); if (r) { letter = r; draw(); } });
    on('#b-open-docx', () => tryApi('sys', 'openPath', letter.docx_abs));
    on('#b-open-pdf', () => tryApi('sys', 'openPath', letter.pdf_abs));
    on('#b-folder', () => tryApi('sys', 'openFolder', letter.archive_abs));
    on('#b-print', async () => { if (await tryApi('sys', 'print', letter.pdf_abs)) toast('Sent to the default printer.', 'success'); });
    on('#b-export-pdf', exportPdfCopy);
    on('#b-dispatch', () => dispatchDialog(letter).then(async (r) => { if (r) { letter = await api('letters', 'get', letter.id); draw(); } }));
    on('#b-ack', async () => {
      const f = await api('sys', 'pickFile', { title: 'Choose acknowledgement receipt', filters: [{ name: 'Scans & documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'docx'] }] });
      if (!f) return;
      if (await tryApi('letters', 'addAttachment', letter.id, f, { kind: 'ack', label: 'Acknowledgement receipt' })) { toast('Acknowledgement saved and linked.', 'success'); letter = await api('letters', 'get', letter.id); draw(); }
    });
    on('#b-attach', async () => {
      const fs = await api('sys', 'pickFile', { title: 'Choose supporting document(s)', multi: true });
      if (!fs) return;
      for (const f of fs) await tryApi('letters', 'addAttachment', letter.id, f, { kind: 'supporting' });
      letter = await api('letters', 'get', letter.id); draw();
    });
    on('#b-revise', async () => {
      const reason = await promptBox('Create revision', 'Why does this letter need to be revised?', { multiline: true, hint: 'The current DOCX and PDF stay in the archive. The revision becomes a new version after you finalize it.' });
      if (!reason) return;
      const r = await tryApi('letters', 'startRevision', letter.id, reason);
      if (r) { letter = r; draw(); openWord(); }
    });
    on('#b-discard-rev', async () => { if (await confirmBox('Discard revision', 'Discard the revision in progress? The archived version is not affected.', { okLabel: 'Discard', kind: 'danger' })) { const r = await tryApi('letters', 'discardRevision', letter.id); if (r) { letter = r; draw(); } } });
    on('#b-override', async () => {
      const no = await promptBox('Change outward number', 'New outward number', { value: letter.outward_no, hint: 'Requires permission. The change is recorded in the audit history with your reason.' });
      if (!no) return;
      const reason = await promptBox('Reason for manual override', 'Reason', { multiline: true });
      if (!reason) return;
      const r = await tryApi('letters', 'overrideNumber', letter.id, no, reason);
      if (r) { letter = r; draw(); toast('Outward number changed. Regenerate the Word document so it shows the new number.', 'warn', 9000); }
    });
    on('#b-cancel', async () => {
      const reason = await promptBox('Cancel letter', 'Reason for cancellation', { multiline: true, hint: `The outward number ${letter.outward_no} stays in the register marked Cancelled and is never reused.` });
      if (!reason) return;
      const r = await tryApi('letters', 'cancel', letter.id, reason);
      if (r) { letter = r; draw(); toast('Letter cancelled.', 'success'); }
    });
    on('#b-delete', async () => { if (await confirmBox('Delete draft', 'Delete this draft? It can be restored from Archive & Search → Deleted records.', { okLabel: 'Delete', kind: 'danger' })) { if ((await tryApi('letters', 'deleteDraft', letter.id)) !== undefined) { dirty = false; location.hash = '#/drafts'; } } });
    on('#b-restore', async () => { const r = await tryApi('letters', 'restore', letter.id); if (r) { letter = r; draw(); } });
    on('#b-copy', async () => { if (dirty && !(await confirmBox('Unsaved changes', 'Discard unsaved changes and create a copy?'))) return; dirty = false; location.hash = `#/letter/new?copy=${letter.id}`; });
    on('#b-history', showHistory);
    on('#b-pick-rec', pickRecipient);
    on('#b-save-rec', async () => {
      const f = collect();
      if (!f.recipient_office && !f.recipient_designation) return toast('Enter at least the office or designation.', 'warn');
      const r = await tryApi('recipients', 'save', { office_name: f.recipient_office || f.recipient_designation, recipient_name: f.recipient_name, designation: f.recipient_designation, department: f.recipient_department, address: f.recipient_address, category_id: f.category_id });
      if (r) { recipients = await api('recipients', 'list', {}); toast('Saved to the recipient directory.', 'success'); }
    });
    on('#b-tpl-text', () => {
      const t = templates.find((x) => String(x.id) === $('[name="template_id"]', el).value);
      if (!t || (!t.default_body && !t.default_subject)) return toast('This template has no saved default text.', 'warn');
      if (t.default_subject) $('[name="subject"]', el).value = t.default_subject;
      if (t.default_body) $('[name="body"]', el).value = t.default_body;
      dirty = true;
    });
    on('#b-snippet', async () => {
      const list = await api('templates', 'listSnippets', Number($('[name="category_id"]', el).value) || null);
      if (!list.length) return toast('No saved text yet. Write some text and click “Save text for reuse”.', 'info');
      const pick = await modal({ title: 'Insert saved text', size: 'wide', body: list.map((s) => `<div class="list-row" data-id="${s.id}"><div class="main-t"><div><b>${esc(s.title)}</b></div><div class="muted" style="font-size:12px">${esc(s.body.slice(0, 160))}</div></div><button class="btn sm danger" data-del="${s.id}">${icon('trash')}</button></div>`).join(''),
        actions: [{ label: 'Cancel', value: null }], onMount: (mb, close) => mb.addEventListener('click', async (e) => {
          const d = e.target.closest('[data-del]'); if (d) { e.stopPropagation(); await tryApi('templates', 'removeSnippet', Number(d.dataset.del)); d.closest('.list-row').remove(); return; }
          const r = e.target.closest('[data-id]'); if (r) close(Number(r.dataset.id));
        }) });
      if (!pick) return;
      const s = list.find((x) => x.id === pick);
      const body = $('[name="body"]', el);
      const pos = body.selectionStart || body.value.length;
      body.value = body.value.slice(0, pos) + s.body + body.value.slice(pos);
      dirty = true;
    });
    on('#b-save-snippet', async () => {
      const body = $('[name="body"]', el);
      const text = body.value.substring(body.selectionStart, body.selectionEnd) || body.value;
      if (!text.trim()) return toast('Write the text first (or select part of the body).', 'warn');
      const t = await promptBox('Save text for reuse', 'Title', { value: $('[name="subject"]', el).value.slice(0, 60) });
      if (!t) return;
      if (await tryApi('templates', 'saveSnippet', { title: t, body: text, category_id: Number($('[name="category_id"]', el).value) || null, language: $('[name="language"]', el).value })) toast('Saved.', 'success');
    });
    wireFiles(el);
    if (letter && (letter.status === 'Generated' || (letter.extra && letter.extra.revisionPending))) startPolling();
  }

  async function preview() {
    if (!letter || dirty) { if (!(await save({ quiet: true }))) return; }
    const r = await busy('Preparing preview…', () => tryApi('letters', 'preview', letter.id));
    if (!r) return;
    if (r.pdfPath) {
      const v = await modal({ title: 'Preview', body: `<p class="muted" style="margin-top:0">The preview opens in your PDF viewer. It is not archived.</p><pre class="preview-text">${esc(r.text)}</pre>`, size: 'wide', actions: [{ label: 'Open PDF preview', icon: 'pdf', value: 'pdf' }, { label: 'Open Word preview', icon: 'word', value: 'docx' }, { label: 'Close', kind: 'primary', value: null }] });
      if (v === 'pdf') tryApi('sys', 'openPath', r.pdfPath);
      if (v === 'docx') tryApi('sys', 'openPath', r.docxPath);
    } else {
      const v = await modal({ title: 'Preview (text)', body: `<div class="callout warn">${icon('alert')}<div>A PDF preview could not be made: ${esc(r.conversionError || '')}</div></div><br><pre class="preview-text">${esc(r.text)}</pre>`, size: 'wide', actions: [{ label: 'Open Word preview', value: 'docx' }, { label: 'Close', kind: 'primary', value: null }] });
      if (v === 'docx') tryApi('sys', 'openPath', r.docxPath);
    }
  }

  async function exportPdfCopy() {
    const dest = await tryApi('sys', 'saveFile', { title: 'Export PDF copy', defaultPath: baseName(letter.pdf_abs), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!dest) return;
    if (await tryApi('sys', 'copyFile', letter.pdf_abs, dest)) toast(`PDF copy saved: ${dest}`, 'success');
  }

  async function showHistory() {
    const h = await api('letters', 'history', letter.id);
    modal({
      title: `History – ${letter.outward_no || 'Draft #' + letter.id}`, size: 'wide',
      body: `${h.inward ? `<div class="callout info">${icon('link')}<div>Correspondence: inward <a href="#/inward/${h.inward.id}">${esc(h.inward.inward_no)}</a> – ${esc(h.inward.subject)}${h.relatedLetters.length > 1 ? `<br>Other replies: ${h.relatedLetters.filter((x) => x.id !== letter.id).map((x) => `<a href="#/letter/${x.id}">${esc(x.outward_no || 'Draft')}</a>`).join(', ')}` : ''}</div></div><br>` : ''}
        <div class="timeline">${h.audit.map((a) => `<div class="ev"><div class="when">${fmtDateTime(a.at)}</div><div><b>${esc(a.action.replace(/^letter\.|^outward\./, '').replace(/\./g, ' '))}</b> · ${esc(a.user_name)}${a.details ? `<div class="muted" style="font-size:12px">${esc(Object.entries(a.details).filter(([k]) => !['fields'].includes(k)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ').slice(0, 300))}</div>` : ''}</div></div>`).join('')}</div>`,
    });
  }

  draw();
  const keyHandler = (e) => { if ((window.__isMac ? e.metaKey : e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (editable()) save(); } };
  document.addEventListener('keydown', keyHandler);
  return {
    title: letter ? (letter.outward_no || `Draft #${letter.id}`) : 'Create Letter',
    crumb: 'Smart Letter Creator',
    canLeave: async () => !dirty || confirmBox('Unsaved changes', 'You have unsaved changes in this letter. Leave without saving?', { okLabel: 'Leave', kind: 'danger' }),
    dispose: () => { stopPolling(); document.removeEventListener('keydown', keyHandler); },
    refresh: async (what) => { if (what === 'templates') templates = await api('templates', 'list', {}); },
  };
}

/** Dispatch dialog (also used by Dispatch Management). Resolves true when saved. */
export async function dispatchDialog(letter) {
  const info = state.info;
  const v = { dispatch_status: letter.dispatch_status === 'Ready for Dispatch' || !letter.dispatch_status ? 'Dispatched' : letter.dispatch_status, dispatch_date: letter.dispatch_date || today(), dispatch_mode: letter.dispatch_mode || 'Hand Delivery', ...pick(letter) };
  function pick(l) { return { tracking_no: l.tracking_no, courier_service: l.courier_service, delivered_date: l.delivered_date, ack_received_date: l.ack_received_date, dispatch_remarks: l.dispatch_remarks }; }
  const body = `<p class="muted" style="margin-top:0">${esc(letter.outward_no)} · ${esc(letter.subject)}</p>${formHtml([
    { name: 'dispatch_status', label: 'Dispatch status', type: 'select', options: info.dispatchStatuses.filter((s) => s !== 'Cancelled').map((s) => [s, s]), required: true },
    { name: 'dispatch_mode', label: 'Dispatch mode', type: 'select', options: info.dispatchModes.map((s) => [s, s]) },
    { name: 'dispatch_date', label: 'Dispatch date', type: 'date' },
    { name: 'tracking_no', label: 'Tracking / receipt no.' },
    { name: 'courier_service', label: 'Courier / postal service' },
    { name: 'delivered_date', label: 'Delivered date', type: 'date' },
    { name: 'ack_received_date', label: 'Acknowledgement received on', type: 'date', hint: 'Upload the receipt from the letter screen.' },
    { name: 'dispatch_remarks', label: 'Remarks', type: 'textarea', rows: 2, full: true },
  ], v)}<div class="hint" style="margin-top:10px">A letter is never marked delivered automatically – set “Delivered” only when delivery is confirmed.</div>`;
  return modal({
    title: 'Record dispatch', size: 'wide', body, actions: [{ label: 'Cancel', value: null }, {
      label: 'Save dispatch details', kind: 'primary', onClick: async (mb) => {
        const r = await api('letters', 'recordDispatch', letter.id, readForm(mb));
        toast('Dispatch details saved.', 'success');
        return !!r;
      },
    }],
  });
}
