// Background orchestration for K-Flow automations. The service worker is the
// only component that reads the full database, resolves variables, decrypts
// sensitive values and decides what may run where. Pages receive only what a
// single run needs. Run / recording state lives in chrome.storage.session so it
// survives service-worker restarts and page navigations (but not browser restarts).
import { api } from '../shared/browser';
import { listRecords, getOne, saveRecords } from '../shared/db';
import { loadSettings, isSiteBlocked } from '../shared/settings';
import { addExecution, updateExecution, audit } from '../shared/history';
import { uid } from '../shared/ids';
import type { AutofillProfile, Macro, ScriptRecord, Variable, DataTable, Workspace, Settings, Execution, MacroStep, Snippet } from '../shared/types';
import { matchesAny, hostAllowed, isOfficialHost } from '../automation/sites';
import { planAutofill, evalCondition } from '../automation/autofill';
import { resolveVariables, rowToRecord, activeRecord, formatOptionsFrom } from '../automation/variables';
import { instrument, hasErrors } from '../automation/script/instrument';
import { tidyRecording } from '../automation/recorder';
import { unprotectTable } from '../data/protect';
import { recordLabel } from '../data/sources';
import { vaultValues, masterKey } from '../security/vault';
import { getOrgState, canOnRecord, type OrgState } from '../shared/orgState';
import { render } from '../engine/render';
import { DEFAULT_MACRO_SETTINGS } from '../library/workspaces';
import { mask } from '../automation/safety';

const session = () => (api.storage as any).session as chrome.storage.StorageArea;
async function sget<T>(key: string): Promise<T | undefined> { const r = await new Promise<any>((res) => session().get(key, res)); return r?.[key]; }
async function sset(key: string, v: any) { await new Promise<void>((res) => (v === undefined ? session().remove(key, () => res()) : session().set({ [key]: v }, () => res()))); }

// ---------------------------------------------------------------- context
interface Ctx { settings: Settings; org: OrgState | null; workspaces: Workspace[] }
async function ctx(): Promise<Ctx> {
  const [settings, org, workspaces] = await Promise.all([loadSettings(), getOrgState(), listRecords<Workspace>('workspaces')]);
  return { settings, org, workspaces };
}

function hostOf(url: string) { try { return new URL(url).hostname; } catch { return ''; } }

/** Throws a user-facing error if automation may not run on this URL. */
export function checkSiteAllowed(c: Ctx, url: string) {
  const host = hostOf(url);
  if (!/^https?:|^file:/.test(url)) throw new Error('Automations run only on web pages (http/https)');
  if (isSiteBlocked(c.settings, host)) throw new Error(`K-Flow is disabled on ${host} (Settings → Blocked sites)`);
  if (!hostAllowed(c.settings.security.automationAllowlist, host)) throw new Error(`${host} is not in your automation allowlist (Settings → Security)`);
  if (c.org && !c.org.revoked && c.org.policies.allowedDomains.length && !hostAllowed(c.org.policies.allowedDomains, host)) throw new Error(`Your organization allows automations only on: ${c.org.policies.allowedDomains.join(', ')}`);
}

export function isOfficial(c: Ctx, url: string, workspaceId?: string) {
  const host = hostOf(url);
  const ws = c.workspaces.find((w) => w.id === workspaceId);
  return isOfficialHost(host, [...c.settings.security.officialDomains, ...(ws?.officialDomains || [])]);
}

async function loadTables(): Promise<DataTable[]> {
  const mk = await masterKey();
  return Promise.all((await listRecords<DataTable>('tables')).map((t) => unprotectTable(t, mk)));
}

