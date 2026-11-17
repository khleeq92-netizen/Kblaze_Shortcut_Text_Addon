// Macro recorder: turns real user interactions into macro steps with robust
// targets (CSS + XPath + label fallbacks). Password / OTP values are never
// recorded — the step is marked sensitive and left empty for a {{vault.*}} value.
import type { MacroStep } from '../shared/types';
import { targetFor, fieldKind, labelFor } from './dom';
import { isCaptchaField, isMfaField, SENSITIVE_FIELD } from './safety';
import { uid } from '../shared/ids';

export interface RecorderOptions {
  doc: Document;
  onStep: (step: MacroStep, replaceLast: boolean) => void;
  recordScroll?: boolean;
  /** Elements to ignore (our own UI). */
  ignore?: (el: Element) => boolean;
  /** Only record real user input (default). Tests set false because jsdom cannot create trusted events. */
  trustedOnly?: boolean;
}

export interface Recorder { stop(): void; pause(p: boolean): void; paused(): boolean }

const TEXTISH = new Set(['text', 'number', 'email', 'tel', 'url', 'textarea', 'date', 'time', 'datetime', 'month', 'password', 'contenteditable', 'combobox']);

export function startRecorder(opts: RecorderOptions): Recorder {
  const { doc } = opts;
  let paused = false;
  let last: MacroStep | null = null;
  let lastScroll = { x: (doc.defaultView || window).scrollX, y: (doc.defaultView || window).scrollY };
  let scrollTimer: any = null;
  const trusted = (e: Event) => opts.trustedOnly === false || e.isTrusted;
  const ignore = (el: Element | null) => !el || !!el.closest('kf-ui-root,kf-overlay-root') || !!opts.ignore?.(el);
  const url = () => (doc.defaultView || window).location.href;

  const emit = (s: Omit<MacroStep, 'id'>, mergeWithLast = false) => {
    const step: MacroStep = { id: uid('stp'), url: url(), ...s };
    const replace = mergeWithLast && !!last && last.type === step.type && JSON.stringify(last.target) === JSON.stringify(step.target);
    if (replace) step.id = last!.id;
    last = step;
    opts.onStep(step, replace);
  };

  const real = (e: Event) => (e.composedPath?.()[0] as Element) || (e.target as Element);

  const onClick = (e: MouseEvent) => {
    if (paused || !trusted(e)) return;
    let el = real(e);
    if (!el || el.nodeType !== 1 || ignore(el)) return;
    // Form controls are recorded through change events; labels toggling inputs too.
    const ctrl = el.closest('input,select,textarea,option,[contenteditable=""],[contenteditable="true"]');
    if (ctrl) {
      const k = fieldKind(ctrl);
      if (k === 'button') el = ctrl;
      else return;
    }
    const lab = el.closest('label');
    if (lab && ((lab as HTMLLabelElement).control || lab.querySelector('input,select,textarea'))) return;
    // record the meaningful clickable ancestor
    const clickable = el.closest('button,a[href],[role=button],[role=tab],[role=menuitem],[role=option],[role=link],[role=checkbox],[role=switch],input[type=submit],input[type=button],summary,[onclick]') || el;
    if (clickable.getAttribute('role') === 'checkbox' || clickable.getAttribute('role') === 'switch') {
      const now = clickable.getAttribute('aria-checked') === 'true';
      // aria state flips after the click handler – read it a tick later
      setTimeout(() => emit({ type: clickable.getAttribute('aria-checked') === 'true' ? 'check' : 'uncheck', target: targetFor(clickable), note: `${clickable.getAttribute('aria-checked') === 'true' ? 'Check' : 'Uncheck'} "${labelFor(clickable)}"` }), 0);
      void now;
      return;
    }
    emit({ type: 'click', target: targetFor(clickable), note: `Click "${(labelFor(clickable) || clickable.textContent || clickable.tagName).trim().slice(0, 60)}"` });
  };

  const onChange = (e: Event) => {
    if (paused || !trusted(e)) return;
    const el = real(e);
    if (!el || ignore(el)) return;
    const kind = fieldKind(el);
    const h = el as HTMLInputElement;
    const label = labelFor(el).slice(0, 60);
    if (isCaptchaField(el) || isMfaField(el)) return; // never record CAPTCHA / OTP
    switch (kind) {
      case 'checkbox':
        emit({ type: h.checked ? 'check' : 'uncheck', target: targetFor(el), note: `${h.checked ? 'Check' : 'Uncheck'} "${label}"` });
        return;
      case 'radio': {
        const opt = (h.labels?.[0]?.textContent || h.value).trim();
        emit({ type: 'radio', target: { by: 'css', value: `input[type="radio"][name="${(h.name || '').replace(/"/g, '\\"')}"]`, fallbacks: targetFor(el).fallbacks }, value: h.value || opt, note: `Choose "${opt}" for "${label}"` });
        return;
      }
      case 'select':
        emit({ type: 'select', target: targetFor(el), value: (el as HTMLSelectElement).selectedOptions[0]?.text.trim() || h.value, note: `Select "${(el as HTMLSelectElement).selectedOptions[0]?.text.trim()}" in "${label}"` }, true);
        return;
      case 'multiselect':
        emit({ type: 'select', target: targetFor(el), value: Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.text.trim()).join(', '), note: `Select in "${label}"` }, true);
        return;
      case 'file':
        emit({ type: 'confirm', value: `Attach the file for "${label}" manually, then press Continue.`, note: `Manual file upload: ${label}` });
        return;
      default:
        if (!TEXTISH.has(kind)) return;
        recordText(el);
    }
  };

  const recordText = (el: Element) => {
    const kind = fieldKind(el);
    const h = el as HTMLInputElement;
    const label = labelFor(el).slice(0, 60);
    const sig = `${h.type || ''} ${h.name || ''} ${h.id || ''} ${h.getAttribute('autocomplete') || ''} ${label}`;
    const sensitive = kind === 'password' || SENSITIVE_FIELD.test(sig);
    const value = kind === 'contenteditable' ? (el.textContent || '') : String(h.value ?? '');
    emit({ type: 'type', target: targetFor(el), value: sensitive ? '' : value, sensitive, clear: true, note: sensitive ? `Type into "${label}" — set a {{vault.…}} value (not recorded)` : `Type into "${label}"` }, true);
  };

  const onBlur = (e: FocusEvent) => {
    if (paused) return;
    const el = real(e);
    if (el && !ignore(el) && fieldKind(el) === 'contenteditable') recordText(el);
  };

  const onKey = (e: KeyboardEvent) => {
    if (paused || !trusted(e)) return;
    const el = real(e);
    if (!el || ignore(el)) return;
    if (e.key === 'Enter' && el.tagName === 'INPUT') {
      recordText(el);
      emit({ type: 'key', value: 'Enter', target: targetFor(el), note: 'Press Enter' });
    } else if (e.key === 'Escape') emit({ type: 'key', value: 'Escape', note: 'Press Escape' });
  };

  const onScroll = () => {
    if (paused || !opts.recordScroll) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const w = doc.defaultView || window;
      if (Math.abs(w.scrollY - lastScroll.y) < 250 && Math.abs(w.scrollX - lastScroll.x) < 250) return;
      lastScroll = { x: w.scrollX, y: w.scrollY };
      emit({ type: 'scroll', x: Math.round(w.scrollX), y: Math.round(w.scrollY), note: `Scroll to ${Math.round(w.scrollY)}px` }, last?.type === 'scroll');
    }, 700);
  };

  const o = { capture: true } as const;
  doc.addEventListener('click', onClick, o);
  doc.addEventListener('change', onChange, o);
  doc.addEventListener('blur', onBlur, o);
  doc.addEventListener('keydown', onKey, o);
  (doc.defaultView || window).addEventListener('scroll', onScroll, { passive: true });
  return {
    stop() {
      doc.removeEventListener('click', onClick, o);
      doc.removeEventListener('change', onChange, o);
      doc.removeEventListener('blur', onBlur, o);
      doc.removeEventListener('keydown', onKey, o);
      (doc.defaultView || window).removeEventListener('scroll', onScroll);
      clearTimeout(scrollTimer);
    },
    pause(p) { paused = p; },
    paused: () => paused,
  };
}

/** Post-processing when a recording is saved: drop no-op duplicates, add waits after navigations. */
export function tidyRecording(steps: MacroStep[]): MacroStep[] {
  const out: MacroStep[] = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (prev && s.type === 'type' && prev.type === 'type' && JSON.stringify(prev.target) === JSON.stringify(s.target)) { out[out.length - 1] = s; continue; }
    if (prev && s.type === 'scroll' && prev.type === 'scroll') { out[out.length - 1] = s; continue; }
    if (prev && s.type === 'navigate' && prev.type === 'navigate') { out[out.length - 1] = s; continue; }
    out.push(s);
  }
  return out;
}
