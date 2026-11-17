import React, { useEffect, useState } from 'react';
import { useStore, useRoute, pickFile } from '../store';
import { Empty, ConfirmModal, Switch } from '../common';
import { uid } from '../../../shared/ids';
import { listExecutions } from '../../../shared/history';
import type { Macro, MacroStep, MacroStepType, StepCondition, Execution } from '../../../shared/types';
import { PageHead, SitesEditor, TargetEditor, TabPicker, TagsInput, jsonDownload, send, SearchBox, StatusBadge } from './kit';
import { describeStep, validateMacro, describeCondition } from '../../../automation/macro';
import { DEFAULT_MACRO_SETTINGS } from '../../../library/workspaces';
import { Clapperboard, Plus, Trash2, Copy, Download, Upload, Save, ArrowUp, ArrowDown, Circle, Play, Pause, Square, AlertTriangle, Share2, ChevronDown, ChevronRight } from 'lucide-react';

const STEP_TYPES: { t: MacroStepType; label: string; group: string }[] = [
  { t: 'click', label: 'Click', group: 'Interact' }, { t: 'type', label: 'Type text', group: 'Interact' }, { t: 'select', label: 'Select option', group: 'Interact' },
  { t: 'check', label: 'Check', group: 'Interact' }, { t: 'uncheck', label: 'Uncheck', group: 'Interact' }, { t: 'radio', label: 'Choose radio', group: 'Interact' },
  { t: 'key', label: 'Press key', group: 'Interact' }, { t: 'hover', label: 'Hover', group: 'Interact' }, { t: 'focus', label: 'Focus', group: 'Interact' }, { t: 'scroll', label: 'Scroll', group: 'Interact' },
  { t: 'navigate', label: 'Open URL', group: 'Flow' }, { t: 'waitFor', label: 'Wait for element', group: 'Flow' }, { t: 'waitGone', label: 'Wait until gone', group: 'Flow' }, { t: 'delay', label: 'Delay', group: 'Flow' },
  { t: 'label', label: 'Label', group: 'Flow' }, { t: 'goto', label: 'Go to label (loop)', group: 'Flow' }, { t: 'confirm', label: 'Ask me', group: 'Flow' }, { t: 'assert', label: 'Check condition', group: 'Flow' }, { t: 'stop', label: 'Stop', group: 'Flow' },
  { t: 'autofill', label: 'Run autofill profile', group: 'K-Flow' }, { t: 'script', label: 'Run script', group: 'K-Flow' }, { t: 'snippet', label: 'Insert snippet', group: 'K-Flow' }, { t: 'extract', label: 'Save text to variable', group: 'K-Flow' }, { t: 'nextRecord', label: 'Next dataset record', group: 'K-Flow' },
];
const NEEDS_TARGET = new Set<MacroStepType>(['click', 'type', 'select', 'check', 'uncheck', 'radio', 'waitFor', 'waitGone', 'extract', 'hover', 'focus']);
const NEEDS_VALUE: Partial<Record<MacroStepType, string>> = { type: 'Text (may use {{variables}})', select: 'Option', radio: 'Option', key: 'Key (Enter, Tab, Escape…)', navigate: 'https://…', extract: 'Variable name', confirm: 'Question to ask', label: 'Label name', goto: 'Label to jump to' };
const NEEDS_MS = new Set<MacroStepType>(['delay', 'waitFor', 'waitGone']);

export function newMacro(workspaceId: string, name = 'New macro'): Macro {
  const t = Date.now();
  return { id: uid('mac'), name, enabled: true, sites: [], steps: [], settings: { ...DEFAULT_MACRO_SETTINGS }, tags: [], datasetId: null, workspaceId, createdAt: t, updatedAt: t };
}