/** Builds all named values for a run: variables + active dataset record + vault + page. */
export async function buildValues(opts: { workspaceId?: string; datasetId?: string | null; recordId?: string | null; scopeRef?: string | null; url?: string; extra?: Record<string, any> }) {
  const [settings, variables, tables] = await Promise.all([loadSettings(), listRecords<Variable>('variables'), loadTables()]);
  const host = opts.url ? hostOf(opts.url) : undefined;
  const vault = await vaultValues(host);
  const ds = opts.datasetId ? tables.find((t) => t.id === opts.datasetId) : undefined;
  const row = ds ? (opts.recordId ? ds.rows.find((r) => r.id === opts.recordId) : activeRecord(ds)) : null;
  const record = ds && row ? rowToRecord(ds, row) : null;
  const fo = formatOptionsFrom(settings);
  const page = opts.url ? { url: opts.url, title: '', host: host || '' } : undefined;
  const r = resolveVariables(variables, { record, datasets: tables, fo, vault, page, workspaceId: opts.workspaceId, scopeRef: opts.scopeRef });
  const values = { ...r.values, ...(opts.extra || {}) };
  return { values, errors: r.errors, record, dataset: ds, row, settings, fo, tables, vaultLocked: !vault, recordLabel: ds && row ? recordLabel(ds, row.id) : '' };
}

export async function renderWith(text: string, opts: Parameters<typeof buildValues>[0]): Promise<string> {
  if (!text.includes('{{')) return text;
  const b = await buildValues(opts);
  const snippets = await listRecords<Snippet>('snippets');
  const byShortcut = new Map(snippets.map((s) => [s.shortcut, s]));
  const out = render(text, 'text', {
    globals: b.values, fo: b.fo, profile: { ...b.settings.profile } as any, page: opts.url ? { url: opts.url, title: '', host: hostOf(opts.url) } : undefined,
    resolveSnippet: (sc) => { const s = byShortcut.get(sc); return s ? { content: s.content, contentType: s.contentType } : null; },
  });
  if (out.errors.length) throw new Error(out.errors[0]);
  if (out.needsForm) throw new Error(`Unknown variable(s): ${out.form.map((f: any) => f.name).join(', ')}`);
  return out.text;
}

// ---------------------------------------------------------------- page info
export async function forPage(url: string) {
  const c = await ctx();
  const host = hostOf(url);
  const [profiles, macros, scripts] = await Promise.all([listRecords<AutofillProfile>('autofill'), listRecords<Macro>('macros'), listRecords<ScriptRecord>('scripts')]);
  let allowed = true;
  let reason = '';
  try { checkSiteAllowed(c, url); } catch (e: any) { allowed = false; reason = e.message; }
  const wsName = (id?: string) => c.workspaces.find((w) => w.id === id)?.name || 'General';
  const siteMatch = (sites: any[]) => sites.length > 0 && matchesAny(sites, url);
  const pick = <T extends { enabled: boolean; sites: any[]; workspaceId?: string; orgId?: string | null }>(list: T[], res: any) => list.filter((x) => x.enabled && canOnRecord(c.org, x, 'execute', res));
  return {
    host,
    allowed,
    reason,
    official: isOfficial(c, url),
    settings: { autofillHotkey: c.settings.automation.autofillHotkey, autoRun: c.settings.automation.autoRunEnabled, highlight: c.settings.automation.highlight },
    profiles: pick(profiles, 'autofill').map((p) => ({ id: p.id, name: p.name, rules: p.rules.length, runMode: p.runMode, shortcut: p.shortcut || '', workspace: wsName(p.workspaceId), matches: siteMatch(p.sites), anySite: !p.sites.length, datasetId: p.datasetId || null, starter: !!p.starter })),
    macros: pick(macros, 'macros').map((m) => ({ id: m.id, name: m.name, steps: m.steps.length, shortcut: m.shortcut || '', workspace: wsName(m.workspaceId), matches: siteMatch(m.sites), anySite: !m.sites.length, datasetId: m.datasetId || null })),
    scripts: (c.settings.security.scriptsEnabled && !c.org?.policies.disableScripts ? pick(scripts, 'scripts').filter((s) => !s.library) : []).map((s) => ({ id: s.id, name: s.name, runMode: s.runMode, workspace: wsName(s.workspaceId), matches: siteMatch(s.sites), anySite: !s.sites.length })),
  };
}

