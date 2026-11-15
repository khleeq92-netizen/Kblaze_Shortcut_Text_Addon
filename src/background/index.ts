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
api.commands?.onCommand.addListener((command, tab) => {
  if (command === 'open-assistant' && tab?.id !== undefined) api.tabs.sendMessage(tab.id, { type: MSG.openAssistant }).catch?.(() => {});
});

function setupMenus() {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: 'qth-insert', title: 'Insert QuickText snippet…', contexts: ['editable'] });
    api.contextMenus.create({ id: 'qth-new-from-selection', title: 'Create QuickText snippet from selection', contexts: ['selection'] });
  });
}
api.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'qth-insert') api.tabs.sendMessage(tab.id, { type: MSG.openAssistant }, { frameId: info.frameId }).catch?.(() => {});
  if (info.menuItemId === 'qth-new-from-selection') {
    const text = (info.selectionText || '').slice(0, 20000);
    api.tabs.create({ url: api.runtime.getURL('dashboard/index.html#/new?text=' + encodeURIComponent(text)) });
  }
});

api.runtime.onInstalled.addListener(async (details) => {
  setupMenus();
  if (details.reason === 'install') {
    await seedIfEmpty();
    api.tabs.create({ url: api.runtime.getURL('dashboard/index.html#/welcome') });
  }
});
api.runtime.onStartup?.addListener(setupMenus);
