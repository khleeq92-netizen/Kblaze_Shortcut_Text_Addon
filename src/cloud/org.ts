// Enterprise organizations: administrators, staff, invitations, role-based
// permissions, shared automation profiles/templates, policies (configuration
// distributed to every member), device management, audit + activity logs and
// shared-profile version history. Authorization is enforced by
// firebase/firestore.rules; the extension mirrors it for UX and local execution.
import { collection, doc, getDocs, query, where, setDoc, updateDoc, getDoc, addDoc, deleteField, arrayUnion, arrayRemove, orderBy, limit as qlimit, deleteDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import type { CollectionName } from '../shared/types';
import { setOrgState, getOrgState, deviceId, DEFAULT_POLICIES, type OrgPolicies, type OrgState } from '../shared/orgState';
import { flattenPolicy, type Role, type PermissionPolicy, type Action } from '../security/permissions';
import { getAll, putMany, saveRecords, notifyChanged } from '../shared/db';
import { setAuditActor, setVersionActorSafe } from './actor';

export const ORG_COLLECTIONS: CollectionName[] = ['workspaces', 'folders', 'snippets', 'templates', 'autofill', 'macros', 'scripts', 'variables', 'tables'];

export interface Org {
  id: string;
  name: string;
  ownerUid: string;
  members: Record<string, Role>;
  memberUids: string[];
  memberEmails: Record<string, string>;
  inviteEmails: string[];
  invites: Record<string, Role>;
  permissions: PermissionPolicy;
  /** flattened role -> actions (read by security rules) */
  perm: Record<string, Action[]>;
  /** uid -> denied actions (read by security rules) */
  deny: Record<string, Action[]>;
  allow: Record<string, Action[]>;
  policies: OrgPolicies;
  createdAt: number;
  updatedAt: number;
  myRole?: Role;
}

export const emailKey = (e: string) => e.trim().toLowerCase().replace(/\./g, ',');

async function ctx() {
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!fb || !u) throw new Error('Sign in to use organization features.');
  return { db: fb.db, user: u };
}

function derived(p: PermissionPolicy) {
  const deny: Record<string, Action[]> = {};
  const allow: Record<string, Action[]> = {};
  for (const [uid, o] of Object.entries(p.users || {})) { if (o.deny?.length) deny[uid] = o.deny; if (o.allow?.length) allow[uid] = o.allow; }
  return { perm: flattenPolicy(p), deny, allow };
}

export async function listMyOrgs(): Promise<Org[]> {
  const { db, user } = await ctx();
  const snap = await getDocs(query(collection(db, 'orgs'), where('memberUids', 'array-contains', user.uid)));
  return snap.docs.map((d) => ({ ...(d.data() as Org), id: d.id, myRole: (d.data() as Org).ownerUid === user.uid ? 'owner' : (d.data() as Org).members[user.uid] }));
}

export async function listInvites(): Promise<Org[]> {
  const { db, user } = await ctx();
  if (!user.email) return [];
  const snap = await getDocs(query(collection(db, 'orgs'), where('inviteEmails', 'array-contains', user.email.toLowerCase())));
  return snap.docs.map((d) => ({ ...(d.data() as Org), id: d.id }));
}

export async function createOrg(name: string): Promise<string> {
  const { db, user } = await ctx();
  const ref = doc(collection(db, 'orgs'));
  const permissions: PermissionPolicy = {};
  const t = Date.now();
  await setDoc(ref, {
    name: name.trim().slice(0, 100), ownerUid: user.uid, members: { [user.uid]: 'owner' }, memberUids: [user.uid], memberEmails: { [user.uid]: user.email || '' },
    inviteEmails: [], invites: {}, permissions, ...derived(permissions), policies: DEFAULT_POLICIES, createdAt: t, updatedAt: t,
  });
  await logAudit(ref.id, 'create', 'organization', { name });
  await selectOrg(ref.id);
  return ref.id;
}

export async function getOrg(orgId: string): Promise<Org | null> {
  const { db, user } = await ctx();
  const s = await getDoc(doc(db, 'orgs', orgId));
  if (!s.exists()) return null;
  const o = { ...(s.data() as Org), id: s.id };
  o.myRole = o.ownerUid === user.uid ? 'owner' : o.members[user.uid];
  return o;
}

export async function inviteMember(orgId: string, email: string, role: Role) {
  const { db } = await ctx();
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter a valid email address');
  if (role === 'owner') throw new Error('Ownership cannot be granted by invitation');
  await updateDoc(doc(db, 'orgs', orgId), { inviteEmails: arrayUnion(e), [`invites.${emailKey(e)}`]: role, updatedAt: Date.now() });
  await logAudit(orgId, 'invite', 'member', { name: e, details: `role ${role}` });
}

export async function revokeInvite(orgId: string, email: string) {
  const { db } = await ctx();
  const e = email.trim().toLowerCase();
  await updateDoc(doc(db, 'orgs', orgId), { inviteEmails: arrayRemove(e), [`invites.${emailKey(e)}`]: deleteField(), updatedAt: Date.now() });
  await logAudit(orgId, 'revoke-invite', 'member', { name: e });
}