// ---------------------------------------------------------------- autofill
export async function autofillPlan(profileId: string, url: string, recordId?: string | null) {
  const c = await ctx();
  checkSiteAllowed(c, url);
  const p = await getOne<AutofillProfile>('autofill', profileId);
  if (!p || p.deleted) throw new Error('Autofill profile not found');
  if (!canOnRecord(c.org, p, 'execute', 'autofill')) throw new Error('Your organization role does not allow running this profile');
  const b = await buildValues({ workspaceId: p.workspaceId, datasetId: p.datasetId, recordId, scopeRef: p.id, url });
  const rules = planAutofill(p, { values: b.values, fo: b.fo, url, ctx: { profile: { ...b.settings.profile } as any, page: { url, title: '', host: hostOf(url) } } });
  const varErrors = Object.entries(b.errors).map(([k, v]) => `{{${k}}}: ${v}`);
  return {
    name: p.name, rules, official: isOfficial(c, url, p.workspaceId),
    waitMs: c.settings.automation.waitTimeoutMs, fieldDelayMs: p.fieldDelayMs ?? 0, highlight: c.settings.automation.highlight, respectExisting: c.settings.automation.respectExistingValues,
    record: b.recordLabel, datasetId: p.datasetId || null, recordId: b.row?.id || null, varErrors, vaultLocked: b.vaultLocked, workspaceId: p.workspaceId,
  };
}

export async function logAutofill(p: { profileId: string; name: string; url: string; preview: boolean; report: any; recordId?: string | null; record?: string; workspaceId?: string }) {
  const items = (p.report?.items || []) as any[];
  const exec: Omit<Execution, 'id'> = {
    kind: 'autofill', refId: p.profileId, name: p.name + (p.preview ? ' (preview)' : ''), workspaceId: p.workspaceId, startedAt: Date.now() - (p.report?.durationMs || 0), endedAt: Date.now(),
    status: p.report?.failed ? (p.report.filled ? 'partial' : 'failed') : 'success', url: p.url.slice(0, 500), host: hostOf(p.url),
    steps: items.map((it, i) => ({ i, label: it.label, status: it.status === 'filled' || it.status === 'previewed' ? 'done' : it.status === 'skipped' ? 'skip' : 'fail', ms: it.ms, error: ['filled', 'previewed'].includes(it.status) ? undefined : it.message })),
    filled: p.report?.filled, failed: p.report?.failed, skipped: p.report?.skipped, recordId: p.recordId, recordLabel: p.record,
  };
  const s = await loadSettings();
  await addExecution(exec, s.automation.historyLimit);
  if (!p.preview) await audit('execute', 'autofill', { resourceId: p.profileId, name: p.name, details: `${exec.filled} filled, ${exec.failed} problems on ${exec.host}${p.record ? ' · record ' + p.record : ''}`, workspaceId: p.workspaceId });
  return exec;
}

// ---------------------------------------------------------------- datasets
export async function moveRecord(datasetId: string, dir: 'next' | 'prev' | 'set', rowId?: string): Promise<{ ok: boolean; rowId?: string; label?: string; index?: number; total?: number }> {
  const t = await getOne<DataTable>('tables', datasetId);
  if (!t) throw new Error('Dataset not found');
  const i = Math.max(0, t.rows.findIndex((r) => r.id === t.currentRowId));
  let j = i;
  if (dir === 'next') j = i + 1;
  else if (dir === 'prev') j = i - 1;
  else j = t.rows.findIndex((r) => r.id === rowId);
  if (j < 0 || j >= t.rows.length) return { ok: false, index: i, total: t.rows.length };
  const next = { ...t, currentRowId: t.rows[j].id };
  await saveRecords('tables', [next], { snapshot: false });
  const plain = await unprotectTable(next, await masterKey());
  return { ok: true, rowId: t.rows[j].id, label: recordLabel(plain, t.rows[j].id), index: j, total: t.rows.length };
}

// ---------------------------------------------------------------- macros
export interface ActiveRun { runId: string; macroId: string; name: string; tabId: number; status: 'running' | 'paused' | 'stopped'; state: any; execId: string; startedAt: number; datasetId?: string | null; workspaceId?: string; lastUrl?: string; heartbeat: number }
const runKey = (tabId: number) => `kf.run.${tabId}`;

export async function getRun(tabId: number) { return sget<ActiveRun>(runKey(tabId)); }

