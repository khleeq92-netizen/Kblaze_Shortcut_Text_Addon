import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useCloud } from '../cloud';
import { Empty, PlanGate, Section, ConfirmModal, timeAgo } from '../common';
import type { Team, Role } from '../../../cloud/teams';
import { uid } from '../../../shared/ids';
import { Users, Plus, Trash2, LogOut, Check, FolderPlus } from 'lucide-react';

export function TeamView() {
  const { configured, user, mod, syncNow } = useCloud();
  const { can, folders, saveFolder, snippets, usage, toast } = useStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [invites, setInvites] = useState<Team[]>([]);
  const [active, setActive] = useState<string>('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [auditLog, setAudit] = useState<any[]>([]);
  const [teamUsage, setTeamUsage] = useState<any[]>([]);
  const [confirm, setConfirm] = useState<null | { title: string; run: () => Promise<void> }>(null);

  const load = async () => {
    if (!mod || !user) return;
    try {
      const t = await mod.teams.listMyTeams();
      setTeams(t);
      setInvites(await mod.teams.listInvites());
      if (!active && t[0]) setActive(t[0].id);
    } catch (e: any) { toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, [mod, user?.uid]);
  const team = teams.find((t) => t.id === active);
  const admin = team && (team.myRole === 'owner' || team.myRole === 'admin');
  useEffect(() => {
    if (!mod || !team || !admin) { setAudit([]); setTeamUsage([]); return; }
    if (can('auditLogs')) mod.teams.getAudit(team.id).then(setAudit).catch(() => setAudit([]));
    if (can('teamAnalytics')) mod.teams.getTeamUsage(team.id).then(setTeamUsage).catch(() => setTeamUsage([]));
  }, [team?.id, admin]);

  if (!can('teams')) return <div className="page"><div className="page-head"><h2>Team</h2></div><PlanGate feature="teams"><span /></PlanGate></div>;
  if (!configured || !user) return <div className="page"><div className="page-head"><h2>Team</h2></div><Empty icon={<Users size={32} />} title="Sign in to use team workspaces">Teams are stored in your Firebase project. <a href="#/settings?tab=cloud">Configure cloud & sign in</a>.</Empty></div>;

  const act = async (fn: () => Promise<any>, msg: string) => { try { await fn(); toast(msg); await load(); } catch (e: any) { toast(e.message, 'error'); } };
  const teamFolder = team && folders.find((f) => f.teamId === team.id && !f.parentId);
  const teamSnips = team ? snippets.filter((s) => s.teamId === team.id) : [];

  return (
    <div className="page">
      <div className="page-head"><h2>Team workspaces</h2></div>
      {invites.map((t) => (
        <div key={t.id} className="card locked row" style={{ marginBottom: 10 }}>
          <span className="grow">You're invited to <b>{t.name}</b> as {t.inviteRoles[(user.email || '').toLowerCase().replace(/\./g, ',')] || 'member'}.</span>
          <button className="btn primary sm" onClick={() => act(() => mod!.teams.acceptInvite(t), 'Joined team')}><Check size={13} /> Accept</button>
        </div>
      ))}
      <div className="row" style={{ marginBottom: 16 }}>
        <select className="select" style={{ maxWidth: 280 }} value={active} onChange={(e) => setActive(e.target.value)}>
          {!teams.length && <option value="">No teams yet</option>}
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.myRole})</option>)}
        </select>
        <input className="input" style={{ maxWidth: 240 }} placeholder="New team name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" disabled={!name.trim()} onClick={() => act(async () => { const id = await mod!.teams.createTeam(name); setActive(id); setName(''); }, 'Team created')}><Plus size={14} /> Create team</button>
      </div>
      {team && (
        <>
          <Section title="Shared folder" desc="Snippets in the team folder (and its subfolders) sync to every member. Viewers get read-only copies.">
            {teamFolder ? (
              <div className="row"><span className="grow">📁 <b>{teamFolder.name}</b> — {teamSnips.length} shared snippet(s)</span><a className="btn sm" href={'#/folder/' + teamFolder.id}>Open folder</a><button className="btn sm" onClick={() => syncNow().then(() => toast('Synced'))}>Sync now</button></div>
            ) : (
              <button className="btn" disabled={team.myRole === 'viewer'} onClick={() => act(async () => { await saveFolder({ id: uid('fld'), name: team.name, parentId: null, teamId: team.id }); await syncNow(); }, 'Team folder created')}><FolderPlus size={14} /> Create shared team folder</button>
            )}
          </Section>
          <Section title="Members & roles" desc={<>Owner · Admin · Editor · Viewer. Permissions are enforced by Firestore security rules.</>}>
            <table className="list">
              <thead><tr><th>Member</th><th>Role</th><th /></tr></thead>
              <tbody>
                {Object.entries(team.members).map(([mUid, r]) => (
                  <tr key={mUid}>
                    <td>{team.memberEmails[mUid] || mUid}{mUid === user.uid && ' (you)'}</td>
                    <td>{admin && r !== 'owner' && mUid !== user.uid ? (
                      <select className="select" style={{ width: 130 }} value={r} onChange={(e) => act(() => mod!.teams.setRole(team.id, mUid, e.target.value as Role), 'Role updated')}>{(['admin', 'editor', 'viewer'] as Role[]).map((x) => <option key={x}>{x}</option>)}</select>
                    ) : <span className="badge primary">{r}</span>}</td>
                    <td>{admin && r !== 'owner' && mUid !== user.uid && <button className="btn ghost sm danger" onClick={() => setConfirm({ title: 'Remove member?', run: () => mod!.teams.removeMember(team.id, mUid) })}><Trash2 size={13} /></button>}</td>
                  </tr>
                ))}
                {team.inviteEmails.map((e) => (
                  <tr key={e}><td className="muted">{e} (invited)</td><td><span className="badge warn">{team.inviteRoles[e.replace(/\./g, ',')]}</span></td><td>{admin && <button className="btn ghost sm" onClick={() => act(() => mod!.teams.revokeInvite(team.id, e), 'Invite revoked')}>Revoke</button>}</td></tr>
                ))}
              </tbody>
            </table>
            {admin && (
              <div className="row" style={{ marginTop: 12 }}>
                <input className="input" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <select className="select" style={{ width: 130 }} value={role} onChange={(e) => setRole(e.target.value as Role)}>{(['admin', 'editor', 'viewer'] as Role[]).map((x) => <option key={x}>{x}</option>)}</select>
                <button className="btn primary" disabled={!email} onClick={() => act(async () => { await mod!.teams.inviteMember(team.id, email, role); setEmail(''); }, 'Invitation added — they will see it after signing in')}>Invite</button>
              </div>
            )}
            <div className="row" style={{ marginTop: 14 }}>
              {team.myRole !== 'owner' && <button className="btn sm" onClick={() => setConfirm({ title: 'Leave this team?', run: () => mod!.teams.leaveTeam(team.id) })}><LogOut size={13} /> Leave team</button>}
              {team.myRole === 'owner' && <button className="btn sm danger" onClick={() => setConfirm({ title: 'Delete this team for everyone?', run: () => mod!.teams.deleteTeam(team.id) })}><Trash2 size={13} /> Delete team</button>}
            </div>
          </Section>
          {admin && (
            <Section title="Team analytics" desc="Expansions of shared snippets, reported by each member's device.">
              <PlanGate feature="teamAnalytics">
                <div className="row" style={{ marginBottom: 10 }}>
                  <button className="btn sm" onClick={() => act(async () => {
                    const counts: Record<string, number> = {};
                    for (const s of teamSnips) { const u = usage.get(s.id); if (u) counts[s.id] = u.count; }
                    await mod!.teams.reportTeamUsage(team.id, counts);
                  }, 'Usage reported')}>Report my usage</button>
                </div>
                <table className="list"><thead><tr><th>Member</th><th>Expansions</th><th>Updated</th></tr></thead>
                  <tbody>{teamUsage.map((u) => <tr key={u.uid}><td>{u.email}</td><td>{Object.values(u.counts || {}).reduce((a: number, b: any) => a + Number(b), 0)}</td><td>{timeAgo(u.updatedAt)}</td></tr>)}
                    {!teamUsage.length && <tr><td colSpan={3} className="muted">No reports yet.</td></tr>}</tbody></table>
              </PlanGate>
            </Section>
          )}
          {admin && (
            <Section title="Audit log" desc="Append-only record of team administration events.">
              <PlanGate feature="auditLogs">
                <table className="list"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
                  <tbody>{auditLog.map((a) => <tr key={a.id}><td>{new Date(a.at).toLocaleString()}</td><td>{a.email}</td><td className="mono">{a.action}</td><td>{a.detail}</td></tr>)}
                    {!auditLog.length && <tr><td colSpan={4} className="muted">No events.</td></tr>}</tbody></table>
              </PlanGate>
            </Section>
          )}
        </>
      )}
      {confirm && <ConfirmModal title={confirm.title} danger message="This takes effect immediately for all members." onConfirm={() => act(confirm.run, 'Done')} onClose={() => setConfirm(null)} />}
    </div>
  );
}
