// Overlay iframe (extension origin): snippet picker, fill-in form and
// confirmation dialog. Talks to the hosting content script via postMessage,
// gated by a one-time nonce issued by the background worker.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../ui/theme.css';
import './overlay.css';
import { api } from '../../shared/browser';
import { MSG, OVERLAY_MSG } from '../../shared/constants';
import { getOne, listRecords, recordUsage, saveRecords } from '../../shared/db';
import { unprotectTable } from '../../data/protect';
import { masterKey } from '../../security/vault';
import { resolveVariables, formatOptionsFrom } from '../../automation/variables';
import { matchesAny, siteFromUrl } from '../../automation/sites';
import { audit } from '../../shared/history';
import { uid } from '../../shared/ids';
import type { AutofillProfile, AutofillRule, Variable, ElementTarget, TargetBy } from '../../shared/types';
import { loadSettings } from '../../shared/settings';
import { applyTheme } from '../../ui/theme';
import { render } from '../../engine/render';
import { buildRenderContext } from '../../shared/renderContext';
import { FormRenderer, hasErrors } from '../../ui/FormRenderer';
import type { Snippet, DataTable, Settings } from '../../shared/types';
import { AlertTriangle, Search, Zap, X } from 'lucide-react';

const hash = new URLSearchParams(location.hash.slice(1));
const nonce = hash.get('nonce') || '';
const parentOrigin = hash.get('origin') || '*';
/** Opened as a popup window (cross-origin-isolated pages such as WhatsApp Web). */
const inWindow = hash.get('window') === '1';

function post(kind: string, data: any = {}) {
  if (inWindow) {
    if (kind === 'result') api.runtime.sendMessage({ type: 'kf/overlayResult', nonce, result: data.result });
    return;
  }
  window.parent.postMessage({ channel: OVERLAY_MSG, nonce, kind, ...data }, parentOrigin);
}
const finish = (result: any) => post('result', { result });

function useAutoResize(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => post('resize', { height: Math.ceil(ref.current!.getBoundingClientRect().height) + 2 }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="ov-head">
      <div className="logo">K</div>
      <h1>{title}</h1>
      <button className="btn ghost icon sm" onClick={onClose} title="Close (Esc)"><X size={15} /></button>
    </div>
  );
}

