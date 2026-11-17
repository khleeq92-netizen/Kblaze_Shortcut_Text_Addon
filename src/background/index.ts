// K-Flow Automation background service worker (MV3). Kept deliberately small:
// it answers content-script requests from the local IndexedDB, renders
// field-less snippets, records usage and wires browser commands/menus.
import { api } from '../shared/browser';
import { MSG, STORAGE_KEYS } from '../shared/constants';
import { getAll, getOne, recordUsage, listRecords } from '../shared/db';
import { loadSettings, isSiteBlocked } from '../shared/settings';
import { render } from '../engine/render';
import { buildRenderContext } from '../shared/renderContext';
import { seedIfEmpty } from '../library/seed';
import type { Snippet, DataTable, Workflow, Workspace, Variable } from '../shared/types';
import * as A from './automation';
import { unprotectTable } from '../data/protect';
import { masterKey } from '../security/vault';
import { resolveVariables, formatOptionsFrom } from '../automation/variables';

// ---- one-time form sessions (content script -> overlay iframe handshake)
const formSessions = new Map<string, { snippetId: string; page: any; tabId?: number; at: number; mode: string; payload?: any }>();
function cleanupSessions() {
  const now = Date.now();
  for (const [k, v] of formSessions) if (now - v.at > 10 * 60 * 1000) formSessions.delete(k);
}
function nonce() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const overlayWindows = new Map<number, { nonce: string; tabId?: number; frameId: number; done: boolean }>();
api.windows?.onRemoved.addListener((winId) => {
  const o = overlayWindows.get(winId);
  if (!o) return;
  overlayWindows.delete(winId);
  if (!o.done && o.tabId !== undefined) api.tabs.sendMessage(o.tabId, { type: 'kf/overlayResult', nonce: o.nonce, result: { type: 'cancel' } }, { frameId: o.frameId }).catch?.(() => {});
});

async function loadAll() {
  const [settings, allSnippets, rawTables, workspaces] = await Promise.all([loadSettings(), listRecords<Snippet>('snippets'), listRecords<DataTable>('tables'), listRecords<Workspace>('workspaces')]);
  const mk = await masterKey();
  const tables = await Promise.all(rawTables.map((t) => unprotectTable(t, mk)));
  // Snippets of workspaces whose text expansion is switched off are ignored.
  const off = new Set(workspaces.filter((w) => !w.expansionActive || w.archived).map((w) => w.id));
  const snippets = allSnippets.filter((s) => !s.workspaceId || !off.has(s.workspaceId));
  return { settings, snippets, tables };
}

/** Variables for snippet expansion: global + the snippet's workspace (no vault secrets in text expansion). */
async function snippetGlobals(snippet: Snippet, settings: any, tables: DataTable[], page: any) {
  const variables = await listRecords<Variable>('variables');
  if (!variables.length) return {};
  const r = resolveVariables(variables, { datasets: tables, fo: formatOptionsFrom(settings), page, workspaceId: snippet.workspaceId || settings.activeWorkspaceId });
  const { row, record, vault, ...rest } = r.values as any;
  return rest;
}

async function getIndex(host: string) {
  const { settings, snippets } = await loadAll();
  const blocked = isSiteBlocked(settings, host);
  return {
    settings: {
      expansionEnabled: settings.expansionEnabled && !blocked,
      blocked,
      triggerMode: settings.triggerMode,
      delimiters: settings.delimiters,
      keepDelimiter: settings.keepDelimiter,
      caseSensitive: settings.caseSensitive,
      wordBoundary: settings.wordBoundary,
      assistantHotkey: settings.assistantHotkey,
      showFloatingButton: settings.showFloatingButton,
      showToasts: settings.showToasts,
      googleDocsExperimental: settings.googleDocsExperimental,
    },
    // Only shortcut metadata is sent to pages; content stays in the extension.
    shortcuts: snippets.filter((s) => s.enabled && s.shortcut).map((s) => ({ id: s.id, shortcut: s.shortcut, trigger: s.trigger || 'default' })),
  };
}

