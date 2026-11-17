import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useCloud } from '../cloud';
import { ConfirmModal, Empty, Switch } from '../common';
import { PageHead } from './kit';
import { ROLES, ACTIONS, ROLE_LABELS, ACTION_LABELS, DEFAULT_MATRIX, assignableRoles, canManage, roleActions, type Role, type Action, type PermissionPolicy } from '../../../security/permissions';
import { DEFAULT_POLICIES, type OrgPolicies } from '../../../shared/orgState';
import type { Org } from '../../../cloud/org';
import { Building2, Users, ShieldCheck, Laptop, ScrollText, Activity, Plus, Trash2, LogOut, Check, Mail, Share2, RefreshCw } from 'lucide-react';

type Tab = 'members' | 'permissions' | 'policies' | 'devices' | 'shared' | 'audit' | 'activity';

export function OrgView() {
  const s = useStore();
  const { configured, user, mod, syncNow } = useCloud();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [invites, setInvites] = useState<Org[]>([]);
  const [org, setOrg] = useState<Org | null>(null);
  const [tab, setTab] = useState<Tab>('members');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [confirm, setConfirm] = useState<{ title: string; run: () => Promise<any> } | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [perm, setPerm] = useState<PermissionPolicy>({});
  const [pol, setPol] = useState<OrgPolicies>(DEFAULT_POLICIES);
  const load = async () => {
    if (!mod || !user) return;
    try {
      const [o, i] = await Promise.all([mod.org.listMyOrgs(), mod.org.listInvites()]);
      setOrgs(o); setInvites(i);
      const active = o.find((x) => x.id === s.org?.orgId) || null;
      setOrg(active);
      if (active) { setPerm(active.permissions || {}); setPol({ ...DEFAULT_POLICIES, ...(active.policies || {}) }); }
    } catch (e: any) { s.toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, [mod, user, s.org?.orgId]);
  useEffect(() => {
    if (!mod || !org) return;
    if (tab === 'devices') mod.org.listDevices(org.id).then(setRows).catch((e) => s.toast(e.message, 'error'));
    if (tab === 'audit') mod.org.getAudit(org.id).then(setRows).catch((e) => s.toast(e.message, 'error'));
    if (tab === 'activity') mod.org.getActivity(org.id).then(setRows).catch((e) => s.toast(e.message, 'error'));
  }, [tab, org?.id]);
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); s.toast(ok); await load(); await s.reload(); } catch (e: any) { s.toast(e?.code === 'permission-denied' ? 'Not allowed by your role (or the security rules are not deployed)' : e.message, 'error'); } };

  if (!configured || !user) return (
    <div className="page"><PageHead title="Organization" icon={<Building2 size={20} />} sub="Administrators, staff, roles, shared automations, policies, devices and audit logs." />
      <Empty icon={<Building2 size={32} />} title={configured ? 'Sign in to manage your organization' : 'Connect Firebase to enable organizations'}>Organizations need the cloud backend (Settings → Cloud & Account). Everything else in K-Flow works without it.</Empty></div>
  );
  const me = org ? { uid: user.uid, role: (org.ownerUid === user.uid ? 'owner' : org.members[user.uid]) as Role } : null;
  const isAdmin = me && (me.role === 'owner' || me.role === 'admin');
  const mx = (r: Role) => roleActions(r, perm);
  const toggle = (r: Role, a: Action) => {
    const cur = new Set(perm.roles?.[r] || DEFAULT_MATRIX[r]);
    cur.has(a) ? cur.delete(a) : cur.add(a);
    setPerm({ ...perm, roles: { ...(perm.roles || {}), [r]: [...cur] } });
  };
  const shared = [...s.autofill, ...s.macros, ...s.scripts, ...s.snippets, ...s.variables, ...s.tables].filter((x: any) => x.orgId && x.orgId === org?.id);
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHead title="Organization" icon={<Building2 size={20} />} sub="Enterprise administration — enforced in the cloud by Firestore security rules.">
        <select className="select" style={{ width: 260 }} value={org?.id || ''} onChange={(e) => act(() => mod!.org.selectOrg(e.target.value || null), e.target.value ? 'Organization selected' : 'Left organization mode')}>
          <option value="">— No organization (personal) —</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.myRole})</option>)}
        </select>
        <button className="btn" onClick={() => act(async () => { await mod!.org.refreshOrgState(); await syncNow(); }, 'Synced')}><RefreshCw size={15} /></button>
      </PageHead>
      {invites.length > 0 && <section className="card section">{invites.map((o) => <div key={o.id} className="row"><Mail size={16} /><span className="grow">You are invited to <b>{o.name}</b> as <b>{o.invites[(user.email || '').toLowerCase().replace(/\./g, ',')]}</b></span><button className="btn primary sm" onClick={() => act(() => mod!.org.acceptInvite(o), 'Joined organization')}><Check size={13} /> Accept</button></div>)}</section>}
      {!org && (
        <section className="card section" style={{ maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}>Create an organization</h3>
          <p className="muted">You become the owner and can invite administrators and staff, decide who may create, edit, run, share or delete automations, and push policies to every member's K-Flow.</p>
          <div className="row"><input className="input" placeholder="e.g. Dr M.A. Aziz Jr College of Science" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn primary" disabled={!name.trim()} onClick={() => act(async () => { await mod!.org.createOrg(name); setName(''); }, 'Organization created')}><Plus size={14} /> Create</button></div>
        </section>
      )}
      {org && me && (
        <>
          {s.org?.revoked && <div className="kf-note danger">This device has been revoked by an administrator. Organization data was removed from this device.</div>}
          <div className="kf-tabs">
            {([['members', Users, 'Members'], ['permissions', ShieldCheck, 'Permissions'], ['policies', ShieldCheck, 'Policies'], ['devices', Laptop, 'Devices'], ['shared', Share2, 'Shared items'], ['audit', ScrollText, 'Audit log'], ['activity', Activity, 'Activity']] as const).map(([k, Ic, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Ic size={14} /> {l}</button>
            ))}
          </div>
          {tab === 'members' && (
            <section className="card section">
              <table className="list"><thead><tr><th>Member</th><th>Role</th><th /></tr></thead><tbody>
                {Object.entries(org.members).map(([uid, r]) => {
                  const target = { uid, role: (uid === org.ownerUid ? 'owner' : r) as Role };
                  return (
                    <tr key={uid}><td>{org.memberEmails[uid] || uid}{uid === user.uid && <span className="badge" style={{ marginLeft: 6 }}>you</span>}</td>
                      <td>{canManage(me, target) ? <select className="select" style={{ width: 170 }} value={target.role} onChange={(e) => act(() => mod!.org.setRole(org.id, uid, e.target.value as Role), 'Role updated')}>{assignableRoles(me).map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}</select> : <span className="badge primary">{ROLE_LABELS[target.role]}</span>}</td>
                      <td>{canManage(me, target) && <button className="btn ghost sm danger" onClick={() => setConfirm({ title: `Remove ${org.memberEmails[uid] || uid}?`, run: () => mod!.org.removeMember(org.id, uid) })}><Trash2 size={13} /></button>}</td></tr>
                  );
                })}
                {org.inviteEmails.map((e) => <tr key={e}><td className="muted">{e} (invited)</td><td><span className="badge warn">{ROLE_LABELS[org.invites[e.replace(/\./g, ',')]] || 'invited'}</span></td><td>{isAdmin && <button className="btn ghost sm" onClick={() => act(() => mod!.org.revokeInvite(org.id, e), 'Invitation revoked')}>Revoke</button>}</td></tr>)}
              </tbody></table>
              {isAdmin && <div className="row" style={{ marginTop: 12 }}><input className="input" type="email" placeholder="staff@college.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} /><select className="select" style={{ width: 170 }} value={role} onChange={(e) => setRole(e.target.value as Role)}>{assignableRoles(me).map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}</select><button className="btn primary" disabled={!email} onClick={() => act(async () => { await mod!.org.inviteMember(org.id, email, role); setEmail(''); }, 'Invitation created — they accept it after signing in with that email')}>Invite</button></div>}
              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                {me.role !== 'owner' && <button className="btn sm" onClick={() => setConfirm({ title: 'Leave this organization?', run: () => mod!.org.leaveOrg(org.id) })}><LogOut size={13} /> Leave</button>}
                {me.role === 'owner' && <button className="btn sm danger" onClick={() => setConfirm({ title: 'Delete the organization for everyone?', run: () => mod!.org.deleteOrg(org.id) })}><Trash2 size={13} /> Delete organization</button>}
              </div>
            </section>
          )}
          {tab === 'permissions' && (
            <section className="card section">
              <div className="section-head"><div><h3>Role permissions</h3><div className="muted" style={{ fontSize: 13 }}>Applies to shared items. Owners always have every permission.</div></div>{isAdmin && <button className="btn primary" onClick={() => act(() => mod!.org.updatePermissions(org.id, perm), 'Permissions saved')}>Save permissions</button>}</div>
              <div style={{ overflow: 'auto' }}><table className="list kf-matrix"><thead><tr><th>Role</th>{ACTIONS.map((a) => <th key={a}>{ACTION_LABELS[a]}</th>)}</tr></thead>
                <tbody>{ROLES.filter((r) => r !== 'owner').map((r) => <tr key={r}><td><b>{ROLE_LABELS[r]}</b></td>{ACTIONS.map((a) => <td key={a}><input type="checkbox" disabled={!isAdmin || (r === 'admin' && me.role !== 'owner')} checked={mx(r).has(a)} onChange={() => toggle(r, a)} /></td>)}</tr>)}</tbody></table></div>
              <h4>Per-user exceptions</h4>
              <table className="list"><tbody>{Object.keys(org.members).filter((u) => u !== org.ownerUid).map((u) => (
                <tr key={u}><td>{org.memberEmails[u] || u}</td><td>
                  <div className="row wrap" style={{ gap: 6 }}>{(['create', 'edit', 'execute', 'share', 'delete', 'export'] as Action[]).map((a) => {
                    const denied = perm.users?.[u]?.deny?.includes(a);
                    return <label key={a} className="check" style={{ fontSize: 12 }}><input type="checkbox" disabled={!isAdmin} checked={!!denied} onChange={() => { const cur = perm.users?.[u] || {}; const deny = new Set(cur.deny || []); denied ? deny.delete(a) : deny.add(a); setPerm({ ...perm, users: { ...(perm.users || {}), [u]: { ...cur, deny: [...deny] } } }); }} /> deny {ACTION_LABELS[a].toLowerCase()}</label>;
                  })}</div></td></tr>
              ))}</tbody></table>
            </section>
          )}
          {tab === 'policies' && (
            <section className="card section">
              <div className="section-head"><div><h3>Policies (distributed to every member)</h3><div className="muted" style={{ fontSize: 13 }}>Members' extensions apply these on each sync.</div></div>{isAdmin && <button className="btn primary" onClick={() => act(() => mod!.org.updatePolicies(org.id, pol), 'Policies saved')}>Save policies</button>}</div>
              <div className="field"><label className="label">Allowed automation domains (empty = no restriction)</label><input className="input mono" disabled={!isAdmin} value={pol.allowedDomains.join(', ')} onChange={(e) => setPol({ ...pol, allowedDomains: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="udiseplus.gov.in, 11thadmission.org.in" /></div>
              <div className="field"><Switch disabled={!isAdmin} checked={pol.disableScripts} onChange={(v) => setPol({ ...pol, disableScripts: v })} label="Disable custom JavaScript for all members" /></div>
              <div className="field"><Switch disabled={!isAdmin} checked={pol.disableAI} onChange={(v) => setPol({ ...pol, disableAI: v })} label="Disable the AI builder" /></div>
              <div className="field"><Switch disabled={!isAdmin} checked={pol.allowSensitiveSync} onChange={(v) => setPol({ ...pol, allowSensitiveSync: v })} label="Allow passphrase-encrypted sync of sensitive datasets" /></div>
              <div className="field"><Switch disabled={!isAdmin} checked={pol.activityMonitoring} onChange={(v) => setPol({ ...pol, activityMonitoring: v })} label="Activity monitoring (execution summaries, never field values)" /></div>
            </section>
          )}
          {tab === 'devices' && (
            <section className="card section">
              <table className="list"><thead><tr><th>Device</th><th>User</th><th>Last seen</th><th>Status</th><th /></tr></thead><tbody>{rows.map((d) => (
                <tr key={d.id}><td><b>{d.name}</b><div className="muted mono" style={{ fontSize: 11 }}>{d.id}{d.id === s.org?.deviceId ? ' (this device)' : ''}</div></td><td>{d.email}</td><td className="muted">{new Date(d.lastSeen).toLocaleString()}</td><td>{d.revoked ? <span className="badge danger">revoked</span> : <span className="badge success">active</span>}</td>
                  <td>{(isAdmin || s.orgAllowed('manageDevices')) && <button className="btn sm" onClick={() => act(() => mod!.org.setDeviceRevoked(org.id, d.id, !d.revoked), d.revoked ? 'Device restored' : 'Device revoked')}>{d.revoked ? 'Restore' : 'Revoke'}</button>}</td></tr>
              ))}</tbody></table>
              {!rows.length && <div className="muted">No devices registered yet (devices register on their first sync).</div>}
            </section>
          )}
          {tab === 'shared' && (
            <section className="card section">
              <div className="muted" style={{ marginBottom: 10 }}>Share personal items from their editor (“Share” button). Shared items sync to every member; editing them requires the Edit permission.</div>
              <table className="list"><tbody>{shared.map((x: any) => <tr key={x.id}><td><b>{x.name}</b></td><td className="muted">{x.rules ? 'autofill' : x.steps ? 'macro' : x.code !== undefined ? 'script' : x.shortcut !== undefined ? 'snippet' : x.columns ? 'dataset' : 'variable'}</td><td className="muted">v{x.version || 1} · by {x.sharedBy || x.updatedBy || ''}</td></tr>)}</tbody></table>
              {!shared.length && <div className="muted">Nothing shared yet.</div>}
            </section>
          )}
          {(tab === 'audit' || tab === 'activity') && (
            <section className="card section">
              <table className="list"><thead><tr><th>Time</th><th>User</th>{tab === 'audit' ? <><th>Action</th><th>Resource</th><th>Details</th></> : <><th>Automation</th><th>Result</th><th>Site</th></>}</tr></thead>
                <tbody>{rows.map((r) => <tr key={r.id}><td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString()}</td><td>{r.email}</td>{tab === 'audit' ? <><td><span className="badge">{r.action}</span></td><td>{r.resource} <b>{r.name}</b></td><td className="muted">{r.details}</td></> : <><td>{r.kind}: <b>{r.name}</b></td><td>{r.status}{r.failed ? ` · ${r.failed} failed` : ''}</td><td className="muted">{r.host}</td></>}</tr>)}</tbody></table>
              {!rows.length && <div className="muted">No entries (requires the “View audit log” permission).</div>}
            </section>
          )}
        </>
      )}
      {confirm && <ConfirmModal title={confirm.title} danger onConfirm={() => act(confirm.run, 'Done')} onClose={() => setConfirm(null)} message="This cannot be undone." />}
    </div>
  );
}
