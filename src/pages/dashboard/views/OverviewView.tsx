import React, { useEffect, useMemo, useState } from 'react';
import { useStore, useRoute } from '../store';
import { useCloud } from '../cloud';
import { listExecutions, listAudit } from '../../../shared/history';
import type { Execution, AuditEntry } from '../../../shared/types';
import { Stat, StatusBadge, TabPicker, send } from './kit';
import { timeAgo } from '../common';
import { describeSite } from '../../../automation/sites';
import { FormInput, Clapperboard, FileCode2, Activity, CheckCircle2, XCircle, Database, Braces, Cloud, CloudOff, Play, Wand2, Crosshair, Circle, AlertTriangle, Zap } from 'lucide-react';

export function OverviewView() {
  const s = useStore();
  const { configured, user, sync } = useCloud();
  const [, , go] = useRoute();
  const [execs, setExecs] = useState<Execution[]>([]);
  const [aud, setAud] = useState<AuditEntry[]>([]);
  const [tab, setTab] = useState<number | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { listExecutions().then(setExecs); listAudit().then((a) => setAud(a.slice(0, 8))); }, [s.autofill, s.macros, s.scripts]);
  const wsExecs = execs.filter((e) => (e.workspaceId || 'ws_general') === s.ws.id);
  const ok = wsExecs.filter((e) => e.status === 'success').length;
  const bad = wsExecs.filter((e) => e.status === 'failed' || e.status === 'partial').length;
  const profiles = s.autofill.filter(s.inWs).filter((p) => !p.name.startsWith('[Draft]'));
  const macros = s.macros.filter(s.inWs);
  const scripts = s.scripts.filter(s.inWs);
  const last14 = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d.getTime(); });
    return days.map((d) => ({ d, ok: wsExecs.filter((e) => e.startedAt >= d && e.startedAt < d + 864e5 && e.status === 'success').length, bad: wsExecs.filter((e) => e.startedAt >= d && e.startedAt < d + 864e5 && e.status !== 'success').length }));
  }, [wsExecs]);
  const max = Math.max(1, ...last14.map((x) => x.ok + x.bad));
  const quick = [...profiles.map((p) => ({ kind: 'autofill' as const, id: p.id, name: p.name, sub: p.sites.map(describeSite).join(', ') || 'any site' })), ...macros.map((m) => ({ kind: 'macro' as const, id: m.id, name: m.name, sub: `${m.steps.length} steps` })), ...scripts.filter((x) => !x.library).map((x) => ({ kind: 'script' as const, id: x.id, name: x.name, sub: 'script' }))]
    .filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  const runQuick = async (x: (typeof quick)[0]) => {
    if (tab === null) { s.toast('Choose a browser tab', 'error'); return; }
    try {
      if (x.kind === 'autofill') await send({ type: 'kf/autofill/run', tabId: tab, profileId: x.id });
      if (x.kind === 'macro') await send({ type: 'kf/macro/start', tabId: tab, macroId: x.id });
      if (x.kind === 'script') { const r = await send<any>({ type: 'kf/script/run', tabId: tab, scriptId: x.id }); s.toast(r.ok ? 'Script finished' : `Script failed: ${r.error?.message}`, r.ok ? 'ok' : 'error'); return; }
      s.toast(`Started “${x.name}”`);
    } catch (e: any) { s.toast(/Receiving end/.test(e.message) ? 'Reload that tab once so K-Flow is active there' : e.message, 'error'); }
  };
  const errors = wsExecs.filter((e) => e.status === 'failed' || e.status === 'partial').slice(0, 5);
  return (
    <div className="page kf-overview">
      <div className="kf-hero" style={{ ['--ws' as any]: s.ws.color }}>
        <div className="grow">
          <div className="kf-hero-k">{s.ws.kind === 'college' ? 'College Administration' : s.ws.kind === 'trading' ? 'Trading & Business' : s.ws.kind === 'general' ? 'General Productivity' : 'Workspace'}</div>
          <h1>{s.ws.name}</h1>
          <div className="kf-hero-sub">{s.ws.description}</div>
        </div>
        <div className="kf-hero-actions">
          <button className="btn" onClick={() => go('/builder')}><Wand2 size={15} /> AI builder</button>
          <button className="btn" onClick={() => go('/macros')}><Circle size={13} /> Record macro</button>
          <button className="btn primary" onClick={() => go('/autofill')}><FormInput size={15} /> Autofill profiles</button>
        </div>
      </div>
      <div className="stat-cards">
        <Stat label="Autofill profiles" value={profiles.length} icon={<FormInput size={18} />} />
        <Stat label="Macros" value={macros.length} icon={<Clapperboard size={18} />} />
        <Stat label="Scripts" value={scripts.length} icon={<FileCode2 size={18} />} />
        <Stat label="Total executions" value={wsExecs.length} icon={<Activity size={18} />} tone="info" />
        <Stat label="Successful" value={ok} icon={<CheckCircle2 size={18} />} tone="ok" />
        <Stat label="Failed / partial" value={bad} icon={<XCircle size={18} />} tone={bad ? 'bad' : undefined} />
      </div>
      <div className="kf-cols">
        <div>
          <section className="card section">
            <div className="section-head"><div><h3>Quick run</h3><div className="muted" style={{ fontSize: 13 }}>Run an automation on an open tab.</div></div><TabPicker value={tab} onChange={(t) => setTab(t)} /></div>
            <input className="input" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
            {!quick.length && <div className="muted">Nothing to run yet in this workspace.</div>}
            <div className="kf-quick">{quick.map((x) => (
              <div key={x.kind + x.id} className="kf-quick-item">
                {x.kind === 'autofill' ? <FormInput size={16} /> : x.kind === 'macro' ? <Clapperboard size={16} /> : <FileCode2 size={16} />}
                <div className="grow"><b>{x.name}</b><div className="muted" style={{ fontSize: 12 }}>{x.sub}</div></div>
                <button className="btn sm primary" onClick={() => runQuick(x)}><Play size={13} /> Run</button>
              </div>
            ))}</div>
          </section>
          <section className="card section">
            <div className="section-head"><h3>Executions — last 14 days</h3><button className="btn sm" onClick={() => go('/history')}>Full history</button></div>
            <div className="bars kf-bars">{last14.map((x) => <div key={x.d} title={`${new Date(x.d).toLocaleDateString()}: ${x.ok} ok, ${x.bad} failed`} style={{ height: `${((x.ok + x.bad) / max) * 100}%` }}><span className="bad" style={{ height: `${x.ok + x.bad ? (x.bad / (x.ok + x.bad)) * 100 : 0}%` }} /></div>)}</div>
            <table className="list" style={{ marginTop: 12 }}><tbody>{wsExecs.slice(0, 8).map((e) => (
              <tr key={e.id}><td><StatusBadge status={e.status} /></td><td><b>{e.name}</b><div className="muted" style={{ fontSize: 12 }}>{e.kind}{e.recordLabel ? ' · ' + e.recordLabel : ''}</div></td><td className="muted">{e.host}</td><td className="muted">{timeAgo(e.startedAt)}</td></tr>
            ))}{!wsExecs.length && <tr><td className="muted">No executions yet.</td></tr>}</tbody></table>
          </section>
        </div>
        <aside>
          <section className="card section">
            <h3 style={{ marginTop: 0 }}>Status</h3>
            <div className="kf-status">
              <div>{configured && user ? <Cloud size={16} /> : <CloudOff size={16} />}<span className="grow">Cloud sync</span><b>{!configured ? 'Local only' : !user ? 'Signed out' : sync.status === 'error' ? 'Error' : sync.lastSyncAt ? timeAgo(sync.lastSyncAt) : sync.status}</b></div>
              <div><Database size={16} /><span className="grow">Datasets</span><b>{s.tables.filter(s.inWs).length}</b></div>
              <div><Braces size={16} /><span className="grow">Variables</span><b>{s.variables.filter((v) => !v.workspaceId || s.inWs(v)).length}</b></div>
              <div><Zap size={16} /><span className="grow">Snippets</span><b>{s.snippets.filter(s.inWs).length}</b></div>
              <div>{s.vaultUnlocked ? '🔓' : '🔒'}<span className="grow">Vault</span><b>{s.vault.length ? (s.vaultUnlocked ? 'unlocked' : 'locked') : 'not set up'}</b></div>
              {s.org && <div>🏢<span className="grow">Organization</span><b>{s.org.orgName} · {s.org.role}</b></div>}
            </div>
            {sync.status === 'error' && <div className="err">{sync.lastError}</div>}
          </section>
          <section className="card section">
            <h3 style={{ marginTop: 0 }}>Needs attention</h3>
            {!errors.length && <div className="muted" style={{ fontSize: 13 }}>✓ No recent failures.</div>}
            {errors.map((e) => <div key={e.id} className="kf-err-item" onClick={() => go('/history?id=' + e.id)}><AlertTriangle size={14} /><div className="grow"><b>{e.name}</b><div className="muted" style={{ fontSize: 12 }}>{e.error || `${e.failed} field problem(s)`}</div></div></div>)}
            {profiles.some((p) => p.starter) && <div className="kf-err-item" onClick={() => go('/autofill')}><Crosshair size={14} /><div className="grow"><b>{profiles.filter((p) => p.starter).length} starter profile(s) to verify</b><div className="muted" style={{ fontSize: 12 }}>Preview them on the live portal and confirm the selectors.</div></div></div>}
            {s.tables.filter(s.inWs).some((t) => !t.rows.length) && <div className="kf-err-item" onClick={() => go('/data')}><Database size={14} /><div className="grow"><b>Empty datasets</b><div className="muted" style={{ fontSize: 12 }}>Import your spreadsheet to use record-wise autofill.</div></div></div>}
          </section>
          <section className="card section">
            <div className="section-head"><h3 style={{ margin: 0 }}>Recent activity</h3><button className="btn sm" onClick={() => go('/audit')}>Audit log</button></div>
            {aud.map((a) => <div key={a.id} className="kf-act"><span className="badge">{a.action}</span> {a.resource} <b>{a.name}</b><span className="muted"> · {timeAgo(a.at)}</span></div>)}
            {!aud.length && <div className="muted" style={{ fontSize: 13 }}>No activity yet.</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
