// DOM helpers shared by the autofill engine, macro player, recorder and field
// selector: selector generation (CSS + XPath), target resolution across open
// shadow roots and same-origin iframes, label detection and field classification.
import type { ElementTarget, FieldKind, DetectedField, TargetBy } from '../shared/types';
import { safeRegex } from './sites';

export const SHADOW_SEP = ' >>> ';

const cssEsc = (s: string) => ((globalThis as any).CSS?.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, '\\$1'));
const attrEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').replace(/[*:]+\s*$/, '').trim();

/** ids / classes that look auto-generated are not stable across page loads. */
export function unstableToken(s: string): boolean {
  return /\d{4,}|^[a-f0-9]{8,}$|^(ember|react|mui|ng-|jss|css-|sc-|_)[\w-]*\d/i.test(s) || /:r[0-9a-z]+:/.test(s);
}

function rootOf(el: Element): Document | ShadowRoot {
  const r = el.getRootNode();
  return (r instanceof ShadowRoot || (r as any).host) ? (r as ShadowRoot) : el.ownerDocument;
}

function uniqueIn(root: ParentNode, sel: string, el: Element): boolean {
  try {
    const all = root.querySelectorAll(sel);
    return all.length === 1 && all[0] === el;
  } catch { return false; }
}

/** Selector unique inside the element's own root (document or shadow root). */
function localCss(el: Element): string {
  const root = rootOf(el);
  const tag = el.tagName.toLowerCase();
  if (el.id && !unstableToken(el.id) && uniqueIn(root, '#' + cssEsc(el.id), el)) return '#' + cssEsc(el.id);
  const name = el.getAttribute('name');
  if (name) {
    const s = `${tag}[name="${attrEsc(name)}"]`;
    if (uniqueIn(root, s, el)) return s;
    if ((el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox') {
      const v = el.getAttribute('value');
      if (v !== null) { const s2 = `${s}[value="${attrEsc(v)}"]`; if (uniqueIn(root, s2, el)) return s2; }
    }
  }
  for (const attr of ['data-testid', 'data-test', 'data-qa', 'data-cy', 'formcontrolname', 'ng-model', 'aria-label', 'placeholder', 'title']) {
    const v = el.getAttribute(attr);
    if (v && !unstableToken(v)) {
      const s = `${tag}[${attr}="${attrEsc(v)}"]`;
      if (uniqueIn(root, s, el)) return s;
    }
  }
  if (tag === 'a' || tag === 'button') {
    const href = el.getAttribute('href');
    if (href && href.length < 120 && !href.startsWith('javascript')) { const s = `${tag}[href="${attrEsc(href)}"]`; if (uniqueIn(root, s, el)) return s; }
  }
  // positional path up to the nearest stable ancestor id
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && parts.length < 8) {
    let part = cur.tagName.toLowerCase();
    if (cur !== el && cur.id && !unstableToken(cur.id) && uniqueIn(root, '#' + cssEsc(cur.id), cur)) { parts.unshift('#' + cssEsc(cur.id)); break; }
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    if (!parent || parent.tagName === 'HTML') break;
    cur = parent;
    const candidate = parts.join(' > ');
    if (parts.length >= 2 && uniqueIn(root, candidate, el)) return candidate;
  }
  return parts.join(' > ');
}

/** Full CSS selector; shadow boundaries are joined with " >>> ". */
export function cssFor(el: Element): string {
  const chain: string[] = [];
  let cur: Element | null = el;
  let guard = 0;
  while (cur && guard++ < 10) {
    chain.unshift(localCss(cur));
    const r = cur.getRootNode() as ShadowRoot;
    cur = r && (r as any).host ? (r as any).host : null;
  }
  return chain.join(SHADOW_SEP);
}

