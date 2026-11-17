// Datasets: import (Excel, CSV/TSV, JSON, Google Sheets) with column mapping,
// data validation, duplicate / missing-field detection, sensitive-column
// encryption, record selection and exports.
import React, { useEffect, useMemo, useState } from 'react';
import { useStore, useRoute, download, pickFile } from '../store';
import { Empty, ConfirmModal, Modal, PlanGate } from '../common';
import { uid, slugKey } from '../../../shared/ids';
import { toCSV } from '../../../shared/validate';
import type { DataTable, DataColumn, ColumnType } from '../../../shared/types';
import { ADAPTERS, parseDelimited, sheetToTable, checkQuality, findRecords, recordLabel, uniqueKeys, type ImportedSheet } from '../../../data/sources';
import { loadPublicSheet, loadPrivateSheet, googleAccessToken, SHEETS_SCOPE, appendRows, parseSheetUrl } from '../../../data/gsheets';
import { writeXlsx } from '../../../data/xlsx';
import { looksSensitiveColumn, mask } from '../../../automation/safety';
import { PageHead, bytesDownload, send } from './kit';
import { Database, Plus, Trash2, Download, Upload, Save, Settings2, Search, FileSpreadsheet, Sheet, ShieldCheck, Eye, EyeOff, CheckCircle2, AlertTriangle, Lock, ArrowRight } from 'lucide-react';

const TYPES: ColumnType[] = ['text', 'number', 'email', 'phone', 'date', 'category', 'url', 'boolean'];

/** CSV text -> dataset (kept for existing callers). */
export function tableFromCSV(name: string, text: string): DataTable {
  return sheetToTable({ name, rows: parseDelimited(text), source: { kind: 'csv', ref: name } } as ImportedSheet, { name, autoSensitive: false });
}

