// QuickText Hub background service worker (MV3). Kept deliberately small:
// it answers content-script requests from the local IndexedDB, renders
// field-less snippets, records usage and wires browser commands/menus.
import { api } from '../shared/browser';
import { MSG, STORAGE_KEYS } from '../shared/constants';
import { getAll, getOne, recordUsage, listRecords } from '../shared/db';
import { loadSettings, isSiteBlocked } from '../shared/settings';
import { render } from '../engine/render';
import { buildRenderContext } from '../shared/renderContext';
import { seedIfEmpty } from '../library/seed';
import type { Snippet, DataTable, Workflow } from '../shared/types';

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
  if (!o.done && o.tabId !== undefined) api.tabs.sendMessage(o.tabId, { type: 'qth/overlayResult', nonce: o.nonce, result: { type: 'cancel' } }, { frameId: o.frameId }).catch?.(() => {});
});

async function loadAll() {
  const [settings, snippets, tables] = await Promise.all([loadSettings(), listRecords<Snippet>('snippets'), listRecords<DataTable>('tables')]);
  return { settings, snippets, tables };
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
    return { kind: 'error', message: usesProfile ? `“${snippet.name}” is empty because your profile isn't filled in yet. Open the QuickText dashboard → Settings → Profile and add your details (e.g. your signature).` : `“${snippet.name}” has no text yet. Add content to it in the QuickText dashboard.` };
  }
  await recordUsage(snippetId);
  return { kind: 'insert', text: out.text, html: out.html, isRich: out.isRich, cursor: out.cursor === null ? null : out.text.length - out.cursor, name: snippet.name };
}

api.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('qth/')) return false;
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
      case 'qth/openOverlay': {
        // content script asks for an overlay session (picker / confirm / form)
        cleanupSessions();
        const n = nonce();
        formSessions.set(n, { snippetId: String(msg.snippetId || ''), page: msg.page, tabId, at: Date.now(), mode: String(msg.mode || 'picker'), payload: msg.payload });
        return { nonce: n };
      }
      case 'qth/renderText': {
        // Autopilot "type" steps may use commands such as {{me.name}} or {{today}}.
        const { settings, snippets, tables } = await loadAll();
        const out = render(String(msg.content || ''), 'text', buildRenderContext({ settings, snippets, tables, page: msg.page }));
        if (out.errors.length) return { error: out.errors[0] };
        if (out.needsForm) return { error: 'Autopilot text cannot contain form fields — use an "Insert snippet" step instead' };
        return { text: out.text };
      }
      case 'qth/openOverlayWindow': {
        // Popup-window variant of the overlay for cross-origin-isolated pages.
        const n = String(msg.nonce);
        const width = msg.mode === 'picker' ? 460 : 500;
        const height = msg.mode === 'picker' ? 470 : msg.mode === 'confirm' ? 300 : 620;
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
      case 'qth/overlayResult': {
        // From the popup-window overlay: relay to the content script that asked, then close.
        for (const [winId, o] of overlayWindows) {
          if (o.nonce !== msg.nonce) continue;
          o.done = true;
          if (o.tabId !== undefined) {
            try { await api.windows.update((await api.tabs.get(o.tabId)).windowId, { focused: true }); } catch { /* ignore */ }
            api.tabs.sendMessage(o.tabId, { type: 'qth/overlayResult', nonce: o.nonce, result: msg.result }, { frameId: o.frameId }).catch?.(() => {});
          }
          api.windows.remove(winId).catch?.(() => {});
          overlayWindows.delete(winId);
        }
        return { ok: true };
      }
      case 'qth/closeOverlayWindow': {
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
        return (await listRecords<Workflow>('workflows')).filter((w) => w.enabled);
      case MSG.getWorkflow:
        return getOne<Workflow>('workflows', String(msg.id));
      case MSG.openDashboard:
        await api.tabs.create({ url: api.runtime.getURL('dashboard/index.html' + (msg.hash ? '#' + msg.hash : '')) });
        return { ok: true };
      case MSG.picked:
        await new Promise<void>((r) => api.storage.local.set({ [STORAGE_KEYS.picked]: { ...msg.element, at: Date.now() } }, () => r()));
        return { ok: true };
      default:
        return { error: 'unknown message' };
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
    api.contextMenus.create({ id: 'qth-insert', title: 'Insert QuickText snippet…', contexts: ['editable'] });
    if ((api as any).sidePanel?.open) api.contextMenus.create({ id: 'qth-sidepanel', title: 'Open QuickText side panel', contexts: ['all'] });
    api.contextMenus.create({ id: 'qth-new-from-selection', title: 'Create QuickText snippet from selection', contexts: ['selection'] });
  });
}
api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'qth-sidepanel') { openSidePanel(tab?.windowId); return; }
  if (!tab?.id) return;
  if (info.menuItemId === 'qth-insert') api.tabs.sendMessage(tab.id, { type: MSG.openAssistant }, { frameId: info.frameId }).catch?.(() => {});
  if (info.menuItemId === 'qth-new-from-selection') {
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