export function xpathFor(el: Element): string {
  if (rootOf(el) !== el.ownerDocument) return '';
  if (el.id && !unstableToken(el.id) && el.ownerDocument.querySelectorAll('#' + cssEsc(el.id)).length === 1) return `//*[@id="${el.id}"]`;
  const tag = el.tagName.toLowerCase();
  const name = el.getAttribute('name');
  if (name && el.ownerDocument.getElementsByName(name).length === 1) return `//${tag}[@name="${name}"]`;
  const segs: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1) {
    const parent: Element | null = cur.parentElement;
    const t = cur.tagName.toLowerCase();
    if (cur !== el && cur.id && !unstableToken(cur.id)) { segs.unshift(`/*[@id="${cur.id}"]`); return '/' + segs.join('/'); }
    if (!parent) { segs.unshift(t); break; }
    const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
    segs.unshift(same.length > 1 ? `${t}[${same.indexOf(cur) + 1}]` : t);
    cur = parent;
  }
  return '/' + segs.join('/');
}

// ------------------------------------------------------------------ labels
function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('input,select,textarea,script,style,option').forEach((x) => x.remove());
  return norm(clone.textContent);
}

export function humanize(s: string): string {
  return s.replace(/\[\]$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.[\]]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
}

/** Best human label for a form control (label[for], aria, wrapping label, table cell, nearby text). */
export function labelFor(el: Element): string {
  const h = el as HTMLInputElement;
  const doc = el.ownerDocument;
  const root = rootOf(el) as any;
  // buttons and links are labelled by their own text
  if (el.tagName === 'BUTTON' || el.tagName === 'A' || (el.tagName === 'INPUT' && ['submit', 'button', 'reset', 'image'].includes(h.type)) || el.getAttribute('role') === 'button') {
    const own = norm(el.getAttribute('aria-label') || el.textContent || h.value || el.getAttribute('title') || el.getAttribute('alt'));
    if (own) return own;
  }
  const labels = (h as any).labels as NodeListOf<HTMLLabelElement> | undefined;
  if (labels && labels.length) { const t = textOf(labels[0]); if (t) return t; }
  const lb = el.getAttribute('aria-labelledby');
  if (lb) { const t = norm(lb.split(/\s+/).map((id) => (root.getElementById ? root.getElementById(id) : doc.getElementById(id))?.textContent || '').join(' ')); if (t) return t; }
  const al = el.getAttribute('aria-label');
  if (al) return norm(al);
  const wrap = el.closest('label');
  if (wrap) { const t = textOf(wrap); if (t) return t; }
  if (h.type === 'radio' || h.type === 'checkbox') {
    // the group question usually lives in a legend / preceding text
    const fs = el.closest('fieldset');
    const lg = fs?.querySelector('legend');
    if (lg) return norm(lg.textContent);
  }
  // table layouts (common on government portals): <td>Label</td><td><input></td>
  const cell = el.closest('td,th');
  if (cell) {
    let prev = cell.previousElementSibling;
    while (prev && !textOf(prev)) prev = prev.previousElementSibling;
    if (prev) { const t = textOf(prev); if (t && t.length < 120) return t; }
  }
  // previous sibling label-ish element / text (never one that belongs to another control)
  let p: Element | null = el.previousElementSibling;
  for (let i = 0; p && i < 3; i++, p = p.previousElementSibling) {
    if (p.matches('input,select,textarea,button') || p.querySelector('input,select,textarea,button')) break;
    if (p.tagName === 'LABEL' && (p as HTMLLabelElement).htmlFor && (p as HTMLLabelElement).htmlFor !== el.id) break;
    if (/^(LABEL|SPAN|B|STRONG|P|DIV|H\d|DT|FONT)$/.test(p.tagName)) { const t = textOf(p); if (t && t.length < 120) return t; }
  }
  // form-group pattern: <div class="form-group"><label>..</label><div><input></div></div>
  const group = el.parentElement?.closest('div,li,p,dd');
  if (group) {
    const l = group.querySelector('label,.label,.control-label,.form-label');
    if (l && !l.contains(el)) { const t = textOf(l); if (t && t.length < 120) return t; }
    if (group.previousElementSibling && /^(DT|LABEL)$/.test(group.previousElementSibling.tagName)) { const t = textOf(group.previousElementSibling); if (t) return t; }
  }
  const ph = el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || el.getAttribute('title');
  if (ph) return norm(ph);
  const n = el.getAttribute('name') || el.id;
  return n ? humanize(n) : '';
}

