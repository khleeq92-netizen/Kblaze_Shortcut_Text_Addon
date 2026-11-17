// Content-script controller for K-Flow automations on the current page:
// autofill (run / preview / hotkeys / on-load), macro playback with
// pause/resume/stop that survives navigations, the macro recorder, the visual
// field selector and page scanning for the AI builder. Only the top frame drives
// runs; same-origin iframes are reached through the DOM helpers.
import { api } from '../shared/browser';
import { runAutofill, reportText, type AutofillReport } from '../automation/autofill';
import { playMacro, describeStep, type MacroRunState } from '../automation/macro';
import { startRecorder, type Recorder } from '../automation/recorder';
import { detectFields, targetFor, labelFor, fieldKind, cssFor, xpathFor, CONTROL_SEL } from '../automation/dom';
import { toast, highlight, runPanel, recorderBar, badge, clearBadges, mapBar } from './ui';
import { openOverlay } from './overlay';
import { getEditTarget, deepActiveElement } from './editable';

type Send = <T = any>(msg: any) => Promise<T | null>;

interface PageInfo {
  allowed: boolean; reason: string; official: boolean;
  settings: { autofillHotkey: string; autoRun: boolean; highlight: boolean };
  profiles: { id: string; name: string; runMode: string; shortcut: string; matches: boolean; anySite: boolean }[];
  macros: { id: string; name: string; shortcut: string; matches: boolean }[];
  recording: { steps: number; paused: boolean } | null;
}

const page = () => ({ url: location.href.slice(0, 2000), title: document.title.slice(0, 300), host: location.hostname });

