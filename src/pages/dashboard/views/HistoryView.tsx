import React, { useEffect, useMemo, useState } from 'react';
import { useStore, useRoute, download } from '../store';
import { Modal, ConfirmModal, Empty } from '../common';
import { listExecutions, clearExecutions, executionsCSV, executionsXLSX, listAudit } from '../../../shared/history';
import { toCSV } from '../../../shared/validate';
import type { Execution, AuditEntry } from '../../../shared/types';
import { PageHead, StatusBadge, bytesDownload } from './kit';
import { onLocalChange } from '../../../shared/db';
import { History, Download, Trash2, ScrollText } from 'lucide-react';

export function HistoryView() {
  const s = useStore();
  const [qs] = [new URLSearchParams(location.hash.split('?')[1] || '')];
  const [list, setList] = useState<Execution[]>([]);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [allWs, setAllWs] = useState(false);
  const [sel, setSel] = useState<Execution | null>(null);
  const [clear, setClear] = useState(false);
  const load = () => listExecutions().then((l) => { setList(l); const id = qs.get('id'); if (id) setSel(l.find((x) => x.id === id) || null); });
  useEffect(() => { load(); const off = onLocalChange(({ collections }) => { if (collections.includes('executions')) load(); }); return () => { off(); }; }, []);
  const filtered = useMemo(() => list.filter((e) => (allWs || (e.workspaceId || 'ws_general') === s.ws.id) && (!kind || e.kind === kind) && (!status || e.status === status) && (!q || `${e.name} ${e.host} ${e.recordLabel || ''} ${e.error || ''}`.toLowerCase().includes(q.toLowerCase()))), [list, kind, status, q, allWs, s.ws.id]);
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      <PageHead title="Execution history" icon={<History size={20} />} sub="Every autofill, macro and script run with step-level results. Field values are never stored.">
        <button className="btn" disabled={!filtered.length} onClick={() => download(`k-flow-executions-${new Date().toISOString().slice(0, 10)}.csv`, executionsCSV(filtered), 'text/csv')}><Download size={15} /> CSV</button>
        <button className="btn" disabled={!filtered.length} onClick={() => bytesDownload(`k-flow-executions-${new Date().toISOString().slice(0, 10)}.xlsx`, executionsXLSX(filtered), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}><Download size={15} /> Excel report</button>
        <button className="btn danger" onClick={() => setClear(true)}><Trash2 size={15} /></button>
      </PageHead>
      <div className="row wrap" style={{ marginBottom: 12, gap: 8 }}>
        <input className="input" style={{ width: 260 }} placeholder="Search name, site, record, error…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 150 }} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{['autofill', 'macro', 'script'].map((k) => <option key={k}>{k}</option>)}</select>
        <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All results</option>{['success', 'partial', 'failed', 'stopped', 'running'].map((k) => <option key={k}>{k}</option>)}</select>
        <label className="check"><input type="checkbox" checked={allWs} onChange={(e) => setAllWs(e.target.checked)} /> All workspaces</label>
        <span className="muted grow" style={{ textAlign: 'right' }}>{filtered.length} of {list.length}</span>
      </div>
      {filtered.length ? (
        <div className="card"><table className="list">
          <thead><tr><th>Result</th><th>Automation</th><th>Type</th><th>Record</th><th>Website</th><th>Fields / steps</th><th>Started</th><th>Duration</th></tr></thead>
          <tbody>{filtered.slice(0, 500).map((e) => (
            <tr key={e.id} className="clickable" onClick={() => setSel(e)}>
              <td><StatusBadge status={e.status} /></td><td><b>{e.name}</b>{e.error && <div className="err" style={{ fontSize: 12 }}>{e.error.slice(0, 120)}</div>}</td><td>{e.kind}</td><td>{e.recordLabel}</td><td className="muted">{e.host}</td>
              <td>{e.filled ?? '–'} ok{e.failed ? <span className="err"> · {e.failed} failed</span> : ''}{e.skipped ? <span className="muted"> · {e.skipped} skipped</span> : ''}</td>
              <td className="muted">{new Date(e.startedAt).toLocaleString()}</td><td className="muted">{e.endedAt ? `${((e.endedAt - e.startedAt) / 1000).toFixed(1)} s` : '…'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty icon={<History size={32} />} title="No executions">Runs appear here with their results.</Empty>}
      {sel && (
        <Modal title={sel.name} onClose={() => setSel(null)} width={760}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}><StatusBadge status={sel.status} /><span className="badge">{sel.kind}</span><span className="muted">{new Date(sel.startedAt).toLocaleString()}</span><span className="muted mono">{sel.url}</span></div>
          {sel.error && <div className="err" style={{ marginBottom: 8 }}>{sel.error}</div>}
          <table className="list"><thead><tr><th>#</th><th>Step / field</th><th>Result</th><th>ms</th><th>Message</th></tr></thead>
            <tbody>{(sel.steps || []).map((x, i) => <tr key={i}><td>{x.i + 1}</td><td>{x.label}</td><td><StatusBadge status={x.status} /></td><td className="muted">{x.ms ?? ''}</td><td className="muted">{x.error}</td></tr>)}</tbody></table>
          {sel.logs?.length ? <><div className="label" style={{ marginTop: 12 }}>Log</div><div className="code-out">{sel.logs.join('\n')}</div></> : null}
        </Modal>
      )}
      {clear && <ConfirmModal title="Clear execution history?" danger message="This removes all execution records on this device." onConfirm={async () => { await clearExecutions(); load(); }} onClose={() => setClear(false)} />}
    </div>
  );
}

export function AuditView() {
  const [list, setList] = useState<AuditEntry[]>([]);
  const [q, setQ] = useState('');
  const [, , go] = useRoute();
  const s = useStore();
  useEffect(() => { listAudit().then(setList); const off = onLocalChange(({ collections }) => { if (collections.includes('audit')) listAudit().then(setList); }); return () => { off(); }; }, []);
  const f = list.filter((a) => !q || `${a.action} ${a.resource} ${a.name || ''} ${a.details || ''} ${a.actor}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHead title="Audit log" icon={<ScrollText size={20} />} sub={<>Who created, changed, shared, ran or deleted what on this device{s.org ? <> — organization-wide log under <a href="#/org" onClick={(e) => { e.preventDefault(); go('/org'); }}>Organization</a></> : ''}.</>}>
        <input className="input" style={{ width: 260 }} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={!f.length} onClick={() => download(`k-flow-audit-${new Date().toISOString().slice(0, 10)}.csv`, toCSV([['Time', 'Actor', 'Action', 'Resource', 'Name', 'Details'], ...f.map((a) => [new Date(a.at).toISOString(), a.actor, a.action, a.resource, a.name || '', a.details || ''])]), 'text/csv')}><Download size={15} /> CSV</button>
      </PageHead>
      <div className="card"><table className="list">
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Name</th><th>Details</th></tr></thead>
        <tbody>{f.slice(0, 1000).map((a) => <tr key={a.id}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(a.at).toLocaleString()}</td><td>{a.actor}</td><td><span className="badge">{a.action}</span></td><td>{a.resource}</td><td><b>{a.name}</b></td><td className="muted" style={{ fontSize: 12 }}>{a.details}</td></tr>)}</tbody>
      </table>{!f.length && <div className="muted" style={{ padding: 16 }}>No entries.</div>}</div>
    </div>
  );
}
