// EduDesk renderer entry: navigation, routing, global shortcuts and live refresh.
import { icon } from './icons.js';
import { api, state, $, $$, esc, toast, refreshCategories, refreshSettings, modal } from './lib.js';

const NAV = [
  { group: 'Office' },
  { r: 'dashboard', label: 'Dashboard', icon: 'dashboard', key: '1' },
  { r: 'letter/new', label: 'Create Letter', icon: 'pen', key: '2' },
  { r: 'drafts', label: 'Drafts', icon: 'drafts', count: 'drafts', key: '3' },
  { r: 'outward', label: 'Outward Register', icon: 'outbox', key: '4' },
  { r: 'inward', label: 'Inward Register', icon: 'inbox', count: 'pendingInward', key: '5' },
  { r: 'dispatch', label: 'Dispatch Management', icon: 'truck', count: 'readyForDispatch', key: '6' },
  { group: 'UDISE' },
  { r: 'udise', label: 'UDISE S02 / S03', icon: 'form', key: '7' },
  { r: 'students', label: 'Students', icon: 'student' },
  { group: 'Library' },
  { r: 'templates', label: 'Templates', icon: 'template', key: '8' },
  { r: 'recipients', label: 'Recipient Directory', icon: 'users' },
  { group: 'Records' },
  { r: 'reports', label: 'Reports', icon: 'chart', key: '9' },
  { r: 'archive', label: 'Archive & Search', icon: 'archive' },
  { r: 'settings', label: 'Settings', icon: 'settings' },
];

const VIEWS = {
  dashboard: () => import('./views/dashboard.js'),
  letter: () => import('./views/letter.js'),
  drafts: () => import('./views/drafts.js'),
  outward: () => import('./views/outward.js'),
  inward: () => import('./views/inward.js'),
  dispatch: () => import('./views/dispatch.js'),
  udise: () => import('./views/udise.js'),
  students: () => import('./views/students.js'),
  templates: () => import('./views/templates.js'),
  recipients: () => import('./views/recipients.js'),
  reports: () => import('./views/reports.js'),
  archive: () => import('./views/archive.js'),
  settings: () => import('./views/settings.js'),
};

let current = null; // { name, ctl }
let counts = {};

function parseHash() {
  const h = (location.hash || '#/dashboard').slice(2);
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || 'dashboard', parts, query, path };
}

export function go(path) { location.hash = `#/${path}`; }
window.__go = go;

function renderNav() {
  const r = parseHash();
  $('#nav').innerHTML = NAV.map((n) => {
    if (n.group) return `<div class="group">${esc(n.group)}</div>`;
    const active = r.path === n.r || (r.name === n.r.split('/')[0] && !(n.r === 'letter/new' && r.path !== 'letter/new'));
    const c = n.count && counts[n.count] ? `<span class="count">${counts[n.count]}</span>` : '';
    return `<a href="#/${n.r}" class="${active ? 'active' : ''}" title="${esc(n.label)}${n.key ? ` (Alt+${n.key})` : ''}">${icon(n.icon)}<span>${esc(n.label)}</span>${c}</a>`;
  }).join('');
}

async function refreshCounts() {
  try {
    const s = await api('dashboard', 'stats');
    counts = s;
    renderNav();
  } catch (_) { /* ignore during restore */ }
}

async function route() {
  const r = parseHash();
  const loader = VIEWS[r.name];
  if (!loader) return go('dashboard');
  if (current && current.ctl && current.ctl.canLeave && !(await current.ctl.canLeave())) {
    history.back();
    return;
  }
  if (current && current.ctl && current.ctl.dispose) current.ctl.dispose();
  const el = $('#view');
  el.scrollTop = 0;
  el.innerHTML = '';
  renderNav();
  try {
    const mod = await loader();
    const ctl = (await mod.render(el, r)) || {};
    current = { name: r.name, ctl };
    $('#page-title').textContent = ctl.title || mod.title || '';
    $('#page-crumb').textContent = ctl.crumb || '';
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="callout err">${icon('alert')}<div><b>This screen could not be opened.</b><br>${esc(e.message)}</div></div>`;
  }
}

let refreshTimer = null;
function onDataChanged(what) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (what === 'categories') await refreshCategories();
    if (what === 'settings') { await refreshSettings(); updateFooter(); }
    refreshCounts();
    if (current && current.ctl && current.ctl.refresh) current.ctl.refresh(what);
  }, 150);
}

function updateFooter() {
  const c = state.settings && state.settings.college;
  const conv = state.info && state.info.converter;
  $('#side-foot').innerHTML = `<div><b>${esc((c && c.name) || 'College profile not set')}</b></div>
    <div style="margin-top:4px">${conv ? (conv.wordAvailable ? 'Microsoft Word detected' : conv.libreOfficeAvailable ? 'Using LibreOffice for PDF' : '<span style="color:#fca5a5">No PDF converter found</span>') : ''}</div>
    <div style="margin-top:2px">v${esc(state.info ? state.info.version : '')} · ${esc(state.info && state.info.user ? state.info.user.display_name : '')}</div>`;
}

function shortcuts(e) {
  if (e.ctrlKey && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.key === 'f' || e.key === 'F')) {
    if (e.key.toLowerCase() === 'f' && document.activeElement && document.activeElement.closest('.modal')) return;
    e.preventDefault(); $('#global-search').focus(); $('#global-search').select();
  } else if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); go('letter/new'); } else if (e.ctrlKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); go('inward/new'); } else if (e.altKey && /^[1-9]$/.test(e.key)) {
    const n = NAV.find((x) => x.key === e.key);
    if (n) { e.preventDefault(); go(n.r); }
  } else if (e.key === 'F1') { e.preventDefault(); showShortcuts(); }
}

function showShortcuts() {
  const rows = [['Ctrl + N', 'Create a new letter'], ['Ctrl + I', 'Add an inward entry'], ['Ctrl + K / Ctrl + F', 'Search all records'], ['Ctrl + S', 'Save draft (in the letter editor)'],
    ['Alt + 1 … 9', 'Open sidebar sections in order'], ['Esc', 'Close a dialog'], ['F1', 'This help']];
  modal({ title: 'Keyboard shortcuts', body: `<table class="tbl">${rows.map(([k, d]) => `<tr><td style="width:180px"><span class="kbd">${esc(k)}</span></td><td>${esc(d)}</td></tr>`).join('')}</table>` });
}

async function boot() {
  try {
    state.info = await api('sys', 'info');
    await refreshSettings();
    await refreshCategories();
  } catch (e) {
    $('#view').innerHTML = `<div class="callout err">${icon('alert')}<div><b>EduDesk could not start.</b><br>${esc(e.message)}</div></div>`;
    return;
  }
  updateFooter();
  if (state.info.integrity && !state.info.integrity.ok) toast('Database integrity check reported a problem. Please create a backup and contact support.', 'error', 15000);
  window.edudesk.onChanged(onDataChanged);
  window.edudesk.onNotice((n) => toast(n.text, n.type));
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', shortcuts);
  $('#btn-new-letter').onclick = () => go('letter/new');
  const gs = $('#global-search');
  gs.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(`archive?q=${encodeURIComponent(gs.value.trim())}`); });
  await refreshCounts();
  if (!state.settings.ui.onboardingDone && !state.settings.college.name) {
    if (!location.hash || location.hash === '#/dashboard') location.hash = '#/settings/college?welcome=1';
  }
  route();
}

boot();
