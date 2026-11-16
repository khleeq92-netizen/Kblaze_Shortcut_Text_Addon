// UDISE S02 / S03 submissions using the original fillable PDF forms.
import { icon } from '../icons.js';
import { api, tryApi, esc, fmtDate, fmtDateTime, badge, table, loading, $, $$, state, toast, busy, modal, confirmBox, catOptions, options, today } from '../lib.js';

const toDMY = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '');
const toISO = (dmy) => (/^\d{2}\/\d{2}\/\d{4}$/.test(dmy || '') ? `${dmy.slice(6)}-${dmy.slice(3, 5)}-${dmy.slice(0, 2)}` : dmy || '');

export async function render(el, route) {
  let mode = route.query.form || null; // 'S02' | 'S03'
  let common = {};
  let entries = [];
  let templates = [];

  async function home() {
    const [subs, tpls] = await Promise.all([api('udise', 'listSubmissions', {}), api('udise', 'listTemplates')]);
    templates = tpls;
    const act = (ft) => tpls.find((t) => t.form_type === ft && t.active);
    el.innerHTML = `<div class="page-head"><div><h1>UDISE S02 / S03</h1><p>Fill the original UDISE forms for one or many students, attach a covering letter, and archive everything under one outward number.</p></div></div>
      <div class="grid g2">
        ${[['S02', 'Form S02 – Add a student', 'For students whose UDISE+ profile was never created (classes 2–12). One completed form per student.', 'plus'],
        ['S03', 'Form S03 – Update an active student', 'Correct name, date of birth, gender, Aadhaar, class/section or parents’ names. Existing and updated details are kept separate.', 'edit']].map(([ft, t, d, ic]) => {
          const a = act(ft);
          return `<div class="card stat tone-${ft === 'S02' ? 'blue' : 'violet'}" data-form="${ft}" style="align-items:flex-start"><div class="ic">${icon(ic)}</div><div style="flex:1"><div style="font-size:16px;font-weight:650">${t}</div><div class="muted" style="margin:4px 0 8px">${d}</div>
            ${a ? `${badge(`Template ${a.version_label}`, a.intact ? 'ok' : 'err')}` : badge('No active template – upload it under Templates', 'err')}</div><button class="btn accent">${icon('plus')}Start ${ft}</button></div>`;
        }).join('')}
      </div>
      <div class="card" style="margin-top:16px"><div class="hd"><h3>Submissions</h3><div class="actions"><a class="btn sm" href="#/templates?tab=udise">${icon('template')}Form templates</a><a class="btn sm" href="#/students">${icon('student')}Student database</a></div></div><div id="t"></div></div>`;
    table($('#t', el), {
      rows: subs, empty: 'No UDISE submissions yet.', onRow: (s) => { location.hash = `#/letter/${s.letter_id}`; },
      columns: [
        { key: 'form_type', label: 'Form', render: (s) => badge(s.form_type, s.form_type === 'S02' ? 'info' : 'violet') },
        { key: 'outward_no', label: 'Outward No.', cls: 'num', render: (s) => esc(s.outward_no || 'Not finalized') },
        { key: 'subject', label: 'Subject', render: (s) => esc(s.subject || '') },
        { key: 'student_count', label: 'Students' },
        { key: 'recipient_office', label: 'Sent to', render: (s) => esc(s.recipient_office || '') },
        { key: 'version_label', label: 'Form version', render: (s) => esc(s.version_label || '') },
        { key: 'status', label: 'Status', render: (s) => `${badge(s.archive_status === 'Complete' ? 'Archived' : s.letter_status)}` },
        { key: 'created_at', label: 'Prepared', render: (s) => fmtDateTime(s.created_at) },
      ],
    });
    $$('[data-form]', el).forEach((c) => { c.onclick = () => start(c.dataset.form); });
  }

  async function start(ft) {
    mode = ft;
    common = await api('udise', 'profileDefaults', ft);
    entries = [];
    editor();
  }

  // ------------------------------------------------------------------ editor
  function commonHtml() {
    const f = (k, l, extra = '') => `<div class="field"><label>${l}</label><input class="input" data-c="${k}" value="${esc(common[k] || '')}" ${extra}></div>`;
    const s02 = mode === 'S02';
    return `<div class="card"><div class="hd"><h3>${icon('settings')} Submitted by (applies to every form in this batch)</h3><div class="actions"><span class="muted" style="font-size:12px">Filled from Settings → College Profile. You may adjust it for this submission.</span></div></div><div class="bd"><div class="form three">
      ${f('udise_code', 'UDISE code')}${f('academic_year', s02 ? 'Current academic year' : 'Academic year')}${f('school_name', 'School name')}
      ${f('state', 'State')}${f('district', 'District')}${f('block', 'Block')}
      ${s02 ? f('hos_contact', 'HoS contact details') + f('hos_name', 'Head of School name') + f('hos_desig', 'HoS designation') + `<div class="field"><label>HoS date</label><input type="date" class="input" data-c="hos_date" value="${toISO(common.hos_date || '') || ''}"></div>`
        : f('head_name', 'Head of School name') + f('head_designation', 'HoS designation') + f('officer_name', 'Education Officer name (if known)') + f('officer_designation', 'Officer designation')}
      </div>
      <div class="inline" style="margin-top:12px">${s02
        ? `<label class="check"><input type="checkbox" data-c="hos_agree" ${common.hos_agree ? 'checked' : ''}> Head of School: “I have read and agree to the above undertaking”</label>`
        : `<label class="check"><input type="checkbox" data-c="undertaking_school" ${common.undertaking_school ? 'checked' : ''}> Undertaking by School (declaration)</label>`}</div>
      <div class="muted" style="font-size:12px;margin-top:8px">${s02 ? 'The Block and District Education Officer sections are left blank for the officers to complete and sign.' : 'The Block/District officer undertaking is left for the officer.'}</div>
    </div></div>`;
  }

  function s02Card(e, i) {
    const d = e.data;
    const inp = (k, l, type = 'text', req = false) => `<div class="field"><label>${l}${req ? ' <span class="req">*</span>' : ''}</label><input class="input" type="${type}" data-k="${k}" value="${esc(type === 'date' ? toISO(d[k]) : d[k] || '')}"></div>`;
    const sel = (k, l, opts, req) => `<div class="field"><label>${l}${req ? ' <span class="req">*</span>' : ''}</label><select class="input" data-k="${k}">${opts.map((o) => `<option ${o === d[k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    return `<div class="student-card" data-i="${i}"><div class="hd"><b>Student ${i + 1}</b> <span class="muted">${esc(d.name || '')}</span><div style="margin-left:auto" class="inline">${e.student_id ? badge('From student database', 'info') : ''}<button class="btn sm" data-prev="${i}">${icon('eye')}Preview form</button><button class="btn sm danger" data-rm="${i}">${icon('trash')}</button></div></div><div class="bd">
      <div class="form three">
        <div class="field full"><label>Name <span class="req">*</span></label><input class="input" data-k="name" value="${esc(d.name || '')}"></div>
        ${sel('gender', 'Gender', ['', 'Male', 'Female', 'Transgender'], true)}${inp('dob', 'Date of birth', 'date', true)}${sel('is_cwsn', 'Is CWSN?', ['No', 'Yes'])}
        ${inp('class_name', 'Class', 'text', true)}${inp('section', 'Section')}${inp('admission_date', 'Admission date', 'date', true)}
        ${inp('father_name', "Father's name", 'text', true)}${inp('mother_name', "Mother's name", 'text', true)}${inp('guardian_name', "Guardian's name (if applicable)")}
        ${inp('mobile', 'Mobile number', 'tel')}${inp('aadhaar', 'Aadhaar number')}${inp('aadhaar_name', 'Name as per Aadhaar')}
        <div class="field full"><label>Reason for non-creation of profile <span class="req">*</span></label><select class="input" data-k="reason"><option value="">— Select —</option>${state.info.s02Reasons.map((r) => `<option ${r === d.reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
      </div>
      <div class="inline" style="margin-top:12px;gap:18px"><b style="font-size:12.5px">Documents attached:</b>
        <label class="check"><input type="checkbox" data-k="doc_register" ${d.doc_register !== false ? 'checked' : ''}> School / Admission Register (mandatory)</label>
        <label class="check"><input type="checkbox" data-k="doc_birth_cert" ${d.doc_birth_cert ? 'checked' : ''}> Birth Certificate</label>
        <label class="check"><input type="checkbox" data-k="doc_transfer_cert" ${d.doc_transfer_cert ? 'checked' : ''}> Transfer / Leaving Certificate</label>
        ${e.student_id ? '' : `<label class="check" style="margin-left:auto"><input type="checkbox" data-save="${i}" ${e.saveStudent ? 'checked' : ''}> Also save to student database</label>`}</div>
      <div class="vmsg" data-v="${i}"></div></div></div>`;
  }

  function s03Card(e, i) {
    const d = e.data;
    const rows = [['name', 'Name'], ['dob', 'Date of birth', 'date'], ['gender', 'Gender'], ['aadhaar', 'Aadhaar number'], ['aadhaar_name', 'Name as per Aadhaar'], ['class_section', 'Class & section'], ['mother', "Mother's name"], ['father', "Father's name"]];
    const cell = (k, type) => `<input class="input" type="${type || 'text'}" data-k="${k}" value="${esc(type === 'date' ? toISO(d[k]) : d[k] || '')}">`;
    return `<div class="student-card" data-i="${i}"><div class="hd"><b>Student ${i + 1}</b> <span class="muted">${esc(d.student_name || '')}</span><div style="margin-left:auto" class="inline">${e.student_id ? `<button class="btn sm" data-fetch="${i}">${icon('refresh')}Copy college record into “Existing”</button>` : ''}<button class="btn sm" data-prev="${i}">${icon('eye')}Preview form</button><button class="btn sm danger" data-rm="${i}">${icon('trash')}</button></div></div><div class="bd">
      <div class="form three"><div class="field"><label>Student's PEN <span class="req">*</span></label>${cell('pen')}</div><div class="field"><label>Name <span class="req">*</span></label>${cell('student_name')}</div><div class="field"><label>Mobile number</label>${cell('mobile')}</div></div><br>
      <div class="compare"><div></div><div class="h ex">Existing details in UDISE Plus</div><div class="h up">Details to be updated in UDISE Plus</div>
        ${rows.map(([k, l, t]) => `<div class="lbl">${l}</div><div class="ex">${cell('existing_' + k, t)}</div><div class="up">${cell('updated_' + k, t)}</div>`).join('')}</div>
      <div class="callout warn" style="margin-top:12px">${icon('alert')}<div>The college database may differ from what UDISE+ currently shows. Check the <b>Existing</b> column against the UDISE+ portal before submitting.<br><label class="check" style="margin-top:6px"><input type="checkbox" data-k="existing_verified" ${d.existing_verified ? 'checked' : ''}> <b>I have verified the existing details against UDISE+</b></label></div></div>
      <div class="inline" style="margin-top:10px;gap:18px"><b style="font-size:12.5px">Documents attached:</b>
        <label class="check"><input type="checkbox" data-k="doc_school_register" ${d.doc_school_register !== false ? 'checked' : ''}> Copy of School Register</label>
        <label class="check"><input type="checkbox" data-k="doc_birth_cert" ${d.doc_birth_cert ? 'checked' : ''}> Copy of Birth Certificate</label></div>
      <div class="vmsg" data-v="${i}"></div></div></div>`;
  }

  function editor() {
    el.innerHTML = `<div class="page-head"><div><h1>Form ${mode} submission</h1><p>${mode === 'S02' ? 'Each student gets a separate completed S02 form on the original format.' : 'Existing and updated details are stored separately and written to the matching columns of the original S03.'}</p></div>
      <div class="actions"><button class="btn" id="b-back">${icon('x')}Cancel</button></div></div>
      ${commonHtml()}
      <div class="card"><div class="hd"><h3>${icon('student')} Students (${entries.length})</h3><div class="actions"><button class="btn sm" id="b-db">${icon('search')}Select from student database</button><button class="btn sm accent" id="b-man">${icon('plus')}Enter manually</button></div></div>
        <div class="bd" id="cards">${entries.length ? entries.map((e, i) => (mode === 'S02' ? s02Card(e, i) : s03Card(e, i))).join('') : `<div class="empty">${icon('student')}<h4>No students added</h4>Select students from the database or enter their details manually.</div>`}</div></div>
      <div class="sticky-bar"><span class="muted" style="margin-right:auto;align-self:center">${entries.length} student(s)</span><button class="btn" id="b-validate">${icon('check')}Check all forms</button><button class="btn primary" id="b-next" ${entries.length ? '' : 'disabled'}>${icon('send')}Continue to covering letter</button></div>`;
    bindEditor();
  }

  function collect() {
    $$('[data-c]', el).forEach((x) => { common[x.dataset.c] = x.type === 'checkbox' ? x.checked : x.type === 'date' ? toDMY(x.value) : x.value; });
    $$('.student-card', el).forEach((card) => {
      const i = Number(card.dataset.i);
      $$('[data-k]', card).forEach((x) => { entries[i].data[x.dataset.k] = x.type === 'checkbox' ? x.checked : x.type === 'date' ? toDMY(x.value) : x.value.trim(); });
      const sv = $('[data-save]', card); if (sv) entries[i].saveStudent = sv.checked;
    });
    return entries.map((e) => ({ ...e, data: { ...common, ...e.data } }));
  }

  async function validateAll() {
    const list = collect();
    let errors = 0;
    for (let i = 0; i < list.length; i++) {
      const r = await api('udise', 'validate', mode, list[i].data);
      errors += r.errors.length;
      const box = $(`[data-v="${i}"]`, el);
      box.innerHTML = r.errors.length || r.warnings.length ? `<div class="callout ${r.errors.length ? 'err' : 'warn'}" style="margin-top:12px">${icon('alert')}<div>${r.errors.map((x) => `• ${esc(x)}`).join('<br>')}${r.errors.length && r.warnings.length ? '<br>' : ''}${r.warnings.map((x) => `• <i>${esc(x)}</i>`).join('<br>')}</div></div>` : `<div class="callout ok" style="margin-top:12px">${icon('ok')}<div>All checks passed.</div></div>`;
    }
    if (!list.length) toast('Add at least one student.', 'warn');
    else if (errors) toast(`${errors} problem(s) must be fixed before the forms can be generated.`, 'error');
    else toast('All forms are complete.', 'success');
    return list.length && !errors;
  }

  function bindEditor() {
    $('#b-back', el).onclick = async () => { if (!entries.length || await confirmBox('Cancel submission', 'Discard this submission?', { okLabel: 'Discard', kind: 'danger' })) { mode = null; home(); } };
    $('#b-man', el).onclick = () => { collect(); entries.push({ data: mode === 'S02' ? { doc_register: true, is_cwsn: 'No' } : { doc_school_register: true }, saveStudent: mode === 'S02' }); editor(); };
    $('#b-db', el).onclick = pickStudents;
    $('#b-validate', el).onclick = validateAll;
    $('#b-next', el).onclick = async () => { if (await validateAll()) coveringLetter(); };
    $$('[data-rm]', el).forEach((b) => { b.onclick = () => { collect(); entries.splice(Number(b.dataset.rm), 1); editor(); }; });
    $$('[data-prev]', el).forEach((b) => { b.onclick = async () => {
      const list = collect();
      const r = await busy('Filling the original form…', () => tryApi('udise', 'previewForm', mode, list[Number(b.dataset.prev)].data));
      if (r) {
        if (r.overflow && r.overflow.length) toast(`Long text was reduced to fit: ${r.overflow.map((o) => o.field).join(', ')}. Check the preview.`, 'warn', 9000);
        tryApi('sys', 'openPath', r.path);
      }
    }; });
    $$('[data-fetch]', el).forEach((b) => { b.onclick = async () => {
      collect();
      const e = entries[Number(b.dataset.fetch)];
      const s = await api('students', 'get', e.student_id);
      Object.assign(e.data, await api('udise', 'fromStudent', 'S03', s));
      editor();
    }; });
  }

  async function pickStudents() {
    collect();
    const body = document.createElement('div');
    body.innerHTML = `<input class="input" id="sq" placeholder="Search name, G.R. no., PEN, Aadhaar…"><div id="sl" style="margin-top:10px;max-height:55vh;overflow:auto"></div>`;
    const chosen = new Set();
    const list = async (q) => {
      const rows = await api('students', 'list', { q, limit: 300 });
      $('#sl', body).innerHTML = rows.length ? `<table class="tbl"><tr><th></th><th>Name</th><th>Class</th><th>G.R. / PEN</th><th>DOB</th></tr>${rows.map((s) => `<tr><td><input type="checkbox" data-sid="${s.id}" ${chosen.has(s.id) ? 'checked' : ''}></td><td><b>${esc(s.name)}</b><div class="sub">${esc(s.father_name || '')}</div></td><td>${esc([s.class_name, s.section].filter(Boolean).join('-'))}</td><td>${esc([s.gr_no, s.pen].filter(Boolean).join(' / '))}</td><td>${fmtDate(s.dob)}</td></tr>`).join('')}</table>` : '<div class="empty">No students found. <a href="#/students">Add or import students</a>.</div>';
      $$('[data-sid]', body).forEach((c) => { c.onchange = () => { if (c.checked) chosen.add(Number(c.dataset.sid)); else chosen.delete(Number(c.dataset.sid)); }; });
    };
    await list('');
    $('#sq', body).oninput = (e) => list(e.target.value);
    const ok = await modal({ title: 'Select students', size: 'wide', body, actions: [{ label: 'Cancel', value: false }, { label: 'Add selected', kind: 'primary', value: true }] });
    if (!ok || !chosen.size) return;
    for (const id of chosen) {
      const s = await api('students', 'get', id);
      const data = await api('udise', 'fromStudent', mode, s);
      entries.push({ student_id: id, data: mode === 'S02' ? { doc_register: true, ...data } : { doc_school_register: true, ...data } });
    }
    editor();
  }

  async function coveringLetter() {
    const list = collect();
    const [tpls, recs] = await Promise.all([api('templates', 'list', {}), api('recipients', 'list', {})]);
    const udiseCat = state.categories.find((c) => c.code === 'UDISE');
    const tOpts = tpls.filter((t) => !t.category_id || (udiseCat && t.category_id === udiseCat.id));
    const pre = tOpts.find((t) => t.name.includes(mode)) || tOpts[0];
    const beo = recs.find((r) => udiseCat && r.category_id === udiseCat.id) || recs.find((r) => /block education/i.test(r.designation || ''));
    const names = list.map((e) => e.data.name || e.data.student_name);
    const body = `<div class="callout info">${icon('info')}<div>${list.length} completed ${mode} form(s) will be generated now. The covering letter is created as a draft; generate it in Word, review, then <b>Finalize &amp; Archive</b> – the forms are then archived in the same outward folder and linked to the same outward number.</div></div><br>
      <div class="form">
        <div class="field full"><label>Covering letter template</label><select class="input" id="ct">${tOpts.map((t) => `<option value="${t.id}" ${pre && t.id === pre.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field full"><label>Send to</label><select class="input" id="cr"><option value="">— Choose recipient —</option>${recs.map((r) => `<option value="${r.id}" ${beo && r.id === beo.id ? 'selected' : ''}>${esc([r.designation, r.office_name].filter(Boolean).join(', '))}</option>`).join('')}</select></div>
        <div class="field full"><label>Subject</label><input class="input" id="cs" value="${esc(mode === 'S02' ? `Request to create UDISE+ student profile (Form S02) – ${list.length} student(s)` : `Request to update student details in UDISE+ (Form S03) – ${list.length} student(s)`)}"></div>
        <div class="field"><label>Letter date</label><input type="date" class="input" id="cd" value="${today()}"></div>
      </div><p class="muted">Students: ${esc(names.join(', '))}</p>`;
    const r = await modal({
      title: 'Covering letter', size: 'wide', body, actions: [{ label: 'Back', value: null }, {
        label: `Generate ${list.length} form(s) & create letter`, kind: 'primary', onClick: async (mb) => {
          const rec = recs.find((x) => String(x.id) === $('#cr', mb).value);
          const tpl = tOpts.find((t) => String(t.id) === $('#ct', mb).value);
          const letter = {
            template_id: tpl ? tpl.id : undefined, subject: $('#cs', mb).value, letter_date: $('#cd', mb).value,
            ...(rec ? { recipient_id: rec.id, recipient_office: rec.office_name, recipient_designation: rec.designation, recipient_name: rec.recipient_name, recipient_department: rec.department, recipient_address: rec.address } : {}),
            ...(tpl && tpl.default_body ? { body: tpl.default_body } : {}),
          };
          return busy(`Filling ${list.length} original ${mode} form(s)…`, () => api('udise', 'prepareSubmission', { formType: mode, entries: list, letter }));
        },
      }],
    });
    if (!r) return;
    const warn = r.items.filter((it) => it.overflow && it.overflow.length);
    toast(`${r.items.length} form(s) generated. Next: generate the covering letter in Word and finalize.${warn.length ? `\nCheck long text in: ${warn.map((w) => w.name).join(', ')}` : ''}`, warn.length ? 'warn' : 'success', 9000);
    entries = [];
    location.hash = `#/letter/${r.letter.id}`;
  }

  loading(el);
  if (mode) await start(mode); else await home();
  return {
    title: 'UDISE S02 / S03',
    canLeave: async () => !mode || !entries.length || confirmBox('Leave submission', 'The students you entered will be lost. Leave?', { okLabel: 'Leave', kind: 'danger' }),
    refresh: async (w) => { if (!mode && ['udise', 'letters'].includes(w)) home(); },
  };
}
