// Overlay iframe (extension origin): snippet picker, fill-in form and
// confirmation dialog. Talks to the hosting content script via postMessage,
// gated by a one-time nonce issued by the background worker.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../ui/theme.css';
import './overlay.css';
import { api } from '../../shared/browser';
import { MSG, OVERLAY_MSG } from '../../shared/constants';
import { getOne, listRecords, recordUsage } from '../../shared/db';
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
    if (kind === 'result') api.runtime.sendMessage({ type: 'qth/overlayResult', nonce, result: data.result });
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
      <div className="logo">Q</div>
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
        <input ref={searchRef} className="ov-search" autoFocus placeholder={tab === 'snippets' ? 'Search snippets by name, shortcut or text…' : 'Search workflows…'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
        <button className="btn ghost icon sm" onClick={() => finish({ type: 'cancel' })} title="Close (Esc)"><X size={15} /></button>
      </div>
      <div className="ov-tabs">
        <button className={tab === 'snippets' ? 'on' : ''} onClick={() => setTab('snippets')}>Snippets ({items.length})</button>
        <button className={tab === 'workflows' ? 'on' : ''} onClick={() => setTab('workflows')}>Autopilot ({wfs.length})</button>
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
  const [data, setData] = useState<{ snippet: Snippet; settings: Settings; snippets: Snippet[]; tables: DataTable[] } | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    (async () => {
      const [snippet, settings, snippets, tables] = await Promise.all([getOne<Snippet>('snippets', snippetId), loadSettings(), listRecords<Snippet>('snippets'), listRecords<DataTable>('tables')]);
      if (!snippet) { setMissing(true); return; }
      applyTheme(settings.theme);
      setData({ snippet, settings, snippets, tables });
    })();
  }, [snippetId]);
  const out = useMemo(() => {
    if (!data) return null;
    return render(data.snippet.content, data.snippet.contentType, buildRenderContext({ settings: data.settings, snippets: data.snippets, tables: data.tables, values, page }));
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
            <div className="hint" style={{ marginTop: 10 }}>QuickText Hub never performs sensitive actions (submitting, sending, purchasing, account changes) without your approval.</div>
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
      {invalid ? <div className="ov-empty">This QuickText window has expired. Close it and try again.</div>
        : !session ? <div className="ov-empty">Loading…</div>
        : session.mode === 'picker' ? <Picker />
        : session.mode === 'confirm' ? <Confirm payload={session.payload} />
        : <Form snippetId={session.snippetId} page={session.page} />}
    </div>
  );
}

if (inWindow) document.body.classList.add('in-window');
createRoot(document.getElementById('root')!).render(<App />);
