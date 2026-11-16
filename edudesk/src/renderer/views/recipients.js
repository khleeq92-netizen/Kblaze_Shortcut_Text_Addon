import { icon } from '../icons.js';
import { api, esc, table, loading, $, catOptions, toast, formHtml, readForm, modal, validateRequired } from '../lib.js';

export async function recipientDialog(r = {}) {
  const body = formHtml([
    { name: 'office_name', label: 'Office name', required: true, full: true },
    { name: 'designation', label: 'Designation' },
    { name: 'recipient_name', label: 'Recipient name' },
    { name: 'department', label: 'Department' },
    { name: 'category_id', label: 'Usual category', type: 'select', options: [['', '— None —'], ...catOptions()] },
    { name: 'address', label: 'Complete address', type: 'textarea', rows: 2, full: true },
    { name: 'district', label: 'District' }, { name: 'state', label: 'State', default: 'Maharashtra' },
    { name: 'pin_code', label: 'PIN code' }, { name: 'phone', label: 'Phone number' },
    { name: 'email', label: 'Email address', type: 'email' },
    { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, full: true },
  ], r);
  return modal({
    title: r.id ? 'Edit recipient' : 'Add recipient', size: 'wide', body, actions: [{ label: 'Cancel', value: null }, {
      label: 'Save', kind: 'primary', onClick: async (mb) => {
        if (!validateRequired(mb)) return false;
        const v = readForm(mb); v.category_id = v.category_id ? Number(v.category_id) : null; if (r.id) v.id = r.id;
        const saved = await api('recipients', 'save', v);
        toast('Recipient saved.', 'success');
        return saved;
      },
    }],
  });
}

export async function render(el) {
  let q = ''; let showInactive = false;
  const draw = async () => {
    const rows = await api('recipients', 'list', { q, includeInactive: showInactive });
    el.innerHTML = `<div class="page-head"><div><h1>Recipient Directory</h1><p>Offices you write to regularly. Choose a recipient while creating a letter to fill in the details automatically.</p></div>
      <div class="actions"><button class="btn accent" id="b-add">${icon('plus')}Add recipient</button></div></div>
      <div class="card"><div class="filters"><div class="field wide"><label>Search</label><input class="input" id="q" value="${esc(q)}"></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" id="ina" ${showInactive ? 'checked' : ''}> Show archived</label></div></div><div id="t"></div></div>`;
    table($('#t', el), {
      rows, onRow: async (r) => { if (await recipientDialog(r)) draw(); }, empty: 'No recipients yet.',
      columns: [
        { key: 'designation', label: 'Designation', render: (r) => `<b>${esc(r.designation || '')}</b>${r.recipient_name ? `<div class="sub">${esc(r.recipient_name)}</div>` : ''}` },
        { key: 'office_name', label: 'Office', render: (r) => `${esc(r.office_name)}${r.department ? `<div class="sub">${esc(r.department)}</div>` : ''}` },
        { key: 'district', label: 'District / PIN', render: (r) => esc([r.district, r.pin_code].filter(Boolean).join(' – ')) },
        { key: 'phone', label: 'Contact', render: (r) => esc([r.phone, r.email].filter(Boolean).join(' · ')) },
        { key: 'category_name', label: 'Category', render: (r) => esc(r.category_name || '') },
        { key: 'act', label: '', sort: false, render: (r) => `<button class="btn sm ghost" data-arch="${r.id}" data-a="${r.active ? 0 : 1}">${r.active ? 'Archive' : 'Restore'}</button> <a class="btn sm" href="#/letter/new" data-new="${r.id}">${icon('pen')}Write</a>` },
      ],
    });
    $('#b-add', el).onclick = async () => { if (await recipientDialog()) draw(); };
    const qi = $('#q', el);
    qi.oninput = () => { clearTimeout(qi._t); qi._t = setTimeout(() => { q = qi.value; draw().then(() => { const n = $('#q', el); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 300); };
    $('#ina', el).onchange = (e) => { showInactive = e.target.checked; draw(); };
    el.querySelectorAll('[data-arch]').forEach((b) => { b.onclick = async (e) => { e.stopPropagation(); await api('recipients', 'setActive', Number(b.dataset.arch), b.dataset.a === '1'); draw(); }; });
    el.querySelectorAll('[data-new]').forEach((b) => { b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = rows.find((x) => x.id === Number(b.dataset.new));
      const addr = [r.address, [r.district, r.state].filter(Boolean).join(', ') + (r.pin_code ? ` - ${r.pin_code}` : '')].filter((x) => x && x.trim()).join('\n');
      const d = await api('letters', 'saveDraft', { recipient_id: r.id, recipient_office: r.office_name, recipient_name: r.recipient_name, recipient_designation: r.designation, recipient_department: r.department, recipient_address: addr, category_id: r.category_id });
      location.hash = `#/letter/${d.id}`;
    }; });
  };
  loading(el);
  await draw();
  return { title: 'Recipient Directory', refresh: draw };
}
