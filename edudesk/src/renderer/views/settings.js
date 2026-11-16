import { icon } from '../icons.js';
import {
  api, tryApi, esc, fmtDateTime, fmtSize, badge, table, loading, $, $$, state, toast, formHtml, readForm, modal, confirmBox, promptBox, busy,
  refreshSettings, refreshCategories, validateRequired, today,
} from '../lib.js';

const TABS = [['college', 'College Profile'], ['letters', 'Letters & Workflow'], ['numbering', 'Numbering'], ['categories', 'Categories'], ['archive', 'Archive & Files'],
  ['conversion', 'Word & PDF'], ['backup', 'Backup & Restore'], ['users', 'Users & Roles'], ['audit', 'Audit History']];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function render(el, route) {
  let tab = route.parts[1] || 'college';
  const welcome = route.query.welcome === '1';
  const draw = async () => {
    await refreshSettings();
    el.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Institution details, numbering, folders, backups and permissions.</p></div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${l}</button>`).join('')}</div><div id="body"></div>`;
    $$('[data-tab]', el).forEach((b) => { b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, '', `#/settings/${tab}`); draw(); }; });
    const body = $('#body', el);
    await ({ college, letters, numbering, categories, archive, conversion, backup, users, audit })[tab](body, draw);
  };

  async function college(body) {
    const c = state.settings.college;
    body.innerHTML = `${welcome ? `<div class="callout info">${icon('info')}<div><b>Welcome to EduDesk!</b> Start by entering your institution's details. They are used in letter templates (placeholders like {{college_name}}) and to pre-fill UDISE S02/S03 forms. Then add your own letterhead under Templates.</div></div><br>` : ''}
      <div class="card"><div class="hd"><h3>Institution</h3></div><div class="bd" id="f">${formHtml([
        { name: 'name', label: 'College / school name', required: true, full: true },
        { name: 'address', label: 'Complete postal address', type: 'textarea', rows: 2, full: true },
        { name: 'college_code', label: 'College code' }, { name: 'index_no', label: 'Index no. (HSC Board)' },
        { name: 'udise_code', label: 'UDISE code', hint: '11 digits' }, { name: 'affiliation', label: 'Affiliation details' },
        { name: 'phone', label: 'Contact number' }, { name: 'email', label: 'Email address', type: 'email' },
        { type: 'section', label: 'Head of institution' },
        { name: 'principal_name', label: "Principal's name" }, { name: 'principal_designation', label: 'Designation' },
        { name: 'hos_contact', label: 'HoS contact details for UDISE forms', hint: 'e.g. Name (mobile). Leave empty to build it from the principal name and phone.', full: true },
        { type: 'section', label: 'Location (used on UDISE forms)' },
        { name: 'state', label: 'State' }, { name: 'district', label: 'District' }, { name: 'block', label: 'Block' },
      ], c)}
      <div class="section-title" style="margin-top:16px">Other details (become placeholders such as {{trust_name}})</div>
      <div id="other">${(c.other || []).map((o, i) => `<div class="inline" style="margin-top:8px"><input class="input" style="max-width:220px" data-ok="${i}" value="${esc(o.key)}" placeholder="key e.g. trust_name"><input class="input grow" data-ov="${i}" value="${esc(o.value)}" placeholder="value"></div>`).join('')}</div>
      <button class="btn sm" id="b-other" style="margin-top:8px">${icon('plus')}Add detail</button>
      </div></div>
      <div class="sticky-bar"><button class="btn primary" id="b-save">${icon('save')}Save college profile</button></div>`;
    $('#b-other', body).onclick = () => { const i = $$('[data-ok]', body).length; $('#other', body).insertAdjacentHTML('beforeend', `<div class="inline" style="margin-top:8px"><input class="input" style="max-width:220px" data-ok="${i}" placeholder="key e.g. trust_name"><input class="input grow" data-ov="${i}" placeholder="value"></div>`); };
    $('#b-save', body).onclick = async () => {
      if (!validateRequired($('#f', body))) return;
      const v = readForm($('#f', body));
      v.other = $$('[data-ok]', body).map((k) => ({ key: k.value.trim().replace(/[^\w]/g, '_'), value: $(`[data-ov="${k.dataset.ok}"]`, body).value })).filter((o) => o.key);
      if (await tryApi('sys', 'settingsSet', 'college', v)) { await tryApi('sys', 'settingsSet', 'ui', { onboardingDone: true }); toast('College profile saved.', 'success'); if (welcome) location.hash = '#/templates'; }
    };
  }

  async function letters(body) {
    const s = state.settings;
    const tpls = await api('templates', 'list', {});
    body.innerHTML = `<div class="card"><div class="hd"><h3>Letter defaults</h3></div><div class="bd" id="f1">${formHtml([
      { name: 'dateFormat', label: 'Date format in letters', type: 'select', options: [['DD/MM/YYYY', '14/11/2026'], ['DD-MM-YYYY', '14-11-2026'], ['DD.MM.YYYY', '14.11.2026'], ['D MMMM YYYY', '14 November 2026'], ['MMMM D, YYYY', 'November 14, 2026']] },
      { name: 'language', label: 'Default letter language', type: 'select', options: [['en', 'English'], ['mr', 'Marathi'], ['hi', 'Hindi']] },
      { name: 'signatoryName', label: 'Default signatory', hint: 'Leave empty to use the principal.' },
      { name: 'signatoryDesignation', label: 'Designation of signatory' },
      { name: 'defaultTemplateId', label: 'Default template / letterhead', type: 'select', options: [['', '— None —'], ...tpls.map((t) => [t.id, t.name])] },
    ], s.letter)}</div></div>
    <div class="card"><div class="hd"><h3>Workflow</h3></div><div class="bd" id="f2">${formHtml([
      { name: 'approvalRequired', label: 'Letters must be approved before the Word document is generated', type: 'checkbox', full: true },
      { name: 'assignNumberAt', label: 'When is the outward number assigned?', type: 'select', full: true, options: [['generate', 'When the Word document is generated (recommended – the number appears in the document you edit)'], ['finalize', 'At Finalize & Archive (the {{outward_number}} placeholder is filled into the edited document)']] },
    ], s.workflow)}</div></div>
    <div class="card"><div class="hd"><h3>Academic year</h3></div><div class="bd" id="f3">${formHtml([
      { name: 'startMonth', label: 'Academic year starts in', type: 'select', options: MONTHS.map((m, i) => [i + 1, m]), hint: 'Used for academic-year numbering, folders and reports.' },
    ], s.academic)}</div></div>
    <div class="sticky-bar"><button class="btn primary" id="b-save">${icon('save')}Save</button></div>`;
    $('#b-save', body).onclick = async () => {
      const a = readForm($('#f1', body)); a.defaultTemplateId = a.defaultTemplateId ? Number(a.defaultTemplateId) : null;
      const b = readForm($('#f2', body));
      const c = readForm($('#f3', body)); c.startMonth = Number(c.startMonth);
      if (await tryApi('sys', 'settingsSet', 'letter', a) && await tryApi('sys', 'settingsSet', 'workflow', b) && await tryApi('sys', 'settingsSet', 'academic', c)) toast('Saved.', 'success');
    };
  }

  async function numbering(body, redraw) {
    const [out, inw] = await Promise.all([api('sys', 'numberingList', 'outward'), api('sys', 'numberingList', 'inward')]);
    const preview = async (scope) => { try { return (await api('sys', 'numberingPreview', scope, { dateISO: today(), categoryCode: 'BEO' })).next; } catch (e) { return e.message; } };
    const [po, pi] = [await preview('outward'), await preview('inward')];
    const card = (scope, list, next) => {
      const a = list.find((s) => s.active && !s.retired_at);
      return `<div class="card"><div class="hd"><h3>${scope === 'outward' ? 'Outward' : 'Inward'} numbering</h3><div class="actions"><button class="btn sm accent" data-edit="${scope}">${icon('edit')}Change format</button></div></div><div class="bd">
        ${a ? `<dl class="kv"><dt>Active format</dt><dd><b>${esc(a.name)}</b></dd><dt>Pattern</dt><dd><code>${esc(a.pattern)}</code> · prefix “${esc(a.prefix)}” · ${a.digits} digits · starts at ${a.start_number}</dd>
        <dt>Resets</dt><dd>${{ academic: 'Every academic year', calendar: 'Every calendar year', never: 'Never (continuous)' }[a.reset]}${a.per_category ? ' · separate series per category' : ''}</dd><dt>Next number</dt><dd><span class="badge info plain" style="font-size:13px">${esc(next)}</span></dd></dl>` : '<div class="callout err">No active numbering format.</div>'}
        ${list.filter((s) => s.retired_at).length ? `<details style="margin-top:12px"><summary class="muted">Previous formats (kept so old numbers never change)</summary><table class="tbl" style="margin-top:8px">${list.filter((s) => s.retired_at).map((s) => `<tr><td>${esc(s.name)}</td><td><code>${esc(s.pattern)}</code></td><td class="muted">retired ${fmtDateTime(s.retired_at)}</td></tr>`).join('')}</table></details>` : ''}
      </div></div>`;
    };
    body.innerHTML = `<div class="callout info">${icon('lock')}<div>Numbers are allocated inside a database transaction, never reused (cancelled numbers stay in the register) and can only be changed manually by users with the override permission – every override is recorded in the audit history. Changing the format creates a new series; existing letters keep their numbers.</div></div><br>${card('outward', out, po)}${card('inward', inw, pi)}`;
    $$('[data-edit]', body).forEach((b) => { b.onclick = () => editScheme(b.dataset.edit, (b.dataset.edit === 'outward' ? out : inw).find((s) => s.active && !s.retired_at) || {}, redraw); });
  }

  async function editScheme(scope, cur, redraw) {
    const presets = state.info.numberingPresets;
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Quick choice</label><div class="chips">${presets.map((p) => `<span class="chip" data-p="${p.key}">${esc(p.label)}</span>`).join('')}</div></div><br>
      ${formHtml([
        { name: 'name', label: 'Name', required: true, full: true },
        { name: 'pattern', label: 'Pattern', required: true, full: true, hint: 'Tokens: {PREFIX} {SEP} {SEQ} {AY} (2026-27) {AYFULL} (2026-2027) {YEAR} {CAT} (category code) {SUFFIX}' },
        { name: 'prefix', label: 'Prefix' }, { name: 'suffix', label: 'Suffix' },
        { name: 'separator', label: 'Separator', default: '/' }, { name: 'digits', label: 'Number of digits', type: 'number' },
        { name: 'start_number', label: 'Starting number', type: 'number' },
        { name: 'reset', label: 'Reset frequency', type: 'select', options: [['academic', 'Every academic year'], ['calendar', 'Every calendar year'], ['never', 'Never (continuous)']] },
        { name: 'per_category', label: 'Separate numbering for each category (needs {CAT})', type: 'checkbox', full: true },
      ], { ...cur, scope, name: cur.name || `${scope === 'outward' ? 'Outward' : 'Inward'} numbering` })}
      <div class="callout ok" style="margin-top:12px">${icon('eye')}<div>Example: <b id="ex">…</b></div></div>`;
    const upd = async () => { const v = readForm(body); v.scope = scope; try { $('#ex', body).textContent = await api('sys', 'numberingPreviewPattern', v, { dateISO: today(), categoryCode: 'BEO' }); } catch (e) { $('#ex', body).textContent = e.message; } };
    body.addEventListener('input', upd); body.addEventListener('change', upd);
    $$('[data-p]', body).forEach((c) => { c.onclick = () => {
      const p = presets.find((x) => x.key === c.dataset.p);
      $('[name="pattern"]', body).value = p.pattern; $('[name="prefix"]', body).value = scope === 'inward' && p.prefix === 'OUT' ? 'IN' : p.prefix || '';
      $('[name="per_category"]', body).checked = !!p.per_category; $('[name="name"]', body).value = `${scope === 'outward' ? 'Outward' : 'Inward'} – ${p.label}`; upd();
    }; });
    setTimeout(upd, 10);
    const r = await modal({
      title: `${scope === 'outward' ? 'Outward' : 'Inward'} numbering format`, size: 'wide', body, actions: [{ label: 'Cancel', value: null }, {
        label: 'Save format', kind: 'primary', onClick: async (mb) => {
          if (!validateRequired(mb)) return false;
          if (cur.id && !(await confirmBox('Change numbering', 'New numbers will use this format. Letters already numbered keep their numbers. Continue?'))) return false;
          const v = readForm(mb); v.scope = scope; v.id = cur.id; v.digits = Number(v.digits); v.start_number = Number(v.start_number);
          return api('sys', 'numberingSave', v);
        },
      }],
    });
    if (r) { toast('Numbering format saved.', 'success'); redraw(); }
  }

  async function categories(body, redraw) {
    await refreshCategories();
    const cats = state.categories;
    body.innerHTML = `<div class="callout info">${icon('info')}<div>Historical letters keep the category name they were filed under, even if you rename or disable a category later. A category can only be deleted when no letter, inward entry or template uses it – otherwise disable it.</div></div><br>
      <div class="card"><div class="hd"><h3>Categories</h3><div class="actions"><button class="btn sm accent" id="b-addc">${icon('plus')}Add category</button></div></div><div class="bd">
      ${cats.map((c, i) => `<div class="student-card"><div class="hd"><b>${esc(c.name)}</b> <span class="badge plain">${esc(c.code)}</span> <span class="muted" style="font-size:12px">folder: ${esc(c.folder_name)}</span> ${c.active ? '' : badge('Disabled', 'err')}
        <div style="margin-left:auto" class="inline"><button class="btn sm ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="btn sm ghost" data-down="${i}" ${i === cats.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <button class="btn sm" data-editc="${c.id}">${icon('edit')}Edit</button><button class="btn sm" data-togc="${c.id}" data-a="${c.active ? 0 : 1}">${c.active ? 'Disable' : 'Enable'}</button><button class="btn sm danger" data-delc="${c.id}">${icon('trash')}</button></div></div>
        <div class="bd"><div class="chips">${c.subcategories.map((s, j) => `<span class="chip" style="${s.active ? '' : 'opacity:.5;text-decoration:line-through'}" data-sub="${s.id}" data-cat="${c.id}" data-j="${j}">${esc(s.name)}</span>`).join('')}<span class="chip" data-addsub="${c.id}" style="border-style:dashed">+ Add subcategory</span></div><div class="muted" style="font-size:11.5px;margin-top:6px">Click a subcategory to rename, disable, move or delete it.</div></div></div>`).join('')}
      </div></div>`;
    const editCat = async (c = {}) => {
      const r = await modal({ title: c.id ? 'Edit category' : 'Add category', body: formHtml([{ name: 'name', label: 'Name', required: true, full: true }, { name: 'code', label: 'Short code (used in category-wise numbers)', hint: 'e.g. BEO, HSC, ZP' }, { name: 'folder_name', label: 'Archive folder name' }], c), actions: [{ label: 'Cancel', value: null }, { label: 'Save', kind: 'primary', onClick: async (mb) => { if (!validateRequired(mb)) return false; return api('categories', 'save', { ...readForm(mb), id: c.id }); } }] });
      if (r) redraw();
    };
    $('#b-addc', body).onclick = () => editCat();
    $$('[data-editc]', body).forEach((b) => { b.onclick = () => editCat(cats.find((c) => c.id === Number(b.dataset.editc))); });
    $$('[data-togc]', body).forEach((b) => { b.onclick = async () => { await tryApi('categories', 'setActive', Number(b.dataset.togc), b.dataset.a === '1'); redraw(); }; });
    $$('[data-delc]', body).forEach((b) => { b.onclick = async () => { if (await confirmBox('Delete category', 'Delete this category?', { okLabel: 'Delete', kind: 'danger' })) { if ((await tryApi('categories', 'remove', Number(b.dataset.delc))) !== undefined) redraw(); } }; });
    const move = async (i, d) => { const ids = cats.map((c) => c.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; await tryApi('categories', 'reorder', ids); redraw(); };
    $$('[data-up]', body).forEach((b) => { b.onclick = () => move(Number(b.dataset.up), -1); });
    $$('[data-down]', body).forEach((b) => { b.onclick = () => move(Number(b.dataset.down), 1); });
    $$('[data-addsub]', body).forEach((b) => { b.onclick = async () => { const n = await promptBox('Add subcategory', 'Name'); if (n && await tryApi('categories', 'saveSub', { category_id: Number(b.dataset.addsub), name: n })) redraw(); }; });
    $$('[data-sub]', body).forEach((b) => { b.onclick = async () => {
      const c = cats.find((x) => x.id === Number(b.dataset.cat)); const s = c.subcategories.find((x) => x.id === Number(b.dataset.sub)); const j = Number(b.dataset.j);
      const act = await modal({ title: s.name, body: `<input class="input" id="sn" value="${esc(s.name)}">`, actions: [{ label: 'Delete', kind: 'danger', value: 'del' }, { label: s.active ? 'Disable' : 'Enable', value: 'tog' }, { label: '◀ Move', value: 'left' }, { label: 'Move ▶', value: 'right' }, { label: 'Rename', kind: 'primary', onClick: (mb) => ({ rename: $('#sn', mb).value }) }] });
      if (!act) return;
      if (act === 'del') await tryApi('categories', 'removeSub', s.id);
      else if (act === 'tog') await tryApi('categories', 'setSubActive', s.id, !s.active);
      else if (act === 'left' || act === 'right') { const ids = c.subcategories.map((x) => x.id); const k = act === 'left' ? j - 1 : j + 1; if (k >= 0 && k < ids.length) { [ids[j], ids[k]] = [ids[k], ids[j]]; await tryApi('categories', 'reorderSubs', ids); } } else if (act.rename) await tryApi('categories', 'saveSub', { id: s.id, category_id: c.id, name: act.rename });
      redraw();
    }; });
  }

  async function archive(body, redraw) {
    const a = state.settings.archive;
    body.innerHTML = `<div class="card"><div class="hd"><h3>Archive location</h3></div><div class="bd">
      <dl class="kv"><dt>Data folder</dt><dd><code>${esc(state.info.dataRoot)}</code></dd><dt>Documents archive</dt><dd><code>${esc(state.info.documentsRoot)}</code></dd></dl>
      <p class="muted">Folder structure: <code>Documents\\2026-27\\Outward\\BEO\\…</code>, <code>…\\Inward\\</code>, <code>…\\Acknowledgements\\</code>, <code>Documents\\Templates\\</code>. Folders are created automatically.</p>
      <div class="inline"><button class="btn" id="b-open">${icon('folder')}Open archive folder</button><button class="btn" id="b-move">${icon('refresh')}Move archive to another folder…</button></div>
      <div class="hint" style="margin-top:8px">Moving copies every file, verifies it and only then switches the location – links in the registers keep working. The old folder is left in place for you to delete later.</div></div></div>
      <div class="card"><div class="hd"><h3>File names</h3></div><div class="bd" id="f">${formHtml([
        { name: 'fileNamePattern', label: 'File name pattern', full: true, hint: 'Tokens: {TYPE} (OUT) {SEQ} (001) {OUTNO} (full number) {AY} {DATE} {SUBJECT} {CATEGORY}. Example result: OUT_001_2026-27_14-11-2026_Student_Information.docx' },
        { name: 'fileDateFormat', label: 'Date format in file names', type: 'select', options: [['DD-MM-YYYY', '14-11-2026'], ['YYYY-MM-DD', '2026-11-14'], ['DD.MM.YYYY', '14.11.2026']] },
      ], a)}<div class="hint">Invalid characters are removed automatically and an existing file is never overwritten (a _2, _3 … suffix is added).</div></div></div>
      <div class="sticky-bar"><button class="btn primary" id="b-save">${icon('save')}Save</button></div>`;
    $('#b-open', body).onclick = () => tryApi('sys', 'openFolder', state.info.documentsRoot);
    $('#b-save', body).onclick = async () => { const v = readForm($('#f', body)); if (!/\{(SEQ|OUTNO)\}/.test(v.fileNamePattern)) return toast('The pattern must include {SEQ} or {OUTNO}.', 'warn'); if (await tryApi('sys', 'settingsSet', 'archive', v)) toast('Saved.', 'success'); };
    $('#b-move', body).onclick = async () => {
      const d = await api('sys', 'pickFolder', { title: 'Choose an EMPTY folder for the archive' });
      if (!d) return;
      if (!(await confirmBox('Move archive', `Copy the entire archive to:\n${d}\n\nA verified backup is made first. This can take a while for large archives.`, { okLabel: 'Move archive' }))) return;
      const r = await busy('Copying and verifying all documents…', () => tryApi('backup', 'moveDocumentsRoot', d));
      if (r) { toast(`Archive moved (${r.files} files). The old folder was left at ${r.oldRoot}.`, 'success', 12000); state.info = await api('sys', 'info'); redraw(); }
    };
  }

  async function conversion(body) {
    const st = await api('sys', 'converterStatus');
    body.innerHTML = `<div class="card"><div class="hd"><h3>Microsoft Word & PDF conversion</h3></div><div class="bd">
      <dl class="kv"><dt>Microsoft Word</dt><dd>${st.wordAvailable ? `${badge('Found', 'ok')} <code>${esc(st.wordPath)}</code>` : badge('Not found', 'warn')}</dd>
      <dt>LibreOffice</dt><dd>${st.libreOfficeAvailable ? `${badge('Found', 'ok')} <code>${esc(st.libreOfficePath)}</code>` : badge('Not found', '')}</dd></dl><br>
      ${!st.wordAvailable && !st.libreOfficeAvailable ? `<div class="callout err">${icon('alert')}<div><b>No PDF converter is available.</b> Install Microsoft Word (recommended) or the free LibreOffice. Until then, letters can be prepared but Finalize & Archive will stop at “PDF pending” and can be retried later.</div></div><br>` : ''}
      <div id="f">${formHtml([
        { name: 'engine', label: 'Create PDFs with', type: 'select', options: [['auto', 'Automatic – Microsoft Word, otherwise LibreOffice'], ['word', 'Microsoft Word only'], ['libreoffice', 'LibreOffice only']] },
        { name: 'timeoutSeconds', label: 'Conversion time limit (seconds)', type: 'number' },
        { name: 'libreOfficePath', label: 'LibreOffice program (soffice.exe) – only if installed in an unusual folder', full: true },
      ], state.settings.conversion)}</div>
      <p class="muted">Word is used in the background: the document is opened read-only with macros disabled, exported with Word's own “Save as PDF”, and closed without saving. Your open Word windows are not touched.</p></div></div>
      <div class="sticky-bar"><button class="btn primary" id="b-save">${icon('save')}Save</button></div>`;
    $('#b-save', body).onclick = async () => { const v = readForm($('#f', body)); v.timeoutSeconds = Number(v.timeoutSeconds) || 180; if (await tryApi('sys', 'settingsSet', 'conversion', v)) toast('Saved.', 'success'); };
  }

  async function backup(body, redraw) {
    const list = await api('backup', 'list');
    const b = state.settings.backup;
    body.innerHTML = `<div class="grid g2"><div class="card"><div class="hd"><h3>${icon('shield')} Create a backup</h3></div><div class="bd">
        <p>A complete backup contains the database, all templates, archived DOCX/PDF letters, inward scans, acknowledgements, UDISE forms, settings and numbering. Every file is checked after copying.</p>
        <div class="field"><label>Backup destination</label><div class="inline"><input class="input grow" id="dest" value="${esc(b.destination || '')}" placeholder="${esc(state.info.dataRoot)}\\Backups (default)"><button class="btn" id="b-pick">${icon('folder')}Choose…</button></div><div class="hint">Use an external drive or pen drive for safety.</div></div><br>
        <button class="btn accent" id="b-now">${icon('shield')}Back up now</button></div></div>
      <div class="card"><div class="hd"><h3>${icon('clock')} Automatic backups</h3></div><div class="bd" id="f">${formHtml([
        { name: 'auto', label: 'Automatic backup', type: 'select', options: [['daily', 'Daily'], ['weekly', 'Weekly'], ['off', 'Off']] },
        { name: 'keep', label: 'Keep the last … automatic backups', type: 'number' },
      ], b)}<p class="muted">Automatic backups run in the background while EduDesk is open. A quick safety copy of the database is also taken before imports, restores and other major changes.</p><button class="btn primary" id="b-save">${icon('save')}Save backup settings</button></div></div></div>
      <div class="card"><div class="hd"><h3>Backup history</h3><div class="actions"><button class="btn sm" id="b-restore-other">${icon('upload')}Restore from a folder…</button></div></div><div id="t"></div></div>`;
    table($('#t', body), {
      rows: list, empty: 'No backups yet.',
      columns: [
        { key: 'created_at', label: 'Created', render: (x) => fmtDateTime(x.created_at) },
        { key: 'kind', label: 'Type', render: (x) => esc(x.kind) },
        { key: 'file_count', label: 'Files', render: (x) => `${x.file_count || 0} · ${fmtSize(x.size_bytes)}` },
        { key: 'verified', label: 'Verified', render: (x) => (x.exists ? (x.verified ? badge('Verified', 'ok') : badge('Not verified', 'err')) : badge('Folder missing', 'warn')) },
        { key: 'path', label: 'Location', render: (x) => `<span style="font-size:12px;font-family:Consolas,monospace">${esc(x.path)}</span>` },
        { key: 'act', label: '', sort: false, cls: 'nowrap', render: (x) => (x.exists ? `<button class="btn sm" data-ver="${esc(x.path)}">Verify</button> <button class="btn sm" data-fold="${esc(x.path)}">${icon('folder')}</button> <button class="btn sm danger" data-res="${esc(x.path)}">Restore</button>` : '') },
      ],
    });
    $('#b-pick', body).onclick = async () => { const d = await api('sys', 'pickFolder', { title: 'Choose backup destination' }); if (d) $('#dest', body).value = d; };
    $('#b-now', body).onclick = async () => {
      const dest = $('#dest', body).value.trim();
      if (dest !== (b.destination || '')) await tryApi('sys', 'settingsSet', 'backup', { destination: dest });
      const r = await busy('Creating and verifying the backup…', () => tryApi('backup', 'create', { destination: dest || undefined }));
      if (r) { toast(`Backup created and verified: ${r.files} files (${fmtSize(r.size)}).`, 'success', 8000); redraw(); }
    };
    $('#b-save', body).onclick = async () => { const v = readForm($('#f', body)); v.keep = Number(v.keep) || 30; v.destination = $('#dest', body).value.trim(); if (await tryApi('sys', 'settingsSet', 'backup', v)) toast('Saved.', 'success'); };
    $$('[data-fold]', body).forEach((x) => { x.onclick = () => tryApi('sys', 'openFolder', x.dataset.fold); });
    $$('[data-ver]', body).forEach((x) => { x.onclick = async () => { const r = await busy('Verifying every file…', () => tryApi('backup', 'verify', x.dataset.ver)); if (r) { toast(r.ok ? `Backup is complete and intact (${r.manifest.files} files).` : `Problems: ${r.errors.slice(0, 5).join('; ')}`, r.ok ? 'success' : 'error', 10000); redraw(); } }; });
    const restore = async (dir) => {
      const v = await busy('Checking the backup…', () => tryApi('backup', 'verify', dir));
      if (!v) return;
      if (!v.ok) return toast(`This backup cannot be restored: ${v.errors.slice(0, 3).join('; ')}`, 'error', 12000);
      if (!(await confirmBox('Restore backup', `Restore the backup made on ${v.manifest.createdAt} (${v.manifest.files} files)?\n\n• A backup of the CURRENT data is made first.\n• Files that would be replaced are moved to a “replaced_before_restore” folder, never deleted.\n• EduDesk restarts afterwards.`, { okLabel: 'Restore', kind: 'danger' }))) return;
      const r = await busy('Restoring…', () => tryApi('backup', 'restore', dir));
      if (r) {
        await modal({ title: 'Restore complete', body: `<div class="callout ok">${icon('ok')}<div>${r.filesRestored} file(s) restored. Your previous data was backed up to:<br><code>${esc(r.preRestoreBackup)}</code></div></div><p>EduDesk will now restart to load the restored data.</p>`, actions: [{ label: 'Restart now', kind: 'primary', value: true }], dismissable: false });
        window.edudesk.call('sys', 'relaunch');
      }
    };
    $$('[data-res]', body).forEach((x) => { x.onclick = () => restore(x.dataset.res); });
    $('#b-restore-other', body).onclick = async () => { const d = await api('sys', 'pickFolder', { title: 'Choose an EduDesk_Backup_… folder' }); if (d) restore(d); };
  }

  async function users(body, redraw) {
    const [roles, list, perms] = await Promise.all([api('users', 'roles'), api('users', 'list'), api('users', 'permissions')]);
    body.innerHTML = `<div class="callout info">${icon('info')}<div>This version runs in <b>single-user mode</b> as the Owner. Roles and permissions are already enforced for every action, so separate staff logins can be enabled in a future version without changing your data.</div></div><br>
      <div class="card"><div class="hd"><h3>Roles & permissions</h3></div><div class="table-wrap"><table class="tbl"><tr><th>Permission</th>${roles.map((r) => `<th style="text-align:center">${esc(r.name)}</th>`).join('')}</tr>
      ${perms.map((p) => `<tr><td>${esc(p.label)}</td>${roles.map((r) => `<td style="text-align:center"><input type="checkbox" data-role="${r.id}" data-perm="${p.key}" ${r.permissions.includes(p.key) ? 'checked' : ''} ${r.name === 'Owner' ? 'disabled' : ''}></td>`).join('')}</tr>`).join('')}</table></div>
      <div class="bd"><button class="btn primary" id="b-save">${icon('save')}Save permissions</button></div></div>
      <div class="card"><div class="hd"><h3>Users</h3></div><div id="t"></div></div>`;
    table($('#t', body), { rows: list, columns: [{ key: 'display_name', label: 'Name' }, { key: 'username', label: 'Username' }, { key: 'role_name', label: 'Role' }, { key: 'active', label: 'Active', render: (u) => (u.active ? badge('Active', 'ok') : badge('Disabled', 'err')) }] });
    $('#b-save', body).onclick = async () => {
      for (const r of roles.filter((x) => x.name !== 'Owner')) {
        const p = $$(`[data-role="${r.id}"]`, body).filter((c) => c.checked).map((c) => c.dataset.perm);
        await tryApi('users', 'saveRole', { id: r.id, name: r.name, permissions: p });
      }
      toast('Permissions saved.', 'success');
    };
  }

  async function audit(body) {
    const rows = await api('users', 'auditLog', { limit: 500 });
    body.innerHTML = '<div class="card"><div id="t"></div></div>';
    table($('#t', body), {
      rows, empty: 'No history yet.',
      columns: [
        { key: 'at', label: 'When', cls: 'nowrap', render: (a) => fmtDateTime(a.at) },
        { key: 'user_name', label: 'User' },
        { key: 'action', label: 'Action', render: (a) => `<b>${esc(a.action)}</b>` },
        { key: 'entity', label: 'Record', render: (a) => (a.entity === 'letter' && a.entity_id ? `<a href="#/letter/${a.entity_id}">letter #${a.entity_id}</a>` : a.entity === 'inward' && a.entity_id ? `<a href="#/inward/${a.entity_id}">inward #${a.entity_id}</a>` : esc([a.entity, a.entity_id].filter(Boolean).join(' #'))) },
        { key: 'details', label: 'Details', sort: false, render: (a) => `<span class="muted" style="font-size:12px">${esc(a.details ? JSON.stringify(a.details).slice(0, 220) : '')}</span>` },
      ],
    });
  }

  loading(el);
  await draw();
  return { title: 'Settings', refresh: (w) => { if (w === 'categories' && tab === 'categories') draw(); } };
}