/** Text a selector can be matched against (label + attributes). */
export function signature(el: Element): string {
  return [labelFor(el), el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('formcontrolname')].filter(Boolean).join(' | ');
}

// ------------------------------------------------------------------ classification
export function fieldKind(el: Element): FieldKind {
  const tag = el.tagName;
  if (tag === 'SELECT') return (el as HTMLSelectElement).multiple ? 'multiselect' : 'select';
  if (tag === 'TEXTAREA') return 'textarea';
  if (tag === 'BUTTON') return 'button';
  if (tag === 'INPUT') {
    const t = ((el as HTMLInputElement).type || 'text').toLowerCase();
    const map: Record<string, FieldKind> = {
      text: 'text', search: 'text', number: 'number', email: 'email', tel: 'tel', date: 'date', time: 'time', 'datetime-local': 'datetime', month: 'month', week: 'text', url: 'url', password: 'password',
      radio: 'radio', checkbox: 'checkbox', file: 'file', hidden: 'hidden', submit: 'button', button: 'button', reset: 'button', image: 'button', range: 'number', color: 'text',
    };
    return map[t] || 'text';
  }
  const role = el.getAttribute('role');
  if (role === 'combobox' || role === 'listbox') return 'combobox';
  if (role === 'checkbox' || role === 'switch') return 'checkbox';
  if (role === 'radio') return 'radio';
  const ce = el.getAttribute('contenteditable');
  if (role === 'textbox' || (el as HTMLElement).isContentEditable || ce === '' || ce === 'true' || ce === 'plaintext-only') return 'contenteditable';
  if (role === 'button' || tag === 'A') return 'button';
  return 'other';
}

export function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (!he.getBoundingClientRect) return false;
  const r = he.getBoundingClientRect();
  const view = el.ownerDocument.defaultView;
  // detached documents (DOMParser, sandbox dry runs) have no layout: only attributes decide
  if (!view) return !(el as HTMLElement).hidden && !/display\s*:\s*none|visibility\s*:\s*hidden/i.test(el.getAttribute('style') || '');
  const st = view.getComputedStyle(el);
  if (st && (st.visibility === 'hidden' || st.display === 'none')) return false;
  // jsdom reports 0x0 for everything – treat as visible unless styled hidden
  if (r.width === 0 && r.height === 0) return !!(he.offsetParent !== null || (el.ownerDocument.defaultView as any)?.navigator?.userAgent?.includes('jsdom'));
  return true;
}

export const CONTROL_SEL = 'input,select,textarea,[contenteditable=""],[contenteditable="true"],[role=textbox],[role=combobox],[role=listbox],[role=checkbox],[role=switch],[role=radio]';
export const CLICKABLE_SEL = 'button,a[href],input[type=submit],input[type=button],input[type=image],[role=button],[role=tab],[role=menuitem],[role=option],[role=link],summary';

/** All roots to search: document, open shadow roots, same-origin iframes. */
export function allRoots(doc: Document, maxDepth = 3): (Document | ShadowRoot)[] {
  const out: (Document | ShadowRoot)[] = [];
  const visit = (root: Document | ShadowRoot, depth: number) => {
    out.push(root);
    if (depth > maxDepth) return;
    const all = root.querySelectorAll('*');
    for (const el of Array.from(all)) {
      if ((el as any).shadowRoot) visit((el as any).shadowRoot, depth + 1);
      if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
        try { const d = (el as HTMLIFrameElement).contentDocument; if (d && d.documentElement) visit(d, depth + 1); } catch { /* cross-origin */ }
      }
    }
  };
  visit(doc, 0);
  return out;
}