async function expand(snippetId: string, page: any, tabId?: number) {
  const { settings, snippets, tables } = await loadAll();
  const snippet = snippets.find((s) => s.id === snippetId);
  if (!snippet) return { kind: 'error', message: 'Snippet not found' };
  const ctx = buildRenderContext({ settings, snippets, tables, page });
  ctx.globals = await snippetGlobals(snippet, settings, tables, page);
  const out = render(snippet.content, snippet.contentType, ctx);
  if (out.errors.length && !out.needsForm) return { kind: 'error', message: out.errors[0] };
  if (out.needsForm) {
    cleanupSessions();
    const n = nonce();
    formSessions.set(n, { snippetId, page, tabId, at: Date.now(), mode: 'form' });
    return { kind: 'form', nonce: n, name: snippet.name };
  }
  if (!out.text.trim() && !out.html.replace(/<[^>]*>/g, '').trim()) {
    const usesProfile = /\{\{\s*me\./.test(snippet.content);
    return { kind: 'error', message: usesProfile ? `“${snippet.name}” is empty because your profile isn't filled in yet. Open the K-Flow dashboard → Settings → Profile and add your details (e.g. your signature).` : `“${snippet.name}” has no text yet. Add content to it in the K-Flow dashboard.` };
  }
  await recordUsage(snippetId);
  return { kind: 'insert', text: out.text, html: out.html, isRich: out.isRich, cursor: out.cursor === null ? null : out.text.length - out.cursor, name: snippet.name };
}

api.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('kf/')) return false;
  // Only accept messages from our own extension contexts / content scripts.
  if (sender.id !== api.runtime.id) return false;
  const tabId = sender.tab?.id;
  (async () => {
    switch (msg.type) {
      case MSG.getIndex:
        return getIndex(String(msg.host || ''));
      case MSG.expand:
        return expand(String(msg.snippetId), msg.page, tabId);
      case MSG.claimForm: {
        // Called by the overlay iframe (an extension page) to learn what to show.
        const s = formSessions.get(String(msg.nonce));
        if (!s) return { ok: false };
        formSessions.delete(String(msg.nonce));
        return { ok: true, snippetId: s.snippetId, page: s.page, mode: s.mode, payload: s.payload };
      }
      case 'kf/openOverlay': {
        // content script asks for an overlay session (picker / confirm / form)
        cleanupSessions();
        const n = nonce();
        formSessions.set(n, { snippetId: String(msg.snippetId || ''), page: msg.page, tabId, at: Date.now(), mode: String(msg.mode || 'picker'), payload: msg.payload });
        return { nonce: n };
      }
      case 'kf/renderText': {
        // Autopilot "type" steps may use commands such as {{me.name}} or {{today}}.
        const { settings, snippets, tables } = await loadAll();
        const out = render(String(msg.content || ''), 'text', buildRenderContext({ settings, snippets, tables, page: msg.page }));
        if (out.errors.length) return { error: out.errors[0] };
        if (out.needsForm) return { error: 'Autopilot text cannot contain form fields — use an "Insert snippet" step instead' };
        return { text: out.text };
      }
      case 'kf/openOverlayWindow': {
        // Popup-window variant of the overlay for cross-origin-isolated pages.
        const n = String(msg.nonce);
        const width = msg.mode === 'picker' ? 460 : 500;
        const height = msg.mode === 'picker' ? 470 : msg.mode === 'confirm' ? 300 : msg.mode === 'mapField' ? 640 : 620;
        let left: number | undefined, top: number | undefined;
        try {
          const w = sender.tab?.windowId !== undefined ? await api.windows.get(sender.tab.windowId) : null;
          if (w && w.left !== undefined && w.width !== undefined && w.top !== undefined && w.height !== undefined) {
            left = Math.round(w.left + (w.width - width) / 2);
            top = Math.round(w.top + Math.max(40, (w.height - height) / 2));
          }
        } catch { /* default placement */ }
        const win = await api.windows.create({ url: api.runtime.getURL('overlay/index.html') + `#nonce=${n}&window=1`, type: 'popup', width, height, left, top, focused: true });
        if (win?.id === undefined) return { ok: false };
        overlayWindows.set(win.id, { nonce: n, tabId: sender.tab?.id, frameId: sender.frameId ?? 0, done: false });
        return { ok: true };
      }
      case 'kf/overlayResult': {
        // From the popup-window overlay: relay to the content script that asked, then close.
        for (const [winId, o] of overlayWindows) {
          if (o.nonce !== msg.nonce) continue;
          o.done = true;
          if (o.tabId !== undefined) {
            try { await api.windows.update((await api.tabs.get(o.tabId)).windowId, { focused: true }); } catch { /* ignore */ }
            api.tabs.sendMessage(o.tabId, { type: 'kf/overlayResult', nonce: o.nonce, result: msg.result }, { frameId: o.frameId }).catch?.(() => {});
          }
          api.windows.remove(winId).catch?.(() => {});
          overlayWindows.delete(winId);
        }
        return { ok: true };
      }
      case 'kf/closeOverlayWindow': {
        for (const [winId, o] of overlayWindows) if (o.nonce === msg.nonce) { o.done = true; api.windows.remove(winId).catch?.(() => {}); overlayWindows.delete(winId); }
        return { ok: true };
      }
      case MSG.recordUsage:
        await recordUsage(String(msg.snippetId));
        return { ok: true };
      case MSG.listForAssistant: {
        const { snippets } = await loadAll();
        const usage = await getAll<any>('usage');
        const u = new Map(usage.map((x) => [x.snippetId, x]));
        return snippets.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name, shortcut: s.shortcut, preview: s.content.slice(0, 160), contentType: s.contentType, favorite: s.favorite, pinned: s.pinned, lastUsedAt: u.get(s.id)?.lastUsedAt || 0, count: u.get(s.id)?.count || 0 }));
      }
      case MSG.listWorkflows:
        // assistant "Macros" tab
        return (await listRecords<any>('macros')).filter((m) => m.enabled).map((m) => ({ id: m.id, name: m.name, steps: m.steps, description: m.description }));
      case MSG.getWorkflow:
        return getOne<Workflow>('workflows', String(msg.id));
      case MSG.openDashboard:
        await api.tabs.create({ url: api.runtime.getURL('dashboard/index.html' + (msg.hash ? '#' + msg.hash : '')) });
        return { ok: true };
      case MSG.picked:
        await new Promise<void>((r) => api.storage.local.set({ [STORAGE_KEYS.picked]: { ...msg.element, at: Date.now() } }, () => r()));
        return { ok: true };
      default:
        return handleAutomation(msg, sender);
    }
  })().then(sendResponse, (e) => sendResponse({ kind: 'error', error: String(e?.message || e), message: String(e?.message || e) }));
  return true;
});

