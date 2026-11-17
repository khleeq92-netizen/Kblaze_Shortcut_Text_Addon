// Autofill engine.
//  planAutofill() runs in the extension (background / pages): it resolves every
//  rule's value template and condition against variables + the active dataset
//  record. Only the resolved values for the current page are sent to the page.
//  runAutofill() runs in the content script: finds each field (waiting for
//  dynamic ones), validates, fills (or previews) and reports per rule.
import type { AutofillProfile, AutofillRule, ElementTarget } from '../shared/types';
import { render, type RenderContext } from '../engine/render';
import { evaluate, type EvalScope } from '../engine/expr';
import { truthy, toText, type Value, type FormatOptions } from '../engine/values';
import { matchSite } from './sites';
import { waitForTarget, isVisible } from './dom';
import { setValue, validateValue } from './setters';
import { isCaptchaField, isMfaField, sensitiveReason, pageHasCaptcha } from './safety';

export interface PlannedRule {
  id: string;
  label: string;
  target: ElementTarget;
  action: AutofillRule['action'];
  value: string;
  overwrite: AutofillRule['overwrite'];
  waitMs?: number;
  delayAfterMs?: number;
  sensitive?: boolean;
  dateFormat?: string;
  includeHidden?: boolean;
  fieldKind?: AutofillRule['fieldKind'];
  /** Set when the rule must not run (condition false, other page, render error). */
  skip?: string;
  error?: string;
}

export interface PlanInput {
  values: Record<string, Value>;
  fo: FormatOptions;
  now?: Date;
  url: string;
  ctx?: Omit<RenderContext, 'globals' | 'fo'>;
}

export function renderValue(template: string, input: PlanInput): { value: string; error?: string } {
  if (!template.includes('{{')) return { value: template };
  const out = render(template, 'text', { ...(input.ctx || {}), fo: input.fo, now: input.now, globals: input.values, features: { forms: true, formulas: true, conditionals: true } });
  if (out.errors.length) return { value: '', error: out.errors[0] };
  if (out.needsForm) {
    const names = out.form.map((f: any) => f.name).filter(Boolean);
    return { value: '', error: `Unknown variable${names.length > 1 ? 's' : ''}: ${names.join(', ')} — define it under Variables or map a dataset column` };
  }
  return { value: out.text };
}

export function evalCondition(cond: string | undefined, input: PlanInput): { ok: boolean; error?: string } {
  if (!cond || !cond.trim()) return { ok: true };
  const scope: EvalScope = {
    lookup: (n) => (Object.prototype.hasOwnProperty.call(input.values, n) ? { found: true, value: input.values[n] } : { found: false, value: null }),
    fo: input.fo,
    now: input.now || new Date(),
  };
  try { return { ok: truthy(evaluate(cond, scope)) }; } catch (e: any) { return { ok: false, error: `Condition error: ${e?.message || e}` }; }
}

export function planAutofill(profile: Pick<AutofillProfile, 'rules'>, input: PlanInput): PlannedRule[] {
  const out: PlannedRule[] = [];
  for (const r of profile.rules) {
    const base: PlannedRule = {
      id: r.id, label: r.label || r.target.value, target: r.target, action: r.action, value: '', overwrite: r.overwrite,
      waitMs: r.waitMs, delayAfterMs: r.delayAfterMs, sensitive: r.sensitive, dateFormat: r.dateFormat, includeHidden: r.includeHidden, fieldKind: r.fieldKind,
    };
    if (!r.enabled) { out.push({ ...base, skip: 'Rule disabled' }); continue; }
    if (r.page && r.page.value && !matchSite(r.page, input.url)) { out.push({ ...base, skip: 'Different page of the form' }); continue; }
    const c = evalCondition(r.condition, input);
    if (c.error) { out.push({ ...base, skip: c.error, error: c.error }); continue; }
    if (!c.ok) { out.push({ ...base, skip: 'Condition not met' }); continue; }
    if (r.action === 'click' || r.action === 'focus' || r.action === 'clear' || r.action === 'check' || r.action === 'uncheck') { out.push({ ...base, value: r.value ? renderValue(r.value, input).value : '' }); continue; }
    const v = renderValue(r.value, input);
    if (v.error) { out.push({ ...base, skip: v.error, error: v.error }); continue; }
    out.push({ ...base, value: v.value });
  }
  return out;
}

// ---------------------------------------------------------------- content side
export type RuleStatus = 'filled' | 'previewed' | 'skipped' | 'notFound' | 'invalid' | 'failed' | 'blocked';
export interface RuleReport { id: string; label: string; status: RuleStatus; message?: string; kind?: string; ms?: number }
export interface AutofillReport { items: RuleReport[]; filled: number; failed: number; skipped: number; durationMs: number; captcha: boolean }

