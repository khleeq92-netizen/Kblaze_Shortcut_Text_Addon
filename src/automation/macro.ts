// Macro player. Runs in the content script; progress is checkpointed to the
// background worker before any step that may navigate, so a run continues on
// the next page (multi-page workflows). Supports conditions, labels + goto
// loops with iteration limits, retries, pause/resume/stop and variables.
import type { Macro, MacroStep, StepCondition, ElementTarget } from '../shared/types';
import { waitForTarget, resolveTarget, isVisible, describeTarget, fieldKind } from './dom';
import { setValue } from './setters';
import { sensitiveReason, isCaptchaField, isMfaField } from './safety';
import { matchSite } from './sites';

export interface MacroRunState {
  runId: string;
  macroId: string;
  stepIndex: number;
  iterations: Record<string, number>;
  vars: Record<string, string>;
  startedAt: number;
  stepLog: { i: number; label: string; status: 'done' | 'fail' | 'skip' | 'warn'; ms?: number; error?: string }[];
  logs: string[];
  /** Pages visited during the run (navigation counter guards against loops). */
  navigations: number;
}

export interface MacroDeps {
  doc: Document;
  renderText: (text: string, vars: Record<string, string>) => Promise<string>;
  evalFormula: (src: string, vars: Record<string, string>) => Promise<boolean>;
  runAutofill: (profileId: string) => Promise<boolean>;
  runScript: (scriptId: string, vars: Record<string, string>) => Promise<{ ok: boolean; error?: string; vars?: Record<string, string> }>;
  insertSnippet: (snippetId: string) => Promise<boolean>;
  nextRecord: () => Promise<boolean>;
  confirm: (title: string, reason: string) => Promise<boolean>;
  navigate: (url: string) => void;
  checkpoint: (state: MacroRunState) => Promise<void>;
  isStopped: () => boolean;
  waitWhilePaused: () => Promise<void>;
  highlight: (el: Element | null, label?: string) => void;
  onStep: (i: number, status: 'run' | 'done' | 'fail' | 'skip') => void;
  official: boolean;
  url: () => string;
}

export type MacroOutcome = { status: 'success' | 'failed' | 'stopped' | 'navigating'; error?: string; state: MacroRunState };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const MAX_NAVIGATIONS = 200;
export const DEFAULT_MAX_ITER = 100;

export function describeStep(s: MacroStep): string {
  const t = describeTarget(s.target);
  switch (s.type) {
    case 'click': return `Click ${t}`;
    case 'type': return `Type ${s.sensitive ? '••••' : `"${(s.value || '').slice(0, 40)}"`} into ${t}`;
    case 'select': return `Select "${s.value}" in ${t}`;
    case 'check': return `Check ${t}`;
    case 'uncheck': return `Uncheck ${t}`;
    case 'radio': return `Choose "${s.value}" in ${t}`;
    case 'scroll': return s.target ? `Scroll to ${t}` : `Scroll to ${s.x ?? 0}, ${s.y ?? 0}`;
    case 'navigate': return `Open ${s.value}`;
    case 'waitFor': return `Wait for ${t}`;
    case 'waitGone': return `Wait until ${t} disappears`;
    case 'delay': return `Wait ${s.ms ?? 500} ms`;
    case 'key': return `Press ${s.value || 'Enter'}`;
    case 'autofill': return 'Run autofill profile';
    case 'script': return 'Run script';
    case 'extract': return `Save text of ${t} as {{${s.value}}}`;
    case 'assert': return `Check that ${describeCondition(s.condition)}`;
    case 'confirm': return `Ask: ${s.value || 'Continue?'}`;
    case 'label': return `Label "${s.value}"`;
    case 'goto': return `Go to "${s.value}"${s.condition ? ' if ' + describeCondition(s.condition) : ''}`;
    case 'stop': return 'Stop the macro';
    case 'snippet': return 'Insert snippet';
    case 'hover': return `Hover ${t}`;
    case 'focus': return `Focus ${t}`;
    case 'nextRecord': return 'Move to next dataset record';
  }
  return s.type;
}

export function describeCondition(c?: StepCondition | null): string {
  if (!c) return 'always';
  const t = describeTarget(c.target);
  switch (c.kind) {
    case 'exists': return `${t} exists`;
    case 'notExists': return `${t} does not exist`;
    case 'visible': return `${t} is visible`;
    case 'textContains': return `${t} contains "${c.value}"`;
    case 'valueEquals': return `${t} value is "${c.value}"`;
    case 'urlMatches': return `URL matches ${c.value}`;
    case 'formula': return c.value || 'formula';
  }
}