export async function startMacro(tabId: number, macroId: string, url: string) {
  const c = await ctx();
  checkSiteAllowed(c, url);
  const m = await getOne<Macro>('macros', macroId);
  if (!m || m.deleted) throw new Error('Macro not found');
  if (!canOnRecord(c.org, m, 'execute', 'macros')) throw new Error('Your organization role does not allow running this macro');
  const existing = await getRun(tabId);
  if (existing && existing.status !== 'stopped' && Date.now() - existing.heartbeat < 120000) throw new Error(`"${existing.name}" is already running in this tab — stop it first`);
  const runId = uid('run');
  const exec = await addExecution({ kind: 'macro', refId: m.id, name: m.name, workspaceId: m.workspaceId, startedAt: Date.now(), status: 'running', url: url.slice(0, 500), host: hostOf(url), steps: [] }, c.settings.automation.historyLimit);
  const run: ActiveRun = { runId, macroId, name: m.name, tabId, status: 'running', execId: exec.id, startedAt: Date.now(), datasetId: m.datasetId, workspaceId: m.workspaceId, heartbeat: Date.now(),
    state: { runId, macroId, stepIndex: 0, iterations: {}, vars: {}, startedAt: Date.now(), stepLog: [], logs: [], navigations: 0 } };
  await sset(runKey(tabId), run);
  await audit('execute', 'macros', { resourceId: m.id, name: m.name, details: `started on ${hostOf(url)}`, workspaceId: m.workspaceId });
  return { run, macro: macroForPage(m), official: isOfficial(c, url, m.workspaceId) };
}

function macroForPage(m: Macro) {
  return { id: m.id, name: m.name, steps: m.steps, settings: { ...DEFAULT_MACRO_SETTINGS, ...(m.settings || {}) } };
}

export async function resumeInfo(tabId: number, url: string) {
  const run = await getRun(tabId);
  if (!run || run.status === 'stopped') return null;
  if (Date.now() - run.heartbeat > 10 * 60_000) { await sset(runKey(tabId), undefined); return null; }
  const m = await getOne<Macro>('macros', run.macroId);
  if (!m) return null;
  const c = await ctx();
  try { checkSiteAllowed(c, url); } catch (e: any) { await finishMacro(tabId, { status: 'failed', error: e.message, state: run.state }); return null; }
  return { run, macro: macroForPage(m), official: isOfficial(c, url, m.workspaceId) };
}

export async function checkpoint(tabId: number, state: any, url?: string) {
  const run = await getRun(tabId);
  if (!run || run.state.runId !== state.runId) return { status: 'stopped' };
  run.state = state;
  run.heartbeat = Date.now();
  if (url) run.lastUrl = url;
  await sset(runKey(tabId), run);
  return { status: run.status };
}

export async function controlMacro(tabId: number, action: 'pause' | 'resume' | 'stop') {
  const run = await getRun(tabId);
  if (!run) return { ok: false };
  run.status = action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'stopped';
  await sset(runKey(tabId), run);
  api.tabs.sendMessage(tabId, { type: 'kf/macro/control', action, runId: run.runId }, { frameId: 0 }).catch?.(() => {});
  if (action === 'stop') await finishMacro(tabId, { status: 'stopped', state: run.state });
  return { ok: true, status: run.status };
}

export async function finishMacro(tabId: number, out: { status: string; error?: string; state: any }) {
  const run = await getRun(tabId);
  await sset(runKey(tabId), undefined);
  if (!run) return;
  const st = out.state || run.state;
  await updateExecution(run.execId, {
    endedAt: Date.now(), status: out.status === 'success' ? 'success' : out.status === 'stopped' ? 'stopped' : 'failed', error: out.error,
    steps: (st.stepLog || []).slice(-500), logs: (st.logs || []).slice(-200),
    filled: (st.stepLog || []).filter((s: any) => s.status === 'done').length, failed: (st.stepLog || []).filter((s: any) => s.status === 'fail').length, skipped: (st.stepLog || []).filter((s: any) => s.status === 'skip').length,
  });
  if (out.status !== 'success') await audit(out.status === 'stopped' ? 'stop' : 'fail', 'macros', { resourceId: run.macroId, name: run.name, details: out.error, workspaceId: run.workspaceId });
}

