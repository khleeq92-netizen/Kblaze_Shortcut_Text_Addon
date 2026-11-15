// Autopilot: runs user-defined, user-approved workflow steps on the current page.
// Every run is visible (progress panel + highlight) and can be stopped. Steps that
// look sensitive (submit/send/pay/delete/…, password or payment fields) always
// require an explicit confirmation in an extension-owned dialog.
import type { Workflow, WorkflowStep } from '../shared/types';
import { highlight, progressPanel, toast } from './ui';
import { openOverlay } from './overlay';
import { getEditTarget } from './editable';
import { replaceBeforeCaret } from './insert';

const SENSITIVE_TEXT = /\b(submit|send|pay|payment|purchase|buy|order|checkout|check out|confirm|delete|remove|transfer|withdraw|sign ?(up|in)|log ?in|register|subscribe|publish|post|place|donate|cancel (my )?(account|subscription)|close account|save changes|update (password|email|account)|deactivate)\b/i;
const SENSITIVE_FIELD = /(pass(word)?|pwd|otp|cvv|cvc|card|ccnum|cc-|iban|account.?number|routing|ssn|pin\b|security.?code)/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function visible(el: Element) {
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
}

function labelText(el: Element): string {
  const parts: string[] = [];
  const h = el as HTMLInputElement;
  if ((h as any).labels) for (const l of Array.from((h as any).labels as NodeListOf<HTMLLabelElement>)) parts.push(l.textContent || '');
  const lb = el.getAttribute('aria-labelledby');
  if (lb) lb.split(/\s+/).forEach((id) => parts.push(document.getElementById(id)?.textContent || ''));
  for (const a of ['aria-label', 'placeholder', 'name', 'id', 'title', 'data-placeholder']) parts.push(el.getAttribute(a) || '');
  if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'A') parts.push(el.textContent || '');
  if (el.tagName === 'INPUT' && ['submit', 'button'].includes(h.type)) parts.push(h.value);
  const wrapLabel = el.closest('label');
  if (wrapLabel) parts.push(wrapLabel.textContent || '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

const FIELD_SEL = 'input:not([type=hidden]),textarea,select,[contenteditable=""],[contenteditable=true],[role=textbox],[role=combobox],button,a[href],[role=button],[role=checkbox],[role=switch]';

export function findTarget(step: WorkflowStep): Element | null {
  const t = step.target;
  if (!t || t.kind === 'focused') {
    let a = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    return a && a !== document.body ? a : null;
  }
  if (t.kind === 'selector') {
    try {
      const all = Array.from(document.querySelectorAll(t.value));
      return all.find(visible) || all[0] || null;
    } catch {
      throw new Error(`Invalid CSS selector "${t.value}"`);
    }
  }
  const want = t.value.trim().toLowerCase();
  const cands = Array.from(document.querySelectorAll(FIELD_SEL)).filter(visible);
  const typed = step.type === 'click' ? cands : cands.filter((c) => !['BUTTON', 'A'].includes(c.tagName) && c.getAttribute('role') !== 'button');
  let best: Element | null = null;
  let bestScore = 0;
  for (const c of typed) {
    const lt = labelText(c).toLowerCase();
    if (!lt) continue;
    const score = lt === want ? 3 : lt.startsWith(want) ? 2 : lt.includes(want) ? 1 : 0;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

export function isSensitive(step: WorkflowStep, el: Element | null): string | null {
  if (step.requireConfirm) return step.note || 'This step is marked as requiring confirmation.';
  if (!el) return null;
  const h = el as HTMLInputElement;
  if (step.type === 'click' || step.type === 'key') {
    const txt = labelText(el) + ' ' + (el.textContent || '').slice(0, 80);
    if ((el.tagName === 'BUTTON' && (h.type === 'submit' || (!el.getAttribute('type') && el.closest('form')))) || (el.tagName === 'INPUT' && h.type === 'submit')) return 'This click submits a form.';
    if (SENSITIVE_TEXT.test(txt)) return `This click looks sensitive ("${txt.trim().slice(0, 60)}").`;
    if (step.type === 'key' && /^enter$/i.test(step.value || '') && el.closest('form')) return 'Pressing Enter here may submit a form.';
  }
  if (step.type === 'type' || step.type === 'select') {
    const sig = `${h.type || ''} ${h.name || ''} ${h.id || ''} ${h.getAttribute?.('autocomplete') || ''} ${labelText(el)}`;
    if (h.type === 'password' || SENSITIVE_FIELD.test(sig)) return 'This step enters data into a password or payment-related field.';
  }
  return null;
}

function tabbables(): HTMLElement[] {
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex],[contenteditable=""],[contenteditable=true]';
  const all = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => !(e as any).disabled && e.tabIndex >= 0 && visible(e));
  const pos = all.filter((e) => e.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return [...pos, ...all.filter((e) => e.tabIndex === 0)];
}

function moveFocus(back = false) {
  const list = tabbables();
  const cur = document.activeElement as HTMLElement | null;
  const i = cur ? list.indexOf(cur) : -1;
  const next = list[(i + (back ? -1 : 1) + list.length) % list.length];
  next?.focus();
  return next;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter ? setter.call(el, value) : (el.value = value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function pressKey(el: Element, key: string) {
  const map: Record<string, { key: string; code: string; keyCode: number }> = {
    enter: { key: 'Enter', code: 'Enter', keyCode: 13 }, tab: { key: 'Tab', code: 'Tab', keyCode: 9 }, escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    space: { key: ' ', code: 'Space', keyCode: 32 }, arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }, backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  };
  const k = map[key.toLowerCase()] || { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, keyCode: key.toUpperCase().charCodeAt(0) };
  for (const type of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { ...k, bubbles: true, cancelable: true, composed: true } as any));
}

export interface RunDeps {
  renderText: (content: string) => Promise<string>;
  expandSnippet: (snippetId: string) => Promise<boolean>;
}

async function confirmStep(title: string, reason: string, detail: string): Promise<boolean> {
  const r = await openOverlay({ mode: 'confirm', page: { url: location.href, title: document.title, host: location.hostname }, payload: { title, reason, detail } });
  return r.type === 'confirm' && r.ok;
}

export function describeStep(s: WorkflowStep): string {
  const tgt = s.target ? (s.target.kind === 'focused' ? 'focused field' : s.target.kind === 'label' ? `"${s.target.value}"` : s.target.value) : 'focused field';
  switch (s.type) {
    case 'focus': return `Focus ${tgt}`;
    case 'type': return `Type into ${tgt}`;
    case 'tab': return s.value === 'shift' ? 'Press Shift+Tab' : 'Press Tab';
    case 'select': return `Select "${s.value}" in ${tgt}`;
    case 'check': return `${s.checked === false ? 'Uncheck' : 'Check'} ${tgt}`;
    case 'click': return `Click ${tgt}`;
    case 'key': return `Press ${s.value}`;
    case 'wait': return `Wait ${s.ms ?? 500} ms`;
    case 'waitFor': return `Wait for ${tgt}`;
    case 'snippet': return 'Insert snippet';
    case 'confirm': return `Ask: ${s.value || 'Continue?'}`;
  }
}

let running = false;

export async function runWorkflow(wf: Workflow, deps: RunDeps) {
  if (running) { toast('A workflow is already running', { error: true }); return; }
  if (wf.siteFilter && !location.hostname.includes(wf.siteFilter)) {
    if (!(await confirmStep(wf.name, `This workflow is meant for sites matching "${wf.siteFilter}".`, `Run it on ${location.hostname} anyway?`))) return;
  }
  running = true;
  const panel = progressPanel(wf.name, wf.steps.map((s) => s.note || describeStep(s)));
  let failed = false;
  try {
    for (let i = 0; i < wf.steps.length; i++) {
      if (panel.stopped()) { for (let j = i; j < wf.steps.length; j++) panel.set(j, 'skip'); break; }
      const step = wf.steps[i];
      panel.set(i, 'run');
      try {
        let el: Element | null = null;
        if (['focus', 'type', 'select', 'check', 'click', 'key'].includes(step.type)) {
          el = findTarget(step);
          if (!el && step.type !== 'key') throw new Error(`Could not find ${describeStep(step).replace(/^\w+ (into |in )?/, '')}`);
          if (el) { (el as HTMLElement).scrollIntoView?.({ block: 'center', behavior: 'smooth' }); highlight(el, `Step ${i + 1}`); await sleep(250); }
          const why = isSensitive(step, el);
          if (why && !(await confirmStep(`${wf.name} — step ${i + 1}`, why, describeStep(step)))) { panel.set(i, 'skip'); for (let j = i + 1; j < wf.steps.length; j++) panel.set(j, 'skip'); toast('Workflow stopped — step was not approved'); break; }
        }
        switch (step.type) {
          case 'focus':
            (el as HTMLElement).focus();
            break;
          case 'type': {
            const h = el as HTMLElement;
            h.focus();
            const text = await deps.renderText(step.value || '');
            const t = getEditTarget(h);
            if (!t) throw new Error('Target is not a text field');
            if (step.clear) {
              if (t.kind === 'ce') { const sel = t.doc.getSelection(); const r = t.doc.createRange(); r.selectNodeContents(t.root); sel?.removeAllRanges(); sel?.addRange(r); }
              else (h as HTMLInputElement).select();
            } else if (t.kind !== 'ce') { const v = (h as HTMLInputElement).value.length; (h as HTMLInputElement).setSelectionRange(v, v); }
            if (t.kind !== 'ce' && step.clear) { setNativeValue(h as HTMLInputElement, ''); }
            const res = await replaceBeforeCaret(t, 0, { text, html: '', isRich: false, cursorBack: null });
            if (res === 'failed' && t.kind !== 'ce') setNativeValue(h as HTMLInputElement, (step.clear ? '' : (h as HTMLInputElement).value) + text);
            break;
          }
          case 'tab':
            moveFocus(step.value === 'shift');
            break;
          case 'select': {
            const want = (await deps.renderText(step.value || '')).trim().toLowerCase();
            if (el instanceof HTMLSelectElement) {
              const opt = Array.from(el.options).find((o) => o.text.trim().toLowerCase() === want || o.value.toLowerCase() === want) || Array.from(el.options).find((o) => o.text.toLowerCase().includes(want));
              if (!opt) throw new Error(`Option "${step.value}" not found`);
              setNativeValue(el, opt.value);
            } else {
              (el as HTMLElement).click();
              await sleep(350);
              const opts = Array.from(document.querySelectorAll('[role=option],[role=menuitem],li,[data-value]')).filter(visible);
              const o = opts.find((x) => (x.textContent || '').trim().toLowerCase() === want) || opts.find((x) => (x.textContent || '').toLowerCase().includes(want));
              if (!o) throw new Error(`Option "${step.value}" not found in custom dropdown`);
              (o as HTMLElement).click();
            }
            break;
          }
          case 'check': {
            const h = el as HTMLInputElement;
            const want = step.checked !== false;
            const cur = h.type === 'checkbox' || h.type === 'radio' ? h.checked : el!.getAttribute('aria-checked') === 'true';
            if (cur !== want) h.click();
            break;
          }
          case 'click':
            (el as HTMLElement).click();
            break;
          case 'key': {
            const target = el || document.activeElement || document.body;
            if (/^tab$/i.test(step.value || '')) moveFocus(false);
            else if (/^enter$/i.test(step.value || '') && (target as HTMLElement).closest?.('form') && target.tagName === 'INPUT') {
              // Synthetic key events cannot submit forms; submit explicitly (already confirmed above).
              const form = (target as HTMLElement).closest('form')!;
              form.requestSubmit ? form.requestSubmit() : form.submit();
            } else pressKey(target, step.value || 'Enter');
            break;
          }
          case 'wait':
            await sleep(Math.min(60000, step.ms ?? 500));
            break;
          case 'waitFor': {
            const deadline = Date.now() + Math.min(60000, step.ms || 10000);
            while (!findTarget(step)) {
              if (Date.now() > deadline || panel.stopped()) throw new Error('Timed out waiting for element');
              await sleep(200);
            }
            break;
          }
          case 'snippet':
            if (!step.snippetId) throw new Error('No snippet selected');
            if (!(await deps.expandSnippet(step.snippetId))) throw new Error('Snippet was not inserted');
            break;
          case 'confirm':
            if (!(await confirmStep(wf.name, step.value || 'Continue with the next steps?', `Step ${i + 1} of ${wf.steps.length}`))) {
              for (let j = i; j < wf.steps.length; j++) panel.set(j, 'skip');
              i = wf.steps.length;
              continue;
            }
            break;
        }
        panel.set(i, 'done');
        await sleep(120);
      } catch (e: any) {
        panel.set(i, 'fail');
        failed = true;
        toast(`Step ${i + 1} failed: ${e?.message || e}`, { error: true, ms: 7000 });
        break;
      }
    }
  } finally {
    highlight(null);
    panel.close();
    running = false;
    if (!failed && !panel.stopped()) toast(`✓ ${wf.name} finished`);
  }
}
