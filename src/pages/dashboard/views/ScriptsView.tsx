import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useRoute } from '../store';
import { Empty, ConfirmModal, Switch } from '../common';
import { uid } from '../../../shared/ids';
import type { ScriptRecord } from '../../../shared/types';
import { PageHead, SitesEditor, TabPicker, TagsInput, jsonDownload, send, SearchBox } from './kit';
import { instrument, hasErrors } from '../../../automation/script/instrument';
import { runScriptPayload } from '../../../automation/script/host';
import { resolveVariables, formatOptionsFrom } from '../../../automation/variables';
import { FileCode2, Plus, Trash2, Copy, Download, Save, Play, FlaskConical, BookOpen, ShieldAlert } from 'lucide-react';

export function newScript(workspaceId: string): ScriptRecord {
  const t = Date.now();
  return { id: uid('scr'), name: 'New script', enabled: true, code: "// K-Flow script — runs on the page without extension privileges\nconst name = kf.vars.student_name || 'World';\nkf.log('Hello', name);\nreturn kf.fields().length;", sites: [], runMode: 'manual', timeoutMs: 30000, maxLoopIterations: 10000, tags: [], workspaceId, createdAt: t, updatedAt: t };
}

const API = [
  ['kf.vars / kf.record', 'Variables and the active dataset record (read). kf.setVar(name, value) passes values back to macros.'],
  ['kf.fill(target, value)', 'Fill a field. Target = CSS selector, XPath (//…), name, or the field label.'],
  ['kf.select / kf.check(target, on)', 'Choose an option / tick a checkbox.'],
  ['kf.click(target)', 'Click (submit / pay / delete buttons are refused — use a macro Click step, which asks you).'],
  ['await kf.waitFor(target, ms)', 'Wait for a dynamic element.'],
  ['kf.exists / kf.visible / kf.text / kf.value', 'Page state detection.'],
  ['kf.$(css) / kf.$$(css)', 'Query elements (shadow DOM with " >>> ").'],
  ['kf.fields()', 'All detected form fields with labels and selectors.'],
  ['await kf.sleep(ms) / kf.loop(n, fn)', 'Delays and bounded loops.'],
  ['kf.log / warn / error / inspect(v)', 'Execution log (shown below and in History).'],
  ['kf.today(fmt) / kf.formatDate(v, fmt)', 'Dates, e.g. kf.today("DD/MM/YYYY").'],
  ['kf.assert(cond, msg) / kf.stop(msg)', 'Fail or stop with a message.'],
];

function JsEditor({ value, onChange, errorLine }: { value: string; onChange: (v: string) => void; errorLine?: number }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gut = useRef<HTMLDivElement>(null);
  const lines = value.split('\n').length;
  return (
    <div className="kf-js">
      <div className="kf-js-gutter" ref={gut}>{Array.from({ length: lines }, (_, i) => <div key={i} className={i + 1 === errorLine ? 'err' : ''}>{i + 1}</div>)}</div>
      <textarea ref={ta} spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} onScroll={(e) => { if (gut.current) gut.current.scrollTop = (e.target as HTMLTextAreaElement).scrollTop; }}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const t = e.currentTarget; const s = t.selectionStart; const en = t.selectionEnd;
            const v = t.value.slice(0, s) + '  ' + t.value.slice(en);
            onChange(v);
            requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; });
          }
        }} />
    </div>
  );
}