function deepQueryCss(doc: Document, selector: string): Element[] {
  const parts = selector.split(/\s*>>>\s*/);
  let scopes: (Document | ShadowRoot | Element)[] = [doc];
  for (let i = 0; i < parts.length; i++) {
    const next: Element[] = [];
    for (const s of scopes) {
      try { next.push(...Array.from((s as ParentNode).querySelectorAll(parts[i]))); } catch { throw new Error(`Invalid CSS selector "${parts[i]}"`); }
    }
    if (i === parts.length - 1) return next;
    scopes = next.map((e) => (e as any).shadowRoot).filter(Boolean);
  }
  return [];
}

function xpathQuery(doc: Document, xp: string): Element[] {
  try {
    const r = doc.evaluate(xp, doc, null, 7 /* ORDERED_NODE_SNAPSHOT_TYPE */, null);
    const out: Element[] = [];
    for (let i = 0; i < r.snapshotLength; i++) { const n = r.snapshotItem(i); if (n && n.nodeType === 1) out.push(n as Element); }
    return out;
  } catch { throw new Error(`Invalid XPath "${xp}"`); }
}

function scoreLabel(lt: string, want: string): number {
  const a = lt.toLowerCase();
  const b = want.toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 4;
  if (a.replace(/[^a-z0-9]/g, '') === b.replace(/[^a-z0-9]/g, '')) return 3.5;
  if (a.startsWith(b)) return 3;
  if (new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(a)) return 2;
  if (a.includes(b)) return 1;
  return 0;
}

function candidates(doc: Document, clickable: boolean): Element[] {
  const sel = clickable ? CONTROL_SEL + ',' + CLICKABLE_SEL : CONTROL_SEL;
  const out: Element[] = [];
  for (const r of allRoots(doc)) out.push(...Array.from(r.querySelectorAll(sel)));
  return out;
}

