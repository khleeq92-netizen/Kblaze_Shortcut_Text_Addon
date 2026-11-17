import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Empty, Modal, ConfirmModal } from '../common';
import { uid } from '../../../shared/ids';
import type { Variable, VariableKind } from '../../../shared/types';
import { PageHead, SearchBox } from './kit';
import { resolveVariables, formatOptionsFrom, validateVariableName, activeRecord, rowToRecord } from '../../../automation/variables';
import { Braces, Plus, Trash2, Pencil, Globe2 } from 'lucide-react';

const KINDS: { k: VariableKind; label: string; help: string; ph: string }[] = [
  { k: 'static', label: 'Static text', help: 'A fixed value, e.g. the college name.', ph: 'Dr M.A. Aziz Jr College of Science' },
  { k: 'formula', label: 'Calculated (formula)', help: 'Uses other variables and dataset columns. Functions: upper, concat, round, if, today(), year()…', ph: 'round(number(account_balance) * number(risk_percent) / 100, 2)' },
  { k: 'date', label: 'Date / time', help: 'today, now, tomorrow, today+7d, now-2h, 2025-06-01…', ph: 'today' },
  { k: 'random', label: 'Random value', help: 'int:1000-9999 · float:0-1:2 · alnum:8 · digits:6 · letters:4 · hex:8 · uuid · choice', ph: 'alnum:8' },
  { k: 'dataset', label: 'Dataset column', help: 'Value of a column of the active record of a dataset.', ph: '' },
  { k: 'conditional', label: 'Conditional', help: 'First matching condition wins; otherwise the default.', ph: 'default value' },
  { k: 'list', label: 'List', help: 'A list of options (joined with commas when inserted).', ph: '' },
  { k: 'counter', label: 'Counter', help: 'A number you can increase from scripts / macros.', ph: '1' },
  { k: 'secret', label: 'Vault secret', help: 'Reference to a vault entry (decrypted only while the vault is unlocked).', ph: 'vault.portal_password' },
];

function newVar(ws: string | undefined): Variable {
  const t = Date.now();
  return { id: uid('var'), name: '', kind: 'static', value: '', workspaceId: ws, createdAt: t, updatedAt: t };
}