export async function acceptInvite(o: Org) {
  const { db, user } = await ctx();
  const e = (user.email || '').toLowerCase();
  const role = o.invites[emailKey(e)];
  if (!role) throw new Error('Invitation not found');
  await updateDoc(doc(db, 'orgs', o.id), {
    [`members.${user.uid}`]: role, memberUids: arrayUnion(user.uid), [`memberEmails.${user.uid}`]: e,
    inviteEmails: arrayRemove(e), [`invites.${emailKey(e)}`]: deleteField(), updatedAt: Date.now(),
  });
  await logAudit(o.id, 'join', 'member', { name: e, details: `as ${role}` });
  await selectOrg(o.id);
}

export async function setRole(orgId: string, uid: string, role: Role) {
  const { db } = await ctx();
  if (role === 'owner') throw new Error('Use "Transfer ownership" to change the owner');
  await updateDoc(doc(db, 'orgs', orgId), { [`members.${uid}`]: role, updatedAt: Date.now() });
  await logAudit(orgId, 'set-role', 'member', { resourceId: uid, details: role });
}

export async function removeMember(orgId: string, uid: string) {
  const { db } = await ctx();
  await updateDoc(doc(db, 'orgs', orgId), { [`members.${uid}`]: deleteField(), memberUids: arrayRemove(uid), [`memberEmails.${uid}`]: deleteField(), updatedAt: Date.now() });
  await logAudit(orgId, 'remove', 'member', { resourceId: uid });
}

export async function leaveOrg(orgId: string) {
  const { db, user } = await ctx();
  await updateDoc(doc(db, 'orgs', orgId), { [`members.${user.uid}`]: deleteField(), memberUids: arrayRemove(user.uid), [`memberEmails.${user.uid}`]: deleteField(), updatedAt: Date.now() });
  const st = await getOrgState();
  if (st?.orgId === orgId) await purgeOrgData(orgId);
}

export async function deleteOrg(orgId: string) {
  const { db } = await ctx();
  await deleteDoc(doc(db, 'orgs', orgId));
  await purgeOrgData(orgId);
}

export async function updatePermissions(orgId: string, permissions: PermissionPolicy) {
  const { db } = await ctx();
  await updateDoc(doc(db, 'orgs', orgId), { permissions, ...derived(permissions), updatedAt: Date.now() });
  await logAudit(orgId, 'update', 'permissions', { details: JSON.stringify(permissions).slice(0, 500) });
}

export async function updatePolicies(orgId: string, policies: OrgPolicies) {
  const { db } = await ctx();
  await updateDoc(doc(db, 'orgs', orgId), { policies, updatedAt: Date.now() });
  await logAudit(orgId, 'update', 'policies', { details: JSON.stringify(policies).slice(0, 500) });
}

export async function renameOrg(orgId: string, name: string) {
  const { db } = await ctx();
  await updateDoc(doc(db, 'orgs', orgId), { name: name.trim().slice(0, 100), updatedAt: Date.now() });
}

// ---------------------------------------------------------------- local state
/** Makes an organization the active one on this device and caches role + policy. */
export async function selectOrg(orgId: string | null) {
  if (!orgId) { const cur = await getOrgState(); await setOrgState(null); if (cur) await purgeOrgData(cur.orgId); return null; }
  const cur = await getOrgState();
  await setOrgState({ ...(cur || {}), orgId } as OrgState);
  return refreshOrgState();
}

export async function refreshOrgState(): Promise<OrgState | null> {
  const cur = await getOrgState();
  if (!cur?.orgId) return null;
  const { db, user } = await ctx();
  const o = await getOrg(cur.orgId).catch(() => null);
  if (!o || !(user.uid in o.members)) { await setOrgState(null); await purgeOrgData(cur.orgId); return null; }
  const dev = await deviceId();
  const ds = await getDoc(doc(db, `orgs/${o.id}/devices/${dev}`)).catch(() => null);
  const revoked = !!ds?.exists() && !!(ds.data() as any).revoked;
  const st: OrgState = {
    orgId: o.id, orgName: o.name, uid: user.uid, email: user.email || '', role: o.ownerUid === user.uid ? 'owner' : o.members[user.uid],
    permissions: o.permissions || {}, policies: { ...DEFAULT_POLICIES, ...(o.policies || {}) }, deviceId: dev, revoked, updatedAt: Date.now(),
  };
  await setOrgState(st);
  setAuditActor(st.email || st.uid);
  setVersionActorSafe(st.email || st.uid);
  if (revoked) await purgeOrgData(o.id);
  return st;
}

/** Removes organization-shared records from this device (left org / device revoked). */
export async function purgeOrgData(orgId: string) {
  const { hardDelete } = await import('../shared/db');
  for (const c of ORG_COLLECTIONS) {
    const recs = (await getAll<any>(c)).filter((r) => r.orgId === orgId);
    if (recs.length) await hardDelete(c, recs.map((r) => r.id));
  }
  await notifyChanged(ORG_COLLECTIONS);
}