export function MacrosView({ id }: { id?: string }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<number | null>(null);
  const cur = id ? s.macros.find((m) => m.id === id) : null;
  if (id && cur) return <MacroEditor macro={cur} />;
  const list = s.macros.filter(s.inWs).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  const record = async () => {
    if (tab === null) { s.toast('Open the website in a tab first', 'error'); return; }
    try { await send({ type: 'kf/rec/start', tabId: tab }); s.toast('Recording started — switch to the tab, do the task, then press "Stop & save" on the page'); } catch (e: any) { s.toast(/Receiving end/.test(e.message) ? 'Reload that tab once so K-Flow can record it' : e.message, 'error'); }
  };
  const importFile = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      const arr = raw?.format === 'k-flow-macros' ? raw.macros : Array.isArray(raw) ? raw : [raw];
      for (const m of arr) {
        if (!Array.isArray(m?.steps)) throw new Error('Not a K-Flow macro file');
        await s.saveRec('macros', { ...newMacro(s.ws.id, String(m.name || 'Imported macro').slice(0, 120)), description: m.description, sites: Array.isArray(m.sites) ? m.sites : [], steps: m.steps.slice(0, 2000).map((st: any) => ({ ...st, id: uid('stp') })), settings: { ...DEFAULT_MACRO_SETTINGS, ...(m.settings || {}) }, tags: Array.isArray(m.tags) ? m.tags : [] }, { action: 'import' });
      }
      s.toast(`Imported ${arr.length} macro(s)`);
    } catch (e: any) { s.toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <PageHead title="Macros" icon={<Clapperboard size={20} />} sub={`Record and replay multi-step browser tasks — ${s.ws.name}`}>
        <SearchBox value={q} onChange={setQ} placeholder="Search macros…" />
        <button className="btn" onClick={importFile}><Upload size={15} /> Import</button>
        <button className="btn" disabled={!list.length} onClick={() => jsonDownload(`k-flow-macros-${s.ws.kind}.json`, { format: 'k-flow-macros', version: 1, macros: list })}><Download size={15} /> Export</button>
        <button className="btn primary" onClick={async () => { const m = await s.saveRec('macros', newMacro(s.ws.id)); go('/macros/' + m.id); }}><Plus size={15} /> New macro</button>
      </PageHead>
      <section className="card section kf-rec-card">
        <div className="row wrap">
          <Circle size={16} color="#ef4444" fill="#ef4444" />
          <b>Record a new macro</b>
          <span className="muted">in</span>
          <TabPicker value={tab} onChange={(t) => setTab(t)} />
          <button className="btn danger solid" onClick={record}><Circle size={13} /> Start recording</button>
        </div>
        <div className="hint">Clicks, typing, dropdowns, checkboxes, Enter and page changes are recorded with robust selectors. Passwords and OTPs are never recorded.</div>
      </section>
      {list.length ? (
        <div className="kf-cards">
          {list.map((m) => (
            <div key={m.id} className="card kf-card" onClick={() => go('/macros/' + m.id)}>
              <div className="row"><b className="grow">{m.name}</b>{!m.enabled && <span className="badge">off</span>}{m.orgId && <span className="badge primary">shared</span>}</div>
              <div className="muted kf-card-sub">{m.description || m.steps.slice(0, 3).map((st) => st.note || describeStep(st)).join(' → ')}</div>
              <div className="row wrap" style={{ gap: 4 }}><span className="badge primary">{m.steps.length} steps</span>{m.datasetId && <span className="badge">📊 batch</span>}{m.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div>
            </div>
          ))}
        </div>
      ) : <Empty icon={<Clapperboard size={32} />} title="No macros yet">Record one above or create it step by step.</Empty>}
    </div>
  );
}

function ConditionEditor({ c, onChange }: { c: StepCondition | null | undefined; onChange: (c: StepCondition | null) => void }) {
  if (!c) return <button className="btn sm" onClick={() => onChange({ kind: 'exists', target: { by: 'css', value: '' } })}>+ Only if…</button>;
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <span className="muted">only if</span>
      <select className="select" style={{ width: 150 }} value={c.kind} onChange={(e) => onChange({ ...c, kind: e.target.value as any })}>
        {['exists', 'notExists', 'visible', 'textContains', 'valueEquals', 'urlMatches', 'formula'].map((k) => <option key={k}>{k}</option>)}
      </select>
      {!['urlMatches', 'formula'].includes(c.kind) && <div style={{ minWidth: 300 }}><TargetEditor target={c.target} onChange={(target) => onChange({ ...c, target })} compact /></div>}
      {['textContains', 'valueEquals', 'urlMatches', 'formula'].includes(c.kind) && <input className="input mono" style={{ width: 220 }} placeholder={c.kind === 'formula' ? 'e.g. category = "OBC"' : 'value'} value={c.value || ''} onChange={(e) => onChange({ ...c, value: e.target.value })} />}
      <button className="btn ghost sm" onClick={() => onChange(null)}>remove</button>
    </div>
  );
}

