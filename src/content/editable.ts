// Detection of editable targets and caret-relative text access for
// <input>, <textarea> and contenteditable (incl. shadow DOM and iframes).

export type Kind = 'input' | 'textarea' | 'ce';
export type Framework = 'lexical' | 'prosemirror' | 'draft' | 'slate' | 'quill' | 'ckeditor' | 'tinymce' | 'gdocs' | 'generic';

export interface EditTarget {
  el: HTMLElement;
  kind: Kind;
  /** contenteditable root (or the input itself) */
  root: HTMLElement;
  doc: Document;
  framework: Framework;
}

const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel']);

export function deepActiveElement(doc: Document = document): Element | null {
  let a: Element | null = doc.activeElement;
  while (a && (a as HTMLElement).shadowRoot?.activeElement) a = (a as HTMLElement).shadowRoot!.activeElement;
  return a;
}

export function detectFramework(root: HTMLElement): Framework {
  if (root.getAttribute('data-lexical-editor') === 'true') return 'lexical';
  if (root.classList.contains('ProseMirror')) return 'prosemirror';
  if (root.closest('.DraftEditor-root') || root.getAttribute('data-contents') === 'true') return 'draft';
  if (root.getAttribute('data-slate-editor') === 'true') return 'slate';
  if (root.classList.contains('ql-editor')) return 'quill';
  if (root.classList.contains('ck-editor__editable') || root.classList.contains('ck-content')) return 'ckeditor';
  if (root.id === 'tinymce' || root.classList.contains('mce-content-body')) return 'tinymce';
  if (/(^|\.)docs\.google\.com$/.test(safeHost(root.ownerDocument)) || root.ownerDocument.defaultView?.frameElement?.classList?.contains('docs-texteventtarget-iframe')) return 'gdocs';
  return 'generic';
}

function safeHost(doc: Document) {
  try { return doc.location?.hostname || window.top?.location.hostname || ''; } catch { return doc.location?.hostname || ''; }
}

export function getEditTarget(node: EventTarget | Element | null): EditTarget | null {
  const el = node as HTMLElement | null;
  if (!el || !(el as any).tagName) return null;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const inp = el as HTMLInputElement;
    if (!TEXT_TYPES.has((inp.getAttribute('type') || '').toLowerCase()) || inp.readOnly || inp.disabled) return null;
    return { el, kind: 'input', root: el, doc: el.ownerDocument, framework: 'generic' };
  }
  if (tag === 'TEXTAREA') {
    const ta = el as HTMLTextAreaElement;
    if (ta.readOnly || ta.disabled) return null;
    return { el, kind: 'textarea', root: el, doc: el.ownerDocument, framework: 'generic' };
  }
  if (el.isContentEditable) {
    let root = el;
    while (root.parentElement && root.parentElement.isContentEditable) root = root.parentElement;
    // crossing shadow boundaries is not needed: contenteditable does not inherit through them
    return { el, kind: 'ce', root, doc: el.ownerDocument, framework: detectFramework(root) };
  }
  return null;
}

export function selectionFor(t: EditTarget): Selection | null {
  const rn = t.root.getRootNode() as any;
  if (rn && rn !== t.doc && typeof rn.getSelection === 'function') return rn.getSelection();
  return t.doc.getSelection();
}

const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'TD', 'TH', 'TABLE', 'SECTION', 'ARTICLE', 'BR', 'HR', 'IMG']);
const ZW = /[​﻿⁠]/;

interface Seg { node: Text; start: number; end: number; rawStart: number }

export interface CaretText {
  /** text immediately before the caret (zero-width chars removed, nbsp → space) */
  text: string;
  /** Range covering the last `n` characters of `text` up to the caret */
  rangeFor(n: number): Range | null;
  /** input/textarea caret index */
  caret?: number;
}

