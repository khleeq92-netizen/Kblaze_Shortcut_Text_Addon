import { icon } from '../icons.js';
import { api, tryApi, esc, fmtDateTime, badge, table, loading, $, $$, state, catOptions, subOptions, toast, formHtml, readForm, modal, confirmBox, promptBox, busy, validateRequired, baseName } from '../lib.js';

const LANGS = [['en', 'English'], ['mr', 'Marathi'], ['hi', 'Hindi']];

export async function render(el, route) {
  let tab = route.query.tab || 'letters';
  const draw = async () => {
    el.innerHTML = `<div class="page-head"><div><h1>Templates</h1><p>Your letterheads and letter formats (.docx), the official UDISE form masters, and reusable text.</p></div>
      <div class="actions" id="acts"></div></div>
      <div class="tabs">${[['letters', 'Letter templates'], ['udise', 'UDISE S02 / S03 forms'], ['snippets', 'Saved text'], ['help', 'Placeholders']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div><div id="body"></div>`;
    $$('[data-tab]', el).forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
    const body = $('#body', el);
    if (tab === 'letters') await lettersTab(body, $('#acts', el), draw);
    if (tab === 'udise') await udiseTab(body, $('#acts', el), draw);
    if (tab === 'snippets') await snippetsTab(body);
    if (tab === 'help') helpTab(body);
  };
  loading(el);
  await draw();
  return { title: 'Templates', refresh: (w) => { if (['templates', 'udise'].includes(w)) draw(); } };
}

async function lettersTab(body, acts, redraw) {
  const rows = await api('templates', 'list', { includeInactive: true });
  acts.innerHTML = `<button class="btn accent" id="b-add">${icon('upload')}Add template from Word file</button>`;
  body.innerHTML = `<div class="callout info">${icon('info')}<div><b>Use your existing letterhead.</b> Click “Add template from Word file” and choose any letter the college has already typed in Word. Choose <i>“Use as letterhead”</i> to keep its logo, header, footer, watermark, border and margins while EduDesk fills in the outward number, date (top-right), recipient, subject, body and signature automatically.</div></div><br><div class="card" id="t"></div>`;
  table($('#t', body), {
    rows, empty: 'No templates.', onRow: (r) => editTemplate(r, redraw),
    columns: [
      { key: 'name', label: 'Template', render: (r) => `<b>${esc(r.name)}</b> ${r.is_letterhead ? badge('Default letterhead', 'info') : ''} ${r.is_sample ? badge('Sample', 'plain') : ''} ${r.active ? '' : badge('Disabled', 'err')}${r.description ? `<div class="sub">${esc(r.description)}</div>` : ''}` },
      { key: 'category_name', label: 'Category', render: (r) => `${esc(r.category_name || 'Any')}${r.subcategory_name ? `<div class="sub">${esc(r.subcategory_name)}</div>` : ''}` },
      { key: 'language', label: 'Lang.', render: (r) => esc((LANGS.find((l) => l[0] === r.language) || [0, r.language])[1]) },
      { key: 'version', label: 'Version', render: (r) => `v${r.version || 1}<div class="sub">${fmtDateTime(r.version_uploaded_at)}</div>` },
      { key: 'placeholders', label: 'Fields', sort: false, render: (r) => `<span title="${esc(r.placeholders.join(', '))}">${r.placeholders.length}</span>` },
      { key: 'act', label: '', sort: false, cls: 'nowrap', render: (r) => `<button class="btn sm" data-word="${r.id}" title="Open a copy in Word">${icon('word')}Open copy</button> <button class="btn sm" data-ver="${r.id}">${icon('upload')}New version</button> <button class="btn sm ghost" data-dup="${r.id}" title="Duplicate">${icon('copy')}</button>` },
    ],
  });
  $('#b-add', acts).onclick = () => addTemplate(redraw);
  $$('[data-word]', body).forEach((b) => { b.onclick = async (e) => {
    e.stopPropagation();
    const t = await api('templates', 'get', Number(b.dataset.word));
    const v = t.versions.find((x) => x.id === t.current_version_id);
    const dest = await tryApi('sys', 'saveFile', { title: 'Save an editable copy of the template', defaultPath: `${t.name.replace(/[^\w\- ]+/g, '_')}_v${v.version}.docx`, filters: [{ name: 'Word', extensions: ['docx'] }] });
    if (!dest) return;
    const src = await api('sys', 'templateFile', v.id);
    if (await tryApi('sys', 'copyFile', src, dest)) {
      await tryApi('sys', 'openPath', dest);
      toast('Edit the copy in Word, save it, then use “New version” to upload it. The stored template is never changed directly.', 'info', 10000);
    }
  }; });
  $$('[data-ver]', body).forEach((b) => { b.onclick = async (e) => {
    e.stopPropagation();
    const f = await api('sys', 'pickFile', { title: 'Choose the updated .docx', filters: [{ name: 'Word', extensions: ['docx', 'dotx'] }] });
    if (!f) return;
    const note = await promptBox('New template version', 'What changed?', { required: false });
    if (note === null) return;
    const r = await tryApi('templates', 'uploadVersion', Number(b.dataset.ver), f, note);
    if (r) { toast(`Version ${r.template.versions[0].version} saved. ${r.removedParts.length ? 'Macros were removed.' : ''}`, 'success'); redraw(); }
  }; });
  $$('[data-dup]', body).forEach((b) => { b.onclick = async (e) => {
    e.stopPropagation();
    const n = await promptBox('Duplicate template', 'Name of the copy');
    if (n && await tryApi('templates', 'duplicate', Number(b.dataset.dup), n)) redraw();
  }; });
}

