// Toolbar popup: quick search + copy/insert, per-site pause, Autopilot runner,
// element picker and sync status.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../ui/theme.css';
import { api, storageGet } from '../../shared/browser';
import { MSG, STORAGE_KEYS } from '../../shared/constants';
import { listRecords } from '../../shared/db';
import { loadSettings, saveSettings, isSiteBlocked, loadCloudConfig } from '../../shared/settings';
import { applyTheme } from '../../ui/theme';
import { render } from '../../engine/render';
import { buildRenderContext } from '../../shared/renderContext';
import type { Snippet, DataTable, Settings, Workflow, SyncState } from '../../shared/types';
import { Copy, ExternalLink, Play, Search, Crosshair, Power, Check, Cloud, PanelRight } from 'lucide-react';

const css = `
body{width:380px;min-height:420px;background:var(--kf-bg)}
.top{display:flex;align-items:center;gap:8px;padding:12px;background:var(--kf-brand-grad);color:#fff}
.top b{flex:1;font-size:15px}
.top .btn{background:rgba(255,255,255,.18);border-color:transparent;color:#fff}
.sec{padding:10px 12px}
.list{list-style:none;margin:0;padding:0;max-height:250px;overflow:auto}
.list li{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px}
.list li:hover{background:var(--kf-surface-2)}
.list .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
.tabs{display:flex;gap:4px;margin-bottom:8px}
.tabs button{all:unset;cursor:pointer;padding:4px 10px;border-radius:7px;font-weight:600;font-size:12.5px;color:var(--kf-muted)}
.tabs button.on{background:var(--kf-primary-soft);color:var(--kf-primary)}
.foot{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-top:1px solid var(--kf-border);font-size:12px}
`;

