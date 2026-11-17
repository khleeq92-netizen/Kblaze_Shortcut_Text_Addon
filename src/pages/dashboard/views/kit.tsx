// Shared building blocks for the automation views.
import React, { useEffect, useState } from 'react';
import { api } from '../../../shared/browser';
import type { SitePattern, ElementTarget, TargetBy, SiteMatchKind } from '../../../shared/types';
import { describeSite } from '../../../automation/sites';
import { Globe, Plus, X, Play, Eye, MonitorSmartphone, RefreshCw } from 'lucide-react';

export function send<T = any>(msg: any): Promise<T> {
  return api.runtime.sendMessage(msg).then((r: any) => {
    if (r && r.kind === 'error') throw new Error(r.message || r.error);
    if (r && r.error && typeof r.error === 'string' && Object.keys(r).length <= 2) throw new Error(r.error);
    return r as T;
  });
}

export function PageHead({ title, sub, icon, children }: { title: string; sub?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head kf-head">
      {icon && <div className="kf-head-ic">{icon}</div>}
      <div className="grow">
        <h2>{title}</h2>
        {sub && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

const KINDS: { k: SiteMatchKind; label: string; ph: string }[] = [
  { k: 'domain', label: 'Domain', ph: 'udiseplus.gov.in' },
  { k: 'prefix', label: 'URL starts with', ph: 'https://portal.example.com/forms/' },
  { k: 'wildcard', label: 'Wildcard', ph: '*.example.com/apply/*' },
  { k: 'regex', label: 'Regex', ph: '^https://.*\\.gov\\.in/.*' },
];

export function SitesEditor({ sites, onChange, emptyLabel = 'Any website' }: { sites: SitePattern[]; onChange: (s: SitePattern[]) => void; emptyLabel?: string }) {
  const [kind, setKind] = useState<SiteMatchKind>('domain');
  const [v, setV] = useState('');
  const add = () => { if (!v.trim()) return; onChange([...sites, { kind, value: v.trim() }]); setV(''); };
  return (
    <div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        {sites.length ? sites.map((s, i) => (
          <span key={i} className="chip-static"><Globe size={12} /> <span className="muted">{s.kind}</span> {describeSite(s)} <button className="x" onClick={() => onChange(sites.filter((_, j) => j !== i))} title="Remove"><X size={12} /></button></span>
        )) : <span className="badge">{emptyLabel}</span>}
      </div>
      <div className="row">
        <select className="select" style={{ width: 160 }} value={kind} onChange={(e) => setKind(e.target.value as SiteMatchKind)}>{KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}</select>
        <input className="input mono" placeholder={KINDS.find((k) => k.k === kind)?.ph} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}><Plus size={14} /> Add</button>
      </div>
    </div>
  );
}

const BYS: TargetBy[] = ['label', 'css', 'xpath', 'id', 'name', 'regex', 'placeholder', 'aria', 'auto'];
export function TargetEditor({ target, onChange, compact }: { target?: ElementTarget; onChange: (t: ElementTarget) => void; compact?: boolean }) {
  const t = target || { by: 'label' as TargetBy, value: '' };
  return (
    <div className="row" style={{ gap: 6 }}>
      <select className="select" style={{ width: compact ? 96 : 120 }} value={t.by} onChange={(e) => onChange({ ...t, by: e.target.value as TargetBy })} title="How to find the element">{BYS.map((b) => <option key={b}>{b}</option>)}</select>
      <input className="input mono" value={t.value} placeholder={t.by === 'label' ? 'Field label, e.g. Student Name' : t.by === 'css' ? '#id, input[name="x"]' : t.by === 'xpath' ? '//input[@name="x"]' : t.by === 'regex' ? 'birth|dob' : ''} onChange={(e) => onChange({ ...t, value: e.target.value })} />
      {(t.fallbacks?.length || 0) > 0 && <span className="badge" title={t.fallbacks!.map((f) => `${f.by}: ${f.value}`).join('\n')}>+{t.fallbacks!.length} fallback</span>}
    </div>
  );
}

export interface TabInfo { id: number; title: string; url: string; active: boolean }
/** Choose which open browser tab a test run should use. */
export function TabPicker({ value, onChange, filter }: { value: number | null; onChange: (id: number | null, tab?: TabInfo) => void; filter?: (t: TabInfo) => boolean }) {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const load = () => send<TabInfo[]>({ type: 'kf/tabs/list' }).then((t) => {
    const list = (t || []).filter((x) => !filter || filter(x));
    setTabs(list);
    if (value === null && list.length) onChange(list[0].id!, list[0]);
  }).catch(() => setTabs([]));
  useEffect(() => { load(); }, []);
  return (
    <div className="row" style={{ gap: 6 }}>
      <MonitorSmartphone size={15} className="muted" />
      <select className="select" style={{ maxWidth: 360 }} value={value ?? ''} onChange={(e) => { const id = Number(e.target.value); onChange(id, tabs.find((t) => t.id === id)); }}>
        {!tabs.length && <option value="">No web page tabs open</option>}
        {tabs.map((t) => <option key={t.id} value={t.id}>{(t.title || t.url).slice(0, 60)} — {(() => { try { return new URL(t.url).hostname; } catch { return ''; } })()}</option>)}
      </select>
      <button className="btn ghost icon sm" onClick={load} title="Refresh tab list"><RefreshCw size={14} /></button>
    </div>
  );
}

export function RunButtons({ onRun, onPreview, disabled, runLabel = 'Run on tab' }: { onRun: () => void; onPreview?: () => void; disabled?: boolean; runLabel?: string }) {
  return (
    <>
      {onPreview && <button className="btn" disabled={disabled} onClick={onPreview}><Eye size={15} /> Preview</button>}
      <button className="btn primary" disabled={disabled} onClick={onRun}><Play size={15} /> {runLabel}</button>
    </>
  );
}

export function Stat({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon?: React.ReactNode; tone?: 'ok' | 'bad' | 'warn' | 'info' }) {
  return (
    <div className={'card stat kf-stat ' + (tone || '')}>
      <div className="row"><div className="grow l">{label}</div>{icon && <div className="kf-stat-ic">{icon}</div>}</div>
      <div className="v">{value}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = status === 'success' || status === 'done' || status === 'filled' ? 'success' : status === 'failed' || status === 'fail' ? 'danger' : status === 'running' ? 'primary' : 'warn';
  return <span className={'badge ' + cls}>{status}</span>;
}

export function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="row wrap" style={{ gap: 4 }}>
      {tags.map((t) => <span key={t} className="chip-static">{t}<button className="x" onClick={() => onChange(tags.filter((x) => x !== t))}><X size={11} /></button></span>)}
      <input className="input" style={{ width: 140 }} placeholder="Add tag…" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onChange([...new Set([...tags, v.trim()])]); setV(''); } }} />
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="search kf-search"><input className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

export function jsonDownload(name: string, data: any) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function bytesDownload(name: string, data: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([data as any], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