function VarDialog({ v, onClose }: { v: Variable; onClose: () => void }) {
  const s = useStore();
  const [d, setD] = useState<Variable>(v);
  const [err, setErr] = useState('');
  const kind = KINDS.find((k) => k.k === d.kind)!;
  const ds = s.tables.find((t) => t.id === d.datasetId);
  const live = useMemo(() => {
    const others = s.variables.filter((x) => x.id !== d.id);
    const dataset = s.tables.find((t) => t.id === d.datasetId) || s.tables.find((t) => t.workspaceId === (d.workspaceId || s.ws.id));
    const rec = dataset ? rowToRecord(dataset, activeRecord(dataset)) : null;
    const r = resolveVariables([...others, { ...d, name: d.name || '__preview' }], { record: rec, datasets: s.tables, fo: formatOptionsFrom(s.settings), workspaceId: d.workspaceId || s.ws.id, vault: null });
    const key = d.name || '__preview';
    return { value: r.values[key], error: r.errors[key] };
  }, [d, s.variables, s.tables]);
  const save = async () => {
    const e = validateVariableName(d.name);
    if (e) { setErr(e); return; }
    if (s.variables.some((x) => x.id !== d.id && x.name === d.name && (x.workspaceId || '') === (d.workspaceId || '') && (x.scopeRef || '') === (d.scopeRef || ''))) { setErr('A variable with this name already exists in this scope'); return; }
    try { await s.saveRec('variables', { ...d, workspaceId: d.workspaceId }); onClose(); s.toast('Variable saved'); } catch (x: any) { setErr(x.message); }
  };
  return (
    <Modal title={v.name ? `Edit {{${v.name}}}` : 'New variable'} onClose={onClose} width={640} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid-2">
        <div className="field"><label className="label">Name (used as {'{{name}}'})</label><input className="input mono" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') })} placeholder="student_name" /></div>
        <div className="field"><label className="label">Display label</label><input className="input" value={d.label || ''} onChange={(e) => setD({ ...d, label: e.target.value })} /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Type</label><select className="select" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as VariableKind })}>{KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}</select></div>
        <div className="field"><label className="label">Scope</label>
          <select className="select" value={d.scopeRef ? 'ref:' + d.scopeRef : d.workspaceId ? 'ws' : 'global'} onChange={(e) => { const v2 = e.target.value; setD({ ...d, workspaceId: v2 === 'global' ? undefined : d.workspaceId || s.ws.id, scopeRef: v2.startsWith('ref:') ? v2.slice(4) : null }); }}>
            <option value="global">Global (all workspaces)</option>
            <option value="ws">This workspace ({s.ws.name})</option>
            {s.autofill.filter(s.inWs).map((p) => <option key={p.id} value={'ref:' + p.id}>Only profile: {p.name}</option>)}
            {s.macros.filter(s.inWs).map((p) => <option key={p.id} value={'ref:' + p.id}>Only macro: {p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="hint" style={{ marginTop: -6, marginBottom: 10 }}>{kind.help}</div>
      {d.kind === 'dataset' ? (
        <div className="grid-2">
          <div className="field"><label className="label">Dataset</label><select className="select" value={d.datasetId || ''} onChange={(e) => setD({ ...d, datasetId: e.target.value })}><option value="">Choose…</option>{s.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
          <div className="field"><label className="label">Column</label><select className="select" value={d.column || ''} onChange={(e) => setD({ ...d, column: e.target.value })}><option value="">Choose…</option>{ds?.columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select></div>
        </div>
      ) : d.kind === 'list' || (d.kind === 'random' && /choice/.test(d.value)) ? (
        <div className="field"><label className="label">Options (one per line)</label><textarea className="textarea" rows={4} value={(d.options || []).join('\n')} onChange={(e) => setD({ ...d, options: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />{d.kind === 'random' && <input className="input mono" style={{ marginTop: 6 }} value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} />}</div>
      ) : (
        <div className="field"><label className="label">{d.kind === 'conditional' ? 'Default value' : 'Value'}</label>{d.kind === 'static' ? <textarea className="textarea" rows={2} value={d.value} placeholder={kind.ph} onChange={(e) => setD({ ...d, value: e.target.value })} /> : <input className="input mono" value={d.value} placeholder={kind.ph} onChange={(e) => setD({ ...d, value: e.target.value })} />}</div>
      )}
      {d.kind === 'date' && <div className="field"><label className="label">Format</label><input className="input mono" placeholder={s.settings.dateFormat} value={d.format || ''} onChange={(e) => setD({ ...d, format: e.target.value })} /><div className="hint">DD/MM/YYYY · D MMM YYYY · dddd · HH:mm · hh:mm A</div></div>}
      {d.kind === 'conditional' && (
        <div className="field"><label className="label">Conditions</label>
          {(d.branches || []).map((b, i) => (
            <div key={i} className="row" style={{ marginBottom: 6 }}>
              <span className="muted">if</span><input className="input mono" value={b.when} placeholder='gender = "Female"' onChange={(e) => setD({ ...d, branches: d.branches!.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)) })} />
              <span className="muted">then</span><input className="input mono" value={b.then} placeholder="F" onChange={(e) => setD({ ...d, branches: d.branches!.map((x, j) => (j === i ? { ...x, then: e.target.value } : x)) })} />
              <button className="btn ghost icon sm" onClick={() => setD({ ...d, branches: d.branches!.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setD({ ...d, branches: [...(d.branches || []), { when: '', then: '' }] })}><Plus size={13} /> Add condition</button>
        </div>
      )}
      <div className="field"><label className="label">Description</label><input className="input" value={d.description || ''} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
      <div className="kf-live"><span className="muted">Current value:</span> {live.error ? <span className="err">{live.error}</span> : <b className="mono">{String(live.value instanceof Date ? live.value.toLocaleString() : live.value ?? '')}</b>}</div>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

export function VariablesView() {
  const s = useStore();
  const [edit, setEdit] = useState<Variable | null>(null);
  const [del, setDel] = useState<Variable | null>(null);
  const [q, setQ] = useState('');
  const visible = s.variables.filter((v) => !v.workspaceId || s.inWs(v)).filter((v) => !q || `${v.name} ${v.label || ''}`.toLowerCase().includes(q.toLowerCase()));
  const values = useMemo(() => {
    const ds = s.tables.find((t) => t.workspaceId === s.ws.id);
    const rec = ds ? rowToRecord(ds, activeRecord(ds)) : null;
    return resolveVariables(s.variables, { record: rec, datasets: s.tables, fo: formatOptionsFrom(s.settings), workspaceId: s.ws.id, vault: null });
  }, [s.variables, s.tables, s.ws.id]);
  const show = (v: Variable) => { if (v.kind === 'secret') return '•••• (vault)'; const x = values.values[v.name]; return x instanceof Date ? x.toLocaleString() : String(x ?? ''); };
  return (
    <div className="page">
      <PageHead title="Variables" icon={<Braces size={20} />} sub={<>Reusable values for autofill rules, macros, scripts and snippets. Type <span className="mono">{'{{name}}'}</span> anywhere. Dataset columns are available automatically as <span className="mono">{'{{column_key}}'}</span>.</>}>
        <SearchBox value={q} onChange={setQ} placeholder="Search variables…" />
        <button className="btn primary" onClick={() => setEdit(newVar(s.ws.id))}><Plus size={15} /> New variable</button>
      </PageHead>
      {visible.length ? (
        <div className="card"><table className="list">
          <thead><tr><th>Name</th><th>Type</th><th>Scope</th><th>Definition</th><th>Current value</th><th /></tr></thead>
          <tbody>{visible.map((v) => (
            <tr key={v.id}>
              <td><span className="mono kf-var">{`{{${v.name}}}`}</span><div className="muted" style={{ fontSize: 12 }}>{v.label}</div></td>
              <td><span className="badge">{KINDS.find((k) => k.k === v.kind)?.label}</span></td>
              <td>{v.scopeRef ? <span className="badge warn">profile/macro</span> : v.workspaceId ? <span className="badge primary">{s.workspaces.find((w) => w.id === v.workspaceId)?.name || 'workspace'}</span> : <span className="badge success"><Globe2 size={11} /> global</span>}</td>
              <td className="mono muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.kind === 'dataset' ? `${s.tables.find((t) => t.id === v.datasetId)?.name || '?'} › ${v.column}` : v.kind === 'conditional' ? `${(v.branches || []).length} condition(s)` : v.value}</td>
              <td>{values.errors[v.name] ? <span className="err">{values.errors[v.name]}</span> : <span className="mono">{show(v).slice(0, 60)}</span>}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost icon sm" onClick={() => setEdit(v)}><Pencil size={14} /></button><button className="btn ghost icon sm danger" onClick={() => setDel(v)}><Trash2 size={14} /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty icon={<Braces size={32} />} title="No variables">Create variables for values you reuse — names, codes, dates, calculations.</Empty>}
      {edit && <VarDialog v={edit} onClose={() => setEdit(null)} />}
      {del && <ConfirmModal title={`Delete {{${del.name}}}?`} danger message="Rules and templates that use it will show an “unknown variable” error." onConfirm={() => s.deleteRec('variables', [del.id], del.name)} onClose={() => setDel(null)} />}
    </div>
  );
}