/** Static checks before running / saving. */
export function validateMacro(m: Pick<Macro, 'steps'>): string[] {
  const problems: string[] = [];
  const labels = new Set(m.steps.filter((s) => s.type === 'label').map((s) => s.value));
  m.steps.forEach((s, i) => {
    const n = i + 1;
    if (['click', 'type', 'select', 'check', 'uncheck', 'radio', 'waitFor', 'waitGone', 'extract', 'hover'].includes(s.type) && !s.target?.value) problems.push(`Step ${n}: choose an element`);
    if (s.type === 'goto' && !labels.has(s.value)) problems.push(`Step ${n}: label "${s.value}" does not exist`);
    if (s.type === 'navigate' && !/^https?:\/\//i.test(s.value || '') && !(s.value || '').includes('{{')) problems.push(`Step ${n}: URL must start with http:// or https://`);
    if (s.type === 'extract' && !/^[A-Za-z_]\w*$/.test(s.value || '')) problems.push(`Step ${n}: variable name is required`);
    if (['autofill', 'script', 'snippet'].includes(s.type) && !s.refId) problems.push(`Step ${n}: choose what to run`);
    if (s.type === 'delay' && (s.ms ?? 0) > 300000) problems.push(`Step ${n}: delays are limited to 5 minutes`);
  });
  return problems;
}

async function checkCondition(c: StepCondition, deps: MacroDeps, vars: Record<string, string>): Promise<boolean> {
  const find = (t?: ElementTarget) => (t ? resolveTarget(deps.doc, t, { clickable: true }) : null);
  switch (c.kind) {
    case 'exists': return !!find(c.target);
    case 'notExists': return !find(c.target);
    case 'visible': { const e = find(c.target); return !!e && isVisible(e); }
    case 'textContains': { const e = find(c.target); const want = await deps.renderText(c.value || '', vars); return !!e && (e.textContent || '').toLowerCase().includes(want.toLowerCase()); }
    case 'valueEquals': { const e = find(c.target) as HTMLInputElement | null; const want = await deps.renderText(c.value || '', vars); return !!e && String(e.value ?? e.textContent ?? '').trim() === want.trim(); }
    case 'urlMatches': return matchSite({ kind: /[*]/.test(c.value || '') ? 'wildcard' : /^\^|\$$|\\/.test(c.value || '') ? 'regex' : 'prefix', value: c.value || '' }, deps.url()) || deps.url().includes(c.value || '\u0000');
    case 'formula': return deps.evalFormula(c.value || '', vars);
  }
  return true;
}

function pressKey(el: Element, key: string) {
  const map: Record<string, { key: string; code: string; keyCode: number }> = {
    enter: { key: 'Enter', code: 'Enter', keyCode: 13 }, tab: { key: 'Tab', code: 'Tab', keyCode: 9 }, escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    space: { key: ' ', code: 'Space', keyCode: 32 }, arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }, backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  };
  const k = map[key.toLowerCase()] || { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, keyCode: key.toUpperCase().charCodeAt(0) };
  const W = (el.ownerDocument.defaultView || window) as any;
  for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new W.KeyboardEvent(type, { ...k, bubbles: true, cancelable: true, composed: true }));
}

function deepActive(doc: Document): Element | null {
  let a: Element | null = doc.activeElement;
  while (a && (a as any).shadowRoot?.activeElement) a = (a as any).shadowRoot.activeElement;
  return a && a !== doc.body && a !== doc.documentElement ? a : null;
}

function tabbables(doc: Document): HTMLElement[] {
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex],[contenteditable=""],[contenteditable=true]';
  const all = Array.from(doc.querySelectorAll<HTMLElement>(sel)).filter((e) => !(e as any).disabled && e.tabIndex >= 0 && isVisible(e));
  const pos = all.filter((e) => e.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return [...pos, ...all.filter((e) => e.tabIndex === 0)];
}

/** Moves focus like the Tab key (synthetic key events cannot move focus). */
export function moveFocus(doc: Document, back = false) {
  const list = tabbables(doc);
  const cur = deepActive(doc) as HTMLElement | null;
  const i = cur ? list.indexOf(cur) : -1;
  const next = list[(i + (back ? -1 : 1) + list.length) % list.length];
  next?.focus();
  return next;
}