// ---------------------------------------------------------------- import wizard
function ImportWizard({ onClose, appendTo }: { onClose: () => void; appendTo?: DataTable }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [sheets, setSheets] = useState<ImportedSheet[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [name, setName] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [sensitive, setSensitive] = useState<Set<number>>(new Set());
  const [gsUrl, setGsUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sheet = sheets?.[sheetIdx];
  const header = sheet?.rows[headerRow] || [];
  useEffect(() => {
    if (!sheet) return;
    const h = sheet.rows[headerRow] || [];
    const auto = uniqueKeys(h.map((x, i) => x.trim() || `Column ${i + 1}`));
    if (appendTo) {
      // map columns of the incoming file to the existing dataset by name/key
      setKeys(h.map((x, i) => appendTo.columns.find((c) => c.name.toLowerCase() === x.trim().toLowerCase() || c.key === slugKey(x))?.key || auto[i]));
    } else setKeys(auto);
    setSensitive(new Set(h.map((x, i) => (looksSensitiveColumn(x) ? i : -1)).filter((i) => i >= 0)));
    setSkip(new Set());
    if (!name) setName(sheet.name);
  }, [sheet, headerRow]);

  const load = async (fn: () => Promise<ImportedSheet[]>) => {
    setBusy(true); setErr('');
    try { const r = await fn(); if (!r.length || !r.some((x) => x.rows.length)) throw new Error('No data found'); setSheets(r); setSheetIdx(Math.max(0, r.findIndex((x) => x.rows.length))); setHeaderRow(0); }
    catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const fromFile = async () => {
    const f = await pickFile('.xlsx,.csv,.tsv,.txt,.json');
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setErr('Files up to 25 MB are supported'); return; }
    const lower = f.name.toLowerCase();
    setName(f.name.replace(/\.(xlsx|csv|tsv|txt|json)$/i, ''));
    if (lower.endsWith('.xlsx')) load(async () => ADAPTERS.xlsx.load({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }));
    else if (lower.endsWith('.xls')) setErr('Old .xls files are not supported — save as .xlsx or CSV in Excel first');
    else if (lower.endsWith('.json')) load(async () => ADAPTERS.json.load({ name: f.name, text: await f.text() }));
    else load(async () => ADAPTERS.csv.load({ name: f.name, text: await f.text() }));
  };
  const fromSheets = async (signedIn: boolean) => {
    if (!parseSheetUrl(gsUrl)) { setErr('Paste a Google Sheets link'); return; }
    load(async () => {
      if (!signedIn) return loadPublicSheet(gsUrl);
      const token = await googleAccessToken(s.cloud.googleClientId, [SHEETS_SCOPE]);
      return loadPrivateSheet(token, gsUrl);
    });
  };
  const body = sheet ? sheet.rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim())) : [];
  const create = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const keyMap: Record<number, string> = {};
      keys.forEach((k, i) => { keyMap[i] = slugKey(k || `column_${i + 1}`); });
      const t = sheetToTable(sheet, { name, headerRow, keys: keyMap, skipColumns: [...skip], workspaceId: s.ws.id, autoSensitive: false });
      t.sensitiveColumns = header.map((_, i) => i).filter((i) => sensitive.has(i) && !skip.has(i)).map((i) => keyMap[i]);
      if (appendTo) {
        const cols = [...appendTo.columns];
        for (const c of t.columns) if (!cols.some((x) => x.key === c.key)) cols.push(c);
        const next = { ...appendTo, columns: cols, rows: [...appendTo.rows, ...t.rows], sensitiveColumns: [...new Set([...(appendTo.sensitiveColumns || []), ...(t.sensitiveColumns || [])])], source: t.source };
        await s.saveTable(next);
        s.toast(`Added ${t.rows.length} records to ${appendTo.name}`);
      } else {
        if (s.tables.some((x) => x.key === t.key)) t.key = `${t.key}_${s.tables.length + 1}`;
        await s.saveTable(t);
        s.toast(`Imported ${t.rows.length} records${t.sensitiveColumns?.length ? ` · ${t.sensitiveColumns.length} column(s) encrypted` : ''}`);
        go('/data/' + t.id);
      }
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={appendTo ? `Import more records into “${appendTo.name}”` : 'Import dataset'} onClose={onClose} width={980} footer={sheet ? <>
      <span className="muted grow">{body.length} records · {header.length - skip.size} columns · {sensitive.size} encrypted</span>
      <button className="btn" onClick={() => setSheets(null)}>Back</button>
      <button className="btn primary" disabled={busy || !body.length} onClick={create}>{appendTo ? 'Add records' : 'Create dataset'} <ArrowRight size={14} /></button>
    </> : undefined}>
      {!sheet ? (
        <div className="kf-import">
          <button className="card kf-src" onClick={fromFile} disabled={busy}><FileSpreadsheet size={26} /><b>Excel, CSV or JSON file</b><span className="muted">.xlsx · .csv · .tsv · .json — read on your device, nothing is uploaded</span></button>
          <div className="card kf-src">
            <Sheet size={26} /><b>Google Sheets</b>
            <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={gsUrl} onChange={(e) => setGsUrl(e.target.value)} />
            <div className="row" style={{ gap: 6 }}>
              <button className="btn" disabled={busy} onClick={() => fromSheets(false)}>Public link</button>
              <button className="btn" disabled={busy || !s.cloud.googleClientId} title={s.cloud.googleClientId ? '' : 'Add a Google OAuth client ID in Settings → Cloud & Account'} onClick={() => fromSheets(true)}>Sign in with Google</button>
            </div>
          </div>
          {busy && <div className="muted">Reading…</div>}
          {err && <div className="err">{err}</div>}
        </div>
      ) : (
        <>
          <div className="grid-3">
            {!appendTo && <div className="field"><label className="label">Dataset name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>}
            {sheets!.length > 1 && <div className="field"><label className="label">Sheet</label><select className="select" value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>{sheets!.map((x, i) => <option key={i} value={i}>{x.name} ({x.rows.length} rows)</option>)}</select></div>}
            <div className="field"><label className="label">Header row</label><select className="select" value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>{sheet.rows.slice(0, 10).map((r, i) => <option key={i} value={i}>Row {i + 1}: {r.filter(Boolean).slice(0, 3).join(', ').slice(0, 50)}</option>)}</select></div>
          </div>
          <div className="label">Column mapping — rename the key used as {'{{key}}'}, skip columns, and choose which ones are encrypted</div>
          <div style={{ overflow: 'auto', maxHeight: '48vh' }} className="card">
            <table className="grid kf-map">
              <thead>
                <tr>{header.map((h, i) => <th key={i} className={skip.has(i) ? 'skip' : ''}>
                  <div className="row" style={{ gap: 4 }}><input type="checkbox" checked={!skip.has(i)} onChange={() => { const n = new Set(skip); n.has(i) ? n.delete(i) : n.add(i); setSkip(n); }} title="Import this column" /><span>{h || `Column ${i + 1}`}</span></div>
                  {appendTo ? <select className="select" value={keys[i] || ''} onChange={(e) => setKeys(keys.map((k, j) => (j === i ? e.target.value : k)))}>{appendTo.columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}<option value={slugKey(h || `column_${i + 1}`)}>+ new column</option></select>
                    : <input className="input mono" value={keys[i] || ''} onChange={(e) => setKeys(keys.map((k, j) => (j === i ? e.target.value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() : k)))} />}
                  <label className="check" style={{ fontWeight: 400, fontSize: 11.5 }}><input type="checkbox" checked={sensitive.has(i)} onChange={() => { const n = new Set(sensitive); n.has(i) ? n.delete(i) : n.add(i); setSensitive(n); }} /> <Lock size={11} /> encrypt</label>
                </th>)}</tr>
              </thead>
              <tbody>{body.slice(0, 8).map((r, ri) => <tr key={ri}>{header.map((_, i) => <td key={i} className={skip.has(i) ? 'skip' : ''}><div className="cell">{sensitive.has(i) ? mask(String(r[i] ?? '')) : r[i]}</div></td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="hint"><ShieldCheck size={12} /> Encrypted columns (Aadhaar, phone, DOB, address…) are stored with AES-256-GCM using a key that never leaves this device. They are excluded from cloud sync unless you enable passphrase-encrypted sync.</div>
          {err && <div className="err">{err}</div>}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- columns
function ColumnsDialog({ table, onSave, onClose }: { table: DataTable; onSave: (t: Partial<DataTable>) => void; onClose: () => void }) {
  const [cols, setCols] = useState(table.columns.map((c) => ({ ...c, optionsText: (c.options || []).join(', ') })));
  const [sens, setSens] = useState(new Set(table.sensitiveColumns || []));
  const [req, setReq] = useState(new Set(table.requiredColumns || []));
  const [keyCol, setKeyCol] = useState(table.keyColumn || '');
  const upd = (i: number, p: any) => setCols(cols.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setter(n); };
  return (
    <Modal title="Columns & validation" onClose={onClose} width={900} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => {
      const columns: DataColumn[] = cols.map(({ optionsText, ...c }) => ({ ...c, key: c.key || slugKey(c.name), options: c.type === 'category' ? optionsText.split(',').map((x: string) => x.trim()).filter(Boolean) : undefined }));
      onSave({ columns, sensitiveColumns: [...sens].filter((k) => columns.some((c) => c.key === k)), requiredColumns: [...req].filter((k) => columns.some((c) => c.key === k)), keyColumn: keyCol || undefined });
      onClose();
    }}>Apply</button></>}>
      <table className="list">
        <thead><tr><th>Name</th><th>Key ({'{{key}}'})</th><th>Type</th><th>Options</th><th title="Unique record id">Key column</th><th>Required</th><th>Encrypted</th><th /></tr></thead>
        <tbody>
          {cols.map((c, i) => (
            <tr key={c.id}>
              <td><input className="input" value={c.name} onChange={(e) => upd(i, { name: e.target.value })} /></td>
              <td><input className="input mono" value={c.key} onChange={(e) => upd(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></td>
              <td><select className="select" value={c.type} onChange={(e) => upd(i, { type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
              <td><input className="input" disabled={c.type !== 'category'} value={c.optionsText} onChange={(e) => upd(i, { optionsText: e.target.value })} /></td>
              <td><input type="radio" name="keycol" checked={keyCol === c.key} onChange={() => setKeyCol(c.key)} /></td>
              <td><input type="checkbox" checked={req.has(c.key)} onChange={() => toggle(req, setReq, c.key)} /></td>
              <td><input type="checkbox" checked={sens.has(c.key)} onChange={() => toggle(sens, setSens, c.key)} /></td>
              <td><button className="btn ghost icon sm danger" onClick={() => setCols(cols.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => setCols([...cols, { id: uid('col'), name: 'New column', key: 'new_column_' + cols.length, type: 'text', optionsText: '' }])}><Plus size={13} /> Add column</button>
        <button className="btn sm ghost" onClick={() => setKeyCol('')}>No key column</button>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Renaming a key does not update rules and templates that already use the old key.</div>
    </Modal>
  );
}

// ---------------------------------------------------------------- editor
function TableEditor({ table }: { table: DataTable }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [draft, setDraft] = useState(table);
  const [cols, setCols] = useState(false);
  const [del, setDel] = useState(false);
  const [imp, setImp] = useState(false);
  const [q, setQ] = useState('');
  const [reveal, setReveal] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  useEffect(() => setDraft(table), [table.id, table.updatedAt]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(table);
  const sens = new Set(draft.sensitiveColumns || []);
  const quality = useMemo(() => checkQuality(draft), [draft]);
  const problemRows = useMemo(() => new Set([...quality.missing.map((m) => m.rowId), ...quality.invalid.map((m) => m.rowId), ...quality.duplicates.flatMap((d) => d.rowIds)]), [quality]);
  const invalidCells = useMemo(() => new Set(quality.invalid.map((x) => x.rowId + '|' + x.column)), [quality]);
  const setCell = (rowId: string, key: string, v: any) => setDraft({ ...draft, rows: draft.rows.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: v } } : r)) });
  const rows = useMemo(() => { let r = q ? findRecords(draft, q, 100000) : draft.rows; if (onlyProblems) r = r.filter((x) => problemRows.has(x.id)); return r; }, [draft, q, onlyProblems, problemRows]);
  const save = async () => {
    if (!/^[a-z_][a-z0-9_]*$/.test(draft.key)) { s.toast('Dataset key must use lowercase letters, numbers and _', 'error'); return; }
    try { await s.saveTable(draft); s.toast('Dataset saved'); } catch (e: any) { s.toast(e.message, 'error'); }
  };
  const matrix = (includeSensitive: boolean) => [draft.columns.map((c) => c.name), ...draft.rows.map((r) => draft.columns.map((c) => (sens.has(c.key) && !includeSensitive ? '' : (r.values[c.key] as any))))];
  const exportCSV = () => download(`${draft.key}.csv`, toCSV(matrix(reveal) as any), 'text/csv');
  const exportXLSX = () => bytesDownload(`${draft.key}.xlsx`, writeXlsx([{ name: draft.name, rows: matrix(reveal) as any }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const exportJSON = () => download(`${draft.key}.json`, JSON.stringify({ ...draft, rows: draft.rows.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, sens.has(k) && !reveal ? '' : v])) })) }, null, 2));
  const setActive = async (rowId: string) => { await send({ type: 'kf/dataset/move', datasetId: draft.id, dir: 'set', rowId }); setDraft({ ...draft, currentRowId: rowId }); s.toast(`Active record: ${recordLabel(draft, rowId)}`); };
  const dedupe = () => {
    const drop = new Set(quality.duplicates.flatMap((d) => d.rowIds.slice(1)));
    setDraft({ ...draft, rows: draft.rows.filter((r) => !drop.has(r.id)) });
    s.toast(`Removed ${drop.size} duplicate record(s) — save to keep the change`);
  };
  const pushToSheet = async () => {
    const url = prompt('Google Sheets link to write this dataset to (a new tab named after the dataset must exist):');
    if (!url) return;
    try {
      const p = parseSheetUrl(url);
      if (!p) throw new Error('Invalid link');
      const token = await googleAccessToken(s.cloud.googleClientId, [SHEETS_SCOPE]);
      await appendRows(token, p.id, draft.name, matrix(false) as any);
      s.toast('Rows appended to Google Sheets');
    } catch (e: any) { s.toast(e.message, 'error'); }
  };
  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <div className="page-head">
        <input className="name-input" style={{ maxWidth: 360 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <span className="muted">key</span>
        <input className="input mono" style={{ width: 180 }} value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
        <div className="grow" />
        {dirty && <span className="badge warn">Unsaved</span>}
        <button className="btn" onClick={() => setCols(true)}><Settings2 size={15} /> Columns</button>
        <button className="btn" onClick={() => setImp(true)}><Upload size={15} /> Import more</button>
        <details className="kf-add"><summary className="btn"><Download size={15} /> Export</summary><div className="kf-add-menu" style={{ right: 0, left: 'auto', minWidth: 220 }}>
          <button className="chip" onClick={exportXLSX}>Excel (.xlsx)</button><button className="chip" onClick={exportCSV}>CSV</button><button className="chip" onClick={exportJSON}>JSON</button>
          {s.cloud.googleClientId && <button className="chip" onClick={pushToSheet}>Append to Google Sheet</button>}
          <div className="hint">Encrypted columns are exported only while “Show sensitive” is on.</div>
        </div></details>
        <button className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /></button>
        <button className="btn primary" onClick={save} disabled={!dirty}><Save size={15} /> Save</button>
      </div>
      <div className="kf-quality">
        <span className={'badge ' + (problemRows.size ? 'warn' : 'success')}>{problemRows.size ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />} {draft.rows.length} records · {problemRows.size} need attention</span>
        {quality.duplicates.length > 0 && <span className="badge danger">{quality.duplicates.length} duplicate {draft.columns.find((c) => c.key === draft.keyColumn)?.name || 'key'}(s) <button className="btn sm ghost" onClick={dedupe}>remove</button></span>}
        {quality.missing.length > 0 && <span className="badge warn">{quality.missing.length} with missing required fields</span>}
        {quality.invalid.length > 0 && <span className="badge warn" title={quality.invalid.slice(0, 10).map((x) => `row ${x.rowIndex + 1} ${x.column}: ${x.problem}`).join('\n')}>{quality.invalid.length} invalid values</span>}
        {sens.size > 0 && <span className="badge primary"><Lock size={11} /> {sens.size} encrypted column(s)</span>}
        {s.lockedValues > 0 && <span className="badge danger">Some synced values are locked — unlock the vault</span>}
        <span className="grow" />
        <label className="check"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Show only problems</label>
        <button className="btn sm" onClick={() => setReveal(!reveal)}>{reveal ? <EyeOff size={13} /> : <Eye size={13} />} {reveal ? 'Hide' : 'Show'} sensitive</button>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="search" style={{ maxWidth: 340 }}><Search size={15} /><input className="input" placeholder={`Find a record${draft.keyColumn ? ' (exact ' + (draft.columns.find((c) => c.key === draft.keyColumn)?.name || '') + ' or any text)' : ''}…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="muted">Active record: <b>{recordLabel(draft, draft.currentRowId) || '—'}</b> · use columns as <span className="mono">{`{{${draft.columns[0]?.key || 'column'}}}`}</span></span>
      </div>
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 290px)' }} className="card">
        <table className="grid">
          <thead><tr><th style={{ width: 36 }} title="Active record">●</th>{draft.columns.map((c) => <th key={c.id}>{c.name}{draft.keyColumn === c.key && ' 🔑'}{sens.has(c.key) && ' 🔒'}{(draft.requiredColumns || []).includes(c.key) && <span className="req">*</span>} <span className="muted mono" style={{ fontWeight: 400 }}>{c.key}</span></th>)}<th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.slice(0, 1000).map((r) => (
              <tr key={r.id} className={(problemRows.has(r.id) ? 'prob ' : '') + (r.id === draft.currentRowId ? 'active' : '')}>
                <td><input type="radio" style={{ width: 'auto', margin: 8 }} checked={r.id === draft.currentRowId} onChange={() => setActive(r.id)} title="Use this record for autofill / macros" /></td>
                {draft.columns.map((c) => (
                  <td key={c.id} className={invalidCells.has(r.id + '|' + c.key) ? 'bad' : ''}>
                    {sens.has(c.key) && !reveal ? <div className="cell muted">{mask(String(r.values[c.key] ?? ''))}</div>
                      : c.type === 'category' ? <select value={String(r.values[c.key] ?? '')} onChange={(e) => setCell(r.id, c.key, e.target.value)}><option value="" />{[...new Set([...(c.options || []), String(r.values[c.key] ?? '')])].filter(Boolean).map((o) => <option key={o}>{o}</option>)}</select>
                      : c.type === 'boolean' ? <input type="checkbox" style={{ width: 'auto', margin: 8 }} checked={!!r.values[c.key]} onChange={(e) => setCell(r.id, c.key, e.target.checked)} />
                      : <input value={String(r.values[c.key] ?? '')} onChange={(e) => setCell(r.id, c.key, c.type === 'number' ? (e.target.value === '' ? null : isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) : e.target.value)} />}
                  </td>
                ))}
                <td><button className="btn ghost icon sm" title="Delete record" onClick={() => setDraft({ ...draft, rows: draft.rows.filter((x) => x.id !== r.id) })}><Trash2 size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 1000 && <div className="muted" style={{ padding: 10 }}>Showing 1,000 of {rows.length} records — use search to find others.</div>}
      </div>
      <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setDraft({ ...draft, rows: [...draft.rows, { id: uid('row'), values: {} }] })}><Plus size={13} /> Add record</button>
      {cols && <ColumnsDialog table={draft} onClose={() => setCols(false)} onSave={(p) => setDraft({ ...draft, ...p })} />}
      {imp && <ImportWizard appendTo={draft} onClose={() => setImp(false)} />}
      {del && <ConfirmModal title="Delete dataset?" danger message="Profiles, macros and variables that use it will report an error." onConfirm={async () => { await s.deleteTable(table.id); go('/data'); }} onClose={() => setDel(false)} />}
    </div>
  );
}

export function DataHubView({ tableId }: { tableId?: string }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [wizard, setWizard] = useState(false);
  const t = tableId ? s.tables.find((x) => x.id === tableId) : null;
  if (t) return <PlanGate feature="dataHub"><TableEditor table={t} /></PlanGate>;
  const list = s.tables.filter(s.inWs);
  const create = async () => {
    const now = Date.now();
    const n = s.tables.length + 1;
    const table: DataTable = { id: uid('tbl'), name: `Dataset ${n}`, key: `dataset_${n}`, columns: [{ id: uid('col'), name: 'Name', key: 'name', type: 'text' }, { id: uid('col'), name: 'Email', key: 'email', type: 'email' }, { id: uid('col'), name: 'Mobile', key: 'mobile', type: 'phone' }], rows: [], workspaceId: s.ws.id, sensitiveColumns: ['email', 'mobile'], createdAt: now, updatedAt: now };
    try { await s.saveTable(table); go('/data/' + table.id); } catch (e: any) { s.toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <PageHead title="Datasets" icon={<Database size={20} />} sub={`Student registers, staff lists, trade journals — imported from Excel, CSV, JSON or Google Sheets. ${s.ws.name}.`}>
        <button className="btn" onClick={create}><Plus size={15} /> Empty dataset</button>
        <button className="btn primary" onClick={() => setWizard(true)}><Upload size={15} /> Import</button>
      </PageHead>
      <PlanGate feature="dataHub">
        {list.length ? (
          <div className="kf-cards">
            {list.map((x) => {
              const qr = checkQuality(x);
              const issues = qr.missing.length + qr.invalid.length + qr.duplicates.length;
              return (
                <div key={x.id} className="card kf-card" onClick={() => go('/data/' + x.id)}>
                  <div className="row"><Database size={16} /><b className="grow">{x.name}</b><span className="badge">{x.rows.length} records</span></div>
                  <div className="muted kf-card-sub">{x.description || `{{${x.columns.slice(0, 3).map((c) => c.key).join('}} {{')}}}`}</div>
                  <div className="row wrap" style={{ gap: 4 }}>
                    {(x.sensitiveColumns || []).length > 0 && <span className="badge primary"><Lock size={10} /> {(x.sensitiveColumns || []).length} encrypted</span>}
                    {x.source?.kind && x.source.kind !== 'manual' && <span className="badge">{x.source.kind}</span>}
                    {issues > 0 ? <span className="badge warn">{issues} issue(s)</span> : x.rows.length ? <span className="badge success">valid</span> : <span className="badge">empty — import data</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Empty icon={<Database size={32} />} title="No datasets in this workspace">Import your Excel sheet or Google Sheet to fill forms record by record.</Empty>}
      </PlanGate>
      {wizard && <ImportWizard onClose={() => setWizard(false)} />}
    </div>
  );
}