// ---------------------------------------------------------------- sharing
/** Copies (or moves) a personal record into the organization so members receive it on their next sync. */
export async function shareToOrg(coll: CollectionName, rec: any, mode: 'copy' | 'move' = 'copy') {
  const st = await getOrgState();
  if (!st) throw new Error('Select an organization first');
  const { uid } = await import('../shared/ids');
  const shared = { ...rec, id: mode === 'move' ? rec.id : uid(coll.slice(0, 3)), orgId: st.orgId, sharedBy: st.email, deleted: false };
  await saveRecords(coll, [shared]);
  await logAudit(st.orgId, 'share', coll, { resourceId: shared.id, name: rec.name });
  await saveVersion(st.orgId, coll, shared);
  return shared;
}

export async function saveVersion(orgId: string, coll: CollectionName, rec: any) {
  const { db, user } = await ctx();
  const body = JSON.stringify(rec);
  if (body.length > 800_000) return;
  await addDoc(collection(db, `orgs/${orgId}/versions`), { collection: coll, recordId: rec.id, version: rec.version || 1, at: Date.now(), by: user.email || user.uid, name: rec.name || rec.id, snapshot: body });
}

export async function listVersions(orgId: string, recordId: string) {
  const { db } = await ctx();
  const snap = await getDocs(query(collection(db, `orgs/${orgId}/versions`), where('recordId', '==', recordId), orderBy('at', 'desc'), qlimit(30)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any), snapshot: JSON.parse((d.data() as any).snapshot) }));
}

// ---------------------------------------------------------------- devices
export async function heartbeatDevice(name?: string) {
  const st = await getOrgState();
  if (!st) return;
  const { db, user } = await ctx();
  const ref = doc(db, `orgs/${st.orgId}/devices/${st.deviceId}`);
  const cur = await getDoc(ref);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const base = { uid: user.uid, email: user.email || '', lastSeen: Date.now(), ua: ua.slice(0, 300), name: name || (cur.exists() ? (cur.data() as any).name : guessDeviceName(ua)) };
  if (!cur.exists()) await setDoc(ref, { ...base, revoked: false, firstSeen: Date.now() });
  else await updateDoc(ref, base);
}

function guessDeviceName(ua: string) {
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Brave/.test(ua) ? 'Brave' : 'Chrome';
  return `${br} on ${os}`;
}

export async function listDevices(orgId: string) {
  const { db } = await ctx();
  const snap = await getDocs(collection(db, `orgs/${orgId}/devices`));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function setDeviceRevoked(orgId: string, devId: string, revoked: boolean) {
  const { db } = await ctx();
  await updateDoc(doc(db, `orgs/${orgId}/devices/${devId}`), { revoked, revokedAt: Date.now() });
  await logAudit(orgId, revoked ? 'revoke' : 'restore', 'device', { resourceId: devId });
}

// ---------------------------------------------------------------- audit / activity
export async function logAudit(orgId: string, action: string, resource: string, p: { resourceId?: string; name?: string; details?: string } = {}) {
  const { db, user } = await ctx();
  await addDoc(collection(db, `orgs/${orgId}/audit`), { at: Date.now(), uid: user.uid, email: user.email || '', action, resource, resourceId: p.resourceId || '', name: (p.name || '').slice(0, 200), details: (p.details || '').slice(0, 1000) }).catch(() => {});
}

export async function getAudit(orgId: string, n = 300) {
  const { db } = await ctx();
  const snap = await getDocs(query(collection(db, `orgs/${orgId}/audit`), orderBy('at', 'desc'), qlimit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** Pushes local execution summaries (never field values) when activity monitoring is enabled. */
export async function pushActivity() {
  const st = await getOrgState();
  if (!st || st.revoked || !st.policies.activityMonitoring) return 0;
  const { db, user } = await ctx();
  const { metaGet, metaSet } = await import('../shared/db');
  const since = (await metaGet<number>(`activity:${st.orgId}`)) || Date.now() - 864e5;
  const list = (await getAll<any>('executions')).filter((e) => e.startedAt > since && e.status !== 'running').slice(0, 200);
  for (const e of list) {
    await addDoc(collection(db, `orgs/${st.orgId}/activity`), { at: e.startedAt, uid: user.uid, email: user.email || '', device: st.deviceId, kind: e.kind, name: e.name, status: e.status, host: e.host || '', filled: e.filled ?? null, failed: e.failed ?? null, durationMs: e.endedAt ? e.endedAt - e.startedAt : null });
  }
  await metaSet(`activity:${st.orgId}`, Date.now());
  return list.length;
}

export async function getActivity(orgId: string, n = 300) {
  const { db } = await ctx();
  const snap = await getDocs(query(collection(db, `orgs/${orgId}/activity`), orderBy('at', 'desc'), qlimit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export { putMany };