// ---- keyboard command + context menu: open the assistant in the active field
// ---- side panel
async function applyActionBehaviour() {
  const s = await loadSettings();
  const sp = (api as any).sidePanel;
  if (!sp?.setPanelBehavior) return;
  const panel = s.actionOpens === 'sidepanel';
  await sp.setPanelBehavior({ openPanelOnActionClick: panel }).catch(() => {});
  await api.action.setPopup({ popup: panel ? '' : 'popup/index.html' });
}
function openSidePanel(windowId?: number) {
  const sp = (api as any).sidePanel;
  if (sp?.open && windowId !== undefined) return sp.open({ windowId }).catch(() => {});
  if ((api as any).sidebarAction?.open) return (api as any).sidebarAction.open();
}
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.settings]) applyActionBehaviour();
});
applyActionBehaviour();

api.commands?.onCommand.addListener((command, tab) => {
  if (command === 'open-side-panel') openSidePanel(tab?.windowId);
  if (command === 'open-assistant' && tab?.id !== undefined) api.tabs.sendMessage(tab.id, { type: MSG.openAssistant }).catch?.(() => {});
});

function setupMenus() {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: 'kf-insert', title: 'Insert K-Flow snippet…', contexts: ['editable'] });
    if ((api as any).sidePanel?.open) api.contextMenus.create({ id: 'kf-sidepanel', title: 'Open K-Flow side panel', contexts: ['all'] });
    api.contextMenus.create({ id: 'kf-new-from-selection', title: 'Create K-Flow snippet from selection', contexts: ['selection'] });
    api.contextMenus.create({ id: 'kf-map-field', title: 'K-Flow: map this field…', contexts: ['editable'] });
    api.contextMenus.create({ id: 'kf-autofill', title: 'K-Flow: autofill this page', contexts: ['page', 'editable'] });
  });
}
api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kf-sidepanel') { openSidePanel(tab?.windowId); return; }
  if (!tab?.id) return;
  if (info.menuItemId === 'kf-insert') api.tabs.sendMessage(tab.id, { type: MSG.openAssistant }, { frameId: info.frameId }).catch?.(() => {});
  if (info.menuItemId === 'kf-new-from-selection') {
    const text = (info.selectionText || '').slice(0, 20000);
    api.tabs.create({ url: api.runtime.getURL('dashboard/index.html#/new?text=' + encodeURIComponent(text)) });
  }
});

