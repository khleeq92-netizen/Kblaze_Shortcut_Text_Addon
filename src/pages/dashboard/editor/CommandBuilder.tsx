// Visual command builder: non-technical users pick a command, fill in a small
// form, and get correct template syntax inserted at the cursor.
import React, { useMemo, useState } from 'react';
import { Modal, PlanGate } from '../common';
import { useStore } from '../store';
import { COMMANDS, CommandDef, buildCommand, Param } from './commands';
import { FUNCTIONS } from '../../../engine/expr';
import { parseExpr } from '../../../engine/expr';
import { Plus, Trash2, Code2, Wand2 } from 'lucide-react';

const OPS = [
  { v: '=', l: 'is' }, { v: '!=', l: 'is not' }, { v: '>', l: 'greater than' }, { v: '>=', l: 'at least' },
  { v: '<', l: 'less than' }, { v: '<=', l: 'at most' }, { v: 'contains', l: 'contains' }, { v: 'empty', l: 'is empty' }, { v: 'notempty', l: 'is not empty' },
];

function lit(v: string) {
  const t = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(t) || /^(true|false|yes|no)$/i.test(t)) return t;
  return '"' + t.replace(/"/g, '\\"') + '"';
}

function ConditionInput({ value, onChange, names }: { value: string; onChange: (v: string) => void; names: string[] }) {
  const [raw, setRaw] = useState(!!value);
  const [rows, setRows] = useState([{ field: names[0] || '', op: '=', val: '' }]);
  const [join, setJoin] = useState<'and' | 'or'>('and');
  const build = (rs = rows, j = join) => {
    const parts = rs.filter((r) => r.field).map((r) =>
      r.op === 'empty' ? `isempty(${r.field})` : r.op === 'notempty' ? `not isempty(${r.field})` : r.op === 'contains' ? `contains(${r.field}, ${lit(r.val)})` : `${r.field} ${r.op} ${lit(r.val)}`);
    onChange(parts.join(` ${j} `));
  };
  if (raw)
    return (
      <div>
        <FormulaInput value={value} onChange={onChange} names={names} />
        <button type="button" className="btn sm ghost" onClick={() => setRaw(false)}><Wand2 size={13} /> Use condition builder</button>
      </div>
    );
  return (
    <div>
      {rows.map((r, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          {i > 0 && <select className="select" style={{ width: 70 }} value={join} onChange={(e) => { setJoin(e.target.value as any); build(rows, e.target.value as any); }}><option value="and">and</option><option value="or">or</option></select>}
          <input className="input" list="kf-names" placeholder="field" value={r.field} onChange={(e) => { const n = rows.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)); setRows(n); build(n); }} />
          <select className="select" value={r.op} onChange={(e) => { const n = rows.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)); setRows(n); build(n); }}>{OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
          {!['empty', 'notempty'].includes(r.op) && <input className="input" placeholder="value" value={r.val} onChange={(e) => { const n = rows.map((x, j) => (j === i ? { ...x, val: e.target.value } : x)); setRows(n); build(n); }} />}
          {rows.length > 1 && <button type="button" className="btn ghost icon sm" onClick={() => { const n = rows.filter((_, j) => j !== i); setRows(n); build(n); }}><Trash2 size={14} /></button>}
        </div>
      ))}
      <datalist id="kf-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => setRows([...rows, { field: names[0] || '', op: '=', val: '' }])}><Plus size={13} /> Add rule</button>
        <button type="button" className="btn sm ghost" onClick={() => setRaw(true)}><Code2 size={13} /> Write formula</button>
      </div>
      {value && <div className="hint mono">{value}</div>}
    </div>
  );
}

export function FormulaInput({ value, onChange, names, placeholder }: { value: string; onChange: (v: string) => void; names: string[]; placeholder?: string }) {
  const [fn, setFn] = useState('');
  let err = '';
  if (value.trim()) { try { parseExpr(value); } catch (e: any) { err = e.message; } }
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(FUNCTIONS)) (g[v.group] ||= []).push(k);
    return g;
  }, []);
  return (
    <div>
      <input className={'input mono' + (err ? ' invalid' : '')} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {err && <div className="err">{err}</div>}
      <div className="row wrap" style={{ marginTop: 6, gap: 4 }}>
        {names.slice(0, 16).map((n) => <button type="button" key={n} className="chip" onClick={() => onChange((value ? value + ' ' : '') + n)}>{n}</button>)}
        {['+', '-', '*', '/', '&', '>', '<', '='].map((o) => <button type="button" key={o} className="chip mono" onClick={() => onChange(value + ' ' + o + ' ')}>{o}</button>)}
        <select className="select" style={{ width: 'auto', padding: '3px 6px', fontSize: 12 }} value={fn} onChange={(e) => { const f = e.target.value; setFn(''); if (f) onChange(value + (value && !/[\s(,]$/.test(value) ? ' ' : '') + f + '()'); }}>
          <option value="">+ function…</option>
          {Object.entries(groups).map(([g, fns]) => <optgroup key={g} label={g}>{fns.map((f) => <option key={f} value={f}>{FUNCTIONS[f].sig} — {FUNCTIONS[f].doc}</option>)}</optgroup>)}
        </select>
      </div>
    </div>
  );
}