export function initAutomation(send: Send, expandSnippet: (id: string) => Promise<boolean>) {
  if (window !== window.top) {
    // frames only answer scans (field detection) — runs are driven from the top frame
    return { onMessage: () => false };
  }
  let info: PageInfo | null = null;
  let autoRan = false;

  const confirm = async (title: string, reason: string) => {
    const r = await openOverlay({ mode: 'confirm', page: page(), payload: { title, reason, detail: location.hostname } });
    return r.type === 'confirm' && r.ok;
  };

  async function refresh() {
    info = await send<PageInfo>({ type: 'kf/automation/forPage', url: location.href });
    return info;
  }

  // ------------------------------------------------------------- autofill
  let filling = false;
  async function autofill(profileId: string, preview = false, recordId?: string | null): Promise<AutofillReport | null> {
    if (filling) { toast('Autofill is already running'); return null; }
    filling = true;
    clearBadges();
    let plan: any;
    try {
      plan = await send<any>({ type: 'kf/autofill/plan', profileId, url: location.href, recordId });
      if (!plan || plan.error || !plan.rules) { toast(`K-Flow: ${plan?.error || plan?.message || 'could not load profile'}`, { error: true, ms: 7000 }); return null; }
      let stopped = false;
      const active = plan.rules.filter((r: any) => !r.skip || r.error);
      const panel = runPanel(`${preview ? 'Preview' : 'Autofill'}: ${plan.name}`, active.map((r: any) => r.label), preview ? { onStop: () => { stopped = true; } } : { onStop: () => { stopped = true; } });
      if (plan.record) panel.setSub(`Record: ${plan.record}`);
      if (plan.varErrors?.length) toast(`Variable problems: ${plan.varErrors.slice(0, 2).join('; ')}`, { error: true, ms: 8000 });
      const idx = new Map(active.map((r: any, i: number) => [r.id, i]));
      const rep = await runAutofill(plan.rules, {
        doc: document, preview, waitMs: Math.min(plan.waitMs, preview ? 1500 : plan.waitMs), fieldDelayMs: plan.fieldDelayMs || 0,
        highlight: (el, label, kind) => { if (!el) { highlight(null); return; } if (preview) badge(el, label || '', kind === 'err' ? 'err' : 'ok'); else if (plan.highlight) highlight(el, label); },
        confirm, stopped: () => stopped, official: plan.official, respectExisting: plan.respectExisting,
        onProgress: (_i, _n, r) => { const i = idx.get(r.id) as number | undefined; if (i !== undefined) panel.set(i, r.status, r.message); },
      });
      const summary = reportText(rep) + (rep.captcha ? ' · CAPTCHA on page — complete it yourself' : '') + (plan.official ? ' · Official portal: review and submit manually' : '');
      const actions: { label: string; run: () => void; kind?: 'pri' | 'dan' }[] = [];
      if (preview) actions.push({ label: 'Fill now', kind: 'pri', run: () => { panel.close(); clearBadges(); autofill(profileId, false, recordId); } });
      if (plan.datasetId) actions.push({ label: 'Next record →', run: async () => { const r = await send<any>({ type: 'kf/dataset/move', datasetId: plan.datasetId, dir: 'next' }); if (!r?.ok) { toast('That was the last record'); return; } panel.close(); clearBadges(); autofill(profileId, preview); } });
      if (preview) actions.push({ label: 'Clear highlights', run: () => clearBadges() });
      panel.done(summary, actions);
      send({ type: 'kf/autofill/report', profileId, name: plan.name, url: location.href, preview, report: rep, recordId: plan.recordId, record: plan.record, workspaceId: plan.workspaceId });
      return rep;
    } finally {
      filling = false;
    }
  }

  async function hotkeyAutofill() {
    const i = info || (await refresh());
    if (!i) return;
    if (!i.allowed) { toast(`K-Flow: ${i.reason}`, { error: true }); return; }
    const matching = i.profiles.filter((p) => p.matches);
    if (!matching.length) { toast('No autofill profile matches this site — create one with the field selector (Alt+Shift+M) or in the side panel', { error: true, ms: 6000 }); return; }
    autofill(matching[0].id);
  }

  // ------------------------------------------------------------- macros
  let runState: { stopped: boolean; paused: boolean; runId: string } | null = null;
  async function playRun(r: { run: any; macro: any; official: boolean }) {
    if (runState) return;
    const run = r.run;
    const state: MacroRunState = run.state;
    runState = { stopped: false, paused: run.status === 'paused', runId: run.runId };
    const panel = runPanel(r.macro.name, r.macro.steps.map((s: any) => s.note || describeStep(s)), {
      onPause: () => send({ type: 'kf/macro/control', action: 'pause' }).then(() => { if (runState) runState.paused = true; panel.setPaused(true); }),
      onResume: () => send({ type: 'kf/macro/control', action: 'resume' }).then(() => { if (runState) runState.paused = false; panel.setPaused(false); }),
      onStop: () => { if (runState) runState.stopped = true; send({ type: 'kf/macro/control', action: 'stop' }); },
    });
    panel.setPaused(runState.paused);
    for (const l of state.stepLog || []) panel.set(l.i, l.status === 'done' ? 'done' : l.status === 'fail' ? 'fail' : 'skip');
    if (state.stepIndex > 0) panel.setSub(`Continuing at step ${state.stepIndex + 1} on ${location.hostname}`);
    const rs = runState;
    const out = await playMacro(r.macro, state, {
      doc: document,
      renderText: async (text, vars) => { if (!text.includes('{{')) return text; const x = await send<any>({ type: 'kf/macro/render', text, vars, url: location.href }); if (!x || x.error || x.message) throw new Error(x?.error || x?.message || 'Could not render value'); return x.text; },
      evalFormula: async (src, vars) => { const x = await send<any>({ type: 'kf/macro/formula', src, vars, url: location.href }); if (!x || x.error || x.message) throw new Error(x?.error || x?.message || 'Formula error'); return !!x.ok; },
      runAutofill: async (pid) => { const rep = await autofill(pid, false); return !!rep && rep.failed === 0; },
      runScript: async (sid, vars) => { const x = await send<any>({ type: 'kf/script/run', scriptId: sid, vars, url: location.href }); return x && !x.message ? { ok: !!x.ok, error: x.error?.message, vars: x.vars } : { ok: false, error: x?.message || 'Script failed' }; },
      insertSnippet: expandSnippet,
      nextRecord: async () => { const x = await send<any>({ type: 'kf/macro/nextRecord' }); if (x?.message) throw new Error(x.message); if (x?.ok) panel.setSub(`Record ${x.index + 1}/${x.total}: ${x.label}`); return !!x?.ok; },
      confirm,
      navigate: (url) => { location.href = url; },
      checkpoint: async (st) => { const x = await send<any>({ type: 'kf/macro/checkpoint', state: st, url: location.href }); if (x?.status === 'stopped') rs.stopped = true; if (x?.status === 'paused') rs.paused = true; },
      isStopped: () => rs.stopped,
      waitWhilePaused: async () => { while (rs.paused && !rs.stopped) await new Promise((res) => setTimeout(res, 250)); },
      highlight: (el, label) => highlight(el, label),
      onStep: (i, status) => panel.set(i, status),
      official: r.official,
      url: () => location.href,
    });
    highlight(null);
    if (out.status === 'navigating') { panel.setSub('Opening the next page…'); runState = null; return; }
    await send({ type: 'kf/macro/finish', status: out.status, error: out.error, state: out.state });
    runState = null;
    if (out.status === 'success') panel.done(`✓ Finished (${out.state.stepLog.filter((s) => s.status === 'done').length} steps)`);
    else if (out.status === 'stopped') panel.done('Stopped');
    else { panel.done(out.error || 'Failed'); toast(`Macro failed: ${out.error}`, { error: true, ms: 8000 }); }
    if (out.state.logs.length) console.info('[K-Flow macro]', out.state.logs.join('\n'));
  }

  // ------------------------------------------------------------- recorder
  let recorder: Recorder | null = null;
  let bar: ReturnType<typeof recorderBar> | null = null;
  function beginRecording(paused = false, count = 0) {
    if (recorder) return;
    bar = recorderBar({
      onPause: (p) => { send({ type: 'kf/rec/pause', paused: p }); },
      onStop: () => { send({ type: 'kf/rec/stop', save: true }); endRecording(); toast('Macro saved — opening the editor'); },
      onCancel: () => { send({ type: 'kf/rec/stop', save: false }); endRecording(); toast('Recording discarded'); },
    });
    bar.count(count);
    bar.setPaused(paused);
    recorder = startRecorder({
      doc: document,
      onStep: async (step, replace) => { const r = await send<any>({ type: 'kf/rec/step', step, replace }); if (r?.count !== undefined) bar?.count(r.count); },
    });
    recorder.pause(paused);
  }
  function endRecording() { recorder?.stop(); recorder = null; bar?.close(); bar = null; }

  // ------------------------------------------------------------- field selector
  let mapping = false;
  async function startMapper(profileId?: string | null, focused?: boolean) {
    if (mapping) return;
    const i = info || (await refresh());
    if (i && !i.allowed) { toast(`K-Flow: ${i.reason}`, { error: true }); return; }
    mapping = true;
    let busy = false;
    let lastProfile = profileId || null;
    const stop = () => {
      mapping = false;
      highlight(null);
      bar.close();
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', key, true);
    };
    const bar = mapBar(stop);
    const pickable = (el: Element | null): Element | null => {
      if (!el || el.closest('kf-ui-root,kf-overlay-root')) return null;
      const lab = el.closest('label') as HTMLLabelElement | null;
      if (lab?.control) return lab.control;
      return el.closest(CONTROL_SEL + ',button,a[href],[role=button],input[type=submit]') || null;
    };
    const move = (e: MouseEvent) => {
      if (busy) return;
      const el = pickable(document.elementFromPoint(e.clientX, e.clientY));
      if (el) highlight(el, `${fieldKind(el)} · ${labelFor(el).slice(0, 40) || el.tagName.toLowerCase()}`);
    };
    const capture = async (el: Element) => {
      busy = true;
      highlight(el, 'Mapping…');
      const kind = fieldKind(el);
      const opts = el.tagName === 'SELECT' ? Array.from((el as HTMLSelectElement).options).map((o) => o.text.trim()).filter(Boolean).slice(0, 100)
        : kind === 'radio' && (el as HTMLInputElement).name ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape((el as HTMLInputElement).name)}"]`)).map((r) => (r.labels?.[0]?.textContent || r.value).trim()) : undefined;
      const field = { kind, label: labelFor(el), name: el.getAttribute('name') || '', id: el.id, css: cssFor(el), xpath: xpathFor(el), target: targetFor(el), options: opts, required: !!(el as HTMLInputElement).required, placeholder: el.getAttribute('placeholder') || '' };
      const r = await openOverlay({ mode: 'mapField', page: page(), payload: { field, url: location.href, profileId: lastProfile } });
      busy = false;
      highlight(null);
      if (r.type === 'mapped') {
        lastProfile = r.profileId;
        badge(el, '✓ mapped', 'ok');
        bar.text('✓ Saved. Click the next field to map · Esc to finish');
        refresh();
        if (!r.more) stop();
      } else bar.text('🎯 Click a form field to map it · Esc to finish');
    };
    const click = (e: MouseEvent) => {
      if (busy) return;
      const el = pickable(document.elementFromPoint(e.clientX, e.clientY));
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      capture(el);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); stop(); } };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    if (focused) { const el = deepActiveElement(); if (el && el !== document.body) capture(el); }
  }

  // ------------------------------------------------------------- hotkeys
  function hotkeyMatches(e: KeyboardEvent, spec: string) {
    if (!spec) return false;
    const parts = spec.split('+').map((p) => p.trim().toLowerCase());
    const k = parts[parts.length - 1];
    const key = e.key === ' ' ? 'space' : e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    const code = e.code?.toLowerCase().replace(/^key|^digit/, '');
    return (key === k || code === k) && e.ctrlKey === parts.includes('ctrl') && e.shiftKey === parts.includes('shift') && e.altKey === parts.includes('alt') && e.metaKey === (parts.includes('meta') || parts.includes('cmd'));
  }
  document.addEventListener('keydown', (e) => {
    if (!info || e.repeat) return;
    if (hotkeyMatches(e, info.settings.autofillHotkey)) { e.preventDefault(); hotkeyAutofill(); return; }
    for (const p of info.profiles) if (p.shortcut && hotkeyMatches(e, p.shortcut) && (p.matches || p.anySite)) { e.preventDefault(); autofill(p.id); return; }
    for (const m of info.macros) if (m.shortcut && hotkeyMatches(e, m.shortcut)) { e.preventDefault(); send({ type: 'kf/macro/start', macroId: m.id }).then((r: any) => r?.message && toast(r.message, { error: true })); return; }
  }, true);

  // ------------------------------------------------------------- startup
  (async () => {
    const pending = await send<any>({ type: 'kf/macro/pending', url: location.href });
    const rec = await send<any>({ type: 'kf/rec/status', url: location.href });
    if (rec && rec.steps) beginRecording(rec.paused, rec.steps.length);
    const i = await refresh();
    if (pending?.run) {
      if (document.readyState !== 'complete') await new Promise((r) => window.addEventListener('load', r, { once: true }));
      await new Promise((r) => setTimeout(r, 300));
      playRun(pending);
    } else if (i?.allowed && i.settings.autoRun && !autoRan) {
      autoRan = true;
      for (const p of i.profiles.filter((x) => x.runMode === 'pageLoad' && x.matches)) await autofill(p.id);
    }
  })();

  function onMessage(msg: any, sendResponse: (r: any) => void): boolean {
    switch (msg.type) {
      case 'kf/autofill/start':
        autofill(String(msg.profileId), !!msg.preview, msg.recordId).then((rep) => sendResponse({ ok: !!rep, report: rep }));
        return true;
      case 'kf/autofill/hotkey':
        hotkeyAutofill();
        sendResponse({ ok: true });
        return false;
      case 'kf/macro/resume':
        playRun({ run: msg.run, macro: msg.macro, official: msg.official });
        sendResponse({ ok: true });
        return false;
      case 'kf/macro/control':
        if (runState && runState.runId === msg.runId) {
          if (msg.action === 'stop') runState.stopped = true;
          if (msg.action === 'pause') runState.paused = true;
          if (msg.action === 'resume') runState.paused = false;
        }
        sendResponse({ ok: true });
        return false;
      case 'kf/rec/begin':
        beginRecording();
        sendResponse({ ok: true });
        return false;
      case 'kf/rec/paused':
        recorder?.pause(!!msg.paused);
        bar?.setPaused(!!msg.paused);
        sendResponse({ ok: true });
        return false;
      case 'kf/rec/end':
        endRecording();
        sendResponse({ ok: true });
        return false;
      case 'kf/mapper/begin':
        startMapper(msg.profileId, msg.focused);
        sendResponse({ ok: true });
        return false;
      case 'kf/scan':
        sendResponse({ fields: detectFields(document, { includeHidden: !!msg.includeHidden }), title: document.title, url: location.href });
        return false;
      case 'kf/refresh':
        refresh();
        sendResponse({ ok: true });
        return false;
    }
    return false;
  }
  return { onMessage, refresh };
}

export { getEditTarget };