function MacroEditor({ macro }: { macro: Macro }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [d, setD] = useState(macro);
  const [del, setDel] = useState(false);
  const [tab, setTab] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [runs, setRuns] = useState<Execution[]>([]);
  useEffect(() => setD(macro), [macro.id, macro.updatedAt]);
  useEffect(() => { listExecutions().then((l) => setRuns(l.filter((e) => e.refId === macro.id).slice(0, 15))); }, [macro.id, macro.updatedAt]);
  const dirty = JSON.stringify(d) !== JSON.stringify(macro);
  const problems = validateMacro(d);
  const upd = (p: Partial<Macro>) => setD({ ...d, ...p });
  const updSet = (p: Partial<Macro['settings']>) => upd({ settings: { ...d.settings, ...p } });
  const updStep = (i: number, p: Partial<MacroStep>) => upd({ steps: d.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const addStep = (t: MacroStepType, at = d.steps.length) => { const st: MacroStep = { id: uid('stp'), type: t, ...(NEEDS_TARGET.has(t) ? { target: { by: 'label', value: '' } } : {}), ...(t === 'delay' ? { ms: 1000 } : {}), ...(t === 'key' ? { value: 'Enter' } : {}) }; const steps = [...d.steps]; steps.splice(at, 0, st); upd({ steps }); setOpen(st.id); };
  const move = (i: number, dir: -1 | 1) => { const r = [...d.steps]; const j = i + dir; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; upd({ steps: r }); };
  const save = async () => { try { await s.saveRec('macros', d); s.toast('Macro saved'); } catch (e: any) { s.toast(e.message, 'error'); } };
  const run = async () => {
    if (problems.length) { s.toast(problems[0], 'error'); return; }
    if (dirty) await save();
    if (tab === null) { s.toast('Choose a browser tab', 'error'); return; }
    try { await send({ type: 'kf/macro/start', tabId: tab, macroId: d.id }); s.toast('Macro started — watch the progress panel on the page'); } catch (e: any) { s.toast(/Receiving end/.test(e.message) ? 'Reload that tab once so K-Flow is active there' : e.message, 'error'); }
  };
  const ctl = (action: 'pause' | 'resume' | 'stop') => tab !== null && send({ type: 'kf/macro/control', tabId: tab, action }).then(() => s.toast(action === 'stop' ? 'Stopped' : action === 'pause' ? 'Paused' : 'Resumed')).catch((e) => s.toast(e.message, 'error'));
  const share = async () => { try { const m = await import('../../../cloud'); await m.org.shareToOrg('macros', d); s.toast('Shared with your organization'); await s.reload(); } catch (e: any) { s.toast(e.message, 'error'); } };
  const groups = [...new Set(STEP_TYPES.map((x) => x.group))];
  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="page-head">
        <input className="name-input" value={d.name} onChange={(e) => upd({ name: e.target.value })} />
        {dirty && <span className="badge warn">Unsaved</span>}
        <button className="btn" onClick={async () => { const c = { ...d, id: uid('mac'), name: d.name + ' (copy)', orgId: null, version: 0, steps: d.steps.map((x) => ({ ...x, id: uid('stp') })) }; await s.saveRec('macros', c); go('/macros/' + c.id); }}><Copy size={15} /> Duplicate</button>
        <button className="btn" onClick={() => jsonDownload(`${d.name}.kflow-macro.json`, { format: 'k-flow-macros', version: 1, macros: [d] })}><Download size={15} /></button>
        {s.org && !d.orgId && s.orgAllowed('share', 'macros') && <button className="btn" onClick={share}><Share2 size={15} /> Share</button>}
        <button className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /></button>
        <button className="btn primary" disabled={!dirty} onClick={save}><Save size={15} /> Save</button>
      </div>
      <div className="kf-cols">
        <div>
          {problems.length > 0 && <div className="kf-note warn"><AlertTriangle size={16} /> {problems.slice(0, 4).join(' · ')}</div>}
          <section className="card section">
            <div className="section-head"><h3>Steps ({d.steps.length})</h3>
              <details className="kf-add"><summary className="btn"><Plus size={14} /> Add step</summary>
                <div className="kf-add-menu">{groups.map((g) => <div key={g}><div className="cmd-group">{g}</div>{STEP_TYPES.filter((x) => x.group === g).map((x) => <button key={x.t} className="chip" onClick={(e) => { addStep(x.t); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}>{x.label}</button>)}</div>)}</div>
              </details>
            </div>
            {!d.steps.length && <Empty icon={<Clapperboard size={28} />} title="No steps">Record the task on a page or add steps manually.</Empty>}
            {d.steps.map((st, i) => {
              const isOpen = open === st.id;
              return (
                <div key={st.id} className={'kf-step' + (st.disabled ? ' off' : '') + (st.type === 'label' ? ' lbl' : '')}>
                  <div className="kf-step-top" onClick={() => setOpen(isOpen ? null : st.id)}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="num">{i + 1}</span>
                    <span className="badge primary">{STEP_TYPES.find((x) => x.t === st.type)?.label || st.type}</span>
                    <span className="grow kf-step-desc">{st.note || describeStep(st)}{st.condition ? <span className="muted"> · if {describeCondition(st.condition)}</span> : null}</span>
                    {st.sensitive && <span className="badge warn">sensitive</span>}
                    <span onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 0 }}>
                      <button className="btn ghost icon sm" onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                      <button className="btn ghost icon sm" onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                      <button className="btn ghost icon sm" title="Duplicate step" onClick={() => { const steps = [...d.steps]; steps.splice(i + 1, 0, { ...st, id: uid('stp') }); upd({ steps }); }}><Copy size={13} /></button>
                      <button className="btn ghost icon sm danger" onClick={() => upd({ steps: d.steps.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="kf-step-body">
                      <div className="row wrap" style={{ gap: 8 }}>
                        <select className="select" style={{ width: 190 }} value={st.type} onChange={(e) => updStep(i, { type: e.target.value as MacroStepType })}>{STEP_TYPES.map((x) => <option key={x.t} value={x.t}>{x.label}</option>)}</select>
                        {(NEEDS_TARGET.has(st.type) || st.type === 'scroll' || st.type === 'key') && <div className="grow" style={{ minWidth: 320 }}><TargetEditor target={st.target} onChange={(target) => updStep(i, { target })} /></div>}
                      </div>
                      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                        {NEEDS_VALUE[st.type] && <input className="input mono grow" placeholder={NEEDS_VALUE[st.type]} value={st.value || ''} onChange={(e) => updStep(i, { value: e.target.value })} />}
                        {st.type === 'goto' && <span className="row" style={{ gap: 4 }}>max <input className="input" type="number" style={{ width: 80 }} value={st.maxIterations || 100} onChange={(e) => updStep(i, { maxIterations: Number(e.target.value) })} /> loops</span>}
                        {NEEDS_MS.has(st.type) && <span className="row" style={{ gap: 4 }}><input className="input" type="number" style={{ width: 100 }} value={st.ms ?? (st.type === 'delay' ? 1000 : 10000)} onChange={(e) => updStep(i, { ms: Number(e.target.value) })} /> ms</span>}
                        {st.type === 'scroll' && !st.target?.value && <span className="row" style={{ gap: 4 }}>x <input className="input" type="number" style={{ width: 80 }} value={st.x || 0} onChange={(e) => updStep(i, { x: Number(e.target.value) })} /> y <input className="input" type="number" style={{ width: 90 }} value={st.y || 0} onChange={(e) => updStep(i, { y: Number(e.target.value) })} /></span>}
                        {st.type === 'type' && <label className="check"><input type="checkbox" checked={st.clear !== false} onChange={(e) => updStep(i, { clear: e.target.checked })} /> Replace existing text</label>}
                        {st.type === 'autofill' && <select className="select" value={st.refId || ''} onChange={(e) => updStep(i, { refId: e.target.value })}><option value="">Choose profile…</option>{s.autofill.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                        {st.type === 'script' && <select className="select" value={st.refId || ''} onChange={(e) => updStep(i, { refId: e.target.value })}><option value="">Choose script…</option>{s.scripts.filter((x) => !x.library).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
                        {st.type === 'snippet' && <select className="select" value={st.refId || ''} onChange={(e) => updStep(i, { refId: e.target.value })}><option value="">Choose snippet…</option>{s.snippets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.shortcut})</option>)}</select>}
                      </div>
                      <div style={{ marginTop: 8 }}>{st.type === 'assert' || st.type === 'goto' ? <ConditionEditor c={st.condition} onChange={(condition) => updStep(i, { condition })} /> : <ConditionEditor c={st.condition} onChange={(condition) => updStep(i, { condition })} />}</div>
                      <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
                        <span className="row" style={{ gap: 4 }}>On error <select className="select" style={{ width: 150 }} value={st.onError || 'default'} onChange={(e) => updStep(i, { onError: e.target.value as any })}><option value="default">Macro default</option><option value="stop">Stop</option><option value="continue">Continue</option><option value="retry">Retry</option></select></span>
                        {st.onError === 'retry' && <span className="row" style={{ gap: 4 }}>retries <input className="input" type="number" style={{ width: 70 }} value={st.retries ?? 2} onChange={(e) => updStep(i, { retries: Number(e.target.value) })} /></span>}
                        <input className="input" style={{ width: 260 }} placeholder="Note (shown in the progress panel)" value={st.note || ''} onChange={(e) => updStep(i, { note: e.target.value })} />
                        <label className="check"><input type="checkbox" checked={!!st.disabled} onChange={(e) => updStep(i, { disabled: e.target.checked })} /> Skip this step</label>
                        <button className="btn sm" onClick={() => addStep('delay', i + 1)}>+ step below</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
          <section className="card section">
            <h3 style={{ marginTop: 0 }}>Settings</h3>
            <div className="grid-3">
              <div className="field"><label className="label">Delay between steps (ms)</label><input className="input" type="number" value={d.settings.stepDelayMs} onChange={(e) => updSet({ stepDelayMs: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">Wait for elements up to (ms)</label><input className="input" type="number" value={d.settings.timeoutMs} onChange={(e) => updSet({ timeoutMs: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">Speed</label><select className="select" value={d.settings.speed} onChange={(e) => updSet({ speed: Number(e.target.value) })}>{[0.5, 1, 2, 4].map((x) => <option key={x} value={x}>{x}×</option>)}</select></div>
              <div className="field"><label className="label">Retries per step</label><input className="input" type="number" min={0} max={10} value={d.settings.retries} onChange={(e) => updSet({ retries: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">Retry delay (ms)</label><input className="input" type="number" value={d.settings.retryDelayMs} onChange={(e) => updSet({ retryDelayMs: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">When a step fails</label><select className="select" value={d.settings.onError} onChange={(e) => updSet({ onError: e.target.value as any })}><option value="stop">Stop the macro</option><option value="continue">Log it and continue</option></select></div>
            </div>
            <div className="grid-3">
              <div className="field"><label className="label">Dataset (batch / {'{{column}}'} values)</label><select className="select" value={d.datasetId || ''} onChange={(e) => upd({ datasetId: e.target.value || null })}><option value="">None</option>{s.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div className="field"><label className="label">Keyboard shortcut (on the page)</label><input className="input mono" placeholder="e.g. Alt+2" value={d.shortcut || ''} onChange={(e) => upd({ shortcut: e.target.value })} /></div>
              <div className="field"><label className="label">Enabled</label><Switch checked={d.enabled} onChange={(v) => upd({ enabled: v })} /></div>
            </div>
            <div className="field"><label className="label">Description</label><textarea className="textarea" rows={2} value={d.description || ''} onChange={(e) => upd({ description: e.target.value })} /></div>
            <div className="field"><label className="label">Websites (for the side panel suggestions)</label><SitesEditor sites={d.sites} onChange={(sites) => upd({ sites })} /></div>
            <div className="field"><label className="label">Tags</label><TagsInput tags={d.tags} onChange={(tags) => upd({ tags })} /></div>
          </section>
        </div>
        <aside>
          <section className="card section kf-sticky">
            <h3 style={{ marginTop: 0 }}>Run</h3>
            <div className="field"><TabPicker value={tab} onChange={(t) => setTab(t)} /></div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary" disabled={tab === null || !d.steps.length} onClick={run}><Play size={15} /> Run</button>
              <button className="btn" disabled={tab === null} onClick={() => ctl('pause')}><Pause size={15} /></button>
              <button className="btn" disabled={tab === null} onClick={() => ctl('resume')}><Play size={15} /></button>
              <button className="btn danger" disabled={tab === null} onClick={() => ctl('stop')}><Square size={15} /></button>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>The run continues across page loads in that tab. Submit / pay / delete-type clicks and anything on official portals ask for your approval first.</div>
            <h4 style={{ marginBottom: 6 }}>Recent runs</h4>
            {!runs.length && <div className="muted" style={{ fontSize: 13 }}>Not run yet.</div>}
            {runs.map((r) => <div key={r.id} className="row" style={{ fontSize: 12.5, padding: '3px 0' }}><StatusBadge status={r.status} /><span className="grow muted">{new Date(r.startedAt).toLocaleString()}</span><span className="muted">{r.filled ?? 0}/{r.steps?.length ?? 0}</span></div>)}
            {runs[0]?.error && <div className="err">{runs[0].error}</div>}
          </section>
        </aside>
      </div>
      {del && <ConfirmModal title={`Delete "${d.name}"?`} danger confirmLabel="Delete" message="This removes the macro (and from the cloud on next sync)." onConfirm={async () => { await s.deleteRec('macros', [d.id], d.name); go('/macros'); }} onClose={() => setDel(false)} />}
    </div>
  );
}