function ParamInput({ p, value, onChange, names }: { p: Param; value: any; onChange: (v: any) => void; names: string[] }) {
  const { tables, snippets } = useStore();
  switch (p.type) {
    case 'bool':
      return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {p.label}</label>;
    case 'select':
      return <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>{p.options!.map((o) => <option key={o} value={o}>{o || '(default)'}</option>)}</select>;
    case 'textarea':
      return <textarea className="textarea" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={p.placeholder} />;
    case 'number':
      return <input className="input" type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={p.placeholder} />;
    case 'formula':
      return <FormulaInput value={value ?? ''} onChange={onChange} names={names} placeholder={p.placeholder} />;
    case 'condition':
      return <ConditionInput value={value ?? ''} onChange={onChange} names={names} />;
    case 'table':
      return (
        <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a table…</option>
          {tables.map((t) => <option key={t.id} value={t.key}>{t.name} (data.{t.key}) — columns: {t.columns.map((c) => c.key).join(', ')}</option>)}
        </select>
      );
    case 'snippet':
      return (
        <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a snippet…</option>
          {snippets.filter((s) => s.shortcut).map((s) => <option key={s.id} value={s.shortcut}>{s.shortcut} — {s.name}</option>)}
        </select>
      );
    case 'name':
      return <input className="input mono" value={value ?? ''} placeholder={p.placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\p{L}\p{N}_]/gu, '_'))} />;
    default:
      return <input className="input" value={value ?? ''} placeholder={p.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function CommandBuilder({ onInsert, onClose, names, initial }: { onInsert: (open: string, close?: string, middle?: string) => void; onClose: () => void; names: string[]; initial?: { def: CommandDef; values: Record<string, any> } }) {
  const [def, setDef] = useState<CommandDef | null>(initial?.def || null);
  const [vals, setVals] = useState<Record<string, any>>(initial?.values || {});
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const g: Record<string, CommandDef[]> = {};
    for (const c of COMMANDS) if (!filter || (c.label + c.desc).toLowerCase().includes(filter.toLowerCase())) (g[c.group] ||= []).push(c);
    return g;
  }, [filter]);
  const missing = def?.params.filter((p) => p.required && !String(vals[p.key] ?? '').trim()) || [];
  const built = def && !missing.length ? buildCommand(def, vals) : null;
  const preview = built ? built.open + (built.close ? (built.middle ? '…' + built.middle + '…' : '…') + built.close : '') : '';
  return (
    <Modal
      title={def ? (initial ? 'Edit ' : 'Insert ') + def.label : 'Insert a field or command'}
      onClose={onClose}
      width={760}
      footer={def ? <>
        {!initial && <button className="btn ghost" onClick={() => { setDef(null); setVals({}); }}>← All commands</button>}
        <div className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!built} onClick={() => { onInsert(built!.open, built!.close, built!.middle); onClose(); }}>{initial ? 'Update' : 'Insert'}</button>
      </> : undefined}
    >
      {!def ? (
        <>
          <input className="input" autoFocus placeholder="Search commands…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {Object.entries(groups).map(([g, cmds]) => (
            <div key={g}>
              <div className="cmd-group">{g}</div>
              <div className="cmd-grid">
                {cmds.map((c) => (
                  <button key={c.id} className="cmd-tile" onClick={() => { setDef(c); setVals(c.id === 'upper' ? { mode: 'upper' } : {}); }}>
                    <b>{c.label}</b><span>{c.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          {def.feature && <div style={{ marginBottom: 10 }}><PlanGate feature={def.feature} inline><span /></PlanGate></div>}
          <div className="muted" style={{ marginBottom: 12 }}>{def.desc}</div>
          {def.params.map((p) => (
            <div className="field" key={p.key}>
              {p.type !== 'bool' && <label className="label">{p.label}{p.required && <span style={{ color: 'var(--kf-danger)' }}> *</span>}</label>}
              <ParamInput p={p} value={vals[p.key]} onChange={(v) => setVals({ ...vals, [p.key]: v })} names={names} />
              {p.help && <div className="hint">{p.help}</div>}
            </div>
          ))}
          {def.block && <div className="hint">The section's content goes between the opening and closing commands. Selected text is wrapped automatically.</div>}
          <div className="label" style={{ marginTop: 10 }}>Generated syntax</div>
          <div className="code-out">{preview || `Fill in: ${missing.map((m) => m.label).join(', ')}`}</div>
        </>
      )}
    </Modal>
  );
}