export function textBeforeCaret(t: EditTarget, max = 64): CaretText | null {
  if (t.kind !== 'ce') {
    const inp = t.el as HTMLInputElement | HTMLTextAreaElement;
    let s: number | null, e: number | null;
    try { s = inp.selectionStart; e = inp.selectionEnd; } catch { return null; }
    if (s === null || s !== e) return null;
    const from = Math.max(0, s - max);
    return { text: inp.value.slice(from, s), caret: s, rangeFor: () => null };
  }
  const sel = selectionFor(t);
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed || !t.root.contains(range.startContainer)) return null;

  const root = t.root;
  const segs: Seg[] = [];
  let raw = '';
  let cur: Node | null;
  let curEnd = 0;
  const sc = range.startContainer;
  const so = range.startOffset;
  const lastDeep = (n: Node): Node | null => {
    let x: Node = n;
    for (;;) {
      if (x.nodeType === 1 && BLOCK.has((x as Element).tagName)) return null;
      if (!x.lastChild) return x;
      x = x.lastChild;
    }
  };
  const prev = (n: Node): Node | null | undefined => {
    if (n === root) return undefined;
    if (n.previousSibling) return lastDeep(n.previousSibling);
    const p = n.parentNode;
    if (!p || p === root) return undefined;
    if (p.nodeType === 1 && BLOCK.has((p as Element).tagName)) return null;
    return prev(p);
  };
  if (sc.nodeType === 3) { cur = sc; curEnd = so; }
  else {
    const child = sc.childNodes[so - 1];
    if (child) cur = lastDeep(child);
    else { const p = prev(sc); cur = p === undefined ? null : p; }
    curEnd = cur && cur.nodeType === 3 ? (cur as Text).length : 0;
  }
  while (cur && raw.length < max * 2) {
    if (cur.nodeType === 3) {
      const tn = cur as Text;
      const piece = tn.data.slice(0, curEnd);
      raw = piece + raw;
      segs.forEach((sg) => (sg.rawStart += piece.length));
      segs.unshift({ node: tn, start: 0, end: curEnd, rawStart: 0 });
    } else if (cur.nodeType === 1 && BLOCK.has((cur as Element).tagName)) break;
    const p = prev(cur);
    if (!p) break;
    cur = p;
    curEnd = cur.nodeType === 3 ? (cur as Text).length : 0;
  }
  // clean text + mapping clean index -> raw index
  const map: number[] = [];
  let clean = '';
  for (let i = 0; i < raw.length; i++) {
    if (ZW.test(raw[i])) continue;
    map.push(i);
    clean += raw[i] === ' ' ? ' ' : raw[i];
  }
  const trimmed = clean.length > max ? clean.length - max : 0;
  const text = clean.slice(trimmed);
  return {
    text,
    rangeFor(n: number) {
      if (n > text.length || n <= 0) return null;
      const rawIdx = map[trimmed + text.length - n];
      const seg = segs.find((sg) => rawIdx >= sg.rawStart && rawIdx < sg.rawStart + (sg.end - sg.start));
      if (!seg) return null;
      const r = t.doc.createRange();
      r.setStart(seg.node, seg.start + (rawIdx - seg.rawStart));
      r.setEnd(range.startContainer, range.startOffset);
      return r;
    },
  };
}

export interface SavedCaret {
  target: EditTarget;
  range?: Range;
  start?: number;
  end?: number;
}

export function saveCaret(t: EditTarget): SavedCaret {
  if (t.kind !== 'ce') {
    const inp = t.el as HTMLInputElement;
    return { target: t, start: inp.selectionStart ?? inp.value.length, end: inp.selectionEnd ?? inp.value.length };
  }
  const sel = selectionFor(t);
  return { target: t, range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : undefined };
}

export function restoreCaret(s: SavedCaret) {
  const t = s.target;
  try { (t.kind === 'ce' ? t.root : t.el).focus({ preventScroll: true }); } catch { /* ignore */ }
  if (t.kind !== 'ce') {
    try { (t.el as HTMLInputElement).setSelectionRange(s.start!, s.end!); } catch { /* ignore */ }
    return;
  }
  if (s.range && t.root.contains(s.range.startContainer)) {
    const sel = selectionFor(t);
    sel?.removeAllRanges();
    sel?.addRange(s.range);
  }
}

export function caretRect(t: EditTarget): DOMRect {
  if (t.kind === 'ce') {
    const sel = selectionFor(t);
    if (sel?.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width || r.height || r.top) return r;
    }
  }
  return t.el.getBoundingClientRect();
}

/** Converts a rect inside an iframe into top-document coordinates (same-origin only). */
export function toTopRect(rect: DOMRect, doc: Document): DOMRect {
  let x = rect.left, y = rect.top;
  let w: Window | null = doc.defaultView;
  try {
    while (w && w !== w.top && w.frameElement) {
      const fr = w.frameElement.getBoundingClientRect();
      x += fr.left; y += fr.top;
      w = w.parent;
    }
  } catch { /* cross-origin parent */ }
  return new DOMRect(x, y, rect.width, rect.height);
}
