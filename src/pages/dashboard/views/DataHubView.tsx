import React, { useEffect, useMemo, useState } from 'react';
import { useStore, useRoute, download, pickFile } from '../store';
import { Empty, ConfirmModal, Modal, PlanGate } from '../common';
import { uid, slugKey } from '../../../shared/ids';
import { parseCSV, toCSV, normalizeTable } from '../../../shared/validate';
import type { DataTable, DataColumn, ColumnType } from '../../../shared/types';
import { Database, Plus, Trash2, Download, Upload, Save, Settings2, Search } from 'lucide-react';

const TYPES: ColumnType[] = ['text', 'number', 'email', 'phone', 'date', 'category', 'url', 'boolean'];

function guessType(values: string[]): ColumnType {
  const v = values.filter(Boolean).slice(0, 50);
  if (!v.length) return 'text';
  if (v.every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return 'email';
  if (v.every((x) => /^-?[\d,]+(\.\d+)?$/.test(x))) return 'number';
  if (v.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) return 'date';
  if (v.every((x) => /^\+?[\d\s().-]{7,}$/.test(x))) return 'phone';
  if (v.every((x) => /^https?:\/\//.test(x))) return 'url';
  if (v.every((x) => /^(true|false|yes|no)$/i.test(x))) return 'boolean';
  if (new Set(v).size <= Math.max(3, v.length / 4)) return 'category';
  return 'text';
}

export function tableFromCSV(name: string, text: string): DataTable {
  const rows = parseCSV(text);
  if (rows.length < 1) throw new Error('CSV is empty');
  const header = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const used = new Set<string>();
  const columns: DataColumn[] = header.map((h, i) => {
    let key = slugKey(h); let k = key; let n = 2;
    while (used.has(k)) k = key + '_' + n++;
    used.add(k);
    const vals = rows.slice(1).map((r) => r[i] || '');
    const type = guessType(vals);
    return { id: uid('col'), name: h, key: k, type, options: type === 'category' ? [...new Set(vals.filter(Boolean))].slice(0, 100) : undefined };
  });
  return normalizeTable({ name, key: slugKey(name), columns, rows: rows.slice(1).map((r) => ({ id: uid('row'), values: Object.fromEntries(columns.map((c, i) => [c.key, c.type === 'number' && r[i] ? Number(r[i].replace(/,/g, '')) : c.type === 'boolean' ? /^(true|yes)$/i.test(r[i] || '') : r[i] ?? ''])) })) });
}

function ColumnsDialog({ table, onSave, onClose }: { table: DataTable; onSave: (cols: DataColumn[]) => void; onClose: () => void }) {
  const [cols, setCols] = useState(table.columns.map((c) => ({ ...c, optionsText: (c.options || []).join(', ') })));
  const upd = (i: number, p: any) => setCols(cols.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <Modal title="Edit columns" onClose={onClose} width={720} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { onSave(cols.map(({ optionsText, ...c }) => ({ ...c, key: c.key || slugKey(c.name), options: c.type === 'category' ? optionsText.split(',').map((x: string) => x.trim()).filter(Boolean) : undefined }))); onClose(); }}>Save columns</button></>}>
      <table className="list">
        <thead><tr><th>Name</th><th>Key (used in templates)</th><th>Type</th><th>Options (category)</th><th /></tr></thead>
        <tbody>
          {cols.map((c, i) => (
            <tr key={c.id}>
              <td><input className="input" value={c.name} onChange={(e) => upd(i, { name: e.target.value, key: c.key || slugKey(e.target.value) })} /></td>
              <td><input className="input mono" value={c.key} onChange={(e) => upd(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></td>
              <td><select className="select" value={c.type} onChange={(e) => upd(i, { type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
              <td><input className="input" disabled={c.type !== 'category'} value={c.optionsText} onChange={(e) => upd(i, { optionsText: e.target.value })} /></td>
              <td><button className="btn ghost icon sm danger" onClick={() => setCols(cols.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setCols([...cols, { id: uid('col'), name: 'New column', key: 'new_column_' + cols.length, type: 'text', optionsText: '' }])}><Plus size={13} /> Add column</button>
      <div className="hint" style={{ marginTop: 10 }}>Renaming a key does not update templates that already use the old key.</div>
    </Modal>
  );
}

function TableEditor({ table }: { table: DataTable }) {
  const { saveTable, deleteTable, toast } = useStore();
  const [, , go] = useRoute();
  const [draft, setDraft] = useState(table);
  const [cols, setCols] = useState(false);
  const [del, setDel] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => setDraft(table), [table.id, table.updatedAt]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(table);
  const setCell = (rowId: string, key: string, v: any) => setDraft({ ...draft, rows: draft.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: v } } : r)) });
  const rows = useMemo(() => (q ? draft.rows.filter((r) => Object.values(r.values).some((v) => String(v ?? '').toLowerCase().includes(q.toLowerCase()))) : draft.rows), [draft.rows, q]);
  const save = async () => {
    if (!/^[a-z_][a-z0-9_]*$/.test(draft.key)) { toast('Table key must use lowercase letters, numbers and _', 'error'); return; }
    try { await saveTable(draft); toast('Table saved'); } catch (e: any) { toast(e.message, 'error'); }
  };
  const exportCSV = () => download(`${draft.key}.csv`, toCSV([draft.columns.map((c) => c.name), ...draft.rows.map((r) => draft.columns.map((c) => r.values[c.key] as any))]), 'text/csv');
  const exportJSON = () => download(`${draft.key}.json`, JSON.stringify(draft, null, 2));
  const importInto = async () => {
    const f = await pickFile('.csv,.json,text/csv,application/json');
    if (!f) return;
    try {
      const text = await f.text();
      const t = f.name.endsWith('.json') ? normalizeTable(JSON.parse(text)) : tableFromCSV(draft.name, text);
      const keyMap = new Map(t.columns.map((c) => [c.name.toLowerCase(), c.key]));
      const newCols = [...draft.columns];
      for (const c of t.columns) if (!newCols.some((x) => x.key === c.key || x.name.toLowerCase() === c.name.toLowerCase())) newCols.push(c);
      const mapped = t.rows.map((r) => ({ id: uid('row'), values: Object.fromEntries(newCols.map((c) => [c.key, r.values[c.key] ?? r.values[keyMap.get(c.name.toLowerCase()) || ''] ?? null])) }));
      setDraft({ ...draft, columns: newCols, rows: [...draft.rows, ...mapped] });
      toast(`Added ${mapped.length} rows — remember to save`);
    } catch (e: any) { toast(e.message || 'Could not read file', 'error'); }
  };
  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <div className="page-head">
        <input className="name-input" style={{ maxWidth: 360 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <span className="muted">used as</span>
        <input className="input mono" style={{ width: 200 }} value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
        <div className="grow" />
        {dirty && <span className="badge warn">Unsaved</span>}
        <button className="btn" onClick={() => setCols(true)}><Settings2 size={15} /> Columns</button>
        <button className="btn" onClick={importInto}><Upload size={15} /> Import rows</button>
        <button className="btn" onClick={exportCSV}><Download size={15} /> CSV</button>
        <button className="btn" onClick={exportJSON}><Download size={15} /> JSON</button>
        <button className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /></button>
        <button className="btn primary" onClick={save} disabled={!dirty}><Save size={15} /> Save</button>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="search" style={{ maxWidth: 300 }}><Search size={15} /><input className="input" placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="muted">{draft.rows.length} rows · use in templates: <span className="mono">{`{{pick: x; table=${draft.key}; display=${draft.columns[0]?.key || 'name'}}}`}</span> or <span className="mono">{`{{= lookup(data.${draft.key}, "${draft.columns[0]?.key || 'name'}", value, "${draft.columns[1]?.key || 'email'}")}}`}</span></span>
      </div>
      <div style={{ overflow: 'auto' }} className="card">
        <table className="grid">
          <thead><tr>{draft.columns.map((c) => <th key={c.id}>{c.name} <span className="muted mono" style={{ fontWeight: 400 }}>{c.key} · {c.type}</span></th>)}<th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {draft.columns.map((c) => (
                  <td key={c.id}>
                    {c.type === 'category' ? (
                      <select value={String(r.values[c.key] ?? '')} onChange={(e) => setCell(r.id, c.key, e.target.value)}><option value="" />{(c.options || []).map((o) => <option key={o}>{o}</option>)}</select>
                    ) : c.type === 'boolean' ? (
                      <input type="checkbox" style={{ width: 'auto', margin: 8 }} checked={!!r.values[c.key]} onChange={(e) => setCell(r.id, c.key, e.target.checked)} />
                    ) : (
                      <input type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : c.type === 'email' ? 'email' : 'text'} value={String(r.values[c.key] ?? '')} onChange={(e) => setCell(r.id, c.key, c.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
                    )}
                  </td>
                ))}
                <td><button className="btn ghost icon sm" title="Delete row" onClick={() => setDraft({ ...draft, rows: draft.rows.filter((x) => x.id !== r.id) })}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setDraft({ ...draft, rows: [...draft.rows, { id: uid('row'), values: {} }] })}><Plus size={13} /> Add row</button>
      {cols && <ColumnsDialog table={draft} onClose={() => setCols(false)} onSave={(c) => setDraft({ ...draft, columns: c })} />}
      {del && <ConfirmModal title="Delete table?" danger message="Templates using this table will show an error." onConfirm={async () => { await deleteTable(table.id); go('/data'); }} onClose={() => setDel(false)} />}
    </div>
  );
}

export function DataHubView({ tableId }: { tableId?: string }) {
  const { tables, saveTable, toast } = useStore();
  const [, , go] = useRoute();
  const t = tableId ? tables.find((x) => x.id === tableId) : null;
  if (t) return <PlanGate feature="dataHub"><TableEditor table={t} /></PlanGate>;
  const create = async () => {
    const now = Date.now();
    const n = tables.length + 1;
    const table: DataTable = { id: uid('tbl'), name: `Table ${n}`, key: `table_${n}`, columns: [{ id: uid('col'), name: 'Name', key: 'name', type: 'text' }, { id: uid('col'), name: 'Email', key: 'email', type: 'email' }, { id: uid('col'), name: 'Phone', key: 'phone', type: 'phone' }], rows: [], createdAt: now, updatedAt: now };
    try { await saveTable(table); go('/data/' + table.id); } catch (e: any) { toast(e.message, 'error'); }
  };
  const importNew = async () => {
    const f = await pickFile('.csv,.json,text/csv,application/json');
    if (!f) return;
    try {
      const text = await f.text();
      const base = f.name.replace(/\.(csv|json)$/i, '');
      const table = f.name.toLowerCase().endsWith('.json') ? normalizeTable({ ...JSON.parse(text), id: uid('tbl') }) : tableFromCSV(base, text);
      if (tables.some((x) => x.key === table.key)) table.key += '_' + (tables.length + 1);
      await saveTable(table);
      toast(`Imported ${table.rows.length} rows`);
      go('/data/' + table.id);
    } catch (e: any) { toast(e.message || 'Could not import file', 'error'); }
  };
  return (
    <div className="page">
      <div className="page-head">
        <h2>Data Hub</h2>
        <button className="btn" onClick={importNew}><Upload size={15} /> Import CSV / JSON</button>
        <button className="btn primary" onClick={create}><Plus size={15} /> New table</button>
      </div>
      <PlanGate feature="dataHub">
        <p className="muted" style={{ marginTop: -6 }}>Store customers, students, products or any reusable information once and pull it into templates with <span className="mono">{'{{pick: …}}'}</span> or <span className="mono">lookup()</span>.</p>
        {tables.length ? (
          <div className="tpl-grid">
            {tables.map((t) => (
              <div key={t.id} className="card tpl" style={{ cursor: 'pointer' }} onClick={() => go('/data/' + t.id)}>
                <div className="row"><Database size={16} /><h4 className="grow">{t.name}</h4><span className="badge">{t.rows.length} rows</span></div>
                <div className="mono muted" style={{ fontSize: 12 }}>data.{t.key}</div>
                <div className="row wrap" style={{ gap: 4 }}>{t.columns.map((c) => <span key={c.id} className="badge">{c.name}</span>)}</div>
              </div>
            ))}
          </div>
        ) : <Empty icon={<Database size={32} />} title="No tables yet">Create a table or import a CSV file.</Empty>}
      </PlanGate>
    </div>
  );
}