async function addTemplate(redraw) {
  const file = await api('sys', 'pickFile', { title: 'Choose a Word document (.docx)', filters: [{ name: 'Word document', extensions: ['docx', 'dotx'] }] });
  if (!file) return;
  const info = await tryApi('templates', 'inspect', file);
  if (!info) return;
  const hasPh = info.placeholders.length > 0;
  const body = `<p class="muted" style="margin-top:0">${esc(file)}</p>
    ${info.removedParts.length ? `<div class="callout warn">${icon('shield')}<div>Macros / ActiveX content were found and will be removed. EduDesk never runs macros.</div></div><br>` : ''}
    <div class="field full"><label>How should this document be used?</label>
      <label class="check"><input type="radio" name="mode" value="letterhead" ${hasPh ? '' : 'checked'}> <span><b>Use as letterhead</b> – keep the header, logo, footer, watermark, borders and margins; replace the body with EduDesk's letter layout (Ref/Outward No. left, Date top-right, To, Subject, body, signature, enclosures).</span></label>
      <label class="check" style="margin-top:6px"><input type="radio" name="mode" value="asis" ${hasPh ? 'checked' : ''}> <span><b>Use exactly as it is</b> – the document already contains placeholders such as {{subject}}. ${hasPh ? `<br><small>Found: ${esc(info.placeholders.join(', '))}</small>` : '<br><small>No placeholders found in this document.</small>'}</span></label></div><br>
    ${formHtml([
      { name: 'name', label: 'Template name', required: true, full: true, default: baseName(file).replace(/\.(docx|dotx)$/i, '') },
      { name: 'category_id', label: 'Category', type: 'select', options: [['', 'Any category'], ...catOptions()] },
      { name: 'language', label: 'Layout language', type: 'select', options: LANGS, hint: 'Labels such as Subject/विषय, Date/दिनांक.' },
      { name: 'is_letterhead', label: 'Make this the default letterhead for new letters', type: 'checkbox', full: true },
      { name: 'default_subject', label: 'Default subject (optional)', full: true },
      { name: 'default_body', label: 'Default letter text (optional)', type: 'textarea', rows: 4, full: true },
    ], {})}`;
  const r = await modal({
    title: 'Add letter template', size: 'wide', body, actions: [{ label: 'Cancel', value: null }, {
      label: 'Add template', kind: 'primary', onClick: async (mb) => {
        if (!validateRequired(mb)) return false;
        const v = readForm(mb);
        const mode = $('input[name="mode"]:checked', mb).value;
        v.convertBody = mode === 'letterhead';
        v.category_id = v.category_id ? Number(v.category_id) : null;
        delete v.mode;
        const res = await api('templates', 'create', v, file);
        if (v.is_letterhead) await api('sys', 'settingsSet', 'letter', { defaultTemplateId: res.template.id });
        return res;
      },
    }],
  });
  if (r) { toast(r.warning || 'Template added.', r.warning ? 'warn' : 'success', r.warning ? 10000 : 4000); redraw(); }
}

