// K-Flow Automation content script: detects shortcuts as the user types and
// replaces them with snippet output. It only ever reads the few characters
// directly before the caret in the focused field — never page content.
import { api } from '../shared/browser';
import { MSG, STORAGE_KEYS, MAX_SHORTCUT_LEN } from '../shared/constants';
import { deepActiveElement, getEditTarget, textBeforeCaret, saveCaret, restoreCaret, caretRect, EditTarget, SavedCaret } from './editable';
import { replaceBeforeCaret, state as insertState, Payload } from './insert';
import { findMatch, ShortcutEntry, MatchSettings } from './match';
import { openOverlay, overlayOpen, closeOverlay } from './overlay';
import { toast, copyToast, showFab, hideFab } from './ui';
import { startPicker } from './picker';
import { initAutomation } from './automation';
import { isGoogleDocsFrame, TypedBuffer, gdocsReplace } from './gdocs';

declare global { interface Window { __kfLoaded?: boolean } }

(() => {
  if (window.__kfLoaded) return;
  window.__kfLoaded = true;

  interface IndexSettings extends MatchSettings {
    expansionEnabled: boolean; blocked: boolean; keepDelimiter: boolean; assistantHotkey: string; showFloatingButton: boolean; showToasts: boolean; googleDocsExperimental: boolean;
  }
  let settings: IndexSettings | null = null;
  let entries: ShortcutEntry[] = [];
  let maxLen = 1;
  let busy = false;
  let alive = true;

  const page = () => ({ url: location.href.slice(0, 2000), title: document.title.slice(0, 300), host: location.hostname });

  async function send<T = any>(msg: any): Promise<T | null> {
    if (!alive) return null;
    try {
      return (await api.runtime.sendMessage(msg)) as T;
    } catch (e: any) {
      if (/context invalidated|Extension context/i.test(String(e?.message))) { alive = false; detach(); }
      return null;
    }
  }

  async function refresh() {
    const r = await send<{ settings: IndexSettings; shortcuts: ShortcutEntry[] }>({ type: MSG.getIndex, host: location.hostname });
    if (!r) return;
    settings = r.settings;
    entries = r.shortcuts;
    maxLen = Math.min(MAX_SHORTCUT_LEN, Math.max(1, ...entries.map((e) => e.shortcut.length)) + 1);
  }

  // ---------- expansion
  async function expandInto(t: EditTarget, snippetId: string, deleteCount: number, typed: string, keepSuffix: string): Promise<boolean> {
    const res = await send<any>({ type: MSG.expand, snippetId, page: page() });
    if (!res) return false;
    if (res.kind === 'error') { toast(`K-Flow: ${res.message}`, { error: true, ms: 6000 }); return false; }
    let payload: Payload;
    let saved: SavedCaret | null = null;
    if (res.kind === 'form') {
      saved = saveCaret(t);
      const anchor = caretRect(t);
      const out = await openOverlay({ mode: 'form', nonce: res.nonce, anchor, doc: t.doc, page: page() });
      restoreCaret(saved);
      if (out.type !== 'submit') return false;
      payload = { text: out.text, html: out.html, isRich: out.isRich, cursorBack: out.cursorBack };
      await new Promise((r) => setTimeout(r, 30));
    } else payload = { text: res.text, html: res.html, isRich: res.isRich, cursorBack: res.cursor };

    // Verify the shortcut is still right before the caret (user may have kept typing).
    if (deleteCount > 0) {
      const now = textBeforeCaret(t, deleteCount + 8);
      if (!now || !now.text.endsWith(typed)) return false;
    }
    if (keepSuffix) {
      payload = { ...payload, text: payload.text + keepSuffix, html: payload.html + (keepSuffix === '\n' ? '<br>' : keepSuffix.replace(/&/g, '&amp;').replace(/</g, '&lt;')), cursorBack: payload.cursorBack ? payload.cursorBack + keepSuffix.length : null };
    }
    const result = await replaceBeforeCaret(t, deleteCount, payload);
    if (result === 'failed') {
      copyToast(payload.text, "K-Flow couldn't insert into this editor.");
      return false;
    }
    return true;
  }

  async function check(t: EditTarget) {
    if (!settings?.expansionEnabled || busy || insertState.inserting || !entries.length) return;
    const ctx = textBeforeCaret(t, maxLen + 1);
    if (!ctx) return;
    const m = findMatch(ctx.text, entries, settings);
    if (!m) return;
    busy = true;
    try {
      const typed = ctx.text.slice(ctx.text.length - m.length);
      const keep = m.delimiter && settings.keepDelimiter ? m.delimiter : '';
      await expandInto(t, m.entry.id, m.length, typed, keep);
    } finally {
      busy = false;
    }
  }

  const targetFromEvent = (e: Event) => getEditTarget((e.composedPath?.()[0] as Element) || (e.target as Element));

  function onInput(e: Event) {
    if (insertState.inserting || (e as InputEvent).isComposing) return;
    const ie = e as InputEvent;
    if (ie.inputType && !/^insert(Text|CompositionText|LineBreak|Paragraph)?$/.test(ie.inputType)) return;
    const t = targetFromEvent(e);
    if (t) check(t);
  }
  function onKeyUp(e: KeyboardEvent) {
    // Fallback for editors that cancel native input events (some Lexical/Draft setups).
    if (e.isComposing || insertState.inserting || (e.key.length !== 1 && e.key !== 'Enter' && e.key !== 'Tab')) return;
    const t = targetFromEvent(e);
    if (t && t.kind === 'ce') check(t);
  }

  // ---------- hotkey / assistant
  function hotkeyMatches(e: KeyboardEvent, spec: string) {
    const parts = spec.split('+').map((p) => p.trim().toLowerCase());
    const key = parts[parts.length - 1];
    const want = { ctrl: parts.includes('ctrl'), shift: parts.includes('shift'), alt: parts.includes('alt'), meta: parts.includes('meta') || parts.includes('cmd') };
    const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
    return k === key && e.ctrlKey === want.ctrl && e.shiftKey === want.shift && e.altKey === want.alt && e.metaKey === want.meta;
  }

  async function openAssistant(t: EditTarget | null) {
    if (overlayOpen()) { closeOverlay(); return; }
    const saved = t ? saveCaret(t) : null;
    const anchor = t ? caretRect(t) : undefined;
    const out = await openOverlay({ mode: 'picker', anchor, doc: t?.doc, page: page() });
    if (saved) restoreCaret(saved);
    if (out.type === 'runWorkflow') { startWorkflow(out.workflowId); return; }
    if (out.type !== 'pick') return;
    const target = t || getEditTarget(deepActiveElement());
    if (!target) { toast('Click into a text field first, then open the assistant.', { error: true }); return; }
    await new Promise((r) => setTimeout(r, 20));
    busy = true;
    try { await expandInto(target, out.snippetId, 0, '', ''); } finally { busy = false; }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!settings) return;
    if (settings.assistantHotkey && hotkeyMatches(e, settings.assistantHotkey)) {
      const t = targetFromEvent(e) || getEditTarget(deepActiveElement());
      e.preventDefault();
      e.stopPropagation();
      openAssistant(t);
    }
  }

  // ---------- floating button
  function onFocusIn(e: FocusEvent) {
    if (!settings?.showFloatingButton || window !== window.top) return;
    const t = targetFromEvent(e);
    if (!t) { hideFab(); return; }
    const r = t.root.getBoundingClientRect();
    if (r.width < 120 || r.height < 24) return;
    showFab(r, () => openAssistant(t));
  }
  function onFocusOut() { setTimeout(() => { if (!getEditTarget(deepActiveElement())) hideFab(); }, 200); }

  // ---------- automations (autofill, macros, recorder, field selector)
  const automation = initAutomation(send, async (snippetId) => {
    const t = getEditTarget(deepActiveElement());
    if (!t) throw new Error('No text field is focused');
    return expandInto(t, snippetId, 0, '', '');
  });
  async function startWorkflow(id: string) {
    // legacy Autopilot workflows were migrated to macros with id mac_<id>
    const r = await send<any>({ type: 'kf/macro/start', macroId: id.startsWith('mac_') ? id : 'mac_' + id.replace(/^wf_/, '') });
    if (r?.message) toast(r.message, { error: true });
  }

  // ---------- Google Docs (experimental)
  const gdocs = isGoogleDocsFrame();
  const typed = new TypedBuffer();
  async function onDocsKey(e: KeyboardEvent) {
    if (!settings?.googleDocsExperimental || !settings.expansionEnabled || busy) return;
    typed.push(e);
    const m = findMatch(typed.buf, entries, settings);
    if (!m) return;
    busy = true;
    typed.buf = '';
    try {
      const res = await send<any>({ type: MSG.expand, snippetId: m.entry.id, page: page() });
      if (res?.kind === 'insert') await gdocsReplace(e.target as HTMLElement, m.length, res.text + (m.delimiter && settings.keepDelimiter ? m.delimiter : ''));
      else if (res?.kind === 'form') toast('Snippets with forms are not supported in Google Docs yet — use the assistant and paste.', { error: true });
    } finally { busy = false; }
  }
  const onDocsKeyUp = (e: KeyboardEvent) => { setTimeout(() => onDocsKey(e), 0); };

  // ---------- wiring
  const opts = { capture: true } as const;
  function attach() {
    document.addEventListener('input', onInput, opts);
    document.addEventListener('keyup', onKeyUp, opts);
    document.addEventListener('keydown', onKeyDown, opts);
    document.addEventListener('focusin', onFocusIn, opts);
    document.addEventListener('focusout', onFocusOut, opts);
    if (gdocs) document.addEventListener('keyup', onDocsKeyUp, opts);
  }
  function detach() {
    document.removeEventListener('input', onInput, opts);
    document.removeEventListener('keyup', onKeyUp, opts);
    document.removeEventListener('keydown', onKeyDown, opts);
    document.removeEventListener('focusin', onFocusIn, opts);
    document.removeEventListener('focusout', onFocusOut, opts);
    document.removeEventListener('keyup', onDocsKeyUp, opts);
  }

  attach();
  refresh();

  api.storage.onChanged.addListener((changes, area) => {
    if (!alive || area !== 'local') return;
    if (changes[STORAGE_KEYS.revision] || changes[STORAGE_KEYS.settings]) refresh();
  });

  api.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
    if (sender.id !== api.runtime.id || !msg?.type) return false;
    if (typeof msg.type === 'string' && /^kf\/(autofill|macro|rec|mapper|scan|refresh)/.test(msg.type)) return automation.onMessage(msg, sendResponse);
    switch (msg.type) {
      case MSG.ping:
        sendResponse({ ok: true, host: location.hostname, top: window === window.top });
        return false;
      case MSG.openAssistant: {
        // only the frame that has focus responds (or top frame if none)
        if (!document.hasFocus() && window !== window.top) return false;
        openAssistant(getEditTarget(deepActiveElement()));
        sendResponse({ ok: true });
        return false;
      }
      case MSG.insertSnippet: {
        if (!document.hasFocus() && window !== window.top) return false;
        const t = getEditTarget(deepActiveElement());
        if (!t) { sendResponse({ ok: false, error: 'no-field' }); return false; }
        expandInto(t, String(msg.snippetId), 0, '', '').then((ok) => sendResponse({ ok }));
        return true;
      }
      case MSG.insertText: {
        // From the side panel: insert already-rendered text into the focused field.
        if (window !== window.top && !document.hasFocus()) return false;
        const t = getEditTarget(deepActiveElement());
        if (!t) { sendResponse({ ok: false, error: 'no-field' }); return false; }
        const p = msg.payload || {};
        replaceBeforeCaret(t, 0, { text: String(p.text || ''), html: String(p.html || ''), isRich: !!p.isRich, cursorBack: p.cursorBack ?? null })
          .then((r) => sendResponse({ ok: r === 'ok' }));
        return true;
      }
      case MSG.runWorkflow:
        if (window !== window.top) return false;
        startWorkflow(String(msg.id));
        sendResponse({ ok: true });
        return false;
      case MSG.startPicker:
        if (window !== window.top) return false;
        startPicker();
        sendResponse({ ok: true });
        return false;
    }
    return false;
  });
})();