/** Resolves one target strategy to matching elements (no waiting). */
export function queryBy(doc: Document, by: TargetBy, value: string, opts: { clickable?: boolean; includeHidden?: boolean } = {}): Element[] {
  const v = value.trim();
  if (!v) return [];
  switch (by) {
    case 'css': return deepQueryCss(doc, v);
    case 'xpath': return xpathQuery(doc, v);
    case 'id': {
      for (const r of allRoots(doc)) { const e = (r as any).getElementById ? (r as any).getElementById(v) : r.querySelector('#' + cssEsc(v)); if (e) return [e]; }
      return [];
    }
    case 'name': {
      const out: Element[] = [];
      for (const r of allRoots(doc)) out.push(...Array.from(r.querySelectorAll(`[name="${attrEsc(v)}"]`)));
      return out;
    }
    case 'placeholder':
    case 'aria': {
      const attr = by === 'placeholder' ? 'placeholder' : 'aria-label';
      return candidates(doc, !!opts.clickable).filter((e) => norm(e.getAttribute(attr)).toLowerCase() === v.toLowerCase());
    }
    case 'label': {
      const scored = candidates(doc, !!opts.clickable)
        .filter((e) => opts.includeHidden || (e as HTMLInputElement).type !== 'hidden')
        .map((e) => ({ e, s: scoreLabel(labelFor(e), v) }))
        .filter((x) => x.s > 0);
      const best = Math.max(0, ...scored.map((x) => x.s));
      return scored.filter((x) => x.s === best).map((x) => x.e);
    }
    case 'regex': {
      const re = safeRegex(v);
      if (!re) throw new Error(`Invalid regular expression "${v}"`);
      return candidates(doc, !!opts.clickable).filter((e) => (opts.includeHidden || (e as HTMLInputElement).type !== 'hidden') && re.test(signature(e)));
    }
    case 'auto': {
      if (/^(\/\/|\/html|\(\/\/)/.test(v)) return xpathQuery(doc, v);
      if (/^[#.[]|^[a-z]+[#.[:]|>>>|^[a-z]+$/i.test(v) && !/\s{2,}/.test(v)) {
        try { const r = deepQueryCss(doc, v); if (r.length) return r; } catch { /* not css */ }
      }
      const byId = queryBy(doc, 'name', v);
      if (byId.length) return byId;
      return queryBy(doc, 'label', v, opts);
    }
  }
  return [];
}

function frameDoc(doc: Document, frameSel?: string): Document {
  if (!frameSel) return doc;
  const f = deepQueryCss(doc, frameSel)[0] as HTMLIFrameElement | undefined;
  try { if (f?.contentDocument) return f.contentDocument; } catch { /* cross-origin */ }
  throw new Error(`Frame "${frameSel}" not found or not accessible (cross-origin frames need the content script inside that frame)`);
}

/** Finds the element for a target (primary strategy, then fallbacks). */
export function resolveTarget(doc: Document, t: ElementTarget, opts: { clickable?: boolean; includeHidden?: boolean } = {}): Element | null {
  const d = frameDoc(doc, t.frame);
  const strategies = [{ by: t.by, value: t.value }, ...(t.fallbacks || [])];
  let firstError: Error | null = null;
  for (const s of strategies) {
    try {
      const all = queryBy(d, s.by, s.value, opts);
      if (!all.length) continue;
      if (t.nth !== undefined && t.nth !== null && t.nth >= 0) { if (all[t.nth]) return all[t.nth]; continue; }
      return all.find((e) => isVisible(e)) || all[0];
    } catch (e: any) { firstError = firstError || e; }
  }
  if (firstError && strategies.length === 1) throw firstError;
  return null;
}

/** Waits (polling + MutationObserver) until the target appears. */
export function waitForTarget(doc: Document, t: ElementTarget, timeoutMs: number, opts: { clickable?: boolean; includeHidden?: boolean; visible?: boolean; signal?: () => boolean } = {}): Promise<Element | null> {
  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        const el = resolveTarget(doc, t, opts);
        if (el && (!opts.visible || isVisible(el))) return el;
      } catch (e) { reject(e); return 'err'; }
      return null;
    };
    const first = check();
    if (first === 'err') return;
    if (first) { resolve(first as Element); return; }
    if (timeoutMs <= 0) { resolve(null); return; }
    let done = false;
    const finish = (v: Element | null) => { if (done) return; done = true; obs.disconnect(); clearInterval(iv); clearTimeout(to); resolve(v); };
    const tick = () => { if (opts.signal?.()) { finish(null); return; } const el = check(); if (el && el !== 'err') finish(el as Element); };
    const obs = new MutationObserver(tick);
    obs.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'disabled'] });
    const iv = setInterval(tick, 150);
    const to = setTimeout(() => finish(null), timeoutMs);
  });
}

export function describeTarget(t?: ElementTarget | null): string {
  if (!t) return 'focused element';
  const v = t.value.length > 60 ? t.value.slice(0, 57) + '…' : t.value;
  switch (t.by) {
    case 'label': return `"${v}"`;
    case 'css': return v;
    case 'xpath': return `xpath ${v}`;
    case 'id': return `#${v}`;
    case 'name': return `[name=${v}]`;
    case 'regex': return `/${v}/`;
    case 'placeholder': return `placeholder "${v}"`;
    case 'aria': return `aria "${v}"`;
    default: return v;
  }
}