async function editTemplate(t, redraw) {
  const full = await api('templates', 'get', t.id);
  const body = document.createElement('div');
  body.innerHTML = `${formHtml([
    { name: 'name', label: 'Template name', required: true, full: true },
    { name: 'category_id', label: 'Category', type: 'select', options: [['', 'Any category'], ...catOptions(true)] },
    { name: 'subcategory_id', label: 'Subcategory', type: 'select', options: [['', '— None —'], ...subOptions(t.category_id, true)] },
    { name: 'language', label: 'Language', type: 'select', options: LANGS },
    { name: 'active', label: 'Active (available for new letters)', type: 'checkbox' },
    { name: 'is_letterhead', label: 'Default letterhead for new letters', type: 'checkbox' },
    { name: 'description', label: 'Description', full: true },
    { name: 'default_subject', label: 'Default subject', full: true },
    { name: 'default_body', label: 'Default letter text', type: 'textarea', rows: 5, full: true },
  ], { ...t, is_letterhead: state.settings.letter.defaultTemplateId === t.id })}
  <br><h4>Versions</h4><table class="tbl"><tr><th>Version</th><th>Uploaded</th><th>File</th><th>Note</th><th></th></tr>${full.versions.map((v) => `<tr><td>v${v.version}</td><td class="nowrap">${fmtDateTime(v.uploaded_at)}</td><td>${esc(v.original_name || '')}</td><td>${esc(v.note || '')}</td><td>${v.id === full.current_version_id ? badge('Current', 'ok') : `<button class="btn sm" data-act="${v.id}">Use this version</button>`}</td></tr>`).join('')}</table>`;
  $('[name="category_id"]', body).onchange = (e) => { $('[name="subcategory_id"]', body).innerHTML = [['', '— None —'], ...subOptions(e.target.value, true)].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''); };
  const r = await modal({
    title: 'Template details', size: 'wide', body,
    onMount: (mb, close) => $$('[data-act]', mb).forEach((b) => { b.onclick = async () => { await tryApi('templates', 'setCurrentVersion', t.id, Number(b.dataset.act)); close('x'); }; }),
    actions: [{ label: 'Delete', kind: 'danger', onClick: async () => { if (!(await confirmBox('Delete template', 'Delete this template? Letters already created keep their documents.', { okLabel: 'Delete', kind: 'danger' }))) return false; await api('templates', 'remove', t.id); return 'x'; } },
      { label: 'Cancel', value: null },
      { label: 'Save', kind: 'primary', onClick: async (mb) => {
        if (!validateRequired(mb)) return false;
        const v = readForm(mb);
        v.category_id = v.category_id ? Number(v.category_id) : null; v.subcategory_id = v.subcategory_id ? Number(v.subcategory_id) : null; v.active = v.active ? 1 : 0;
        await api('templates', 'update', t.id, v);
        if (v.is_letterhead) await api('sys', 'settingsSet', 'letter', { defaultTemplateId: t.id });
        else if (state.settings.letter.defaultTemplateId === t.id) await api('sys', 'settingsSet', 'letter', { defaultTemplateId: null });
        return 'x';
      } }],
  });
  if (r) redraw();
}

