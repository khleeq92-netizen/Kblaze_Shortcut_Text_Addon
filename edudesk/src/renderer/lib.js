// Shared UI helpers: API bridge, formatting, modals, toasts, forms, sortable tables.
import { icon } from './icons.js';

export const state = { settings: null, info: null, categories: [], route: null };

export class ApiError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

export async function api(service, method, ...args) {
  const r = await window.edudesk.call(service, method, ...args);
  if (!r.ok) throw new ApiError(r.error, r.code);
  return r.result;
}

/** Call the API and show errors as a toast; returns undefined on error. */
export async function tryApi(service, method, ...args) {
  try {
    return await api(service, method, ...args);
  } catch (e) {
    toast(e.message, 'error');
    return undefined;
  }
}

export const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function fmtDate(iso, fmt) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const f = fmt || (state.settings && state.settings.letter.dateFormat) || 'DD/MM/YYYY';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return f.replace(/YYYY|YY|MMMM|MMM|MM|DD/g, (t) => ({ YYYY: m[1], YY: m[1].slice(2), MMMM: months[+m[2] - 1], MMM: months[+m[2] - 1], MM: m[2], DD: m[3] }[t]));
}
export function fmtDateTime(s) {
  if (!s) return '';
  const d = s.replace('T', ' ').slice(0, 16);
  return `${fmtDate(d.slice(0, 10))} ${d.slice(11, 16)}`;
}
export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
export function baseName(p) { return p ? String(p).split(/[\\/]/).pop() : ''; }

const TONES = {
  Draft: '', 'Awaiting Approval': 'warn', Approved: 'info', Generated: 'info', Finalized: 'ok', Dispatched: 'violet', Delivered: 'ok', Closed: '', Cancelled: 'err',
  'Ready for Dispatch': 'info', 'Acknowledgement Pending': 'warn', Received: 'info', 'Pending Review': 'warn', Assigned: 'info', 'In Progress': 'violet', Replied: 'ok', Completed: 'ok', Archived: '',
  Complete: 'ok', Incomplete: 'err', Failed: 'err', Pending: 'warn', None: '',
};
export function badge(s, tone) {
  if (!s) return '';
  return `<span class="badge ${tone != null ? tone : TONES[s] || ''}">${esc(s)}</span>`;
}

// ---------------------------------------------------------------- toasts
export function toast(text, type = 'info', ms) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'success' ? 'ok' : 'info')}<div>${esc(text)}</div>`;
  el.querySelector('svg').style.cssText = 'width:17px;height:17px;flex:none;margin-top:1px';
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms || (type === 'error' ? 9000 : 4500));
  el.onclick = () => el.remove();
}

// ---------------------------------------------------------------- busy overlay
export async function busy(message, fn) {
  const veil = document.createElement('div');
  veil.className = 'busy-veil';
  veil.innerHTML = `<div class="box"><div class="spin"></div><div>${esc(message)}</div></div>`;
  document.body.appendChild(veil);
  try { return await fn(); } finally { veil.remove(); }
}

// ---------------------------------------------------------------- modals
/**
 * modal({ title, body (html string or Element), size, actions:[{label, kind, value, onClick}] })
 * Resolves with the clicked action's value (or null when closed).
 */
export function modal({ title, body, size = '', actions = [{ label: 'Close', value: null }], onMount, dismissable = true }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true"><div class="mh"><h3>${esc(title)}</h3><button class="btn ghost sm x" title="Close (Esc)">${icon('x')}</button></div><div class="mb"></div><div class="mf"></div></div>`;
    const mb = $('.mb', ov);
    if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
    const close = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(null); };
    document.addEventListener('keydown', onKey);
    $('.x', ov).onclick = () => close(null);
    const mf = $('.mf', ov);
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `btn ${a.kind || ''}`;
      b.innerHTML = (a.icon ? icon(a.icon) : '') + esc(a.label);
      b.onclick = async () => {
        if (a.onClick) {
          b.disabled = true;
          try {
            const r = await a.onClick(mb, close);
            if (r === false) return;
            if (r !== undefined) return close(r);
          } catch (e) { toast(e.message, 'error'); return; } finally { b.disabled = false; }
        }
        close(a.value === undefined ? a.label : a.value);
      };
      mf.appendChild(b);
    }
    if (!actions.length) mf.remove();
    document.body.appendChild(ov);
    if (onMount) onMount(mb, close);
    const first = $('input:not([type=hidden]):not([readonly]), select, textarea', mb);
    if (first) setTimeout(() => first.focus(), 30);
  });
}