function realClick(el: Element) {
  const W = (el.ownerDocument.defaultView || window) as any;
  const r = (el as HTMLElement).getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  if (W.PointerEvent) el.dispatchEvent(new W.PointerEvent('pointerdown', init));
  el.dispatchEvent(new W.MouseEvent('mousedown', init));
  if (W.PointerEvent) el.dispatchEvent(new W.PointerEvent('pointerup', init));
  el.dispatchEvent(new W.MouseEvent('mouseup', init));
  (el as HTMLElement).click();
}

const MAY_NAVIGATE = new Set(['click', 'key', 'navigate', 'autofill', 'script']);

export function newRunState(macroId: string, runId: string): MacroRunState {
  return { runId, macroId, stepIndex: 0, iterations: {}, vars: {}, startedAt: Date.now(), stepLog: [], logs: [], navigations: 0 };
}

export async function playMacro(macro: Pick<Macro, 'id' | 'name' | 'steps' | 'settings'>, state: MacroRunState, deps: MacroDeps): Promise<MacroOutcome> {
  const st = macro.settings;
  const steps = macro.steps;
  const labelIndex = new Map<string, number>();
  steps.forEach((s, i) => { if (s.type === 'label' && s.value) labelIndex.set(s.value, i); });
  const log = (i: number, label: string, status: MacroRunState['stepLog'][0]['status'], ms?: number, error?: string) => {
    state.stepLog.push({ i, label, status, ms, error });
    if (state.stepLog.length > 2000) state.stepLog.splice(0, state.stepLog.length - 2000);
  };

  // Steps that may unload the page are logged as done *before* they act, so the
  // record survives the navigation (the run continues on the next page).
  let preLogged = -1;
  const handoff = async (step: MacroStep, i: number) => {
    const last = state.stepLog[state.stepLog.length - 1];
    if (!(preLogged === i && last && last.i === i)) log(i, step.note || describeStep(step), 'done');
    preLogged = i;
    state.stepIndex = i + 1;
    await deps.checkpoint(state);
  };

  while (state.stepIndex < steps.length) {
    const i = state.stepIndex;
    const step = steps[i];
    await deps.waitWhilePaused();
    if (deps.isStopped()) return { status: 'stopped', state };
    if (step.disabled) { deps.onStep(i, 'skip'); state.stepIndex++; continue; }
    const label = step.note || describeStep(step);
    deps.onStep(i, 'run');
    const t0 = Date.now();
    try {
      if (step.condition && step.type !== 'assert' && step.type !== 'goto') {
        if (!(await checkCondition(step.condition, deps, state.vars))) { deps.onStep(i, 'skip'); log(i, label, 'skip', 0, 'Condition not met'); state.stepIndex++; continue; }
      }
      const maxRetries = step.onError === 'retry' ? Math.max(1, step.retries ?? st.retries ?? 2) : step.retries ?? st.retries ?? 0;
      let attempt = 0;
      let jumped = false;
      let ended = false;
      for (;;) {
        try {
          const r = await runStep(step, i);
          jumped = r === 'jump';
          ended = r === 'end';
          if (r === 'navigating') return { status: 'navigating', state };
          break;
        } catch (e) {
          if (attempt >= maxRetries || deps.isStopped()) throw e;
          attempt++;
          state.logs.push(`Step ${i + 1} failed (${(e as Error).message}); retry ${attempt}/${maxRetries}`);
          await sleep(st.retryDelayMs || 800);
        }
      }
      deps.onStep(i, 'done');
      if (preLogged === i) { const last = state.stepLog[state.stepLog.length - 1]; if (last && last.i === i) last.ms = Date.now() - t0; preLogged = -1; }
      else log(i, label, 'done', Date.now() - t0);
      if (ended) { state.stepIndex = steps.length; break; }
      if (!jumped) state.stepIndex++;
      if (!MAY_NAVIGATE.has(step.type)) await deps.checkpoint(state);
      if (st.stepDelayMs) await sleep(Math.min(10000, st.stepDelayMs / Math.max(0.1, st.speed || 1)));
    } catch (e: any) {
      const msg = e?.message || String(e);
      deps.onStep(i, 'fail');
      if (preLogged === i) { const last = state.stepLog[state.stepLog.length - 1]; if (last && last.i === i) state.stepLog.pop(); preLogged = -1; }
      log(i, label, 'fail', Date.now() - t0, msg);
      const policy = step.onError && step.onError !== 'default' && step.onError !== 'retry' ? step.onError : st.onError;
      if (policy === 'continue') { state.logs.push(`Step ${i + 1} failed, continuing: ${msg}`); state.stepIndex++; await deps.checkpoint(state); continue; }
      deps.highlight(null);
      return { status: 'failed', error: `Step ${i + 1} (${label}): ${msg}`, state };
    }
  }
  deps.highlight(null);
  return { status: 'success', state };

  // ------------------------------------------------------------- one step
  async function runStep(step: MacroStep, i: number): Promise<'ok' | 'jump' | 'end' | 'navigating'> {
    const timeout = step.ms && ['waitFor', 'waitGone'].includes(step.type) ? step.ms : st.timeoutMs || 10000;
    const needsEl = ['click', 'type', 'select', 'check', 'uncheck', 'radio', 'waitFor', 'extract', 'hover', 'focus'].includes(step.type) || (step.type === 'scroll' && step.target) || (step.type === 'key' && step.target);
    let el: Element | null = null;
    if (needsEl && !step.target?.value && ['type', 'select', 'check', 'uncheck', 'radio', 'focus', 'extract'].includes(step.type)) {
      // no target = the field that currently has focus
      el = deepActive(deps.doc);
      if (!el) throw new Error('No field is focused — click into a field or choose a target for this step');
    } else if (needsEl && step.target) {
      el = await waitForTarget(deps.doc, step.target, timeout, { clickable: ['click', 'hover', 'waitFor', 'extract', 'scroll', 'focus'].includes(step.type), visible: step.type === 'waitFor', signal: deps.isStopped });
      if (!el) throw new Error(`${describeTarget(step.target)} not found within ${Math.round(timeout / 1000)} s`);
      (el as HTMLElement).scrollIntoView?.({ block: 'center' });
      deps.highlight(el, `Step ${i + 1}`);
    }
    switch (step.type) {
      case 'click': {
        const why = sensitiveReason(el, 'click') || (deps.official && fieldKind(el!) === 'button' ? 'This is an official/government portal. K-Flow asks before every action button.' : null);
        if (why && !(await deps.confirm(`${macro.name} — step ${i + 1}`, why))) throw new Error('Step was not approved');
        await handoff(step, i);
        realClick(el!);
        await sleep(60);
        return 'jump';
      }
      case 'type': {
        if (isCaptchaField(el!)) throw new Error('This is a CAPTCHA field — K-Flow never fills CAPTCHAs. Complete it manually and resume.');
        if (isMfaField(el!)) throw new Error('This is an OTP / two-factor field — enter it yourself.');
        const why = sensitiveReason(el, 'type');
        if (why && !step.sensitive && !(await deps.confirm(`${macro.name} — step ${i + 1}`, why))) throw new Error('Step was not approved');
        const text = await deps.renderText(step.value || '', state.vars);
        const kind = fieldKind(el!);
        const cur = (el as HTMLInputElement).value ?? '';
        const value = step.clear === false && kind !== 'contenteditable' ? cur + text : text;
        const r = await setValue(el!, value, { action: 'fill' });
        if (!r.ok) throw new Error(r.message || 'Could not type');
        return 'ok';
      }
      case 'select':
      case 'radio': {
        const v = await deps.renderText(step.value || '', state.vars);
        const r = await setValue(el!, v, { action: step.type === 'radio' ? 'radio' : 'select' });
        if (!r.ok) throw new Error(r.message || 'Could not select');
        return 'ok';
      }
      case 'check':
      case 'uncheck': {
        const r = await setValue(el!, '', { action: step.type });
        if (!r.ok) throw new Error(r.message || 'Could not change checkbox');
        return 'ok';
      }
      case 'hover': {
        const W = (el!.ownerDocument.defaultView || window) as any;
        for (const t of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) el!.dispatchEvent(new W.MouseEvent(t, { bubbles: t !== 'mouseenter', cancelable: true }));
        return 'ok';
      }
      case 'focus':
        (el as HTMLElement).focus();
        return 'ok';
      case 'scroll':
        if (el) (el as HTMLElement).scrollIntoView({ block: 'center' });
        else (deps.doc.defaultView || window).scrollTo({ left: step.x || 0, top: step.y || 0 });
        await sleep(150);
        return 'ok';
      case 'navigate': {
        const url = (await deps.renderText(step.value || '', state.vars)).trim();
        if (!/^https?:\/\//i.test(url)) throw new Error(`Refusing to open "${url}" — only http(s) URLs are allowed`);
        if (++state.navigations > MAX_NAVIGATIONS) throw new Error('Too many page navigations in one run');
        await handoff(step, i);
        if (url.replace(/#.*$/, '') === deps.url().replace(/#.*$/, '')) { deps.navigate(url); return 'jump'; }
        deps.navigate(url);
        return 'navigating';
      }
      case 'waitFor':
        return 'ok';
      case 'waitGone': {
        const end = Date.now() + timeout;
        while (step.target && resolveTarget(deps.doc, step.target)) {
          if (Date.now() > end) throw new Error(`${describeTarget(step.target)} is still present`);
          if (deps.isStopped()) return 'ok';
          await sleep(150);
        }
        return 'ok';
      }
      case 'delay': {
        const end = Date.now() + Math.min(300000, (step.ms ?? 500) / Math.max(0.1, st.speed || 1));
        while (Date.now() < end) { if (deps.isStopped()) return 'ok'; await deps.waitWhilePaused(); await sleep(Math.min(200, end - Date.now())); }
        return 'ok';
      }
      case 'key': {
        const key = step.value || 'Enter';
        const target = el || deps.doc.activeElement || deps.doc.body;
        const why = sensitiveReason(target, 'key', key);
        if (why && !(await deps.confirm(`${macro.name} — step ${i + 1}`, why))) throw new Error('Step was not approved');
        await handoff(step, i);
        if (/^(shift\+)?tab$/i.test(key)) { moveFocus(deps.doc, /^shift/i.test(key)); return 'jump'; }
        if (/^enter$/i.test(key) && target.tagName === 'INPUT' && (target as HTMLElement).closest('form')) {
          pressKey(target, key);
          const form = (target as HTMLElement).closest('form')!;
          form.requestSubmit ? form.requestSubmit() : form.submit();
        } else pressKey(target, key);
        return 'jump';
      }
      case 'autofill': {
        await handoff(step, i);
        if (!(await deps.runAutofill(step.refId!))) throw new Error('Autofill reported problems');
        return 'jump';
      }
      case 'script': {
        await handoff(step, i);
        const r = await deps.runScript(step.refId!, state.vars);
        if (r.vars) Object.assign(state.vars, r.vars);
        if (!r.ok) throw new Error(r.error || 'Script failed');
        await deps.checkpoint(state);
        return 'jump';
      }
      case 'extract': {
        const he = el as HTMLInputElement;
        const v = ('value' in he && typeof he.value === 'string' && el!.tagName !== 'BUTTON' ? he.value : el!.textContent || '').trim();
        state.vars[step.value || 'extracted'] = v.slice(0, 5000);
        return 'ok';
      }
      case 'assert':
        if (step.condition && !(await checkCondition(step.condition, deps, state.vars))) throw new Error(`Check failed: ${describeCondition(step.condition)}`);
        return 'ok';
      case 'confirm':
        if (!(await deps.confirm(macro.name, await deps.renderText(step.value || 'Continue with the next steps?', state.vars)))) return 'end';
        return 'ok';
      case 'label':
        return 'ok';
      case 'goto': {
        if (step.condition && !(await checkCondition(step.condition, deps, state.vars))) return 'ok';
        const target = labelIndex.get(step.value || '');
        if (target === undefined) throw new Error(`Label "${step.value}" not found`);
        const n = (state.iterations[step.id] || 0) + 1;
        const limit = step.maxIterations || DEFAULT_MAX_ITER;
        if (n > limit) { state.logs.push(`Loop limit of ${limit} reached at step ${i + 1}`); return 'ok'; }
        state.iterations[step.id] = n;
        state.stepIndex = target;
        return 'jump';
      }
      case 'stop':
        return 'end';
      case 'snippet':
        if (!(await deps.insertSnippet(step.refId!))) throw new Error('Snippet was not inserted (click into a text field first)');
        return 'ok';
      case 'nextRecord':
        if (!(await deps.nextRecord())) return 'end';
        return 'ok';
    }
    return 'ok';
  }
}