export async function macroValues(tabId: number, vars: Record<string, string>, url: string) {
  const run = await getRun(tabId);
  return { workspaceId: run?.workspaceId, datasetId: run?.datasetId, scopeRef: run?.macroId, url, extra: vars };
}

export async function evalFormulaFor(src: string, opts: Parameters<typeof buildValues>[0]) {
  const b = await buildValues(opts);
  const r = evalCondition(src, { values: b.values, fo: b.fo, url: opts.url || '' });
  if (r.error) throw new Error(r.error);
  return r.ok;
}

// ---------------------------------------------------------------- recorder
export interface Recording { tabId: number; startedAt: number; startUrl: string; steps: MacroStep[]; paused: boolean; lastUrl: string; workspaceId: string }
const recKey = (tabId: number) => `kf.rec.${tabId}`;
export async function getRecording(tabId: number) { return sget<Recording>(recKey(tabId)); }

export async function startRecording(tabId: number, url: string) {
  const c = await ctx();
  checkSiteAllowed(c, url);
  const rec: Recording = { tabId, startedAt: Date.now(), startUrl: url, steps: [], paused: false, lastUrl: url, workspaceId: c.settings.activeWorkspaceId };
  await sset(recKey(tabId), rec);
  return rec;
}

export async function recordStep(tabId: number, step: MacroStep, replace: boolean) {
  const rec = await getRecording(tabId);
  if (!rec || rec.paused) return { ok: false };
  if (replace) { const i = rec.steps.findIndex((s) => s.id === step.id); if (i >= 0) rec.steps[i] = step; else rec.steps.push(step); }
  else rec.steps.push(step);
  if (rec.steps.length > 2000) rec.steps.shift();
  await sset(recKey(tabId), rec);
  return { ok: true, count: rec.steps.length };
}

/** Called when a recorded tab loads a new page: adds a navigate step unless a click/key caused it. */
export async function recordPageLoad(tabId: number, url: string) {
  const rec = await getRecording(tabId);
  if (!rec) return null;
  if (url !== rec.lastUrl) {
    const last = rec.steps[rec.steps.length - 1];
    const causedByAction = last && ['click', 'key'].includes(last.type) && Date.now() - rec.startedAt > 0;
    if (!causedByAction && !rec.paused) rec.steps.push({ id: uid('stp'), type: 'navigate', value: url, note: `Open ${hostOf(url)}` });
    rec.lastUrl = url;
    await sset(recKey(tabId), rec);
  }
  return rec;
}

export async function pauseRecording(tabId: number, paused: boolean) {
  const rec = await getRecording(tabId);
  if (!rec) return null;
  rec.paused = paused;
  await sset(recKey(tabId), rec);
  return rec;
}

export async function stopRecording(tabId: number, save: boolean, name?: string) {
  const rec = await getRecording(tabId);
  await sset(recKey(tabId), undefined);
  if (!rec || !save) return { saved: false };
  const steps = tidyRecording(rec.steps);
  if (!steps.length) return { saved: false, empty: true };
  const t = Date.now();
  const first = steps[0];
  const withStart: MacroStep[] = first?.type === 'navigate' ? steps : [{ id: uid('stp'), type: 'navigate', value: rec.startUrl, note: `Open ${hostOf(rec.startUrl)}`, disabled: true }, ...steps];
  const m: Macro = {
    id: uid('mac'), name: name || `Recorded on ${hostOf(rec.startUrl)} ${new Date(t).toLocaleString()}`, enabled: true, workspaceId: rec.workspaceId,
    sites: [{ kind: 'domain', value: hostOf(rec.startUrl).replace(/^www\./, '') }], steps: withStart, settings: { ...DEFAULT_MACRO_SETTINGS }, tags: ['recorded'], startUrl: rec.startUrl, createdAt: t, updatedAt: t,
  };
  await saveRecords('macros', [m]);
  await audit('create', 'macros', { resourceId: m.id, name: m.name, details: `recorded ${steps.length} steps (sensitive values not recorded: ${steps.filter((s) => s.sensitive).length})`, workspaceId: m.workspaceId });
  return { saved: true, macroId: m.id, steps: withStart.length };
}

