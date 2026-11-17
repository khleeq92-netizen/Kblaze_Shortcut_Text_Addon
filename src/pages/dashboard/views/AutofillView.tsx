import React, { useEffect, useMemo, useState } from 'react';
import { useStore, useRoute, pickFile } from '../store';
import { Empty, ConfirmModal, Modal, Switch } from '../common';
import { uid } from '../../../shared/ids';
import { listVersions } from '../../../shared/db';
import type { AutofillProfile, AutofillRule, AutofillAction } from '../../../shared/types';
import { PageHead, SitesEditor, TargetEditor, TabPicker, RunButtons, TagsInput, jsonDownload, send, SearchBox } from './kit';
import { describeSite } from '../../../automation/sites';
import { planAutofill } from '../../../automation/autofill';
import { resolveVariables, formatOptionsFrom, activeRecord, rowToRecord } from '../../../automation/variables';
import { recordLabel } from '../../../data/sources';
import { FormInput, Plus, Trash2, Copy, Download, Upload, Save, ArrowUp, ArrowDown, History, Crosshair, AlertTriangle, ShieldCheck, Share2 } from 'lucide-react';

const ACTIONS: AutofillAction[] = ['fill', 'select', 'radio', 'check', 'uncheck', 'click', 'clear', 'focus'];

export function newProfile(workspaceId: string, name = 'New autofill profile'): AutofillProfile {
  const t = Date.now();
  return { id: uid('afp'), name, enabled: true, sites: [], rules: [], datasetId: null, runMode: 'manual', tags: [], fieldDelayMs: 0, workspaceId, createdAt: t, updatedAt: t };
}
export function newRule(): AutofillRule {
  return { id: uid('rul'), enabled: true, label: '', target: { by: 'label', value: '' }, action: 'fill', value: '', overwrite: 'always', fieldKind: 'auto' };
}

function normalizeImported(raw: any, ws: string): AutofillProfile[] {
  const list = Array.isArray(raw) ? raw : raw?.format === 'k-flow-autofill' ? raw.profiles : raw?.rules ? [raw] : null;
  if (!Array.isArray(list)) throw new Error('Not a K-Flow autofill export');
  return list.map((p: any) => ({
    ...newProfile(ws, String(p.name || 'Imported profile').slice(0, 120)),
    description: String(p.description || '').slice(0, 2000),
    sites: Array.isArray(p.sites) ? p.sites.filter((s: any) => s && typeof s.value === 'string').slice(0, 50) : [],
    rules: (Array.isArray(p.rules) ? p.rules : []).slice(0, 500).map((r: any) => ({ ...newRule(), ...r, id: uid('rul'), target: { by: r?.target?.by || 'auto', value: String(r?.target?.value || ''), fallbacks: Array.isArray(r?.target?.fallbacks) ? r.target.fallbacks.slice(0, 5) : undefined } })),
    runMode: p.runMode === 'pageLoad' ? 'pageLoad' : 'manual', tags: Array.isArray(p.tags) ? p.tags.map(String).slice(0, 20) : [], portal: p.portal, academicYear: p.academicYear,
  }));
}