export function ScriptsView({ id }: { id?: string }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [q, setQ] = useState('');
  const cur = id ? s.scripts.find((x) => x.id === id) : null;
  if (id && cur) return <ScriptEditor script={cur} />;
  const list = s.scripts.filter(s.inWs).filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <PageHead title="JavaScript automation" icon={<FileCode2 size={20} />} sub="Reusable scripts that run in a sandboxed interpreter on the page — no extension privileges, loop & time limits enforced.">
        <SearchBox value={q} onChange={setQ} placeholder="Search scripts…" />
        <button className="btn primary" onClick={async () => { const x = await s.saveRec('scripts', newScript(s.ws.id)); go('/scripts/' + x.id); }}><Plus size={15} /> New script</button>
      </PageHead>
      {!s.settings.security.scriptsEnabled && <div className="kf-note warn"><ShieldAlert size={16} /> Custom JavaScript is turned off in Settings → Security. Scripts can be edited but not run.</div>}
      {list.length ? (
        <div className="kf-cards">
          {list.map((x) => (
            <div key={x.id} className="card kf-card" onClick={() => go('/scripts/' + x.id)}>
              <div className="row"><b className="grow">{x.name}</b>{x.library && <span className="badge primary">library</span>}{!x.enabled && <span className="badge">off</span>}</div>
              <div className="muted kf-card-sub">{x.description || x.code.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'))}</div>
              <div className="row wrap" style={{ gap: 4 }}><span className="badge">{x.code.split('\n').length} lines</span>{x.tags.map((t) => <span key={t} className="badge">{t}</span>)}</div>
            </div>
          ))}
        </div>
      ) : <Empty icon={<FileCode2 size={32} />} title="No scripts yet">Create a script for logic that autofill rules can't express — loops, page checks, calculations.</Empty>}
    </div>
  );
}

function ScriptEditor({ script }: { script: ScriptRecord }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [d, setD] = useState(script);
  const [del, setDel] = useState(false);
  const [tab, setTab] = useState<number | null>(null);
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [fixture, setFixture] = useState('<form>\n  <label for="n">Student Name</label><input id="n" name="student_name">\n  <select name="gender"><option>Male</option><option>Female</option></select>\n</form>');
  useEffect(() => setD(script), [script.id, script.updatedAt]);
  const dirty = JSON.stringify(d) !== JSON.stringify(script);
  const upd = (p: Partial<ScriptRecord>) => setD({ ...d, ...p });
  const analysis = useMemo(() => instrument(d.code), [d.code]);
  const firstErr = analysis.problems.find((p) => p.severity === 'error');
  const save = async () => { try { await s.saveRec('scripts', d); s.toast('Script saved'); } catch (e: any) { s.toast(e.message, 'error'); } };
  const vars = () => {
    const r = resolveVariables(s.variables, { datasets: s.tables, fo: formatOptionsFrom(s.settings), workspaceId: d.workspaceId, scopeRef: d.id, vault: null });
    const { row, record, vault, ...rest } = r.values as any;
    return JSON.parse(JSON.stringify(rest, (_k, v) => (v instanceof Date ? v.toISOString() : v)));
  };
  const dryRun = async () => {
    if (hasErrors(analysis.problems)) return;
    setBusy(true);
    try {
      // detached sandbox document — no access to the extension page or any website
      const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${fixture}</body></html>`, 'text/html');
      const libs = s.scripts.filter((x) => x.library && x.id !== d.id).map((l) => ({ name: l.name, code: instrument(l.code).code })).filter((l) => l.code);
      const r = await runScriptPayload({ code: analysis.code, libraries: libs, vars: vars(), timeoutMs: Math.min(d.timeoutMs, 15000), maxLoopIterations: d.maxLoopIterations }, doc);
      setOut({ ...r, where: 'sandbox', html: doc.body.innerHTML.slice(0, 4000) });
    } finally { setBusy(false); }
  };
  const runOnTab = async () => {
    if (dirty) await save();
    if (tab === null) { s.toast('Choose a tab', 'error'); return; }
    setBusy(true);
    try { const r = await send<any>({ type: 'kf/script/run', tabId: tab, scriptId: d.id }); setOut({ ...r, where: 'tab' }); }
    catch (e: any) { setOut({ ok: false, error: { message: e.message }, logs: [], where: 'tab' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="page-head">
        <input className="name-input" value={d.name} onChange={(e) => upd({ name: e.target.value })} />
        {dirty && <span className="badge warn">Unsaved</span>}
        <button className="btn" onClick={async () => { const c = { ...d, id: uid('scr'), name: d.name + ' (copy)', orgId: null, version: 0 }; await s.saveRec('scripts', c); go('/scripts/' + c.id); }}><Copy size={15} /></button>
        <button className="btn" onClick={() => jsonDownload(`${d.name}.kflow-script.json`, { format: 'k-flow-scripts', version: 1, scripts: [d] })}><Download size={15} /></button>
        <button className="btn danger" onClick={() => setDel(true)}><Trash2 size={15} /></button>
        <button className="btn primary" disabled={!dirty} onClick={save}><Save size={15} /> Save</button>
      </div>
      <div className="kf-cols">
        <div>
          <section className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            <JsEditor value={d.code} onChange={(code) => upd({ code })} errorLine={firstErr?.line || (out && !out.ok ? out.error?.line : undefined)} />
            <div className="kf-problems">
              {!analysis.problems.length ? <span className="ok">✓ No problems · {analysis.loops} loop(s) guarded</span> : analysis.problems.map((p, i) => <div key={i} className={p.severity}>{p.severity === 'error' ? '✗' : '⚠'} {p.line ? `line ${p.line}${p.column ? ':' + p.column : ''} — ` : ''}{p.message}</div>)}
            </div>
          </section>
          <section className="card section">
            <div className="section-head"><h3>Output {out ? <span className="muted">({out.where === 'sandbox' ? 'sandbox' : 'browser tab'})</span> : null}</h3>{out && <span className={'badge ' + (out.ok ? 'success' : 'danger')}>{out.ok ? `ok · ${out.durationMs ?? 0} ms · ${out.steps ?? 0} statements` : 'failed'}</span>}</div>
            {!out && <div className="muted">Run the script to see its log here.</div>}
            {out && (
              <>
                {out.error && <div className="err" style={{ marginBottom: 8 }}>{out.error.line ? `Line ${out.error.line}: ` : ''}{out.error.message}</div>}
                <div className="code-out kf-log">{(out.logs || []).map((l: any, i: number) => <div key={i} className={l.level}>{`[${String(l.at ?? '').padStart(5)}ms${l.line ? ' L' + l.line : ''}] ${l.text}`}</div>)}{!out.logs?.length && <span className="muted">No log output.</span>}</div>
                {'result' in out && out.result !== undefined && <><div className="label" style={{ marginTop: 10 }}>Return value</div><div className="code-out">{JSON.stringify(out.result, null, 2)}</div></>}
                {out.vars && Object.keys(out.vars).length > 0 && <><div className="label" style={{ marginTop: 10 }}>Variables set</div><div className="code-out">{JSON.stringify(out.vars, null, 2)}</div></>}
              </>
            )}
          </section>
        </div>
        <aside>
          <section className="card section">
            <h3 style={{ marginTop: 0 }}>Run</h3>
            <TabPicker value={tab} onChange={(t) => setTab(t)} />
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <button className="btn" disabled={busy || !!firstErr} onClick={dryRun}><FlaskConical size={15} /> Dry run (sandbox)</button>
              <button className="btn primary" disabled={busy || !!firstErr || tab === null || !s.settings.security.scriptsEnabled} onClick={runOnTab}><Play size={15} /> Run on tab</button>
            </div>
            <details style={{ marginTop: 10 }}><summary className="muted">Sandbox HTML for dry runs</summary><textarea className="textarea mono" rows={6} value={fixture} onChange={(e) => setFixture(e.target.value)} /></details>
          </section>
          <section className="card section">
            <h3 style={{ marginTop: 0 }}>Settings</h3>
            <div className="grid-2">
              <div className="field"><label className="label">Timeout (ms)</label><input className="input" type="number" value={d.timeoutMs} onChange={(e) => upd({ timeoutMs: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">Max loop iterations</label><input className="input" type="number" value={d.maxLoopIterations} onChange={(e) => upd({ maxLoopIterations: Number(e.target.value) })} /></div>
            </div>
            <div className="field"><label className="label">Dataset (kf.record)</label><select className="select" value={d.datasetId || ''} onChange={(e) => upd({ datasetId: e.target.value || null })}><option value="">None</option>{s.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="field"><Switch checked={!!d.library} onChange={(v) => upd({ library: v })} label="Library script (its functions are available to every script)" /></div>
            <div className="field"><Switch checked={d.enabled} onChange={(v) => upd({ enabled: v })} label="Enabled" /></div>
            <div className="field"><label className="label">Websites</label><SitesEditor sites={d.sites} onChange={(sites) => upd({ sites })} /></div>
            <div className="field"><label className="label">Description</label><textarea className="textarea" rows={2} value={d.description || ''} onChange={(e) => upd({ description: e.target.value })} /></div>
            <div className="field"><label className="label">Tags</label><TagsInput tags={d.tags} onChange={(tags) => upd({ tags })} /></div>
          </section>
          <section className="card section">
            <h3 style={{ marginTop: 0 }}><BookOpen size={15} /> kf API</h3>
            <table className="list"><tbody>{API.map(([a, b]) => <tr key={a}><td className="mono" style={{ whiteSpace: 'nowrap' }}>{a}</td><td className="muted" style={{ fontSize: 12 }}>{b}</td></tr>)}</tbody></table>
            <div className="hint">Top-level <span className="mono">await</span> and <span className="mono">return</span> are allowed. Vault secrets are never passed to scripts.</div>
          </section>
        </aside>
      </div>
      {del && <ConfirmModal title={`Delete "${d.name}"?`} danger confirmLabel="Delete" message="Macros that run this script will fail." onConfirm={async () => { await s.deleteRec('scripts', [d.id], d.name); go('/scripts'); }} onClose={() => setDel(false)} />}
    </div>
  );
}