/** Builds a robust target for an element: best CSS primary + XPath/label fallbacks. */
export function targetFor(el: Element): ElementTarget {
  const css = cssFor(el);
  const xp = xpathFor(el);
  const label = labelFor(el);
  const fallbacks: { by: TargetBy; value: string }[] = [];
  if (xp) fallbacks.push({ by: 'xpath', value: xp });
  const name = el.getAttribute('name');
  if (name && !css.includes(`name="${name}"`) && (el as HTMLInputElement).type !== 'radio') fallbacks.push({ by: 'name', value: name });
  if (label && label.length < 80) fallbacks.push({ by: 'label', value: label });
  let frame: string | undefined;
  const win = el.ownerDocument.defaultView;
  try {
    if (win && win.frameElement && win.parent && win.parent.document) frame = cssFor(win.frameElement);
  } catch { /* cross-origin */ }
  return { by: 'css', value: css, fallbacks, ...(frame ? { frame } : {}) };
}

// ------------------------------------------------------------------ detection
function optionsOf(el: Element): { value: string; label: string }[] | undefined {
  if (el.tagName === 'SELECT') return Array.from((el as HTMLSelectElement).options).map((o) => ({ value: o.value, label: norm(o.text) }));
  const owns = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  if (owns) {
    const lb = el.ownerDocument.getElementById(owns.split(/\s+/)[0]);
    if (lb) return Array.from(lb.querySelectorAll('[role=option]')).map((o) => ({ value: o.getAttribute('data-value') || norm(o.textContent), label: norm(o.textContent) }));
  }
  return undefined;
}

/** Detects form fields on the page (and open shadow roots / same-origin frames). */
export function detectFields(doc: Document, opts: { includeHidden?: boolean; includeButtons?: boolean } = {}): DetectedField[] {
  const out: DetectedField[] = [];
  const radioGroups = new Map<string, DetectedField>();
  for (const root of allRoots(doc)) {
    const sel = opts.includeButtons ? CONTROL_SEL + ',button,input[type=submit]' : CONTROL_SEL;
    for (const el of Array.from(root.querySelectorAll(sel))) {
      const kind = fieldKind(el);
      if (kind === 'button' && !opts.includeButtons) continue;
      const hidden = kind === 'hidden' || !isVisible(el);
      if (hidden && !opts.includeHidden) continue;
      const h = el as HTMLInputElement;
      if (el.closest('kf-ui-root,kf-overlay-root')) continue;
      let frame: string | undefined;
      const d = el.ownerDocument;
      if (d !== doc) { try { frame = d.defaultView?.frameElement ? cssFor(d.defaultView.frameElement) : undefined; } catch { /* ignore */ } }
      if (kind === 'radio' && h.name) {
        const key = (frame || '') + '|' + h.name;
        const g = radioGroups.get(key);
        const optLabel = norm((h.labels && h.labels[0]?.textContent) || h.value);
        if (g) { g.options!.push({ value: h.value, label: optLabel }); if (h.checked) g.value = h.value; continue; }
        const groupLabel = (() => {
          const fs = el.closest('fieldset')?.querySelector('legend');
          if (fs) return norm(fs.textContent);
          const cell = el.closest('td');
          const prev = cell?.previousElementSibling;
          if (prev) return textOf(prev);
          return humanize(h.name);
        })();
        const f: DetectedField = {
          kind: 'radio', label: groupLabel, name: h.name, id: h.id, placeholder: '', required: h.required,
          options: [{ value: h.value, label: optLabel }], css: `input[type="radio"][name="${attrEsc(h.name)}"]`, xpath: `//input[@type="radio"][@name="${h.name}"]`,
          value: h.checked ? h.value : '', hidden, frame,
        };
        radioGroups.set(key, f);
        out.push(f);
        continue;
      }
      out.push({
        kind,
        label: labelFor(el),
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        required: !!h.required || el.getAttribute('aria-required') === 'true',
        options: optionsOf(el),
        css: cssFor(el),
        xpath: xpathFor(el),
        value: kind === 'checkbox' ? String(!!h.checked) : kind === 'password' ? '' : 'value' in h ? String(h.value ?? '').slice(0, 200) : norm(el.textContent).slice(0, 200),
        hidden,
        frame,
        maxLength: h.maxLength > 0 ? h.maxLength : undefined,
        pattern: h.pattern || undefined,
      });
    }
  }
  return out;
}
