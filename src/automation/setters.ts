// Sets values on every supported control type in a way frameworks notice
// (React/Vue/Angular controlled inputs, jQuery/select2 change handlers).
import type { FieldKind } from '../shared/types';
import { fieldKind, labelFor, isVisible } from './dom';
import { parseDate, formatDate } from '../engine/dates';

export interface SetResult { ok: boolean; message?: string; warning?: string; kind: FieldKind }

const TRUE_RE = /^(1|y|yes|true|on|checked|tick|ticked|x|✓|✔|haan|ha)$/i;
const FALSE_RE = /^(0|n|no|false|off|unchecked|untick|)$/i;
export function parseBool(v: string): boolean | null {
  const s = String(v ?? '').trim();
  if (TRUE_RE.test(s)) return true;
  if (FALSE_RE.test(s)) return false;
  return null;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const loose = (s: string) => norm(s).replace(/[^a-z0-9ऀ-ॿ]/g, '');

function fire(el: Element, type: string, init: EventInit = {}) {
  const w = el.ownerDocument.defaultView || window;
  const E = type.startsWith('key') ? (w as any).KeyboardEvent : type === 'input' ? ((w as any).InputEvent || (w as any).Event) : type.startsWith('focus') || type === 'blur' ? (w as any).FocusEvent : (w as any).Event;
  el.dispatchEvent(new E(type, { bubbles: type !== 'focus' && type !== 'blur', cancelable: true, composed: true, ...init }));
}

/** Calls the prototype value setter so React's value tracker sees a change. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const w = (el.ownerDocument.defaultView || window) as any;
  const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
  const own = Object.getOwnPropertyDescriptor(el, 'value')?.set;
  const protoSet = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (protoSet && own !== protoSet) protoSet.call(el, value);
  else if (own) own.call(el, value);
  else (el as any).value = value;
}

function commit(el: HTMLElement, value: string) {
  el.focus?.();
  fire(el, 'focus');
  fire(el, 'focusin');
  setNativeValue(el as HTMLInputElement, value);
  fire(el, 'input', { data: value, inputType: 'insertText' } as any);
  fire(el, 'keyup', { key: 'Unidentified' } as any);
  fire(el, 'change');
  fire(el, 'blur');
  fire(el, 'focusout');
}

/** Converts a date-ish value to the representation a field expects. */
export function formatDateFor(kind: FieldKind, raw: string, fmt?: string): string | null {
  const d = parseDate(raw.trim());
  if (!d) return null;
  if (kind === 'date') return formatDate(d, 'YYYY-MM-DD');
  if (kind === 'month') return formatDate(d, 'YYYY-MM');
  if (kind === 'datetime') return formatDate(d, 'YYYY-MM-DD[T]HH:mm');
  if (kind === 'time') return formatDate(d, 'HH:mm');
  return formatDate(d, fmt || 'DD/MM/YYYY');
}

export function findOption(sel: HTMLSelectElement, want: string): HTMLOptionElement | null {
  const opts = Array.from(sel.options);
  const w = norm(want);
  const lw = loose(want);
  if (!w) return opts.find((o) => o.value === '') || null;
  return (
    opts.find((o) => o.value === want) ||
    opts.find((o) => norm(o.text) === w) ||
    opts.find((o) => norm(o.value) === w) ||
    opts.find((o) => loose(o.text) === lw || loose(o.value) === lw) ||
    opts.find((o) => lw.length >= 2 && loose(o.text).startsWith(lw)) ||
    opts.find((o) => lw.length >= 3 && loose(o.text).includes(lw)) ||
    null
  );
}

export function splitMulti(v: string): string[] {
  return v.split(/\s*[,;|\n]\s*/).map((x) => x.trim()).filter(Boolean);
}

function radioGroup(el: HTMLInputElement): HTMLInputElement[] {
  const root = el.form || el.getRootNode() as ParentNode;
  if (!el.name) return [el];
  return Array.from((root as ParentNode).querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((r) => r.name === el.name);
}

function radioLabel(r: HTMLInputElement) {
  return `${r.labels?.[0]?.textContent || ''} ${r.getAttribute('aria-label') || ''}`.trim() || labelFor(r);
}

async function setCustomDropdown(el: HTMLElement, want: string): Promise<SetResult> {
  const doc = el.ownerDocument;
  el.click();
  fire(el, 'mousedown');
  await new Promise((r) => setTimeout(r, 200));
  const w = norm(want);
  const lw = loose(want);
  const owns = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const scope: ParentNode = (owns && doc.getElementById(owns.split(/\s+/)[0])) || doc;
  const opts = Array.from(scope.querySelectorAll('[role=option],[role=menuitem],[role=menuitemradio],li[data-value],.select2-results__option,.dropdown-item,.ant-select-item-option,.MuiMenuItem-root')).filter((o) => isVisible(o));
  const o = opts.find((x) => norm(x.textContent || '') === w || x.getAttribute('data-value') === want) || opts.find((x) => loose(x.textContent || '').startsWith(lw) && lw.length >= 2) || opts.find((x) => lw.length >= 3 && loose(x.textContent || '').includes(lw));
  if (!o) { fire(el, 'keydown', { key: 'Escape' } as any); return { ok: false, kind: 'combobox', message: `Option "${want}" not found in the dropdown` }; }
  (o as HTMLElement).scrollIntoView?.({ block: 'nearest' });
  fire(o, 'mousedown');
  (o as HTMLElement).click();
  fire(o, 'mouseup');
  return { ok: true, kind: 'combobox' };
}

/**
 * Sets a value on a control. `action` refines the intent (check/uncheck/radio/select/fill/clear).
 */
export async function setValue(el: Element, value: string, opts: { action?: string; dateFormat?: string; overwrite?: 'always' | 'ifEmpty' } = {}): Promise<SetResult> {
  const kind = fieldKind(el);
  const h = el as HTMLInputElement;
  const action = opts.action || 'fill';
  if ((h as any).disabled) return { ok: false, kind, message: 'Field is disabled' };
  switch (kind) {
    case 'file':
      return { ok: false, kind, message: 'Browsers do not allow extensions to choose files for upload — attach the file manually' };
    case 'button':
      return { ok: false, kind, message: 'Target is a button — use a click action' };
    case 'checkbox': {
      let want: boolean | null = action === 'check' ? true : action === 'uncheck' ? false : parseBool(value);
      if (want === null) want = value.trim().length > 0;
      const cur = el.tagName === 'INPUT' ? h.checked : el.getAttribute('aria-checked') === 'true';
      if (cur !== want) {
        (el as HTMLElement).click();
        const now = el.tagName === 'INPUT' ? h.checked : el.getAttribute('aria-checked') === 'true';
        if (now !== want && el.tagName === 'INPUT') { h.checked = want; fire(el, 'input'); fire(el, 'change'); }
      }
      return { ok: true, kind };
    }
    case 'radio': {
      if (el.tagName !== 'INPUT') { (el as HTMLElement).click(); return { ok: true, kind }; }
      const group = radioGroup(h);
      const w = norm(value);
      const lw = loose(value);
      let pick: HTMLInputElement | undefined;
      if (action === 'check' || (action === 'radio' && !value) || (group.length === 1 && parseBool(value) === true)) pick = h;
      else pick = group.find((r) => r.value === value) || group.find((r) => norm(r.value) === w) || group.find((r) => norm(radioLabel(r)) === w) || group.find((r) => loose(radioLabel(r)) === lw || loose(r.value) === lw) || group.find((r) => lw.length >= 2 && loose(radioLabel(r)).startsWith(lw));
      if (!pick) return { ok: false, kind, message: `No radio option "${value}" (options: ${group.map((r) => radioLabel(r) || r.value).join(', ').slice(0, 120)})` };
      if (!pick.checked) { pick.click(); if (!pick.checked) { pick.checked = true; fire(pick, 'input'); fire(pick, 'change'); } }
      return { ok: true, kind };
    }
    case 'select': {
      const s = el as HTMLSelectElement;
      if (action === 'clear') { s.selectedIndex = -1; fire(s, 'change'); return { ok: true, kind }; }
      const o = findOption(s, value);
      if (!o) return { ok: false, kind, message: `Option "${value}" not found (options: ${Array.from(s.options).map((x) => x.text.trim()).filter(Boolean).slice(0, 12).join(', ')})` };
      s.focus?.();
      setNativeValue(s, o.value);
      o.selected = true;
      fire(s, 'input');
      fire(s, 'change');
      fire(s, 'blur');
      return { ok: true, kind };
    }
    case 'multiselect': {
      const s = el as HTMLSelectElement;
      const wants = splitMulti(value);
      const missing: string[] = [];
      const chosen = new Set<HTMLOptionElement>();
      for (const w of wants) { const o = findOption(s, w); if (o) chosen.add(o); else missing.push(w); }
      for (const o of Array.from(s.options)) o.selected = chosen.has(o);
      fire(s, 'input');
      fire(s, 'change');
      return missing.length ? { ok: chosen.size > 0, kind, warning: `Not found: ${missing.join(', ')}`, message: chosen.size ? undefined : `Options not found: ${missing.join(', ')}` } : { ok: true, kind };
    }
    case 'combobox': {
      if (el.tagName === 'INPUT') {
        // editable combobox (autocomplete): type then pick the matching option if a list appears
        commit(el as HTMLElement, value);
        await new Promise((r) => setTimeout(r, 250));
        const doc = el.ownerDocument;
        const opt = Array.from(doc.querySelectorAll('[role=option]')).filter(isVisible).find((o) => norm(o.textContent || '') === norm(value));
        if (opt) (opt as HTMLElement).click();
        return { ok: true, kind };
      }
      return setCustomDropdown(el as HTMLElement, value);
    }
    case 'contenteditable': {
      const he = el as HTMLElement;
      he.focus();
      const doc = el.ownerDocument;
      const sel = doc.getSelection();
      const r = doc.createRange();
      r.selectNodeContents(he);
      sel?.removeAllRanges();
      sel?.addRange(r);
      let ok = false;
      try { ok = doc.execCommand('insertText', false, value); } catch { ok = false; }
      if (!ok || norm(he.textContent || '') !== norm(value)) { he.textContent = value; fire(he, 'input'); }
      fire(he, 'blur');
      return { ok: true, kind };
    }
    default: {
      // text-like inputs and textareas
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return { ok: false, kind, message: `<${el.tagName.toLowerCase()}> is not a fillable field — check the selector` };
      if (opts.overwrite === 'ifEmpty' && String(h.value || '').trim()) return { ok: true, kind, warning: 'Kept existing value' };
      let v = action === 'clear' ? '' : value;
      let warning: string | undefined;
      if (['date', 'month', 'datetime', 'time'].includes(kind) && v) {
        const f = formatDateFor(kind, v);
        if (!f) return { ok: false, kind, message: `"${v}" is not a valid date` };
        v = f;
      } else if (opts.dateFormat && v) {
        const f = formatDateFor('text', v, opts.dateFormat);
        if (f) v = f;
      }
      if (kind === 'number' && v && isNaN(Number(v.replace(/,/g, '')))) return { ok: false, kind, message: `"${v}" is not a number` };
      if (kind === 'number') v = v.replace(/,/g, '');
      if (h.maxLength > 0 && v.length > h.maxLength) { warning = `Value truncated to ${h.maxLength} characters`; v = v.slice(0, h.maxLength); }
      if (h.readOnly) warning = (warning ? warning + '; ' : '') + 'Field is read-only (probably a date picker) — value set programmatically';
      commit(el as HTMLElement, v);
      if (String(h.value) !== v && kind !== 'number') return { ok: false, kind, message: 'The page rejected the value (field reformatted or reset it)', warning };
      return { ok: true, kind, warning };
    }
  }
}

/** Static validation of a value against a field (preview mode, no changes made). */
export function validateValue(el: Element, value: string, action = 'fill'): string | null {
  const kind = fieldKind(el);
  const h = el as HTMLInputElement;
  if ((h as any).disabled) return 'Field is disabled';
  if (kind === 'file') return 'File inputs cannot be filled automatically';
  if (kind === 'button' && action !== 'click') return 'Target is a button';
  if (action === 'click' || action === 'focus' || action === 'clear') return null;
  if (kind === 'select') return findOption(el as HTMLSelectElement, value) ? null : `Option "${value}" not found`;
  if (kind === 'multiselect') { const miss = splitMulti(value).filter((w) => !findOption(el as HTMLSelectElement, w)); return miss.length ? `Options not found: ${miss.join(', ')}` : null; }
  if (kind === 'radio' && el.tagName === 'INPUT' && action !== 'check') {
    const group = radioGroup(h);
    const lw = loose(value);
    return group.some((r) => r.value === value || loose(radioLabel(r)) === lw || loose(r.value) === lw || (lw.length >= 2 && loose(radioLabel(r)).startsWith(lw))) || (group.length === 1 && parseBool(value) !== null) ? null : `No radio option "${value}"`;
  }
  if (kind === 'checkbox' && action === 'fill' && parseBool(value) === null && value.trim() === '') return null;
  if (['date', 'month', 'datetime', 'time'].includes(kind) && value && !parseDate(value)) return `"${value}" is not a valid date`;
  if (kind === 'number' && value && isNaN(Number(value.replace(/,/g, '')))) return `"${value}" is not a number`;
  if (kind === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `"${value}" is not a valid email address`;
  if (kind === 'tel' && value && !/^[+\d][\d\s\-()]{5,}$/.test(value)) return `"${value}" does not look like a phone number`;
  if (h.required && !value.trim()) return 'Required field would be left empty';
  if (h.maxLength > 0 && value.length > h.maxLength) return `Longer than the field allows (${h.maxLength})`;
  if (h.pattern && value) { try { if (!new RegExp(`^(?:${h.pattern})$`).test(value)) return `Does not match the field's pattern ${h.pattern}`; } catch { /* ignore */ } }
  return null;
}