// ---------------------------------------------------------------- scripts
export async function runScript(scriptId: string, tabId: number, frameId: number, url: string, extraVars: Record<string, any> = {}) {
  const c = await ctx();
  checkSiteAllowed(c, url);
  if (!c.settings.security.scriptsEnabled) throw new Error('Custom JavaScript is turned off (Settings → Security)');
  if (c.org?.policies.disableScripts) throw new Error('Your organization has disabled custom scripts');
  const s = await getOne<ScriptRecord>('scripts', scriptId);
  if (!s || s.deleted) throw new Error('Script not found');
  if (!canOnRecord(c.org, s, 'execute', 'scripts')) throw new Error('Your organization role does not allow running this script');
  const all = await listRecords<ScriptRecord>('scripts');
  const libs = all.filter((x) => x.library && x.id !== s.id && x.enabled && (!x.workspaceId || x.workspaceId === s.workspaceId));
  const main = instrument(s.code);
  if (hasErrors(main.problems)) throw new Error(main.problems.filter((p) => p.severity === 'error').map((p) => `line ${p.line ?? '?'}: ${p.message}`).join('; '));
  const libraries = libs.map((l) => ({ name: l.name, ...instrument(l.code) })).filter((l) => !hasErrors(l.problems)).map((l) => ({ name: l.name, code: l.code }));
  const b = await buildValues({ workspaceId: s.workspaceId, datasetId: s.datasetId, scopeRef: s.id, url, extra: extraVars });
  // vault secrets are never handed to scripts; only plain variables + the active record
  const { vault: _vault, row: _row, record: _record, ...vars } = b.values as any;
  const payload = { code: main.code, libraries, vars: JSON.parse(JSON.stringify(vars, (_k, v) => (v instanceof Date ? v.toISOString() : v))), record: b.record, timeoutMs: s.timeoutMs, maxLoopIterations: s.maxLoopIterations, name: s.name };
  const exec = await addExecution({ kind: 'script', refId: s.id, name: s.name, workspaceId: s.workspaceId, startedAt: Date.now(), status: 'running', url: url.slice(0, 500), host: hostOf(url), steps: [] }, c.settings.automation.historyLimit);
  let result: any;
  try {
    const target = { tabId, frameIds: [frameId || 0] };
    await api.scripting.executeScript({ target, world: 'MAIN' as any, files: ['script-host.js'] });
    const [r] = await api.scripting.executeScript({ target, world: 'MAIN' as any, func: (p: any) => (window as any).__kfScriptHost.run(p), args: [payload] });
    result = r?.result;
    if (!result) throw new Error('The page did not return a result (it may have navigated away)');
  } catch (e: any) {
    result = { ok: false, error: { message: /Cannot access|cannot be scripted|chrome:\/\//i.test(String(e?.message)) ? 'This page cannot be scripted by extensions' : e?.message || String(e) }, logs: [], vars: {}, durationMs: 0, steps: 0 };
  }
  await updateExecution(exec.id, {
    endedAt: Date.now(), status: result.ok ? 'success' : 'failed', error: result.error ? `${result.error.line ? 'line ' + result.error.line + ': ' : ''}${result.error.message}` : undefined,
    logs: (result.logs || []).slice(-200).map((l: any) => `[${l.level}${l.line ? ' L' + l.line : ''}] ${l.text}`),
  });
  await audit('execute', 'scripts', { resourceId: s.id, name: s.name, details: `${result.ok ? 'ok' : 'failed'} on ${hostOf(url)}`, workspaceId: s.workspaceId });
  const changed: Record<string, any> = {};
  for (const [k, v] of Object.entries(result.vars || {})) if (!(k in vars) || JSON.stringify((vars as any)[k]) !== JSON.stringify(v)) changed[k] = v;
  return { ...result, vars: changed };
}

export async function maskForLog(v: string, sensitive?: boolean) { return sensitive ? mask(v) : v; }