// Activate expansion in tabs that were already open when the extension was installed
// or updated (declared content scripts only reach pages loaded afterwards).
async function injectIntoOpenTabs() {
  if (!api.scripting?.executeScript) return;
  const tabs = await api.tabs.query({});
  for (const t of tabs) {
    if (t.id === undefined || !/^(https?|file):/.test(t.url || '')) continue;
    api.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, files: ['content.js'] }).catch(() => {});
  }
}

api.runtime.onInstalled.addListener(async (details) => {
  setupMenus();
  injectIntoOpenTabs();
  if (details.reason === 'install') {
    await seedIfEmpty();
    api.tabs.create({ url: api.runtime.getURL('dashboard/index.html#/welcome') });
  }
});
api.runtime.onStartup?.addListener(setupMenus);

// =====================================================================
// K-Flow automation messages
// =====================================================================
async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [t] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  return t;
}

/**
 * Messages from content scripts may only act on their own tab and never get
 * privileged data beyond what a run on that page needs. Messages from extension
 * pages (dashboard, side panel, popup, overlay) may target any tab by id.
 */
async function handleAutomation(msg: any, sender: chrome.runtime.MessageSender): Promise<any> {
  const fromExt = !sender.tab || (sender.url || '').startsWith(api.runtime.getURL(''));
  const senderTab = sender.tab?.id;
  const pageUrl = String(msg.url || sender.tab?.url || sender.url || '');
  const tabFor = async () => {
    if (!fromExt) return senderTab!;
    if (typeof msg.tabId === 'number') return msg.tabId as number;
    const t = await activeTab();
    if (t?.id === undefined) throw new Error('No active tab');
    return t.id;
  };
  const urlFor = async (tabId: number) => (fromExt ? (await api.tabs.get(tabId)).url || '' : pageUrl);
  const toTab = async (tabId: number, m: any, frameId = 0) => api.tabs.sendMessage(tabId, m, { frameId });
  switch (msg.type) {
    case 'kf/automation/forPage': {
      const tabId = await tabFor();
      const url = await urlFor(tabId);
      const info = await A.forPage(url);
      const [run, rec] = await Promise.all([A.getRun(tabId), A.getRecording(tabId)]);
      return { ...info, run: run && run.status !== 'stopped' ? { name: run.name, status: run.status, step: run.state?.stepIndex } : null, recording: rec ? { steps: rec.steps.length, paused: rec.paused } : null, tabId, url };
    }
    // ---- autofill
    case 'kf/autofill/plan':
      return A.autofillPlan(String(msg.profileId), pageUrl, msg.recordId ?? null);
    case 'kf/autofill/report':
      return A.logAutofill({ profileId: String(msg.profileId), name: String(msg.name || ''), url: pageUrl, preview: !!msg.preview, report: msg.report, recordId: msg.recordId, record: msg.record, workspaceId: msg.workspaceId });
    case 'kf/autofill/run': {
      const tabId = await tabFor();
      return toTab(tabId, { type: 'kf/autofill/start', profileId: msg.profileId, preview: !!msg.preview, recordId: msg.recordId ?? null });
    }
    // ---- dataset records
    case 'kf/dataset/move':
      return A.moveRecord(String(msg.datasetId), msg.dir || 'next', msg.rowId);
    // ---- macros
    case 'kf/macro/start': {
      const tabId = await tabFor();
      const url = await urlFor(tabId);
      const r = await A.startMacro(tabId, String(msg.macroId), url);
      await toTab(tabId, { type: 'kf/macro/resume', run: r.run, macro: r.macro, official: r.official });
      return { ok: true, runId: r.run.runId };
    }
    case 'kf/macro/pending':
      return senderTab !== undefined ? A.resumeInfo(senderTab, pageUrl) : null;
    case 'kf/macro/checkpoint':
      return senderTab !== undefined ? A.checkpoint(senderTab, msg.state, pageUrl) : { status: 'stopped' };
    case 'kf/macro/finish':
      if (senderTab !== undefined) await A.finishMacro(senderTab, { status: msg.status, error: msg.error, state: msg.state });
      return { ok: true };
    case 'kf/macro/control': {
      const tabId = await tabFor();
      return A.controlMacro(tabId, msg.action);
    }
    case 'kf/macro/render': {
      const tabId = await tabFor();
      return { text: await A.renderWith(String(msg.text || ''), await A.macroValues(tabId, msg.vars || {}, pageUrl)) };
    }
    case 'kf/macro/formula': {
      const tabId = await tabFor();
      return { ok: await A.evalFormulaFor(String(msg.src || ''), await A.macroValues(tabId, msg.vars || {}, pageUrl)) };
    }
    case 'kf/macro/nextRecord': {
      const tabId = await tabFor();
      const run = await A.getRun(tabId);
      if (!run?.datasetId) throw new Error('This macro has no dataset — choose one in the macro settings');
      return A.moveRecord(run.datasetId, 'next');
    }
    // ---- recorder
    case 'kf/rec/start': {
      const tabId = await tabFor();
      const url = await urlFor(tabId);
      await A.startRecording(tabId, url);
      await toTab(tabId, { type: 'kf/rec/begin' });
      return { ok: true };
    }
    case 'kf/rec/status':
      return senderTab !== undefined ? A.recordPageLoad(senderTab, pageUrl) : null;
    case 'kf/rec/step':
      return senderTab !== undefined ? A.recordStep(senderTab, msg.step, !!msg.replace) : { ok: false };
    case 'kf/rec/pause': {
      const tabId = await tabFor();
      const r = await A.pauseRecording(tabId, !!msg.paused);
      toTab(tabId, { type: 'kf/rec/paused', paused: !!msg.paused }).catch(() => {});
      return { ok: !!r };
    }
    case 'kf/rec/stop': {
      const tabId = await tabFor();
      const res = await A.stopRecording(tabId, msg.save !== false, msg.name);
      toTab(tabId, { type: 'kf/rec/end' }).catch(() => {});
      if (res.saved && msg.open !== false) api.tabs.create({ url: api.runtime.getURL(`dashboard/index.html#/macros/${res.macroId}`) });
      return res;
    }
    // ---- scripts
    case 'kf/script/run': {
      const tabId = await tabFor();
      const url = await urlFor(tabId);
      const frameId = fromExt ? 0 : sender.frameId ?? 0;
      return A.runScript(String(msg.scriptId), tabId, frameId, url, msg.vars || {});
    }
    // ---- field selector / scanning
    case 'kf/mapper/start': {
      const tabId = await tabFor();
      return toTab(tabId, { type: 'kf/mapper/begin', profileId: msg.profileId || null });
    }
    case 'kf/scan': {
      if (!fromExt) return { error: 'not allowed' };
      const tabId = await tabFor();
      const url = await urlFor(tabId);
      const r = await toTab(tabId, { type: 'kf/scan' });
      return { ...(r || {}), url, tabId };
    }
    case 'kf/tabs/list': {
      if (!fromExt) return [];
      const tabs = await api.tabs.query({});
      return tabs.filter((t) => /^https?:/.test(t.url || '')).map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
    }
    case 'kf/render': {
      if (!fromExt) return { error: 'not allowed' };
      return { text: await A.renderWith(String(msg.text || ''), { workspaceId: msg.workspaceId, datasetId: msg.datasetId, url: msg.url }) };
    }
  }
  return { error: 'unknown message' };
}

// Keep a recording / run alive across navigations: inform the new page.
api.tabs.onRemoved.addListener(async (tabId) => {
  const run = await A.getRun(tabId);
  if (run) await A.finishMacro(tabId, { status: 'stopped', error: 'Tab was closed', state: run.state });
  if (await A.getRecording(tabId)) await A.stopRecording(tabId, true);
});

// Commands + context menu entries for automation
api.commands?.onCommand.addListener(async (command, tab) => {
  if (tab?.id === undefined) return;
  if (command === 'run-autofill') api.tabs.sendMessage(tab.id, { type: 'kf/autofill/hotkey' }, { frameId: 0 }).catch?.(() => {});
  if (command === 'field-selector') api.tabs.sendMessage(tab.id, { type: 'kf/mapper/begin' }, { frameId: 0 }).catch?.(() => {});
});
api.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'kf-map-field') api.tabs.sendMessage(tab.id, { type: 'kf/mapper/begin', focused: true }, { frameId: info.frameId ?? 0 }).catch?.(() => {});
  if (info.menuItemId === 'kf-autofill') api.tabs.sendMessage(tab.id, { type: 'kf/autofill/hotkey' }, { frameId: 0 }).catch?.(() => {});
});
