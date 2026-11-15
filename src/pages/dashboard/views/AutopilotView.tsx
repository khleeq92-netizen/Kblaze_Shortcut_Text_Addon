import React, { useEffect, useState } from 'react';
import { useStore, useRoute } from '../store';
import { Empty, ConfirmModal, PlanGate, Switch } from '../common';
import { uid } from '../../../shared/ids';
import { storageGet, api } from '../../../shared/browser';
import { STORAGE_KEYS } from '../../../shared/constants';
import { describeStep } from '../../../content/autopilot';
import type { Workflow, WorkflowStep, WorkflowStepType } from '../../../shared/types';
import { Zap, Plus, Trash2, ArrowUp, ArrowDown, Save, Crosshair, ShieldCheck, Copy, GripVertical } from 'lucide-react';

const STEP_TYPES: { v: WorkflowStepType; l: string; target: boolean; value?: string }[] = [
  { v: 'type', l: 'Type text', target: true, value: 'Text (commands like {{me.name}} allowed)' },
  { v: 'tab', l: 'Press Tab', target: false },
  { v: 'select', l: 'Select dropdown option', target: true, value: 'Option label or value' },
  { v: 'check', l: 'Tick / untick checkbox', target: true },
  { v: 'click', l: 'Click element', target: true },
  { v: 'key', l: 'Press key', target: false, value: 'Enter, Escape, ArrowDown…' },
  { v: 'focus', l: 'Focus field', target: true },
  { v: 'snippet', l: 'Insert snippet', target: false },
  { v: 'wait', l: 'Wait', target: false },
  { v: 'waitFor', l: 'Wait for element', target: true },
  { v: 'confirm', l: 'Ask me to confirm', target: false, value: 'Question to ask' },
];

