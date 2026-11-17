// K-Flow side panel: browse & search snippets, fill forms inline (no popup
// needed on WhatsApp Web), insert into the page or copy, run Autopilot, and
// create snippets quickly — stays open while you work.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../ui/theme.css';
import './sidepanel.css';
import { api } from '../../shared/browser';
import { MSG, STORAGE_KEYS } from '../../shared/constants';
import { listRecords, getAll, recordUsage, onLocalChange, saveRecords } from '../../shared/db';
import { loadSettings, saveSettings, isSiteBlocked } from '../../shared/settings';
import { applyTheme } from '../../ui/theme';
import { render } from '../../engine/render';
import { buildRenderContext } from '../../shared/renderContext';
import { FormRenderer, hasErrors } from '../../ui/FormRenderer';
import { htmlToText, sanitizeHtml } from '../../shared/html';
import { uid } from '../../shared/ids';
import type { Snippet, Folder, DataTable, Settings, Workflow, UsageRecord } from '../../shared/types';
import { Search, Copy, CornerDownLeft, ExternalLink, Play, Plus, Star, Pin, ChevronDown, ChevronRight, Power, Crosshair, Eye, Circle, Pause, Square, SkipForward, SkipBack, FileCode2, Clapperboard, FormInput } from 'lucide-react';
import { resolveVariables, formatOptionsFrom } from '../../automation/variables';
import { unprotectTable } from '../../data/protect';
import { masterKey } from '../../security/vault';
import { recordLabel } from '../../data/sources';
import type { Workspace, Variable } from '../../shared/types';

interface Data { settings: Settings; snippets: Snippet[]; folders: Folder[]; tables: DataTable[]; workflows: Workflow[]; usage: Map<string, UsageRecord>; workspaces: Workspace[]; globals: Record<string, any> }

async function loadData(): Promise<Data> {
  const [settings, snippets, folders, raw, workflows, usage, workspaces, variables] = await Promise.all([
    loadSettings(), listRecords<Snippet>('snippets'), listRecords<Folder>('folders'), listRecords<DataTable>('tables'), listRecords<Workflow>('workflows'), getAll<UsageRecord>('usage'), listRecords<Workspace>('workspaces'), listRecords<Variable>('variables'),
  ]);
  const mk = await masterKey();
  const tables = await Promise.all(raw.map((t) => unprotectTable(t, mk)));
  const ws = settings.activeWorkspaceId;
  const r = resolveVariables(variables, { datasets: tables, fo: formatOptionsFrom(settings), workspaceId: ws, vault: null });
  const { row, record, vault, ...globals } = r.values as any;
  const inWs = (x: { workspaceId?: string }) => (x.workspaceId || 'ws_general') === ws;
  return { settings, snippets: snippets.filter((s) => s.enabled && inWs(s)), folders: folders.filter(inWs), tables, workflows: workflows.filter((w) => w.enabled), usage: new Map(usage.map((u) => [u.snippetId, u])), workspaces, globals };
}

function send<T = any>(msg: any): Promise<T> {
  return api.runtime.sendMessage(msg).then((r: any) => { if (r?.kind === 'error') throw new Error(r.message); return r; });
}