export function AutofillView({ id }: { id?: string }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [q, setQ] = useState('');
  const list = s.autofill.filter(s.inWs).filter((p) => !q || `${p.name} ${p.portal || ''} ${p.sites.map(describeSite).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const cur = id ? s.autofill.find((p) => p.id === id) : null;
  if (id && cur) return <ProfileEditor profile={cur} />;
  const create = async () => { const p = await s.saveRec('autofill', newProfile(s.ws.id)); go('/autofill/' + p.id); };
  const importFile = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try { const ps = normalizeImported(JSON.parse(await f.text()), s.ws.id); for (const p of ps) await s.saveRec('autofill', p, { action: 'import' }); s.toast(`Imported ${ps.length} profile(s)`); } catch (e: any) { s.toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <PageHead title="Autofill profiles" icon={<FormInput size={20} />} sub={<>Rules that fill forms on matching websites — {s.ws.name}. Map fields visually with <b>Alt+Shift+M</b> on any page.</>}>
        <SearchBox value={q} onChange={setQ} placeholder="Search profiles…" />
        <button className="btn" onClick={importFile}><Upload size={15} /> Import</button>
        <button className="btn" disabled={!list.length} onClick={() => jsonDownload(`k-flow-autofill-${s.ws.kind}.json`, { format: 'k-flow-autofill', version: 1, profiles: list })}><Download size={15} /> Export</button>
        <button className="btn primary" onClick={create}><Plus size={15} /> New profile</button>
      </PageHead>
      {list.length ? (
        <div className="kf-cards">
          {list.map((p) => (
            <div key={p.id} className="card kf-card" onClick={() => go('/autofill/' + p.id)}>
              <div className="row"><b className="grow">{p.name}</b>{!p.enabled && <span className="badge">off</span>}{p.starter && <span className="badge warn" title="Starter mapping — verify on the live portal">starter</span>}{p.orgId && <span className="badge primary">shared</span>}</div>
              <div className="muted kf-card-sub">{p.sites.length ? p.sites.map(describeSite).join(', ') : 'Any website'}</div>
              <div className="row wrap" style={{ gap: 4 }}>
                <span className="badge primary">{p.rules.length} rules</span>
                {p.datasetId && <span className="badge">📊 {s.tables.find((t) => t.id === p.datasetId)?.name || 'dataset'}</span>}
                {p.runMode === 'pageLoad' && <span className="badge success">auto</span>}
                {p.shortcut && <span className="kbd">{p.shortcut}</span>}
                {p.portal && <span className="badge">{p.portal}{p.academicYear ? ' · ' + p.academicYear : ''}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon={<FormInput size={32} />} title="No autofill profiles in this workspace">Create one here, or open a form, press <span className="kbd">Alt+Shift+M</span> and click the fields you want K-Flow to fill. The AI builder can also draft one from a description.</Empty>}
    </div>
  );
}

function ProfileEditor({ profile }: { profile: AutofillProfile }) {
  const s = useStore();
  const [, , go] = useRoute();
  const [d, setD] = useState(profile);
  const [del, setDel] = useState(false);
  const [tab, setTab] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState('');
  const [versions, setVersions] = useState<any[] | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  useEffect(() => setD(profile), [profile.id, profile.updatedAt]);
  const dirty = JSON.stringify(d) !== JSON.stringify(profile);
  const canEdit = s.allowed('autofill', profile, 'edit');
  const ds = s.tables.find((t) => t.id === d.datasetId);
  const upd = (p: Partial<AutofillProfile>) => setD({ ...d, ...p });
  const updRule = (i: number, p: Partial<AutofillRule>) => upd({ rules: d.rules.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const move = (i: number, dir: -1 | 1) => { const r = [...d.rules]; const j = i + dir; if (j < 0 || j >= r.length) return; [r[i], r[j]] = [r[j], r[i]]; upd({ rules: r }); };
  const save = async () => { try { await s.saveRec('autofill', d); s.toast('Profile saved'); } catch (e: any) { s.toast(e.message, 'error'); } };

  // live value preview with the selected/active record
  const preview = useMemo(() => {
    const row = ds ? (recordId ? ds.rows.find((r) => r.id === recordId) : activeRecord(ds)) : null;
    const record = ds && row ? rowToRecord(ds, row) : null;
    const fo = formatOptionsFrom(s.settings);
    const vars = resolveVariables(s.variables, { record, datasets: s.tables, fo, workspaceId: d.workspaceId, scopeRef: d.id, vault: null });
    const plan = planAutofill(d, { values: vars.values, fo, url: tabUrl || 'https://example.com/', ctx: { profile: { ...s.settings.profile } as any } });
    return { plan: new Map(plan.map((p) => [p.id, p])), label: ds && row ? recordLabel(ds, row.id) : '' };
  }, [d, ds, recordId, s.variables, s.tables, tabUrl]);

  const run = async (previewMode: boolean) => {
    if (dirty) await save();
    if (tab === null) { s.toast('Open the form in a browser tab first', 'error'); return; }
    try {
      if (recordId && ds) await send({ type: 'kf/dataset/move', datasetId: ds.id, dir: 'set', rowId: recordId });
      const r = await send<any>({ type: 'kf/autofill/run', tabId: tab, profileId: d.id, preview: previewMode });
      if (r?.report) s.toast(`${previewMode ? 'Preview' : 'Autofill'}: ${r.report.filled} ok · ${r.report.failed} problem(s) — see the panel on the page`);
      else s.toast('Started on the page');
    } catch (e: any) { s.toast(/Receiving end|Could not establish/.test(e.message) ? 'K-Flow is not active in that tab yet — reload the page and try again' : e.message, 'error'); }
  };
  const share = async () => {
    try { const m = await import('../../../cloud'); await m.org.shareToOrg('autofill', d); s.toast('Shared with your organization — members receive it on their next sync'); await s.reload(); } catch (e: any) { s.toast(e.message, 'error'); }
  };
  return (
    <div className="page" style={{ maxWidth: 1320 }}>
      <div className="page-head">
        <input className="name-input" value={d.name} onChange={(e) => upd({ name: e.target.value })} disabled={!canEdit} />
        {dirty && <span className="badge warn">Unsaved</span>}
        <button className="btn" onClick={async () => setVersions(await listVersions(d.id))}><History size={15} /> Versions</button>
        <button className="btn" onClick={async () => { const c = { ...d, id: uid('afp'), name: d.name + ' (copy)', orgId: null, version: 0 }; await s.saveRec('autofill', c); go('/autofill/' + c.id); }}><Copy size={15} /> Duplicate</button>
        <button className="btn" onClick={() => jsonDownload(`${d.name}.kflow-autofill.json`, { format: 'k-flow-autofill', version: 1, profiles: [d] })}><Download size={15} /></button>
        {s.org && !d.orgId && s.orgAllowed('share', 'autofill') && <button className="btn" onClick={share}><Share2 size={15} /> Share</button>}
        <button className="btn danger" disabled={!s.allowed('autofill', profile, 'delete')} onClick={() => setDel(true)}><Trash2 size={15} /></button>
        <button className="btn primary" disabled={!dirty || !canEdit} onClick={save}><Save size={15} /> Save</button>
      </div>
      {d.starter && <div className="kf-note warn"><AlertTriangle size={16} /> Starter profile: rules find fields by their on-screen label. Open the portal, run <b>Preview</b>, then fix any red field with the field selector (<span className="kbd">Alt+Shift+M</span>) or by editing its selector. Untick “starter” once verified. <label className="check" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={!d.starter} onChange={(e) => upd({ starter: !e.target.checked })} /> Verified</label></div>}
      <div className="kf-cols">
        <div>
          <section className="card section">
            <div className="grid-2">
              <div className="field"><label className="label">Description</label><textarea className="textarea" rows={2} value={d.description || ''} onChange={(e) => upd({ description: e.target.value })} /></div>
              <div className="field">
                <label className="label">Data source (dataset)</label>
                <select className="select" value={d.datasetId || ''} onChange={(e) => upd({ datasetId: e.target.value || null })}>
                  <option value="">None — use variables / fixed values</option>
                  {s.tables.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.rows.length} records)</option>)}
                </select>
                {ds && <div className="hint">Use columns as <span className="mono">{`{{${ds.columns[0]?.key || 'column'}}}`}</span>. The dataset's active record is used unless you choose one below.</div>}
              </div>
            </div>
            <div className="field"><label className="label">Websites</label><SitesEditor sites={d.sites} onChange={(sites) => upd({ sites })} emptyLabel="Any website (manual runs only)" /></div>
            <div className="grid-3">
              <div className="field"><label className="label">Run</label><select className="select" value={d.runMode} onChange={(e) => upd({ runMode: e.target.value as any })}><option value="manual">Manually (shortcut, side panel, Alt+Shift+F)</option><option value="pageLoad">Automatically when a matching page loads</option></select></div>
              <div className="field"><label className="label">Keyboard shortcut (on the page)</label><input className="input mono" placeholder="e.g. Alt+1" value={d.shortcut || ''} onChange={(e) => upd({ shortcut: e.target.value })} /></div>
              <div className="field"><label className="label">Delay between fields (ms)</label><input className="input" type="number" min={0} max={5000} value={d.fieldDelayMs ?? 0} onChange={(e) => upd({ fieldDelayMs: Number(e.target.value) })} /></div>
            </div>
            <div className="grid-3">
              <div className="field"><label className="label">Portal</label><input className="input" value={d.portal || ''} onChange={(e) => upd({ portal: e.target.value })} placeholder="e.g. UDISE+, FYJC" /></div>
              <div className="field"><label className="label">Academic year</label><input className="input" value={d.academicYear || ''} onChange={(e) => upd({ academicYear: e.target.value })} placeholder="2025-26" /></div>
              <div className="field"><label className="label">Enabled</label><Switch checked={d.enabled} onChange={(v) => upd({ enabled: v })} label={d.enabled ? 'Active' : 'Disabled'} /></div>
            </div>
            <div className="field"><label className="label">Tags</label><TagsInput tags={d.tags} onChange={(tags) => upd({ tags })} /></div>
          </section>

          <section className="card section">
            <div className="section-head"><div><h3>Field rules ({d.rules.length})</h3><div className="muted" style={{ fontSize: 13 }}>Run in order. Values may use <span className="mono">{'{{column}}'}</span>, <span className="mono">{'{{variable}}'}</span>, <span className="mono">{'{{vault.key}}'}</span>, <span className="mono">{'{{me.name}}'}</span> and formulas such as <span className="mono">{'{{= upper(student_name)}}'}</span>.</div></div>
              <button className="btn" onClick={() => upd({ rules: [...d.rules, newRule()] })}><Plus size={14} /> Add rule</button></div>
            {!d.rules.length && <Empty icon={<Crosshair size={28} />} title="No rules yet">Add rules here or use the field selector on the page to click fields.</Empty>}
            {d.rules.map((r, i) => {
              const pv = preview.plan.get(r.id);
              return (
                <div key={r.id} className={'kf-rule' + (r.enabled ? '' : ' off')}>
                  <div className="kf-rule-top">
                    <span className="num">{i + 1}</span>
                    <input className="input" style={{ width: 180 }} placeholder="Label" value={r.label} onChange={(e) => updRule(i, { label: e.target.value })} />
                    <select className="select" style={{ width: 100 }} value={r.action} onChange={(e) => updRule(i, { action: e.target.value as AutofillAction })}>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
                    <div className="grow"><TargetEditor target={r.target} onChange={(target) => updRule(i, { target })} compact /></div>
                    <Switch checked={r.enabled} onChange={(v) => updRule(i, { enabled: v })} />
                    <button className="btn ghost icon sm" onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                    <button className="btn ghost icon sm" onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                    <button className="btn ghost icon sm danger" onClick={() => upd({ rules: d.rules.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
                  </div>
                  <div className="kf-rule-body">
                    <input className="input mono grow" placeholder={['click', 'focus', 'clear', 'check', 'uncheck'].includes(r.action) ? '(no value needed)' : 'Value: text or {{column}}'} value={r.value} onChange={(e) => updRule(i, { value: e.target.value })} />
                    <input className="input mono" style={{ width: 210 }} placeholder='Condition, e.g. gender = "Female"' value={r.condition || ''} onChange={(e) => updRule(i, { condition: e.target.value })} />
                    <select className="select" style={{ width: 120 }} value={r.overwrite} onChange={(e) => updRule(i, { overwrite: e.target.value as any })} title="Existing values"><option value="always">Overwrite</option><option value="ifEmpty">Only if empty</option></select>
                  </div>
                  <div className="kf-rule-foot">
                    <span className={'kf-pv ' + (pv?.error ? 'err' : pv?.skip ? 'skip' : 'ok')}>{pv?.error ? `⚠ ${pv.error}` : pv?.skip ? `⏭ ${pv.skip}` : r.sensitive ? '→ •••• (sensitive)' : `→ ${pv?.value ?? ''}`.slice(0, 120)}</span>
                    <details className="kf-adv"><summary>More</summary>
                      <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
                        <label className="check"><input type="checkbox" checked={!!r.sensitive} onChange={(e) => updRule(i, { sensitive: e.target.checked })} /> Sensitive (mask in logs)</label>
                        <label className="check"><input type="checkbox" checked={!!r.includeHidden} onChange={(e) => updRule(i, { includeHidden: e.target.checked })} /> Fill hidden field</label>
                        <span className="row" style={{ gap: 4 }}>Date format <input className="input mono" style={{ width: 120 }} placeholder="DD/MM/YYYY" value={r.dateFormat || ''} onChange={(e) => updRule(i, { dateFormat: e.target.value || undefined })} /></span>
                        <span className="row" style={{ gap: 4 }}>Wait <input className="input" type="number" style={{ width: 90 }} value={r.waitMs || 0} onChange={(e) => updRule(i, { waitMs: Number(e.target.value) || undefined })} /> ms</span>
                        <span className="row" style={{ gap: 4 }}>Only on page <input className="input mono" style={{ width: 240 }} placeholder="URL prefix (multi-page forms)" value={r.page?.value || ''} onChange={(e) => updRule(i, { page: e.target.value ? { kind: 'prefix', value: e.target.value } : null })} /></span>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
        <aside>
          <section className="card section kf-sticky">
            <h3 style={{ marginTop: 0 }}>Test & run</h3>
            <div className="field"><label className="label">Browser tab</label><TabPicker value={tab} onChange={(id, t) => { setTab(id); setTabUrl(t?.url || ''); }} /></div>
            {ds && (
              <div className="field"><label className="label">Record ({ds.rows.length})</label>
                <select className="select" value={recordId || ds.currentRowId || ''} onChange={(e) => setRecordId(e.target.value)}>{ds.rows.slice(0, 2000).map((r) => <option key={r.id} value={r.id}>{recordLabel(ds, r.id)}</option>)}</select>
                {!ds.rows.length && <div className="hint">This dataset is empty — import your data under Datasets.</div>}
              </div>
            )}
            <div className="row" style={{ gap: 6 }}><RunButtons onRun={() => run(false)} onPreview={() => run(true)} disabled={tab === null || !d.rules.length} runLabel="Fill now" /></div>
            <div className="hint" style={{ marginTop: 10 }}><ShieldCheck size={12} /> Preview highlights each field and validates values without changing the page. Autofill never submits forms; CAPTCHA and OTP fields are always left to you.</div>
            {preview.label && <div className="hint">Previewing values for <b>{preview.label}</b></div>}
          </section>
        </aside>
      </div>
      {del && <ConfirmModal title={`Delete "${d.name}"?`} danger confirmLabel="Delete" message="The profile is removed from this device (and from the cloud on next sync). Version history is kept for 25 versions." onConfirm={async () => { await s.deleteRec('autofill', [d.id], d.name); go('/autofill'); }} onClose={() => setDel(false)} />}
      {versions && (
        <Modal title="Version history" onClose={() => setVersions(null)} width={640}>
          {!versions.length && <div className="muted">No saved versions yet.</div>}
          <table className="list"><tbody>{versions.map((v) => (
            <tr key={v.id}><td>v{v.version}</td><td>{new Date(v.at).toLocaleString()}</td><td className="muted">{v.actor}</td><td>{v.snapshot.rules?.length ?? 0} rules</td>
              <td><button className="btn sm" onClick={() => { setD({ ...v.snapshot, updatedAt: profile.updatedAt, version: profile.version }); setVersions(null); s.toast('Version loaded — review and Save to restore it'); }}>Restore</button></td></tr>
          ))}</tbody></table>
        </Modal>
      )}
    </div>
  );
}