export function confirmBox(title, message, { okLabel = 'Confirm', kind = 'primary' } = {}) {
  return modal({ title, body: `<p style="margin:0;line-height:1.55;white-space:pre-line">${esc(message)}</p>`, actions: [{ label: 'Cancel', value: false }, { label: okLabel, kind, value: true }] });
}

export function promptBox(title, label, { value = '', required = true, multiline = false, okLabel = 'OK', hint = '' } = {}) {
  const body = `<div class="field"><label>${esc(label)}${required ? ' <span class="req">*</span>' : ''}</label>${multiline ? `<textarea class="input" id="pv">${esc(value)}</textarea>` : `<input class="input" id="pv" value="${esc(value)}">`}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
  return modal({
    title, body, actions: [{ label: 'Cancel', value: null }, {
      label: okLabel, kind: 'primary', onClick: (mb) => {
        const v = $('#pv', mb).value.trim();
        if (required && !v) { $('#pv', mb).classList.add('invalid'); return false; }
        return v;
      },
    }],
  });
}

// ---------------------------------------------------------------- forms
/**
 * fields: [{ name, label, type: text|date|number|select|textarea|checkbox|email|tel|section, options:[[v,l]], required, full, hint, rows, placeholder, readonly }]
 */
export function formHtml(fields, values = {}, cls = '') {
  return `<div class="form ${cls}">${fields.map((f) => {
    if (f.type === 'section') return `<div class="section-title">${esc(f.label)}</div>`;
    const v = values[f.name] == null ? (f.default == null ? '' : f.default) : values[f.name];
    const req = f.required ? ' <span class="req">*</span>' : '';
    const attrs = `name="${f.name}" id="f_${f.name}" ${f.readonly ? 'readonly' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.required ? 'data-required="1"' : ''}`;
    let control;
    if (f.type === 'select') {
      control = `<select class="input" ${attrs}>${(f.options || []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea class="input ${f.cls || ''}" ${attrs} rows="${f.rows || 3}">${esc(v)}</textarea>`;
    } else if (f.type === 'checkbox') {
      return `<div class="field ${f.full ? 'full' : ''}"><label class="check"><input type="checkbox" ${attrs} ${v && v !== '0' ? 'checked' : ''}> ${esc(f.label)}</label>${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
    } else {
      control = `<input class="input" type="${f.type || 'text'}" ${attrs} value="${esc(v)}" ${f.list ? `list="${f.list}"` : ''}>`;
    }
    return `<div class="field ${f.full ? 'full' : ''}"><label for="f_${f.name}">${esc(f.label)}${req}</label>${control}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
  }).join('')}</div>`;
}

export function readForm(root) {
  const out = {};
  for (const el of $$('[name]', root)) {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else out[el.name] = el.value;
  }
  return out;
}

export function validateRequired(root) {
  let ok = true;
  for (const el of $$('[data-required]', root)) {
    const empty = el.type === 'checkbox' ? !el.checked : !String(el.value || '').trim();
    el.classList.toggle('invalid', empty);
    if (empty) ok = false;
  }
  if (!ok) toast('Please fill in the required fields (marked *).', 'warn');
  return ok;
}

export function options(list, valueKey = 'id', labelKey = 'name', blank = '— Select —') {
  return [...(blank != null ? [['', blank]] : []), ...list.map((x) => [x[valueKey], x[labelKey]])];
}

// ---------------------------------------------------------------- tables
/**
 * table(el, { columns:[{key,label,render,sort,cls,width}], rows, onRow, empty, register })
 */
export function table(el, { columns, rows, onRow, empty = 'No records found.', register = false, sortKey, sortDir = 'desc' }) {
  let key = sortKey;
  let dir = sortDir;
  const draw = () => {
    let data = rows;
    if (key) {
      const col = columns.find((c) => c.key === key);
      const get = col && col.sortValue ? col.sortValue : (r) => r[key];
      data = [...rows].sort((a, b) => {
        const x = get(a); const y = get(b);
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), undefined, { numeric: true });
        return dir === 'asc' ? r : -r;
      });
    }
    el.innerHTML = `<div class="table-wrap"><table class="tbl ${register ? 'register' : ''}"><thead><tr>${columns.map((c) => `<th class="${c.sort !== false ? 'sortable' : ''}" data-k="${c.key}" style="${c.width ? `width:${c.width}` : ''}">${esc(c.label)}${key === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${data.length ? data.map((r, i) => `<tr class="${onRow ? 'clickable' : ''}" data-i="${rows.indexOf(r)}">${columns.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r, i) : esc(r[c.key])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="empty">${icon('search')}<h4>${esc(empty)}</h4></div></td></tr>`}</tbody></table></div>`;
    $$('th.sortable', el).forEach((th) => { th.onclick = () => { if (key === th.dataset.k) dir = dir === 'asc' ? 'desc' : 'asc'; else { key = th.dataset.k; dir = 'asc'; } draw(); }; });
    if (onRow) $$('tbody tr[data-i]', el).forEach((tr) => { tr.onclick = (e) => { if (e.target.closest('a,button,input,select')) return; onRow(rows[+tr.dataset.i], e); }; });
  };
  draw();
}

// ---------------------------------------------------------------- files
export function fileRow(path, { label, sub, actions = ['open', 'folder'] } = {}) {
  if (!path) return '';
  const ext = (path.split('.').pop() || '').toLowerCase();
  const cls = ext === 'docx' ? 'docx' : ext === 'pdf' ? 'pdf' : 'other';
  return `<div class="file"><div class="ext ${cls}">${esc(ext.toUpperCase().slice(0, 4))}</div><div class="nm" title="${esc(path)}">${esc(label || baseName(path))}<small>${esc(sub || path)}</small></div>
    ${actions.includes('open') ? `<button class="btn sm" data-open="${esc(path)}">${icon('eye')}Open</button>` : ''}
    ${actions.includes('print') ? `<button class="btn sm" data-print="${esc(path)}">${icon('print')}Print</button>` : ''}
    ${actions.includes('folder') ? `<button class="btn sm ghost" data-folder="${esc(path)}" title="Show in folder">${icon('folder')}</button>` : ''}</div>`;
}

/** Wire up data-open / data-folder / data-print buttons inside root. */
export function wireFiles(root) {
  $$('[data-open]', root).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); tryApi('sys', 'openPath', b.dataset.open); }; });
  $$('[data-folder]', root).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); tryApi('sys', 'showItem', b.dataset.folder); }; });
  $$('[data-print]', root).forEach((b) => { b.onclick = async (e) => { e.stopPropagation(); if (await tryApi('sys', 'print', b.dataset.print)) toast('Sent to the printer.', 'success'); }; });
}

export function loading(el, text = 'Loading…') { el.innerHTML = `<div class="loading"><div class="spin"></div>${esc(text)}</div>`; }

export function catOptions(includeInactive = false) {
  return state.categories.filter((c) => includeInactive || c.active).map((c) => [c.id, c.name + (c.active ? '' : ' (disabled)')]);
}
export function subOptions(catId, includeInactive = false) {
  const c = state.categories.find((x) => String(x.id) === String(catId));
  return c ? c.subcategories.filter((s) => includeInactive || s.active).map((s) => [s.id, s.name]) : [];
}
export async function refreshCategories() { state.categories = await api('categories', 'list', {}); }
export async function refreshSettings() { state.settings = await api('sys', 'settingsAll'); }