/** Automations for the current page: autofill (with record stepping), macros, scripts, recorder, field selector. */
function PagePanel({ data, flash }: { data: Data; flash: (m: string, err?: boolean) => void }) {
  const [info, setInfo] = useState<any>(null);
  const [all, setAll] = useState(false);
  const load = () => send<any>({ type: 'kf/automation/forPage' }).then(setInfo).catch(() => setInfo(null));
  useEffect(() => {
    load();
    const iv = setInterval(load, 2500);
    const onAct = () => load();
    api.tabs.onActivated.addListener(onAct);
    return () => { clearInterval(iv); api.tabs.onActivated.removeListener(onAct); };
  }, []);
  const err = (e: any) => flash(/Receiving end|Could not establish/.test(e?.message) ? 'Reload this page once so K-Flow can work on it.' : e?.message || String(e), true);
  if (!info) return <div className="muted" style={{ padding: 16 }}>Open a website to see its automations.</div>;
  if (!info.allowed) return <div className="sp-warn">{info.reason}</div>;
  const profiles = info.profiles.filter((p: any) => all || p.matches);
  const macros = info.macros.filter((m: any) => all || m.matches || m.anySite);
  const scripts = info.scripts.filter((x: any) => all || x.matches || x.anySite);
  const fill = (id: string, preview = false) => send({ type: 'kf/autofill/run', profileId: id, preview }).then((r: any) => r?.report && flash(`${preview ? 'Preview' : 'Filled'}: ${r.report.filled} ok · ${r.report.failed} problem(s)`, r.report.failed > 0)).catch(err);
  const move = (datasetId: string, dir: 'next' | 'prev') => send<any>({ type: 'kf/dataset/move', datasetId, dir }).then((r) => { flash(r.ok ? `Record ${r.index + 1}/${r.total}: ${r.label}` : 'No more records', !r.ok); }).catch(err);
  return (
    <>
      {info.official && <div className="sp-warn">Official portal — K-Flow fills fields but asks before every action button. Submit the form yourself.</div>}
      {info.run && (
        <div className="sp-run">
          <b className="grow">▶ {info.run.name}</b><span className="badge">{info.run.status} · step {Number(info.run.step) + 1}</span>
          {info.run.status === 'paused' ? <button className="btn sm" onClick={() => send({ type: 'kf/macro/control', action: 'resume' }).then(load)}><Play size={12} /></button> : <button className="btn sm" onClick={() => send({ type: 'kf/macro/control', action: 'pause' }).then(load)}><Pause size={12} /></button>}
          <button className="btn sm danger" onClick={() => send({ type: 'kf/macro/control', action: 'stop' }).then(load)}><Square size={12} /></button>
        </div>
      )}
      <div className="sp-tools">
        <button className="btn sm" onClick={() => send({ type: 'kf/mapper/start' }).then(() => flash('Click a field on the page to map it')).catch(err)}><Crosshair size={13} /> Map fields</button>
        {info.recording ? <>
          <button className="btn sm danger" onClick={() => send({ type: 'kf/rec/stop', save: true }).then((r: any) => flash(r.saved ? `Macro saved (${r.steps} steps)` : 'Nothing recorded', !r.saved)).catch(err)}><Square size={12} /> Stop ({info.recording.steps})</button>
          <button className="btn sm" onClick={() => send({ type: 'kf/rec/pause', paused: !info.recording.paused }).then(load)}>{info.recording.paused ? 'Resume' : 'Pause'}</button>
        </> : <button className="btn sm" onClick={() => send({ type: 'kf/rec/start' }).then(() => { flash('Recording — use the page normally'); load(); }).catch(err)}><Circle size={12} color="#ef4444" /> Record macro</button>}
        <label className="check" style={{ marginLeft: 'auto', fontSize: 12 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> show all</label>
      </div>
      <div className="sp-sec"><FormInput size={13} /> Autofill</div>
      {profiles.map((p: any) => {
        const ds = p.datasetId ? data.tables.find((t) => t.id === p.datasetId) : null;
        return (
          <div className="sp-item" key={p.id}>
            <div className="sp-item-head"><span className="nm">{p.name}</span>{p.starter && <span className="badge warn">verify</span>}<span className="badge">{p.rules}</span></div>
            {ds && <div className="sp-rec"><button className="btn ghost icon sm" onClick={() => move(ds.id, 'prev')}><SkipBack size={12} /></button><span className="grow">{ds.rows.length ? recordLabel(ds, ds.currentRowId || ds.rows[0].id) : 'dataset empty'}</span><button className="btn ghost icon sm" onClick={() => move(ds.id, 'next')}><SkipForward size={12} /></button></div>}
            <div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => fill(p.id, true)}><Eye size={12} /> Preview</button><button className="btn sm primary" onClick={() => fill(p.id)}><Play size={12} /> Fill</button>{p.shortcut && <span className="kbd">{p.shortcut}</span>}</div>
          </div>
        );
      })}
      {!profiles.length && <div className="muted sp-empty">No profile for {info.host}. Use <b>Map fields</b> to create one.</div>}
      <div className="sp-sec"><Clapperboard size={13} /> Macros</div>
      {macros.map((m: any) => <div className="sp-item" key={m.id}><div className="sp-item-head"><span className="nm">{m.name}</span><span className="badge">{m.steps} steps</span><button className="btn sm primary" onClick={() => send({ type: 'kf/macro/start', macroId: m.id }).then(() => { flash('Macro started'); load(); }).catch(err)}><Play size={12} /> Run</button></div></div>)}
      {!macros.length && <div className="muted sp-empty">No macros for this page.</div>}
      {scripts.length > 0 && <div className="sp-sec"><FileCode2 size={13} /> Scripts</div>}
      {scripts.map((x: any) => <div className="sp-item" key={x.id}><div className="sp-item-head"><span className="nm">{x.name}</span><button className="btn sm" onClick={() => send<any>({ type: 'kf/script/run', scriptId: x.id }).then((r) => flash(r.ok ? `✓ ${x.name}${r.result !== undefined && r.result !== null ? ' → ' + JSON.stringify(r.result).slice(0, 60) : ''}` : `✗ ${r.error?.message}`, !r.ok)).catch(err)}><Play size={12} /> Run</button></div></div>)}
    </>
  );
}

async function activeTab() {
  const [t] = await api.tabs.query({ active: true, currentWindow: true });
  return t;
}

function SnippetCard({ s, data, open, onToggle, flash, page }: { s: Snippet; data: Data; open: boolean; onToggle: () => void; flash: (m: string, err?: boolean) => void; page: any }) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [showErrors, setShowErrors] = useState(false);
  const out = useMemo(() => (open ? render(s.content, s.contentType, { ...buildRenderContext({ settings: data.settings, snippets: data.snippets, tables: data.tables, values, page }), globals: data.globals }) : null), [open, s, values, data, page]);
  const ready = () => {
    if (!out) return null;
    if (out.errors.length) { flash(out.errors[0], true); return null; }
    if (hasErrors(out.form) || out.validation.length) { setShowErrors(true); flash('Please complete the highlighted fields', true); return null; }
    if (!out.text.trim()) { flash('Nothing to insert — fill in your profile (Settings → Profile) if this snippet uses it.', true); return null; }
    return out;
  };
  const insert = async () => {
    const o = ready();
    if (!o) return;
    const tab = await activeTab();
    if (tab?.id === undefined) return;
    try {
      const r: any = await api.tabs.sendMessage(tab.id, { type: MSG.insertText, payload: { text: o.text, html: o.html, isRich: o.isRich, cursorBack: o.cursor === null ? null : o.text.length - o.cursor } }, { frameId: 0 });
      if (r?.ok) { await recordUsage(s.id); flash('Inserted ✓'); setValues({}); setShowErrors(false); }
      else if (r?.error === 'no-field') flash('Click into the text box on the page first, then press Insert.', true);
      else { await copy(); }
    } catch { flash('K-Flow can’t insert on this page — copied instead.', true); await copy(); }
  };
  const copy = async () => {
    const o = ready();
    if (!o) return;
    try {
      if (o.isRich && (window as any).ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([o.html], { type: 'text/html' }), 'text/plain': new Blob([o.text], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(o.text);
      await recordUsage(s.id);
      flash('Copied — paste with Ctrl+V');
    } catch { flash('Clipboard blocked', true); }
  };
  const preview = (s.contentType === 'html' ? htmlToText(s.content) : s.content).replace(/\{\{[^}]*\}\}/g, '…').slice(0, 140);
  return (
    <div className="sp-item">
      <div className="sp-item-head" onClick={onToggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="nm" title={s.name}>{s.pinned && <Pin size={11} />} {s.name}</span>
        {s.favorite && <Star size={12} fill="#f59e0b" color="#f59e0b" />}
        <span className="kbd">{s.shortcut}</span>
      </div>
      {!open && <div className="pv">{preview}</div>}
      {open && out && (
        <div className="sp-open">
          {out.errors.length > 0 && <div className="err" style={{ marginBottom: 8 }}>{out.errors[0]}</div>}
          {out.form.length > 0 && <FormRenderer items={out.form} values={values} onChange={setValues} showErrors={showErrors} autoFocus onSubmitShortcut={insert} />}
          <div className="label">Preview</div>
          {out.isRich ? <div className="preview-box" dangerouslySetInnerHTML={{ __html: sanitizeHtml(out.html) }} /> : <div className="preview-box">{out.text}</div>}
          <div className="sp-actions">
            <button className="btn primary" onClick={insert} title="Insert into the focused text box on the page"><CornerDownLeft size={14} /> Insert</button>
            <button className="btn" onClick={copy}><Copy size={14} /> Copy</button>
            {out.form.length > 0 && <button className="btn ghost" onClick={() => { setValues({}); setShowErrors(false); }}>Reset</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAdd({ data, flash, done }: { data: Data; flash: (m: string, err?: boolean) => void; done: () => void }) {
  const [name, setName] = useState('');
  const [shortcut, setShortcut] = useState('/');
  const [content, setContent] = useState('');
  const [folder, setFolder] = useState('');
  const taken = data.snippets.some((s) => s.shortcut === shortcut);
  const save = async () => {
    if (!name.trim() || shortcut.length < 2 || !content.trim()) { flash('Fill in name, shortcut and text', true); return; }
    if (taken) { flash('That shortcut is already used', true); return; }
    const t = Date.now();
    await saveRecords('snippets', [{ id: uid('snp'), name: name.trim(), shortcut, content, contentType: 'text', folderId: folder || null, enabled: true, favorite: false, pinned: false, tags: [], trigger: 'default', createdAt: t, updatedAt: t, teamId: null } as Snippet]);
    flash(`Saved — type ${shortcut} anywhere`);
    setName(''); setShortcut('/'); setContent('');
    done();
  };
  return (
    <div>
      <div className="field"><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold signal" /></div>
      <div className="field"><label className="label">Shortcut</label><input className={'input mono' + (taken ? ' invalid' : '')} value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ''))} />{taken && <div className="err">Already used</div>}</div>
      <div className="field"><label className="label">Folder</label><select className="select" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">— No folder —</option>{data.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
      <div className="field"><label className="label">Text</label><textarea className="textarea mono" rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder={'Hi {{name}},\nYour payment of {{currency: amount}} is due {{date: due; default=+3d}}.'} /></div>
      <div className="hint" style={{ marginBottom: 10 }}>Use {'{{name}}'} for a fill-in field. More field types and the visual builder are in the dashboard editor.</div>
      <button className="btn primary" onClick={save}><Plus size={14} /> Save snippet</button>
    </div>
  );
}

function App() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<'page' | 'snippets' | 'add'>('page');
  const [q, setQ] = useState('');
  const [view, setView] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ m: string; err?: boolean } | null>(null);
  const [host, setHost] = useState('');
  const [page, setPage] = useState<any>(undefined);

  const reload = () => loadData().then((d) => { applyTheme(d.settings.theme); setData(d); });
  const refreshTab = async () => {
    const t = await activeTab();
    if (t?.id === undefined) return;
    try { const r: any = await api.tabs.sendMessage(t.id, { type: MSG.ping }, { frameId: 0 }); setHost(r?.host || ''); setPage({ url: t.url || '', title: t.title || '', host: r?.host || '' }); }
    catch { setHost(''); }
  };
  useEffect(() => {
    reload();
    refreshTab();
    const off = onLocalChange(() => reload());
    const l = (c: any, a: string) => { if (a === 'local' && (c[STORAGE_KEYS.revision] || c[STORAGE_KEYS.settings])) reload(); };
    api.storage.onChanged.addListener(l);
    const onAct = () => refreshTab();
    api.tabs.onActivated.addListener(onAct);
    api.tabs.onUpdated.addListener(onAct);
    return () => { off(); api.storage.onChanged.removeListener(l); api.tabs.onActivated.removeListener(onAct); api.tabs.onUpdated.removeListener(onAct); };
  }, []);
  const flash = (m: string, err = false) => { setMsg({ m, err }); setTimeout(() => setMsg(null), 3200); };

  const list = useMemo(() => {
    if (!data) return [];
    const ql = q.trim().toLowerCase();
    let l = data.snippets;
    if (view === 'fav') l = l.filter((s) => s.favorite || s.pinned);
    else if (view === 'recent') l = l.filter((s) => data.usage.has(s.id)).sort((a, b) => data.usage.get(b.id)!.lastUsedAt - data.usage.get(a.id)!.lastUsedAt);
    else if (view !== 'all') {
      const ids = new Set([view]);
      let grew = true;
      while (grew) { grew = false; for (const f of data.folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; } }
      l = l.filter((s) => s.folderId && ids.has(s.folderId));
    }
    if (ql) l = l.filter((s) => s.name.toLowerCase().includes(ql) || s.shortcut.toLowerCase().includes(ql) || s.content.toLowerCase().includes(ql) || s.tags.some((t) => t.toLowerCase().includes(ql)));
    if (view !== 'recent') l = [...l].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite) || (data.usage.get(b.id)?.count || 0) - (data.usage.get(a.id)?.count || 0) || a.name.localeCompare(b.name));
    return l;
  }, [data, q, view]);

  if (!data) return <div className="muted" style={{ padding: 20 }}>Loading…</div>;
  const blocked = host ? isSiteBlocked(data.settings, host) : false;
  const dash = (h = '') => api.tabs.create({ url: api.runtime.getURL('dashboard/index.html' + (h ? '#' + h : '')) });
  return (
    <div className="sp">
      <div className="sp-top">
        <b className="sp-brand"><span>K</span> K-Flow</b>
        <select className="select sp-ws" value={data.settings.activeWorkspaceId} onChange={(e) => saveSettings({ activeWorkspaceId: e.target.value })} title="Workspace">{data.workspaces.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <button className="btn sm" title={data.settings.expansionEnabled ? 'Pause shortcut expansion' : 'Resume'} onClick={() => saveSettings({ expansionEnabled: !data.settings.expansionEnabled })}><Power size={13} /> {data.settings.expansionEnabled ? 'On' : 'Off'}</button>
        <button className="btn sm" title="Open dashboard" onClick={() => dash()}><ExternalLink size={13} /></button>
      </div>
      <div className="sp-site">
        {host ? <><span className="grow">{blocked ? 'Disabled on' : 'Page:'} <b>{host}</b></span><button className="btn sm" onClick={() => saveSettings({ blockedSites: blocked ? data.settings.blockedSites.filter((b) => !isSiteBlocked({ ...data.settings, blockedSites: [b] }, host)) : [...data.settings.blockedSites, host] })}>{blocked ? 'Enable here' : 'Disable here'}</button></>
          : <span className="muted">This page can’t be used with K-Flow (browser page) — Copy still works.</span>}
      </div>
      <div className="sp-tabs">
        <button className={tab === 'page' ? 'on' : ''} onClick={() => setTab('page')}>This page</button>
        <button className={tab === 'snippets' ? 'on' : ''} onClick={() => setTab('snippets')}>Snippets ({data.snippets.length})</button>
        <button className={tab === 'add' ? 'on' : ''} onClick={() => setTab('add')}>+ Quick add</button>
      </div>
      <div className="sp-body">
        {tab === 'snippets' && (
          <>
            <div className="sp-filter">
              <div className="search grow" style={{ maxWidth: 'none' }}><Search size={15} /><input className="input" autoFocus placeholder="Search snippets…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <div className="sp-filter">
              <select className="select" value={view} onChange={(e) => setView(e.target.value)}>
                <option value="all">All snippets</option>
                <option value="fav">Pinned & favourites</option>
                <option value="recent">Recently used</option>
                {data.folders.map((f) => <option key={f.id} value={f.id}>📁 {f.name}</option>)}
              </select>
            </div>
            <div className="hint" style={{ marginBottom: 8 }}>Click into a text box on the page, then open a snippet here, fill it in and press <b>Insert</b>.</div>
            {list.map((s) => <SnippetCard key={s.id} s={s} data={data} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} flash={flash} page={page} />)}
            {!list.length && <div className="muted" style={{ padding: 20, textAlign: 'center' }}>No snippets found. <a href="#" onClick={(e) => { e.preventDefault(); dash('/templates'); }}>Browse templates</a></div>}
          </>
        )}
        {tab === 'page' && <PagePanel data={data} flash={flash} />}
        {tab === 'add' && <QuickAdd data={data} flash={flash} done={() => setTab('snippets')} />}
      </div>
      {msg && <div className={'sp-msg' + (msg.err ? ' err' : '')}>{msg.m}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
