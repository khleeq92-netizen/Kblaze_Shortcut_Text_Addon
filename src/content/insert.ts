// Safe text insertion. Strategy per editor type:
//  input/textarea      execCommand('insertText') (native undo + framework events) → setRangeText fallback
//  framework editors   (Lexical/WhatsApp, ProseMirror, Draft, Slate, Quill, CKEditor) synthetic paste
//                      over a selection of the shortcut → execCommand fallback
//  generic CE / Gmail  execCommand insertHTML / insertText over the selection
import { EditTarget, selectionFor, textBeforeCaret } from './editable';
import { sanitizeHtml, textToHtml } from '../shared/html';

export interface Payload {
  text: string;
  html: string;
  isRich: boolean;
  /** move caret this many characters back from the end of the insertion */
  cursorBack: number | null;
}

export const state = { inserting: false };

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
const norm = (s: string) => s.replace(/[​﻿⁠]/g, '').replace(/ /g, ' ').replace(/\s+/g, ' ');

function tailMatches(t: EditTarget, expected: string): boolean {
  const tail = norm(expected).trimEnd().slice(-12);
  if (!tail) return true;
  const cur = textBeforeCaret(t, 200);
  if (!cur) return true; // cannot verify (non-collapsed selection) — assume ok
  return norm(cur.text).trimEnd().endsWith(tail);
}

function insertIntoInput(t: EditTarget, deleteCount: number, p: Payload): boolean {
  const el = t.el as HTMLInputElement | HTMLTextAreaElement;
  const caret = el.selectionStart ?? el.value.length;
  const start = Math.max(0, caret - deleteCount);
  const text = t.kind === 'input' ? p.text.replace(/\r?\n/g, ' ') : p.text;
  el.focus({ preventScroll: true });
  el.setSelectionRange(start, caret);
  const before = el.value;
  let ok = false;
  try { ok = t.doc.execCommand('insertText', false, text); } catch { ok = false; }
  const expected = before.slice(0, start) + text + before.slice(caret);
  if (!ok || el.value !== expected) {
    if (el.value !== before) el.value = before; // undo partial change
    el.setRangeText(text, start, caret, 'end');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const end = start + text.length;
  const pos = p.cursorBack ? Math.max(start, end - p.cursorBack) : end;
  el.setSelectionRange(pos, pos);
  return true;
}

function dispatchPaste(target: HTMLElement, p: Payload, rich: boolean): boolean {
  const dt = new DataTransfer();
  dt.setData('text/plain', p.text);
  if (rich) dt.setData('text/html', sanitizeHtml(p.html));
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
  // Some engines ignore clipboardData in the constructor
  if (!ev.clipboardData) Object.defineProperty(ev, 'clipboardData', { value: dt });
  target.dispatchEvent(ev);
  return ev.defaultPrevented;
}

function execInsert(t: EditTarget, p: Payload, rich: boolean): boolean {
  const doc = t.doc;
  try {
    if (rich) return doc.execCommand('insertHTML', false, sanitizeHtml(p.html));
    if (p.text.includes('\n')) return doc.execCommand('insertHTML', false, textToHtml(p.text));
    return doc.execCommand('insertText', false, p.text);
  } catch {
    return false;
  }
}

function moveCaretBack(t: EditTarget, n: number) {
  const sel = selectionFor(t) as any;
  if (!sel?.modify) return;
  for (let i = 0; i < n; i++) sel.modify('move', 'backward', 'character');
}

const PASTE_FRAMEWORKS = new Set(['lexical', 'prosemirror', 'draft', 'slate', 'quill', 'ckeditor']);

/**
 * Replaces `deleteCount` characters before the caret with the payload.
 * Returns 'ok' | 'failed'. Never throws.
 */
export async function replaceBeforeCaret(t: EditTarget, deleteCount: number, p: Payload): Promise<'ok' | 'failed'> {
  state.inserting = true;
  try {
    if (t.kind !== 'ce') return insertIntoInput(t, deleteCount, p) ? 'ok' : 'failed';
    const rich = p.isRich;
    const sel = selectionFor(t);
    if (!sel) return 'failed';
    t.root.focus({ preventScroll: true });
    if (deleteCount > 0) {
      const ctx = textBeforeCaret(t, Math.max(64, deleteCount));
      const r = ctx?.rangeFor(deleteCount);
      if (!r) return 'failed';
      sel.removeAllRanges();
      sel.addRange(r);
    }
    let done = false;
    if (PASTE_FRAMEWORKS.has(t.framework)) {
      // let the editor observe the new selection (selectionchange is async)
      await tick(0);
      await frame();
      if (dispatchPaste(t.root, p, rich)) {
        await tick(30);
        done = true;
      }
    }
    if (!done) {
      done = execInsert(t, p, rich);
      if (!done && rich) done = execInsert(t, p, false);
    }
    if (!done) return 'failed';
    if (p.cursorBack) {
      if (PASTE_FRAMEWORKS.has(t.framework)) await tick(10);
      moveCaretBack(t, p.cursorBack);
    }
    if (!p.cursorBack && !tailMatches(t, p.text)) {
      // Editor may update asynchronously; give it a moment before reporting failure.
      await tick(80);
      if (!tailMatches(t, p.text)) return 'failed';
    }
    return 'ok';
  } finally {
    setTimeout(() => (state.inserting = false), 0);
  }
}