export interface RunDeps {
  doc: Document;
  preview: boolean;
  waitMs: number;
  fieldDelayMs: number;
  highlight: (el: Element | null, label?: string, kind?: 'ok' | 'err' | 'info') => void;
  /** Ask the user before a sensitive click (submit-like). */
  confirm: (title: string, reason: string) => Promise<boolean>;
  stopped: () => boolean;
  onProgress?: (i: number, total: number, r: RuleReport) => void;
  /** Domain is official/government: clicks never happen without confirmation. */
  official: boolean;
  respectExisting: boolean;
}

export function summarize(items: RuleReport[]) {
  return {
    filled: items.filter((i) => i.status === 'filled' || i.status === 'previewed').length,
    failed: items.filter((i) => ['notFound', 'invalid', 'failed', 'blocked'].includes(i.status)).length,
    skipped: items.filter((i) => i.status === 'skipped').length,
  };
}

export async function runAutofill(rules: PlannedRule[], deps: RunDeps): Promise<AutofillReport> {
  const t0 = Date.now();
  const items: RuleReport[] = [];
  const push = (i: number, r: RuleReport) => { items.push(r); deps.onProgress?.(i, rules.length, r); };
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (deps.stopped()) { push(i, { id: r.id, label: r.label, status: 'skipped', message: 'Stopped' }); continue; }
    if (r.skip) { push(i, { id: r.id, label: r.label, status: r.error ? 'invalid' : 'skipped', message: r.skip }); continue; }
    const s0 = Date.now();
    let el: Element | null = null;
    try {
      el = await waitForTarget(deps.doc, r.target, r.waitMs || deps.waitMs, { clickable: r.action === 'click', includeHidden: r.includeHidden, signal: deps.stopped });
    } catch (e: any) {
      push(i, { id: r.id, label: r.label, status: 'invalid', message: e?.message || String(e) });
      continue;
    }
    if (!el) { push(i, { id: r.id, label: r.label, status: 'notFound', message: 'Field not found on this page' }); continue; }
    const kind = (el as HTMLInputElement).type || el.tagName.toLowerCase();
    if (!r.includeHidden && (el as HTMLInputElement).type === 'hidden') { push(i, { id: r.id, label: r.label, status: 'blocked', message: 'Hidden field (enable "Fill hidden field" on the rule to allow)', kind }); continue; }
    if (isCaptchaField(el)) { push(i, { id: r.id, label: r.label, status: 'blocked', message: 'CAPTCHA field — K-Flow never solves or fills CAPTCHAs. Please complete it yourself.', kind }); continue; }
    if (isMfaField(el) && r.action !== 'click') { push(i, { id: r.id, label: r.label, status: 'blocked', message: 'OTP / two-factor field — enter it yourself', kind }); continue; }
    if (deps.preview) {
      const problem = validateValue(el, r.value, r.action);
      deps.highlight(el, `${r.label}: ${r.sensitive ? '••••' : r.value || '(empty)'}`, problem ? 'err' : 'ok');
      push(i, { id: r.id, label: r.label, status: problem ? 'invalid' : 'previewed', message: problem || (r.sensitive ? 'ready (sensitive value hidden)' : `→ ${r.value.slice(0, 80)}`), kind });
      await new Promise((res) => setTimeout(res, 30));
      continue;
    }
    try {
      (el as HTMLElement).scrollIntoView?.({ block: 'center' });
      if (isVisible(el)) deps.highlight(el, r.label, 'info');
      if (r.action === 'click' || r.action === 'focus') {
        if (r.action === 'click') {
          const why = sensitiveReason(el, 'click') || (deps.official ? 'This is an official/government portal — K-Flow never submits or clicks action buttons without your approval.' : null);
          if (why && !(await deps.confirm(`Autofill: ${r.label}`, why))) { push(i, { id: r.id, label: r.label, status: 'skipped', message: 'Not approved', kind }); continue; }
          (el as HTMLElement).click();
        } else (el as HTMLElement).focus();
        push(i, { id: r.id, label: r.label, status: 'filled', kind, ms: Date.now() - s0 });
      } else {
        const overwrite = deps.respectExisting && r.overwrite !== 'always' ? 'ifEmpty' : r.overwrite;
        const res = await setValue(el, r.value, { action: r.action, dateFormat: r.dateFormat, overwrite });
        push(i, { id: r.id, label: r.label, status: res.ok ? 'filled' : 'failed', message: res.message || res.warning, kind: res.kind, ms: Date.now() - s0 });
      }
    } catch (e: any) {
      push(i, { id: r.id, label: r.label, status: 'failed', message: e?.message || String(e), kind });
    }
    const delay = (r.delayAfterMs || 0) + deps.fieldDelayMs;
    if (delay) await new Promise((res) => setTimeout(res, Math.min(10000, delay)));
  }
  if (!deps.preview) deps.highlight(null);
  return { items, ...summarize(items), durationMs: Date.now() - t0, captcha: pageHasCaptcha(deps.doc) };
}

export function reportText(rep: AutofillReport): string {
  return `${rep.filled} filled · ${rep.failed} problem(s) · ${rep.skipped} skipped`;
}

export { toText };