async function udiseTab(body, acts, redraw) {
  const list = await api('udise', 'listTemplates');
  acts.innerHTML = `<button class="btn" data-up="S02">${icon('upload')}Upload new S02 version</button><button class="btn" data-up="S03">${icon('upload')}Upload new S03 version</button>`;
  body.innerHTML = `<div class="callout info">${icon('lock')}<div>These are the <b>original fillable PDFs</b>. EduDesk stores them read-only, checks their checksum before every use, and fills the existing form fields. When a new official format arrives, upload it here, check the preview and the field mapping, then activate it. Earlier submissions always keep the version they were made with.</div></div><br>
    ${['S02', 'S03'].map((ft) => `<div class="card"><div class="hd"><h3>Form ${ft} – ${ft === 'S02' ? 'Add a student (classes 2–12)' : 'Update details of an active student'}</h3></div><div id="t-${ft}"></div></div>`).join('')}`;
  for (const ft of ['S02', 'S03']) {
    table($(`#t-${ft}`, body), {
      rows: list.filter((t) => t.form_type === ft), empty: `No ${ft} template uploaded.`,
      columns: [
        { key: 'version_label', label: 'Version', render: (t) => `<b>${esc(t.version_label)}</b> ${t.active ? badge('Active', 'ok') : ''}<div class="sub">${esc(t.original_name || '')}</div>` },
        { key: 'uploaded_at', label: 'Uploaded', render: (t) => fmtDateTime(t.uploaded_at) },
        { key: 'fields', label: 'Fields', sort: false, render: (t) => `${Object.keys(t.mapping).length} of ${t.field_names.length} mapped` },
        { key: 'intact', label: 'Master file', sort: false, render: (t) => (t.intact ? badge('Unchanged', 'ok') : badge('Modified / missing', 'err')) },
        { key: 'act', label: '', sort: false, cls: 'nowrap', render: (t) => `<button class="btn sm" data-prev="${t.id}">${icon('eye')}Preview</button> <button class="btn sm" data-map="${t.id}">Field mapping</button> ${t.active ? '' : `<button class="btn sm accent" data-activate="${t.id}">Activate</button>`}` },
      ],
    });
  }
  $$('[data-up]', acts).forEach((b) => { b.onclick = async () => {
    const f = await api('sys', 'pickFile', { title: `Choose the new ${b.dataset.up} fillable PDF`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!f) return;
    const label = await promptBox('Version label', 'Version printed on the form (e.g. v.05_01/04/2027)', { required: false });
    if (label === null) return;
    const r = await busy('Checking the form…', () => tryApi('udise', 'uploadTemplate', b.dataset.up, f, { versionLabel: label || undefined, note: 'Uploaded by user' }));
    if (r) {
      toast(`Uploaded ${r.template.version_label}. ${r.unmapped.length ? `${r.unmapped.length} field(s) need mapping before activation.` : 'All fields mapped.'} Preview it, then click Activate.`, r.unmapped.length ? 'warn' : 'success', 10000);
      redraw();
    }
  }; });
  $$('[data-activate]', body).forEach((b) => { b.onclick = async () => {
    if (!(await confirmBox('Activate template', 'New S02/S03 submissions will use this version. Existing submissions are not changed.', { okLabel: 'Activate' }))) return;
    await busy('Activating…', async () => { await tryApi('udise', 'activateTemplate', Number(b.dataset.activate)); });
    redraw();
  }; });
  $$('[data-prev]', body).forEach((b) => { b.onclick = async () => {
    const t = list.find((x) => x.id === Number(b.dataset.prev));
    const path = await busy('Filling the form with sample data…', () => tryApi('sys', 'udisePreviewTemplate', t.id));
    if (path) tryApi('sys', 'openPath', path);
  }; });
  $$('[data-map]', body).forEach((b) => { b.onclick = () => mappingDialog(list.find((x) => x.id === Number(b.dataset.map)), redraw); });
}

async function mappingDialog(t, redraw) {
  const keys = state.info.udiseKeys[t.form_type];
  const body = `<p class="muted" style="margin-top:0">Match each field of the PDF (left) to the EduDesk information that should be written into it (right). Field names of the original form are never changed.</p>
    ${t.field_names.map((f) => `<div class="mapping-row"><div><code>${esc(f.name)}</code> <span class="muted">(${esc(f.type)})</span></div><select class="input" data-field="${esc(f.name)}"><option value="">— leave empty —</option>${keys.map((k) => `<option ${t.mapping[f.name] === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`).join('')}`;
  const r = await modal({
    title: `Field mapping – ${t.form_type} ${t.version_label}`, size: 'wide', body, actions: [{ label: 'Cancel', value: null }, {
      label: 'Save mapping', kind: 'primary', onClick: async (mb) => {
        const m = {};
        $$('[data-field]', mb).forEach((s) => { if (s.value) m[s.dataset.field] = s.value; });
        return api('udise', 'saveMapping', t.id, m);
      },
    }],
  });
  if (r) { toast('Mapping saved.', 'success'); redraw(); }
}

async function snippetsTab(body) {
  const draw = async () => {
    const list = await api('templates', 'listSnippets', null);
    body.innerHTML = `<div class="card"><div class="hd"><h3>Saved text</h3><div class="actions"><button class="btn sm accent" id="b-new">${icon('plus')}New</button></div></div><div id="t"></div></div>`;
    table($('#t', body), {
      rows: list, empty: 'No saved text yet. In the letter editor, use “Save text for reuse”.', onRow: (s) => edit(s),
      columns: [{ key: 'title', label: 'Title', render: (s) => `<b>${esc(s.title)}</b><div class="sub">${esc(s.body.slice(0, 180))}</div>` }, { key: 'language', label: 'Lang.' }],
    });
    $('#b-new', body).onclick = () => edit({});
  };
  const edit = async (s) => {
    const r = await modal({
      title: s.id ? 'Edit saved text' : 'New saved text', size: 'wide', body: formHtml([{ name: 'title', label: 'Title', required: true, full: true }, { name: 'language', label: 'Language', type: 'select', options: LANGS }, { name: 'category_id', label: 'Category', type: 'select', options: [['', 'Any'], ...catOptions()] }, { name: 'body', label: 'Text', type: 'textarea', rows: 8, full: true, required: true }], s),
      actions: [...(s.id ? [{ label: 'Delete', kind: 'danger', onClick: async () => { await api('templates', 'removeSnippet', s.id); return 'x'; } }] : []), { label: 'Cancel', value: null }, { label: 'Save', kind: 'primary', onClick: async (mb) => { if (!validateRequired(mb)) return false; const v = readForm(mb); v.category_id = v.category_id ? Number(v.category_id) : null; if (s.id) v.id = s.id; return api('templates', 'saveSnippet', v); } }],
    });
    if (r) draw();
  };
  await draw();
}

function helpTab(body) {
  const ph = state.info.placeholders;
  body.innerHTML = `<div class="card"><div class="hd"><h3>Placeholders you can type in any Word template</h3></div><div class="bd">
    <p>Type these anywhere in a .docx template (body, header or footer) – EduDesk replaces them and keeps the formatting of the text around them. Extra college fields added under Settings → College Profile → “Other details” become placeholders too.</p>
    <div class="chips">${ph.map((p) => `<span class="chip" title="Click to copy" data-p="{{${p}}}">{{${esc(p)}}}</span>`).join('')}</div>
    <br><p class="muted">Optional lines: wrap a line in <code>{{#reference}}</code> … <code>{{/reference}}</code> (each on its own line) to remove it when there is no reference.</p></div></div>`;
  $$('[data-p]', body).forEach((c) => { c.onclick = () => { navigator.clipboard.writeText(c.dataset.p); toast(`Copied ${c.dataset.p}`, 'success'); }; });
}
