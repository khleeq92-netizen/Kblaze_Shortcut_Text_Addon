import React, { useState } from 'react';
import { useStore } from '../store';
import { Modal, Switch, ConfirmModal } from '../common';
import { uid } from '../../../shared/ids';
import type { Workspace } from '../../../shared/types';
import { PageHead } from './kit';
import { installPresets } from '../../../library/seed';
import { WsIcon } from './Sidebar';
import { Layers, Plus, Pencil, Check, Archive, RotateCcw, PackagePlus } from 'lucide-react';

const COLORS = ['#2563eb', '#059669', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#4f46e5', '#65a30d'];
const ICONS = ['GraduationCap', 'CandlestickChart', 'Sparkles', 'Briefcase', 'Building2', 'HeartPulse', 'ShoppingBag', 'Landmark'];

function WsDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const s = useStore();
  const [d, setD] = useState(ws);
  return (
    <Modal title={ws.name ? `Edit ${ws.name}` : 'New workspace'} onClose={onClose} width={560} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!d.name.trim()} onClick={async () => { await s.saveRec('workspaces', { ...d, workspaceId: undefined } as any); onClose(); }}>Save</button></>}>
      <div className="field"><label className="label">Name</label><input className="input" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
      <div className="field"><label className="label">Description</label><textarea className="textarea" rows={2} value={d.description || ''} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
      <div className="field"><label className="label">Colour</label><div className="row">{COLORS.map((c) => <button key={c} className={'kf-swatch' + (d.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setD({ ...d, color: c })} />)}</div></div>
      <div className="field"><label className="label">Icon</label><div className="row">{ICONS.map((i) => <button key={i} className={'btn icon' + (d.icon === i ? ' primary' : '')} onClick={() => setD({ ...d, icon: i })}><WsIcon name={i} size={16} /></button>)}</div></div>
      <div className="field"><label className="label">Websites this workspace is for (comma separated)</label><input className="input mono" value={d.domains.join(', ')} onChange={(e) => setD({ ...d, domains: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>
      <div className="field"><label className="label">Official / government domains (every action button needs approval)</label><input className="input mono" value={d.officialDomains.join(', ')} onChange={(e) => setD({ ...d, officialDomains: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></div>
      <div className="field"><Switch checked={d.expansionActive} onChange={(v) => setD({ ...d, expansionActive: v })} label="Text expansion active for this workspace's snippets" /></div>
    </Modal>
  );
}

export function WorkspacesView() {
  const s = useStore();
  const [edit, setEdit] = useState<Workspace | null>(null);
  const [arch, setArch] = useState<Workspace | null>(null);
  const counts = (id: string) => {
    const f = (r: { workspaceId?: string }) => (r.workspaceId || 'ws_general') === id;
    return { p: s.autofill.filter(f).length, m: s.macros.filter(f).length, sc: s.scripts.filter(f).length, d: s.tables.filter(f).length, sn: s.snippets.filter(f).length, v: s.variables.filter((v) => v.workspaceId === id).length };
  };
  const missing = (['college', 'trading', 'general'] as const).filter((k) => !s.workspaces.some((w) => w.kind === k));
  return (
    <div className="page">
      <PageHead title="Workspaces" icon={<Layers size={20} />} sub="Each workspace keeps its own profiles, macros, scripts, variables, datasets and templates.">
        {missing.length > 0 && <button className="btn" onClick={async () => { await installPresets({ only: missing as any }); await s.reload(); s.toast('Workspace presets installed'); }}><PackagePlus size={15} /> Restore built-in workspaces</button>}
        <button className="btn primary" onClick={() => setEdit({ id: uid('ws'), name: '', kind: 'custom', color: COLORS[3], icon: 'Briefcase', expansionActive: true, domains: [], officialDomains: [], createdAt: Date.now(), updatedAt: Date.now() })}><Plus size={15} /> New workspace</button>
      </PageHead>
      <div className="kf-ws-grid">
        {s.workspaces.map((w) => {
          const c = counts(w.id);
          const active = w.id === s.ws.id;
          return (
            <div key={w.id} className={'card kf-ws' + (active ? ' on' : '') + (w.archived ? ' arch' : '')} style={{ ['--ws' as any]: w.color }}>
              <div className="row"><div className="kf-ws-ic"><WsIcon name={w.icon} size={20} /></div><div className="grow"><b>{w.name}</b><div className="muted" style={{ fontSize: 12 }}>{w.kind}{w.archived ? ' · archived' : ''}</div></div>
                <button className="btn ghost icon sm" onClick={() => setEdit(w)}><Pencil size={14} /></button></div>
              <div className="muted kf-ws-desc">{w.description}</div>
              <div className="kf-ws-counts"><span><b>{c.p}</b> profiles</span><span><b>{c.m}</b> macros</span><span><b>{c.sc}</b> scripts</span><span><b>{c.d}</b> datasets</span><span><b>{c.v}</b> variables</span><span><b>{c.sn}</b> snippets</span></div>
              <div className="row" style={{ gap: 6 }}>
                {active ? <span className="badge success"><Check size={11} /> Active</span> : <button className="btn sm primary" disabled={w.archived} onClick={() => s.setSettings({ activeWorkspaceId: w.id })}>Switch to</button>}
                <span className="grow" />
                {!w.expansionActive && <span className="badge">expansion off</span>}
                {w.archived ? <button className="btn sm" onClick={() => s.saveRec('workspaces', { ...w, archived: false })}><RotateCcw size={13} /> Restore</button> : !active && <button className="btn sm ghost" onClick={() => setArch(w)}><Archive size={13} /> Archive</button>}
              </div>
            </div>
          );
        })}
      </div>
      {edit && <WsDialog ws={edit} onClose={() => setEdit(null)} />}
      {arch && <ConfirmModal title={`Archive ${arch.name}?`} message="Its automations stop appearing in the side panel and its snippets stop expanding. Nothing is deleted." onConfirm={() => s.saveRec('workspaces', { ...arch, archived: true })} onClose={() => setArch(null)} />}
    </div>
  );
}