function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [host, setHost] = useState('');
  const [tabId, setTabId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'snippets' | 'automate'>('automate');
  const [page, setPage] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [sync, setSync] = useState<SyncState | null>(null);
  const [cloud, setCloud] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      applyTheme(s.theme);
      setSettings(s);
      setSnippets((await listRecords<Snippet>('snippets')).filter((x) => x.enabled));
      setTables(await listRecords<DataTable>('tables'));
      setWorkflows((await listRecords<Workflow>('workflows')).filter((w) => w.enabled));
      setSync((await storageGet<SyncState>(STORAGE_KEYS.sync)) || null);
      setCloud(!!(await loadCloudConfig()).firebase);
      const [t] = await api.tabs.query({ active: true, currentWindow: true });
      if (t?.id !== undefined) setTabId(t.id);
      // Host is only known if the content script answers (no "tabs" permission needed).
      if (t?.id !== undefined) api.tabs.sendMessage(t.id, { type: MSG.ping }, { frameId: 0 }).then((r: any) => setHost(r?.host || ''), () => setHost(''));
      api.runtime.sendMessage({ type: 'kf/automation/forPage' }).then((r: any) => setPage(r && !r.kind ? r : null), () => setPage(null));
    })();
  }, []);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return snippets.filter((s) => !ql || s.name.toLowerCase().includes(ql) || s.shortcut.toLowerCase().includes(ql) || s.content.toLowerCase().includes(ql)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite)).slice(0, 50);
  }, [snippets, q]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const insert = async (s: Snippet) => {
    if (tabId === null) return;
    try {
      const r: any = await api.tabs.sendMessage(tabId, { type: MSG.insertSnippet, snippetId: s.id }, { frameId: 0 });
      if (r?.ok) window.close();
      else flash(r?.error === 'no-field' ? 'Click into a text field on the page first' : 'Could not insert here');
    } catch { flash('K-Flow cannot run on this page'); }
  };
  const copy = async (s: Snippet) => {
    if (!settings) return;
    const out = render(s.content, s.contentType, buildRenderContext({ settings, snippets, tables }));
    if (out.needsForm) { flash('This snippet has a form — use Insert or the assistant'); return; }
    if (out.errors.length) { flash(out.errors[0]); return; }
    try {
      if (out.isRich && (window as any).ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([out.html], { type: 'text/html' }), 'text/plain': new Blob([out.text], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(out.text);
      flash('Copied to clipboard');
    } catch { flash('Clipboard blocked'); }
  };
  const act = async (msg: any, close = true) => {
    try { const r: any = await api.runtime.sendMessage(msg); if (r?.kind === 'error') throw new Error(r.message); if (close) window.close(); return r; }
    catch (e: any) { flash(/Receiving end/.test(e?.message) ? 'Reload the page once so K-Flow can work on it' : e?.message || 'Not available on this page'); }
  };
  const blocked = settings && host ? isSiteBlocked(settings, host) : false;
  const toggleSite = async () => {
    if (!settings || !host) return;
    const next = blocked ? settings.blockedSites.filter((b) => !isSiteBlocked({ ...settings, blockedSites: [b] }, host)) : [...settings.blockedSites, host];
    setSettings(await saveSettings({ blockedSites: next }));
  };
  const toggleAll = async () => settings && setSettings(await saveSettings({ expansionEnabled: !settings.expansionEnabled }));
  const dash = (h = '') => { api.tabs.create({ url: api.runtime.getURL('dashboard/index.html' + (h ? '#' + h : '')) }); window.close(); };

  return (
    <>
      <style>{css}</style>
      <div className="top">
        <b>K-Flow Automation</b>
        <button className="btn sm" title={settings?.expansionEnabled ? 'Pause all expansion' : 'Resume expansion'} onClick={toggleAll}><Power size={14} /> {settings?.expansionEnabled ? 'On' : 'Off'}</button>
        {(api as any).sidePanel?.open && <button className="btn sm" title="Open side panel (Alt+Shift+S)" onClick={async () => { const w = await api.windows.getCurrent(); await (api as any).sidePanel.open({ windowId: w.id }); window.close(); }}><PanelRight size={14} /></button>}
        <button className="btn sm" onClick={() => dash()} title="Open dashboard"><ExternalLink size={14} /></button>
      </div>
      {host && (
        <div className="sec row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--kf-border)' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>{blocked ? 'Expansion disabled on' : 'Active on'} <b>{host}</b></span>
          <button className="btn sm" onClick={toggleSite}>{blocked ? 'Enable here' : 'Disable here'}</button>
        </div>
      )}
      <div className="sec">
        <div className="tabs">
          <button className={tab === 'automate' ? 'on' : ''} onClick={() => setTab('automate')}>This page</button>
          <button className={tab === 'snippets' ? 'on' : ''} onClick={() => setTab('snippets')}>Snippets</button>
        </div>
        {tab === 'snippets' ? (
          <>
            <div className="row" style={{ marginBottom: 6 }}>
              <Search size={15} className="muted" />
              <input className="input" autoFocus placeholder="Search snippets…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="list">
              {filtered.map((s) => (
                <li key={s.id}>
                  <span className="nm" title={s.name}>{s.name}</span>
                  <span className="kbd">{s.shortcut}</span>
                  <button className="btn ghost icon sm" title="Copy output" onClick={() => copy(s)}><Copy size={14} /></button>
                  <button className="btn ghost icon sm" title="Insert into focused field" onClick={() => insert(s)}><Check size={14} /></button>
                </li>
              ))}
              {!filtered.length && <li className="muted">No snippets found</li>}
            </ul>
          </>
        ) : (
          <>
            {!page ? <div className="muted" style={{ padding: 8 }}>Open a website to automate it.</div> : !page.allowed ? <div className="badge warn">{page.reason}</div> : (
              <>
                <div className="row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <button className="btn sm primary" onClick={() => act({ type: 'kf/autofill/run', profileId: page.profiles.find((p: any) => p.matches)?.id })} disabled={!page.profiles.some((p: any) => p.matches)}><Play size={13} /> Autofill page</button>
                  <button className="btn sm" onClick={() => act({ type: 'kf/mapper/start' })}><Crosshair size={14} /> Map fields</button>
                  {page.recording ? <button className="btn sm danger" onClick={() => act({ type: 'kf/rec/stop', save: true })}>■ Stop recording</button> : <button className="btn sm" onClick={() => act({ type: 'kf/rec/start' })}>● Record</button>}
                </div>
                <ul className="list">
                  {page.profiles.filter((p: any) => p.matches).map((p: any) => <li key={p.id}><span className="nm">📝 {p.name}</span><button className="btn ghost sm" onClick={() => act({ type: 'kf/autofill/run', profileId: p.id, preview: true })}>Preview</button><button className="btn sm primary" onClick={() => act({ type: 'kf/autofill/run', profileId: p.id })}>Fill</button></li>)}
                  {page.macros.filter((m: any) => m.matches || m.anySite).slice(0, 8).map((m: any) => <li key={m.id}><span className="nm">🎬 {m.name}</span><button className="btn sm" onClick={() => act({ type: 'kf/macro/start', macroId: m.id })}><Play size={12} /> Run</button></li>)}
                  {!page.profiles.some((p: any) => p.matches) && !page.macros.length && <li className="muted">No automations for {page.host} yet — use Map fields or Record.</li>}
                </ul>
                {page.official && <div className="hint">Official portal: K-Flow will ask before every action button.</div>}
              </>
            )}
          </>
        )}
        {msg && <div className="badge primary" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      <div className="foot muted">
        <span><Cloud size={12} /> {!cloud ? 'Local only' : sync?.lastSyncAt ? `Synced ${new Date(sync.lastSyncAt).toLocaleTimeString()}` : sync?.status === 'error' ? 'Sync error' : 'Not synced yet'}</span>
        <span>Assistant: <span className="kbd">{settings?.assistantHotkey}</span></span>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
