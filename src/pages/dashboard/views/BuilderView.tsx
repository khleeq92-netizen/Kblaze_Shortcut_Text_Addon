// AI-assisted automation builder: describe → scan page → generate (AI or the
// offline matcher) → inspect & edit → test (preview on the tab) → save.
import React, { useState } from 'react';
import { useStore, useRoute } from '../store';
import type { DetectedField, AutofillProfile } from '../../../shared/types';
import { PageHead, TabPicker, TargetEditor, send } from './kit';
import { heuristicPlan, aiPlan, draftToRules, type Draft } from '../../../ai/builder';
import { getApiKey } from '../../../ai/keys';
import { newProfile } from './AutofillView';
import { audit } from '../../../shared/history';
import { Wand2, ScanSearch, Sparkles, Cpu, Play, Save, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';

const EXAMPLES = [
  'Create an automation for the FYJC admission portal. Fill student name, date of birth, gender, category, mobile number and address from my imported spreadsheet.',
  'Fill the UDISE+ student profile with name, mother name, father name, DOB, gender, Aadhaar and mobile from the Students dataset.',
  'Prepare a TradingView alert with my entry, stop loss and take profit levels.',
];

export function BuilderView() {
  const s = useStore();
  const [, , go] = useRoute();
  const [desc, setDesc] = useState('');
  const [tab, setTab] = useState<number | null>(null);
  const [fields, setFields] = useState<DetectedField[] | null>(null);
  const [url, setUrl] = useState('');
  const [datasetId, setDatasetId] = useState<string>(s.tables.find(s.inWs)?.id || '');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [testProfileId, setTestProfileId] = useState<string | null>(null);
  const aiOn = s.settings.ai.provider !== 'none' && !s.org?.policies.disableAI;
  const ds = s.tables.find((t) => t.id === datasetId);

  const scan = async () => {
    setErr(''); setBusy('scan');
    try { const r = await send<any>({ type: 'kf/scan', tabId: tab }); setFields(r.fields || []); setUrl(r.url || ''); if (!r.fields?.length) setErr('No form fields found on that page — open the form page (log in first if needed).'); }
    catch (e: any) { setErr(/Receiving end/.test(e.message) ? 'Reload that tab once so K-Flow can read its fields' : e.message); }
    finally { setBusy(''); }
  };
  const input = () => ({ description: desc, url, fields: fields || [], columns: (ds?.columns || []).map((c) => ({ key: c.key, name: c.name })), variables: s.variables.filter((v) => !v.workspaceId || s.inWs(v)).map((v) => ({ name: v.name, label: v.label })) });
  const generate = async (useAI: boolean) => {
    setErr(''); setDraft(null); setTestProfileId(null);
    if (!fields?.length) { setErr('Scan a page first'); return; }
    setBusy(useAI ? 'ai' : 'heur');
    try {
      if (useAI) {
        const key = await getApiKey(s.settings.ai.provider);
        const d = await aiPlan(input(), s.settings.ai, key || '');
        setDraft(d);
        await audit('generate', 'ai', { details: `${s.settings.ai.provider}: ${d.rules.length} rules for ${url}` });
      } else setDraft(heuristicPlan(input()));
    } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(''); }
  };
  const buildProfile = (): AutofillProfile => ({ ...newProfile(s.ws.id, draft!.name), sites: draft!.sites, rules: draftToRules(draft!), datasetId: datasetId || null, description: `Generated from: ${desc.slice(0, 300)}`, tags: [draft!.source === 'ai' ? 'ai-generated' : 'auto-mapped'] });
  const test = async () => {
    if (!draft || tab === null) return;
    // a disabled draft profile is saved so the page can preview it; it is updated on Save
    const p = testProfileId ? { ...buildProfile(), id: testProfileId } : buildProfile();
    p.enabled = false; p.name = `[Draft] ${p.name}`;
    await s.saveRec('autofill', p, { quiet: true });
    setTestProfileId(p.id);
    try { const r = await send<any>({ type: 'kf/autofill/run', tabId: tab, profileId: p.id, preview: true }); if (r?.report) s.toast(`Preview: ${r.report.filled} ready · ${r.report.failed} problem(s) — highlighted on the page`); }
    catch (e: any) { s.toast(e.message, 'error'); }
  };
  const approve = async () => {
    if (!draft) return;
    const p = { ...buildProfile(), ...(testProfileId ? { id: testProfileId } : {}) };
    await s.saveRec('autofill', p, { action: 'create' });
    s.toast('Profile saved');
    go('/autofill/' + p.id);
  };
  const updRule = (i: number, p: any) => setDraft({ ...draft!, rules: draft!.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <PageHead title="AI automation builder" icon={<Wand2 size={20} />} sub="Describe the task, let K-Flow read the form and propose field mappings, then review, test and approve. Works offline with the built-in matcher; AI is optional." />
      <section className="card section">
        <div className="kf-steps"><span className="on">1 Describe</span><span className={fields ? 'on' : ''}>2 Scan form</span><span className={draft ? 'on' : ''}>3 Review rules</span><span className={testProfileId ? 'on' : ''}>4 Test</span><span>5 Save</span></div>
        <div className="field"><label className="label">What should be automated?</label><textarea className="textarea" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={EXAMPLES[0]} />
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => setDesc(x)}>{x.slice(0, 60)}…</button>)}</div></div>
        <div className="grid-2">
          <div className="field"><label className="label">Form page (open it in a tab)</label><div className="row"><TabPicker value={tab} onChange={(t) => setTab(t)} /><button className="btn" disabled={tab === null || busy === 'scan'} onClick={scan}><ScanSearch size={15} /> Scan fields</button></div>{fields && <div className="hint">{fields.length} fields detected on {(() => { try { return new URL(url).hostname; } catch { return url; } })()}</div>}</div>
          <div className="field"><label className="label">Data source</label><select className="select" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}><option value="">Variables only</option>{s.tables.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.columns.length} columns</option>)}</select></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={!fields?.length || !!busy} onClick={() => generate(false)}><Cpu size={15} /> Match offline (no AI)</button>
          <button className="btn primary" disabled={!fields?.length || !!busy || !aiOn} title={aiOn ? '' : 'Configure an AI provider in Settings → AI'} onClick={() => generate(true)}><Sparkles size={15} /> {busy === 'ai' ? 'Generating…' : 'Generate with AI'}</button>
          {!aiOn && <span className="muted" style={{ fontSize: 12.5 }}>AI is not configured — the offline matcher uses labels, field names and a synonym dictionary.</span>}
        </div>
        {aiOn && <div className="hint">Sent to {s.settings.ai.provider}: your description, field labels/names/types{s.settings.ai.allowPageContext ? ' and dropdown options' : ''}, and column/variable names. Never record values, vault secrets or page content.</div>}
        {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      </section>
      {fields && !draft && (
        <section className="card section"><h3 style={{ marginTop: 0 }}>Detected fields</h3>
          <table className="list"><thead><tr><th>Label</th><th>Type</th><th>Name / id</th><th>Options</th></tr></thead><tbody>{fields.slice(0, 200).map((f, i) => <tr key={i}><td>{f.label || <span className="muted">(no label)</span>}{f.required && <span className="req">*</span>}</td><td><span className="badge">{f.kind}</span></td><td className="mono muted">{f.name || f.id}</td><td className="muted" style={{ fontSize: 12 }}>{f.options?.slice(0, 6).map((o) => o.label).join(', ')}</td></tr>)}</tbody></table>
        </section>
      )}
      {draft && (
        <section className="card section">
          <div className="section-head"><div><h3>{draft.rules.length} proposed rules <span className="badge">{draft.source === 'ai' ? 'AI' : 'offline matcher'}</span></h3><div className="muted" style={{ fontSize: 13 }}>Check every mapping. Low-confidence rows are highlighted.</div></div>
            <div className="row" style={{ gap: 6 }}><input className="input" style={{ width: 280 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /><button className="btn" disabled={tab === null || !draft.rules.length} onClick={test}><Play size={15} /> Test (preview)</button><button className="btn primary" disabled={!draft.rules.length} onClick={approve}><Save size={15} /> Approve & save</button></div></div>
          {draft.notes.map((n, i) => <div key={i} className="kf-note warn"><AlertTriangle size={14} /> {n}</div>)}
          <table className="list">
            <thead><tr><th>Field</th><th>Target</th><th>Action</th><th>Value</th><th>Confidence</th><th /></tr></thead>
            <tbody>{draft.rules.map((r, i) => (
              <tr key={i} className={r.confidence < 0.75 ? 'lowconf' : ''}>
                <td><input className="input" value={r.label} onChange={(e) => updRule(i, { label: e.target.value })} /><div className="muted" style={{ fontSize: 11.5 }}>{r.reason}</div></td>
                <td style={{ minWidth: 280 }}><TargetEditor target={r.target as any} onChange={(t) => updRule(i, { target: t })} compact /></td>
                <td><select className="select" value={r.action} onChange={(e) => updRule(i, { action: e.target.value })}>{['fill', 'select', 'radio', 'check', 'uncheck'].map((a) => <option key={a}>{a}</option>)}</select></td>
                <td><input className="input mono" value={r.value} onChange={(e) => updRule(i, { value: e.target.value })} /></td>
                <td>{r.confidence >= 0.75 ? <span className="badge success"><CheckCircle2 size={11} /> {Math.round(r.confidence * 100)}%</span> : <span className="badge warn">{Math.round(r.confidence * 100)}%</span>}</td>
                <td><button className="btn ghost icon sm danger" onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })}><Trash2 size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
