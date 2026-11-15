// Team workspaces (Business / Enterprise plans): members, roles, shared folders,
// audit log and team analytics. Authorization is enforced server-side by
// firebase/firestore.rules; the client checks roles only for UX.
import { collection, doc, getDocs, query, where, setDoc, updateDoc, getDoc, addDoc, deleteField, arrayUnion, arrayRemove, orderBy, limit as qlimit, increment, deleteDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';

export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer'];
export const ROLE_INFO: Record<Role, string> = {
  owner: 'Full control, billing-ready, can delete the team',
  admin: 'Manage members, roles and all shared snippets; view audit log & analytics',
  editor: 'Create and edit shared snippets and folders',
  viewer: 'Use shared snippets (read-only)',
};

export interface Team {
  id: string;
  name: string;
  ownerUid: string;
  members: Record<string, Role>;
  memberUids: string[];
  memberEmails: Record<string, string>;
  inviteEmails: string[];
  inviteRoles: Record<string, Role>;
  createdAt: number;
  myRole?: Role;
}

export const emailKey = (e: string) => e.trim().toLowerCase().replace(/\./g, ',');

async function ctx() {
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!fb || !u) throw new Error('Sign in to use team workspaces.');
  return { db: fb.db, user: u };
}

export async function listMyTeams(): Promise<Team[]> {
  const { db, user } = await ctx();
  const snap = await getDocs(query(collection(db, 'teams'), where('memberUids', 'array-contains', user.uid)));
  return snap.docs.map((d) => ({ ...(d.data() as Team), id: d.id, myRole: (d.data() as Team).members[user.uid] }));
}

export async function listInvites(): Promise<Team[]> {
  const { db, user } = await ctx();
  if (!user.email) return [];
  const snap = await getDocs(query(collection(db, 'teams'), where('inviteEmails', 'array-contains', user.email.toLowerCase())));
  return snap.docs.map((d) => ({ ...(d.data() as Team), id: d.id }));
}

export async function audit(teamId: string, action: string, detail = '') {
  const { db, user } = await ctx();
  await addDoc(collection(db, `teams/${teamId}/audit`), { at: Date.now(), uid: user.uid, email: user.email || '', action, detail: detail.slice(0, 500) }).catch(() => {});
}

export async function createTeam(name: string): Promise<string> {
  const { db, user } = await ctx();
  const ref = doc(collection(db, 'teams'));
  await setDoc(ref, {
    name: name.trim().slice(0, 100), ownerUid: user.uid, members: { [user.uid]: 'owner' }, memberUids: [user.uid],
    memberEmails: { [user.uid]: user.email || '' }, inviteEmails: [], inviteRoles: {}, createdAt: Date.now(),
  });
  await audit(ref.id, 'team.created', name);
  return ref.id;
}

export async function inviteMember(teamId: string, email: string, role: Role) {
  if (role === 'owner') throw new Error('Ownership cannot be granted by invitation.');
  const { db } = await ctx();
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter a valid email address.');
  await updateDoc(doc(db, 'teams', teamId), { inviteEmails: arrayUnion(e), [`inviteRoles.${emailKey(e)}`]: role });
  await audit(teamId, 'member.invited', `${e} as ${role}`);
}

export async function revokeInvite(teamId: string, email: string) {
  const { db } = await ctx();
  await updateDoc(doc(db, 'teams', teamId), { inviteEmails: arrayRemove(email), [`inviteRoles.${emailKey(email)}`]: deleteField() });
  await audit(teamId, 'invite.revoked', email);
}

export async function acceptInvite(team: Team) {
  const { db, user } = await ctx();
  const e = (user.email || '').toLowerCase();
  const role = team.inviteRoles[emailKey(e)] || 'viewer';
  await updateDoc(doc(db, 'teams', team.id), {
    [`members.${user.uid}`]: role, memberUids: arrayUnion(user.uid), [`memberEmails.${user.uid}`]: e,
    inviteEmails: arrayRemove(e), [`inviteRoles.${emailKey(e)}`]: deleteField(),
  });
  await audit(team.id, 'member.joined', `${e} as ${role}`);
}

export async function setRole(teamId: string, memberUid: string, role: Role) {
  const { db } = await ctx();
  await updateDoc(doc(db, 'teams', teamId), { [`members.${memberUid}`]: role });
  await audit(teamId, 'member.role', `${memberUid} → ${role}`);
}

export async function removeMember(teamId: string, memberUid: string) {
  const { db } = await ctx();
  await updateDoc(doc(db, 'teams', teamId), { [`members.${memberUid}`]: deleteField(), memberUids: arrayRemove(memberUid), [`memberEmails.${memberUid}`]: deleteField() });
  await audit(teamId, 'member.removed', memberUid);
}

export async function leaveTeam(teamId: string) {
  const { user } = await ctx();
  await removeMember(teamId, user.uid);
}

export async function deleteTeam(teamId: string) {
  const { db } = await ctx();
  await deleteDoc(doc(db, 'teams', teamId));
}

export async function getAudit(teamId: string, n = 100) {
  const { db } = await ctx();
  const snap = await getDocs(query(collection(db, `teams/${teamId}/audit`), orderBy('at', 'desc'), qlimit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** Each member reports usage counts of team snippets to teams/{id}/usage/{uid}. */
export async function reportTeamUsage(teamId: string, counts: Record<string, number>) {
  const { db, user } = await ctx();
  const data: any = { email: user.email || '', updatedAt: Date.now() };
  for (const [k, v] of Object.entries(counts)) data[`counts.${k}`] = increment(v);
  const ref = doc(db, `teams/${teamId}/usage/${user.uid}`);
  const ex = await getDoc(ref);
  if (ex.exists()) await updateDoc(ref, data);
  else await setDoc(ref, { email: user.email || '', updatedAt: Date.now(), counts });
}

export async function getTeamUsage(teamId: string) {
  const { db } = await ctx();
  const snap = await getDocs(collection(db, `teams/${teamId}/usage`));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) })) as { uid: string; email: string; counts: Record<string, number>; updatedAt: number }[];
}
