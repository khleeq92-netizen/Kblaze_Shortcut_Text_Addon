import { icon } from '../icons.js';
import { api, tryApi, esc, fmtDate, table, loading, $, toast, formHtml, readForm, modal, validateRequired, busy, confirmBox } from '../lib.js';

const FIELDS = [
  { name: 'name', label: 'Student name', required: true, full: true },
  { name: 'gr_no', label: 'G.R. / Register no.' }, { name: 'pen', label: 'PEN (UDISE)' },
  { name: 'gender', label: 'Gender', type: 'select', options: [['', '—'], ['Male', 'Male'], ['Female', 'Female'], ['Transgender', 'Transgender']] },
  { name: 'dob', label: 'Date of birth', type: 'date' },
  { name: 'class_name', label: 'Class' }, { name: 'section', label: 'Section' },
  { name: 'admission_date', label: 'Admission date', type: 'date' },
  { name: 'is_cwsn', label: 'CWSN', type: 'select', options: [['No', 'No'], ['Yes', 'Yes']] },
  { name: 'father_name', label: "Father's name" }, { name: 'mother_name', label: "Mother's name" },
  { name: 'guardian_name', label: "Guardian's name" }, { name: 'mobile', label: 'Mobile number' },
  { name: 'aadhaar', label: 'Aadhaar number' }, { name: 'aadhaar_name', label: 'Name as per Aadhaar' },
  { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, full: true },
];

export async function render(el) {
  let q = '';
  const draw = async () => {
    const rows = await api('students', 'list', { q });
    el.innerHTML = `<div class="page-head"><div><h1>Students</h1><p>Student records used to fill UDISE S02/S03 forms. Import them from Excel/CSV or add them one by one.</p></div>
      <div class="actions"><button class="btn" id="b-imp">${icon('upload')}Import Excel / CSV</button><button class="btn accent" id="b-add">${icon('plus')}Add student</button></div></div>
      <div class="card"><div class="filters"><div class="field wide"><label>Search</label><input class="input" id="q" value="${esc(q)}" placeholder="Name, G.R. no., PEN, Aadhaar, mobile"></div></div><div id="t"></div><div class="muted" style="padding:10px 14px;font-size:12px">${rows.length} student(s)</div></div>`;
    table($('#t', el), {
      rows, onRow: (s) => edit(s), empty: 'No students yet.',
      columns: [
        { key: 'name', label: 'Name', render: (s) => `<b>${esc(s.name)}</b><div class="sub">${esc([s.father_name, s.mother_name].filter(Boolean).join(' / '))}</div>` },
        { key: 'class_name', label: 'Class', render: (s) => esc([s.class_name, s.section].filter(Boolean).join('-')) },
        { key: 'gr_no', label: 'G.R. no.' }, { key: 'pen', label: 'PEN' },
        { key: 'dob', label: 'DOB', render: (s) => fmtDate(s.dob) },
        { key: 'aadhaar', label: 'Aadhaar', render: (s) => (s.aadhaar ? `XXXX-XXXX-${esc(String(s.aadhaar).slice(-4))}` : '') },
        { key: 'mobile', label: 'Mobile' },
      ],
    });
    const qi = $('#q', el);
    qi.oninput = () => { clearTimeout(qi._t); qi._t = setTimeout(() => { q = qi.value; draw().then(() => { const n = $('#q', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 300); };
    $('#b-add', el).onclick = () => edit({});
    $('#b-imp', el).onclick = importFile;
  };
  async function edit(s) {
    const r = await modal({
      title: s.id ? 'Edit student' : 'Add student', size: 'wide', body: formHtml(FIELDS, s, 'three'),
      actions: [...(s.id ? [{ label: 'Delete', kind: 'danger', onClick: async () => { if (!(await confirmBox('Delete student', 'Remove this student record? Completed UDISE forms are not affected.', { okLabel: 'Delete', kind: 'danger' }))) return false; await api('students', 'remove', s.id); return 'x'; } }] : []),
        { label: 'Cancel', value: null }, { label: 'Save', kind: 'primary', onClick: async (mb) => { if (!validateRequired(mb)) return false; const v = readForm(mb); if (s.id) v.id = s.id; return api('students', 'save', v); } }],
    });
    if (r) draw();
  }
  async function importFile() {
    const f = await api('sys', 'pickFile', { title: 'Choose the student list', filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }] });
    if (!f) return;
    const p = await busy('Reading the file…', () => tryApi('students', 'parseImport', f));
    if (!p) return;
    const ok = p.items.filter((i) => !i.problems.length);
    const bad = p.items.filter((i) => i.problems.length);
    const r = await modal({
      title: 'Import students', size: 'xl',
      body: `<p>Columns recognised: <b>${Object.keys(p.columns).join(', ')}</b>. The first row must contain headings such as Name, Gender, DOB, Class, Father Name, Aadhaar, PEN, GR No.</p>
        <p>${ok.length} row(s) ready${bad.length ? `, <b style="color:var(--err)">${bad.length} row(s) with problems will be skipped</b>` : ''}. Existing students with the same G.R. no. are updated.</p>
        <div style="max-height:50vh;overflow:auto"><table class="tbl"><tr><th>Name</th><th>Class</th><th>DOB</th><th>G.R.</th><th>Problems</th></tr>${p.items.slice(0, 500).map((i) => `<tr><td>${esc(i.data.name || '')}</td><td>${esc(i.data.class_name || '')}</td><td>${esc(i.data.dob || '')}</td><td>${esc(i.data.gr_no || '')}</td><td style="color:var(--err)">${esc(i.problems.join(' '))}</td></tr>`).join('')}</table></div>`,
      actions: [{ label: 'Cancel', value: null }, { label: `Import ${ok.length} student(s)`, kind: 'primary', onClick: () => api('students', 'importRows', ok.map((i) => i.data)) }],
    });
    if (r) { toast(`Imported ${r.added} student(s).`, 'success'); draw(); }
  }
  loading(el);
  await draw();
  return { title: 'Students', refresh: (w) => { if (w === 'students') draw(); } };
}