function StepRow({ step, i, total, onChange, onMove, onDelete, snippets, picked }: { step: WorkflowStep; i: number; total: number; onChange: (s: WorkflowStep) => void; onMove: (d: number) => void; onDelete: () => void; snippets: { id: string; name: string; shortcut: string }[]; picked: any }) {
  const meta = STEP_TYPES.find((t) => t.v === step.type)!;
  const set = (p: Partial<WorkflowStep>) => onChange({ ...step, ...p });
  return (
    <div className="step">
      <div className="num">{i + 1}</div>
      <select className="select" value={step.type} onChange={(e) => set({ type: e.target.value as WorkflowStepType })}>{STEP_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
      <div>
        {meta.target && (
          <div className="row" style={{ marginBottom: 6 }}>
            <select className="select" style={{ width: 150 }} value={step.target?.kind || 'label'} onChange={(e) => set({ target: { kind: e.target.value as any, value: step.target?.value || '' } })}>
              <option value="label">Field labelled</option>
              <option value="selector">CSS selector</option>
              <option value="focused">Focused field</option>
            </select>
            {step.target?.kind !== 'focused' && <input className="input" placeholder={step.target?.kind === 'selector' ? '#email, button[type=submit]' : 'e.g. Email, First name, Submit'} value={step.target?.value || ''} onChange={(e) => set({ target: { kind: step.target?.kind || 'label', value: e.target.value } })} />}
            {picked && <button className="btn sm" title={`Use picked element: ${picked.selector}`} onClick={() => set({ target: { kind: 'selector', value: picked.selector } })}><Crosshair size={13} /> Use picked</button>}
          </div>
        )}
        {meta.value && step.type !== 'snippet' && (step.type === 'type' ? <textarea className="textarea" rows={2} placeholder={meta.value} value={step.value || ''} onChange={(e) => set({ value: e.target.value })} /> : <input className="input" placeholder={meta.value} value={step.value || ''} onChange={(e) => set({ value: e.target.value })} />)}
        {step.type === 'tab' && <label className="check"><input type="checkbox" checked={step.value === 'shift'} onChange={(e) => set({ value: e.target.checked ? 'shift' : '' })} /> Shift+Tab (backwards)</label>}
        {step.type === 'snippet' && <select className="select" value={step.snippetId || ''} onChange={(e) => set({ snippetId: e.target.value })}><option value="">Choose snippet…</option>{snippets.map((s) => <option key={s.id} value={s.id}>{s.shortcut} — {s.name}</option>)}</select>}
        {(step.type === 'wait' || step.type === 'waitFor') && <div className="row" style={{ marginTop: 4 }}><input className="input" type="number" style={{ width: 120 }} value={step.ms ?? (step.type === 'wait' ? 500 : 10000)} onChange={(e) => set({ ms: Number(e.target.value) })} /><span className="muted">{step.type === 'wait' ? 'milliseconds' : 'ms timeout'}</span></div>}
        {step.type === 'check' && <label className="check"><input type="checkbox" checked={step.checked !== false} onChange={(e) => set({ checked: e.target.checked })} /> Should be ticked</label>}
        <div className="row wrap" style={{ marginTop: 6, gap: 14 }}>
          {step.type === 'type' && <label className="check"><input type="checkbox" checked={!!step.clear} onChange={(e) => set({ clear: e.target.checked })} /> Clear field first</label>}
          <label className="check"><input type="checkbox" checked={!!step.requireConfirm} onChange={(e) => set({ requireConfirm: e.target.checked })} /> Always ask before this step</label>
          <input className="input" style={{ maxWidth: 260, padding: '4px 8px', fontSize: 12.5 }} placeholder="Note (shown while running)" value={step.note || ''} onChange={(e) => set({ note: e.target.value })} />
        </div>
      </div>
      <div className="row" style={{ gap: 0 }}>
        <button className="btn ghost icon sm" disabled={i === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
        <button className="btn ghost icon sm" disabled={i === total - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
        <button className="btn ghost icon sm danger" onClick={onDelete}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function WorkflowEditor({ wf, isNew }: { wf: Workflow; isNew?: boolean }) {
  const { saveWorkflow, deleteWorkflow, snippets, toast } = useStore();
  const [, , go] = useRoute();
  const [d, setD] = useState(wf);
  const [del, setDel] = useState(false);
  const [picked, setPicked] = useState<any>(null);
  useEffect(() => setD(wf), [wf.id, wf.updatedAt]);
  useEffect(() => {
    storageGet(STORAGE_KEYS.picked).then(setPicked);
    const l = (c: any, a: string) => a === 'local' && c[STORAGE_KEYS.picked] && setPicked(c[STORAGE_KEYS.picked].newValue);
    api.storage.onChanged.addListener(l);
    return () => api.storage.onChanged.removeListener(l);
  }, []);
  const steps = d.steps;
  const setSteps = (s: WorkflowStep[]) => setD({ ...d, steps: s });
  const save = async () => {
    if (!d.name.trim()) { toast('Name the workflow', 'error'); return; }
    try { await saveWorkflow(d); toast('Workflow saved'); if (isNew) go('/autopilot/' + d.id); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <div className="page-head">
        <input className="name-input" placeholder="Workflow name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <Switch checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label="Enabled" />
        {!isNew && <button className="btn" onClick={async () => { const c = { ...d, id: uid('wf'), name: d.name + ' (copy)', createdAt: 0 }; await saveWorkflow(c); go('/autopilot/' + c.id); }}><Copy size={15} /></button>}
        {!isNew && <button className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /></button>}
        <button className="btn primary" onClick={save}><Save size={15} /> Save</button>
      </div>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <input className="input" placeholder="Description" value={d.description || ''} onChange={(e) => setD({ ...d, description: e.target.value })} />
        <input className="input" placeholder="Only for sites containing (optional), e.g. crm.example.com" value={d.siteFilter || ''} onChange={(e) => setD({ ...d, siteFilter: e.target.value })} />
      </div>
      <div className="card locked" style={{ marginBottom: 14 }}>
        <ShieldCheck size={15} /> <b>You stay in control.</b> Runs only when you start it (popup → Autopilot, or the snippet assistant). Steps that submit forms, send, pay, delete, or touch password/payment fields always ask for confirmation in a dialog the page cannot click. A progress panel with a Stop button is shown during every run.
      </div>
      {steps.map((s, i) => (
        <StepRow key={s.id} step={s} i={i} total={steps.length} snippets={snippets} picked={picked}
          onChange={(n) => setSteps(steps.map((x) => (x.id === s.id ? n : x)))}
          onMove={(dir) => { const a = [...steps]; const [m] = a.splice(i, 1); a.splice(i + dir, 0, m); setSteps(a); }}
          onDelete={() => setSteps(steps.filter((x) => x.id !== s.id))} />
      ))}
      <button className="btn" onClick={() => setSteps([...steps, { id: uid('st'), type: 'type', target: { kind: 'label', value: '' }, value: '' }])}><Plus size={15} /> Add step</button>
      {steps.length > 0 && (
        <div className="section card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0, fontSize: 14 }}>Summary</h3>
          <ol style={{ margin: 0 }}>{steps.map((s) => <li key={s.id} className="muted">{s.note || describeStep(s)}{s.requireConfirm ? ' — asks first' : ''}</li>)}</ol>
        </div>
      )}
      <p className="hint">Tip: open the target page, click the QuickText toolbar button → Autopilot → “Pick element on page”, click the element, then press “Use picked” on a step.</p>
      {del && <ConfirmModal title="Delete workflow?" danger message={`“${d.name}” will be deleted.`} onConfirm={async () => { await deleteWorkflow(d.id); go('/autopilot'); }} onClose={() => setDel(false)} />}
    </div>
  );
}

export function AutopilotView({ workflowId }: { workflowId?: string }) {
  const { workflows } = useStore();
  const [, , go] = useRoute();
  const [fresh, setFresh] = useState<Workflow | null>(null);
  if (workflowId === 'new' && fresh) return <PlanGate feature="autopilot"><WorkflowEditor wf={fresh} isNew /></PlanGate>;
  const wf = workflowId ? workflows.find((w) => w.id === workflowId) : null;
  if (wf) return <PlanGate feature="autopilot"><WorkflowEditor wf={wf} /></PlanGate>;
  const create = () => {
    const t = Date.now();
    setFresh({ id: uid('wf'), name: '', description: '', enabled: true, steps: [{ id: uid('st'), type: 'type', target: { kind: 'label', value: 'Name' }, value: '{{me.name}}' }, { id: uid('st'), type: 'tab' }], createdAt: t, updatedAt: t });
    go('/autopilot/new');
  };
  return (
    <div className="page">
      <div className="page-head"><h2>Autopilot</h2><button className="btn primary" onClick={create}><Plus size={15} /> New workflow</button></div>
      <PlanGate feature="autopilot">
        <p className="muted" style={{ marginTop: -6 }}>Record repetitive form-filling as a sequence of steps: type into fields, press Tab, pick dropdown options, tick boxes and click buttons.</p>
        {workflows.length ? (
          <div className="tpl-grid">
            {workflows.map((w) => (
              <div key={w.id} className="card tpl" style={{ cursor: 'pointer' }} onClick={() => go('/autopilot/' + w.id)}>
                <div className="row"><Zap size={16} /><h4 className="grow">{w.name}</h4>{!w.enabled && <span className="badge">disabled</span>}<span className="badge primary">{w.steps.length} steps</span></div>
                <div className="muted" style={{ fontSize: 12.5 }}>{w.description}</div>
                <div className="pv">{w.steps.map((s, i) => `${i + 1}. ${s.note || describeStep(s)}`).join('\n')}</div>
              </div>
            ))}
          </div>
        ) : <Empty icon={<Zap size={32} />} title="No workflows yet">Create one to automate a repetitive form.</Empty>}
      </PlanGate>
    </div>
  );
}