function Picker() {
  const [items, setItems] = useState<any[]>([]);
  const [wfs, setWfs] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'snippets' | 'workflows'>('snippets');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    api.runtime.sendMessage({ type: MSG.listForAssistant }).then((r: any) => setItems(Array.isArray(r) ? r : []));
    api.runtime.sendMessage({ type: MSG.listWorkflows }).then((r: any) => setWfs(Array.isArray(r) ? r : []));
  }, []);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (tab === 'workflows') return wfs.filter((w) => !ql || w.name.toLowerCase().includes(ql));
    const scored = items
      .filter((s) => !ql || s.name.toLowerCase().includes(ql) || s.shortcut.toLowerCase().includes(ql) || s.preview.toLowerCase().includes(ql))
      .map((s) => ({ s, score: (s.pinned ? 4 : 0) + (s.favorite ? 2 : 0) + (ql && s.shortcut.toLowerCase().startsWith(ql) ? 8 : 0) + Math.min(3, s.count / 10) + (s.lastUsedAt > Date.now() - 864e5 ? 1 : 0) }));
    return scored.sort((a, b) => b.score - a.score || b.s.lastUsedAt - a.s.lastUsedAt).map((x) => x.s);
  }, [items, wfs, q, tab]);
  useEffect(() => setSel(0), [q, tab]);
  useEffect(() => { listRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const choose = (i: number) => {
    const it = filtered[i];
    if (!it) return;
    if (tab === 'workflows') finish({ type: 'runWorkflow', workflowId: it.id });
    else finish({ type: 'pick', snippetId: it.id });
  };
  const searchRef = useRef<HTMLInputElement>(null);
  // Keys typed while focus was still on the page arrive here from the content script.
  const fwd = useRef<(key: string) => void>(() => {});
  fwd.current = (key: string) => {
    searchRef.current?.focus();
    if (key.length === 1) setQ((v) => v + key);
    else if (key === 'Backspace') setQ((v) => v.slice(0, -1));
    else if (key === 'ArrowDown') setSel((s) => Math.min(filtered.length - 1, s + 1));
    else if (key === 'ArrowUp') setSel((s) => Math.max(0, s - 1));
    else if (key === 'Enter') choose(sel);
    else if (key === 'Tab') setTab((t) => (t === 'snippets' ? 'workflows' : 'snippets'));
    else if (key === 'Escape') finish({ type: 'cancel' });
  };
  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.source === window.parent && e.data?.channel === OVERLAY_MSG && e.data.nonce === nonce && e.data.kind === 'key') fwd.current(e.data.key); };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
    else if (e.key === 'Tab') { e.preventDefault(); setTab((t) => (t === 'snippets' ? 'workflows' : 'snippets')); }
  };
  return (
    <>
      <div className="ov-head">
        <Search size={16} className="muted" />
        <input ref={searchRef} className="ov-search" autoFocus placeholder={tab === 'snippets' ? 'Search snippets by name, shortcut or text…' : 'Search macros…'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
        <button className="btn ghost icon sm" onClick={() => finish({ type: 'cancel' })} title="Close (Esc)"><X size={15} /></button>
      </div>
      <div className="ov-tabs">
        <button className={tab === 'snippets' ? 'on' : ''} onClick={() => setTab('snippets')}>Snippets ({items.length})</button>
        <button className={tab === 'workflows' ? 'on' : ''} onClick={() => setTab('workflows')}>Macros ({wfs.length})</button>
      </div>
      {filtered.length ? (
        <ul className="ov-list" ref={listRef}>
          {filtered.map((it, i) => (
            <li key={it.id} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => choose(i)}>
              <span className="nm">{it.pinned ? '📌 ' : ''}{it.name}</span>
              {tab === 'snippets' ? <span className="kbd">{it.shortcut}</span> : <span className="badge primary"><Zap size={11} /> {it.steps.length} steps</span>}
              <span className="pv">{tab === 'snippets' ? (it.contentType === 'html' ? it.preview.replace(/<[^>]+>/g, ' ') : it.preview) : it.description || ''}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ov-empty">{items.length || tab === 'workflows' ? 'No matches' : 'No snippets yet — create some in the dashboard.'}</div>
      )}
      <div className="ov-foot muted" style={{ justifyContent: 'space-between', fontSize: 12 }}>
        <span><span className="kbd">↑↓</span> navigate <span className="kbd">Enter</span> insert <span className="kbd">Tab</span> switch</span>
        <a href="#" onClick={(e) => { e.preventDefault(); api.runtime.sendMessage({ type: MSG.openDashboard }); finish({ type: 'cancel' }); }}>Open dashboard</a>
      </div>
    </>
  );
}

function Form({ snippetId, page }: { snippetId: string; page: any }) {
  const [data, setData] = useState<{ snippet: Snippet; settings: Settings; snippets: Snippet[]; tables: DataTable[]; globals: Record<string, any> } | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    (async () => {
      const [snippet, settings, snippets, raw, variables] = await Promise.all([getOne<Snippet>('snippets', snippetId), loadSettings(), listRecords<Snippet>('snippets'), listRecords<DataTable>('tables'), listRecords<Variable>('variables')]);
      if (!snippet) { setMissing(true); return; }
      applyTheme(settings.theme);
      const mk = await masterKey();
      const tables = await Promise.all(raw.map((t) => unprotectTable(t, mk)));
      const r = resolveVariables(variables, { datasets: tables, fo: formatOptionsFrom(settings), page, workspaceId: snippet.workspaceId || settings.activeWorkspaceId });
      const { row: _r, record: _c, vault: _v, ...globals } = r.values as any;
      setData({ snippet, settings, snippets, tables, globals });
    })();
  }, [snippetId]);
  const out = useMemo(() => {
    if (!data) return null;
    return render(data.snippet.content, data.snippet.contentType, { ...buildRenderContext({ settings: data.settings, snippets: data.snippets, tables: data.tables, values, page }), globals: data.globals });
  }, [data, values, page]);
  if (missing) return <div className="ov-empty">Snippet not found.</div>;
  if (!data || !out) return <div className="ov-empty">Loading…</div>;
  const submit = async () => {
    if (hasErrors(out.form) || out.validation.length || out.errors.length) { setShowErrors(true); return; }
    await recordUsage(data.snippet.id);
    finish({ type: 'submit', snippetId: data.snippet.id, text: out.text, html: out.html, isRich: out.isRich, cursorBack: out.cursor === null ? null : out.text.length - out.cursor });
  };
  const blockingMsgs = [...out.errors, ...(showErrors ? out.validation.filter((v) => !out.form.some((f: any) => f.error && v.startsWith(f.label + ':'))) : [])];
  return (
    <>
      <Header title={`${data.snippet.name}  ·  ${data.snippet.shortcut}`} onClose={() => finish({ type: 'cancel' })} />
      <div className="ov-body" style={{ maxHeight: inWindow ? 'calc(100vh - 110px)' : '58vh' }}>
        {blockingMsgs.length > 0 && <div className="ov-errors">{blockingMsgs.map((m, i) => <div key={i}>{m}</div>)}</div>}
        <FormRenderer items={out.form} values={values} onChange={setValues} showErrors={showErrors} autoFocus onSubmitShortcut={submit} />
        <div className="label" style={{ marginTop: 6 }}>Preview</div>
        {out.isRich ? <div className="preview-box" dangerouslySetInnerHTML={{ __html: out.html }} /> : <div className="preview-box">{out.text}</div>}
      </div>
      <div className="ov-foot">
        <span className="muted grow" style={{ fontSize: 12 }}><span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> to insert</span>
        <button className="btn" onClick={() => finish({ type: 'cancel' })}>Cancel</button>
        <button className="btn primary" onClick={submit}>Insert</button>
      </div>
    </>
  );
}

function Confirm({ payload }: { payload: any }) {
  return (
    <div className="ov-confirm">
      <Header title={payload?.title || 'Confirm action'} onClose={() => finish({ type: 'confirm', ok: false })} />
      <div className="ov-body">
        <div className="warn">
          <AlertTriangle className="ic" size={20} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{payload?.reason || 'Please confirm this step.'}</div>
            <div className="muted">{payload?.detail}</div>
            <div className="hint" style={{ marginTop: 10 }}>K-Flow Automation never performs sensitive actions (submitting, sending, purchasing, account changes) without your approval.</div>
          </div>
        </div>
      </div>
      <div className="ov-foot">
        <button className="btn" autoFocus onClick={() => finish({ type: 'confirm', ok: false })}>Cancel</button>
        <button className="btn primary" onClick={() => finish({ type: 'confirm', ok: true })}>Approve &amp; continue</button>
      </div>
    </div>
  );
}


const KIND_ACTION: Record<string, AutofillRule['action']> = { select: 'select', multiselect: 'select', combobox: 'select', radio: 'radio', checkbox: 'check', button: 'click' };

function MapField({ payload }: { payload: any }) {
  const field = payload?.field || {};
  const url: string = payload?.url || '';
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<AutofillProfile[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profileId, setProfileId] = useState<string>('');
  const [newName, setNewName] = useState(`Autofill ${host}`);
  const [newDataset, setNewDataset] = useState<string>('');
  const [source, setSource] = useState<'column' | 'variable' | 'static' | 'template'>('column');
  const [column, setColumn] = useState('');
  const [variable, setVariable] = useState('');
  const [text, setText] = useState('');
  const [label, setLabel] = useState(field.label || field.name || 'Field');
  const [action, setAction] = useState<AutofillRule['action']>(KIND_ACTION[field.kind] || 'fill');
  const [by, setBy] = useState<TargetBy>(field.target?.by || 'css');
  const [selector, setSelector] = useState<string>(field.target?.value || field.css || '');
  const [condition, setCondition] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      const [ps, vs, ts, st] = await Promise.all([listRecords<AutofillProfile>('autofill'), listRecords<Variable>('variables'), listRecords<DataTable>('tables'), loadSettings()]);
      setProfiles(ps); setVariables(vs); setTables(ts); setSettings(st);
      const pre = ps.find((p) => p.id === payload?.profileId) || ps.find((p) => p.sites.length && matchesAny(p.sites, url) && p.workspaceId === st.activeWorkspaceId) || ps.find((p) => p.sites.length && matchesAny(p.sites, url));
      setProfileId(pre?.id || '__new');
      const ds = ts.find((t) => t.workspaceId === st.activeWorkspaceId) || ts[0];
      setNewDataset(pre?.datasetId || ds?.id || '');
      setReady(true);
    })();
  }, []);
  const profile = profiles.find((p) => p.id === profileId);
  const datasetId = profile ? profile.datasetId || '' : newDataset;
  const ds = tables.find((t) => t.id === datasetId);
  useEffect(() => {
    if (!ds || column) return;
    // suggest the column whose name is closest to the field label
    const want = String(label).toLowerCase().replace(/[^a-z0-9]/g, '');
    const hit = ds.columns.find((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === want) || ds.columns.find((c) => want && (c.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(want) || want.includes(c.key.replace(/_/g, ''))));
    if (hit) setColumn(hit.key);
    else if (!ds.columns.length) setSource('variable');
  }, [ds, label]);
  const value = source === 'column' ? (column ? `{{${column}}}` : '') : source === 'variable' ? (variable ? `{{${variable}}}` : '') : text;
  const save = async (more: boolean) => {
    setErr('');
    if (!selector.trim()) { setErr('Selector is required'); return; }
    if (action !== 'click' && action !== 'check' && action !== 'uncheck' && !value) { setErr('Choose a value for this field'); return; }
    const t = Date.now();
    const target: ElementTarget = { by, value: selector.trim(), fallbacks: (field.target?.fallbacks || []).filter((f: any) => !(f.by === by && f.value === selector.trim())) };
    const rule: AutofillRule = { id: uid('rul'), enabled: true, label: label.trim() || field.kind, target, action, value, overwrite: 'always', fieldKind: field.kind || 'auto', ...(condition.trim() ? { condition: condition.trim() } : {}) };
    let p: AutofillProfile;
    if (profile) {
      const existingIdx = profile.rules.findIndex((r) => r.target.value === target.value && r.target.by === target.by);
      const rules = existingIdx >= 0 ? profile.rules.map((r, i) => (i === existingIdx ? { ...rule, id: r.id } : r)) : [...profile.rules, rule];
      p = { ...profile, rules };
    } else {
      p = { id: uid('afp'), name: newName.trim() || `Autofill ${host}`, enabled: true, sites: [siteFromUrl(url)], rules: [rule], datasetId: newDataset || null, runMode: 'manual', tags: [], workspaceId: settings?.activeWorkspaceId, createdAt: t, updatedAt: t };
    }
    const [saved] = await saveRecords('autofill', [p]);
    await audit(profile ? 'edit' : 'create', 'autofill', { resourceId: saved.id, name: saved.name, details: `mapped field "${rule.label}" (${by})`, workspaceId: saved.workspaceId });
    finish({ type: 'mapped', profileId: saved.id, ruleId: rule.id, more });
  };
  if (!ready) return <div className="ov-empty">Loading…</div>;
  const wsVars = variables.filter((v) => !v.workspaceId || v.workspaceId === (profile?.workspaceId || settings?.activeWorkspaceId));
  return (
    <>
      <Header title="Map field" onClose={() => finish({ type: 'cancel' })} />
      <div className="ov-body map" style={{ maxHeight: inWindow ? 'calc(100vh - 110px)' : '70vh' }}>
        <div className="map-field"><span className="badge primary">{field.kind}</span> <b>{field.label || field.name || '(no label)'}</b>{field.required && <span className="badge warn">required</span>}</div>
        <label className="label">Rule label</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="label">Profile</label>
        <select className="select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {profiles.filter((p) => !p.sites.length || matchesAny(p.sites, url)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.rules.length} rules)</option>)}
          <option value="__new">+ New profile for {host}</option>
          {profiles.some((p) => p.sites.length && !matchesAny(p.sites, url)) && <optgroup label="Other sites">{profiles.filter((p) => p.sites.length && !matchesAny(p.sites, url)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
        </select>
        {profileId === '__new' && (
          <div className="row2">
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Profile name" />
            <select className="select" value={newDataset} onChange={(e) => setNewDataset(e.target.value)}>
              <option value="">No dataset</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <label className="label">Value</label>
        <div className="seg">
          {(['column', 'variable', 'static', 'template'] as const).map((s) => <button key={s} className={source === s ? 'on' : ''} onClick={() => setSource(s)} disabled={s === 'column' && !ds}>{s === 'column' ? 'Dataset column' : s === 'variable' ? 'Variable' : s === 'static' ? 'Fixed text' : 'Template'}</button>)}
        </div>
        {source === 'column' && (ds ? <select className="select" value={column} onChange={(e) => setColumn(e.target.value)}><option value="">Choose a column of “{ds.name}”…</option>{ds.columns.map((c) => <option key={c.key} value={c.key}>{c.name}  ({`{{${c.key}}}`})</option>)}</select> : <div className="hint">This profile has no dataset.</div>)}
        {source === 'variable' && <select className="select" value={variable} onChange={(e) => setVariable(e.target.value)}><option value="">Choose a variable…</option>{wsVars.map((v) => <option key={v.id} value={v.name}>{v.label || v.name} ({`{{${v.name}}}`})</option>)}<option value="me.name">Profile: name</option><option value="me.email">Profile: email</option><option value="me.phone">Profile: phone</option></select>}
        {source === 'static' && (field.options?.length ? <select className="select" value={text} onChange={(e) => setText(e.target.value)}><option value="">Choose…</option>{field.options.map((o: string) => <option key={o}>{o}</option>)}</select> : <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Text to fill" />)}
        {source === 'template' && <textarea className="textarea mono" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. {{first_name}} {{last_name}} or {{upper(student_name)}}" />}
        <div className="row2">
          <div><label className="label">Action</label><select className="select" value={action} onChange={(e) => setAction(e.target.value as any)}>{['fill', 'select', 'radio', 'check', 'uncheck', 'click', 'clear'].map((a) => <option key={a}>{a}</option>)}</select></div>
          <div><label className="label">Target by</label><select className="select" value={by} onChange={(e) => { const b = e.target.value as TargetBy; setBy(b); setSelector(b === 'css' ? field.css : b === 'xpath' ? field.xpath : b === 'id' ? field.id : b === 'name' ? field.name : b === 'label' ? field.label : selector); }}>{['css', 'xpath', 'id', 'name', 'label', 'regex'].map((a) => <option key={a}>{a}</option>)}</select></div>
        </div>
        <label className="label">Selector <span className="muted">(generated automatically — edit if needed)</span></label>
        <input className="input mono" value={selector} onChange={(e) => setSelector(e.target.value)} />
        <details><summary className="muted">Condition (optional)</summary><input className="input mono" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder='e.g. gender = "Female"' /></details>
        {err && <div className="ov-errors">{err}</div>}
      </div>
      <div className="ov-foot">
        <button className="btn" onClick={() => finish({ type: 'cancel' })}>Cancel</button>
        <span className="grow" />
        <button className="btn" onClick={() => save(false)}>Save &amp; finish</button>
        <button className="btn primary" onClick={() => save(true)}>Save &amp; map next</button>
      </div>
    </>
  );
}

function App() {
  const ref = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<any>(null);
  const [invalid, setInvalid] = useState(false);
  useAutoResize(ref);
  useEffect(() => {
    loadSettings().then((s) => applyTheme(s.theme));
    window.focus();
    api.runtime.sendMessage({ type: MSG.claimForm, nonce }).then((r: any) => (r?.ok ? setSession(r) : setInvalid(true)), () => setInvalid(true));
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') finish({ type: 'cancel' }); };
    const refocus = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.channel !== OVERLAY_MSG || e.data.nonce !== nonce || e.data.kind !== 'key') return;
      if (e.data.key === 'Escape') { finish({ type: 'cancel' }); return; }
      const active = document.activeElement;
      if (!active || active === document.body) (document.querySelector('.qform input, .qform select, .qform textarea, .ov-foot .btn') as HTMLElement | null)?.focus();
    };
    window.addEventListener('message', refocus);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="ov fade-in" ref={ref}>
      {invalid ? <div className="ov-empty">This K-Flow window has expired. Close it and try again.</div>
        : !session ? <div className="ov-empty">Loading…</div>
        : session.mode === 'picker' ? <Picker />
        : session.mode === 'confirm' ? <Confirm payload={session.payload} />
        : session.mode === 'mapField' ? <MapField payload={session.payload} />
        : <Form snippetId={session.snippetId} page={session.page} />}
    </div>
  );
}

if (inWindow) document.body.classList.add('in-window');
createRoot(document.getElementById('root')!).render(<App />);
