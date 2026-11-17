// Firestore security-rules tests (run against the Firestore emulator):
//   npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, deleteField, arrayUnion } from 'firebase/firestore';

const here = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['create', 'edit', 'execute', 'share', 'delete', 'export', 'viewAudit', 'manageMembers', 'manageSettings', 'manageDevices'];
// mirrors DEFAULT_MATRIX in src/security/permissions.ts (flattened as the extension writes it)
const PERM = { owner: ALL, admin: ALL, manager: ['create', 'edit', 'execute', 'share', 'delete', 'export', 'viewAudit'], staff: ['execute', 'create', 'edit'], viewer: ['execute'] };
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'k-flow-rules-test', firestore: { rules: fs.readFileSync(path.join(here, '../../firebase/firestore.rules'), 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const as = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seedOrg = (extra = {}) => env.withSecurityRulesDisabled(async (c) => {
  await setDoc(doc(c.firestore(), 'orgs/o1'), {
    name: 'College', ownerUid: 'owner', members: { owner: 'owner', admin: 'admin', mgr: 'manager', staff: 'staff', view: 'viewer' }, memberUids: ['owner', 'admin', 'mgr', 'staff', 'view'],
    memberEmails: {}, inviteEmails: ['new@college.in'], invites: { 'new@college,in': 'staff' }, permissions: {}, perm: PERM, deny: {}, allow: {}, policies: {}, createdAt: 1, updatedAt: 1, ...extra,
  });
});
const rec = (p = {}) => ({ name: 'Profile', rules: [], updatedAt: Date.now(), ...p });

test('personal data is private to its owner', async () => {
  await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/autofill/p1'), rec()));
  await assertSucceeds(getDoc(doc(as('u1'), 'users/u1/autofill/p1')));
  await assertFails(getDoc(doc(as('u2'), 'users/u1/autofill/p1')));
  await assertFails(setDoc(doc(as('u2'), 'users/u1/autofill/p2'), rec()));
  await assertFails(getDoc(doc(anon(), 'users/u1/autofill/p1')));
  await assertFails(setDoc(doc(as('u1'), 'users/u1/autofill/p3'), { name: 'x' })); // updatedAt required
  await assertFails(setDoc(doc(as('u1'), 'users/u1/unknown/p'), rec()));
  for (const c of ['macros', 'scripts', 'variables', 'vault', 'workspaces', 'tables', 'snippets']) await assertSucceeds(setDoc(doc(as('u1'), `users/u1/${c}/x`), rec()));
});

test('cloud backups: owner only, vault-encrypted only', async () => {
  await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/backups/b1'), { keyType: 'vault', iv: 'x', chunks: 1, createdAt: 1 }));
  await assertSucceeds(setDoc(doc(as('u1'), 'users/u1/backups/b1/chunks/0'), { i: 0, data: 'ciphertext' }));
  await assertFails(setDoc(doc(as('u1'), 'users/u1/backups/b2'), { keyType: 'none', chunks: 1 }));
  await assertFails(getDoc(doc(as('u2'), 'users/u1/backups/b1')));
  await assertFails(getDoc(doc(as('u2'), 'users/u1/backups/b1/chunks/0')));
});

test('creating an organization: creator must be the sole owner', async () => {
  const good = { name: 'X', ownerUid: 'u1', members: { u1: 'owner' }, memberUids: ['u1'], memberEmails: {}, inviteEmails: [], invites: {}, perm: PERM, deny: {}, allow: {}, policies: {}, createdAt: 1, updatedAt: 1 };
  await assertSucceeds(setDoc(doc(as('u1'), 'orgs/new1'), good));
  await assertFails(setDoc(doc(as('u1'), 'orgs/new2'), { ...good, ownerUid: 'u2' }));
  await assertFails(setDoc(doc(as('u1'), 'orgs/new3'), { ...good, members: { u1: 'owner', u2: 'admin' }, memberUids: ['u1', 'u2'] }));
});

test('organization documents are visible to members and invitees only', async () => {
  await seedOrg();
  await assertSucceeds(getDoc(doc(as('staff'), 'orgs/o1')));
  await assertSucceeds(getDoc(doc(as('newbie', 'new@college.in'), 'orgs/o1')));
  await assertFails(getDoc(doc(as('stranger', 'x@y.com'), 'orgs/o1')));
});

test('shared resources follow the RBAC matrix', async () => {
  await seedOrg();
  await assertSucceeds(setDoc(doc(as('staff'), 'orgs/o1/autofill/p1'), rec()));        // staff: create
  await assertSucceeds(setDoc(doc(as('staff'), 'orgs/o1/autofill/p1'), rec({ name: 'edited' }))); // staff: edit
  await assertSucceeds(getDoc(doc(as('view'), 'orgs/o1/autofill/p1')));               // viewer: read/run
  await assertFails(setDoc(doc(as('view'), 'orgs/o1/autofill/p2'), rec()));           // viewer: no create
  await assertFails(updateDoc(doc(as('view'), 'orgs/o1/autofill/p1'), { name: 'x', updatedAt: Date.now() }));
  await assertFails(updateDoc(doc(as('staff'), 'orgs/o1/autofill/p1'), { deleted: true, updatedAt: Date.now() })); // staff: no delete (tombstone)
  await assertFails(deleteDoc(doc(as('staff'), 'orgs/o1/autofill/p1')));
  await assertSucceeds(updateDoc(doc(as('mgr'), 'orgs/o1/autofill/p1'), { deleted: true, updatedAt: Date.now() }));  // manager: delete
  await assertFails(getDoc(doc(as('stranger'), 'orgs/o1/autofill/p1')));
  await assertFails(setDoc(doc(as('owner'), 'orgs/o1/notallowed/x'), rec()));
});

test('per-user deny overrides the role; a minted "owner" role string grants nothing', async () => {
  await seedOrg({ deny: { staff: ['create', 'edit'] }, members: { owner: 'owner', admin: 'admin', staff: 'staff', fake: 'owner' }, memberUids: ['owner', 'admin', 'staff', 'fake'] });
  await assertFails(setDoc(doc(as('staff'), 'orgs/o1/macros/m1'), rec()));
  await assertFails(setDoc(doc(as('fake'), 'orgs/o1/macros/m1'), rec()));
  await assertFails(getDocs(collection(as('fake'), 'orgs/o1/audit')));
  await assertSucceeds(setDoc(doc(as('owner'), 'orgs/o1/macros/m1'), rec()));
});

test('members, roles and invitations', async () => {
  await seedOrg();
  await assertSucceeds(updateDoc(doc(as('admin'), 'orgs/o1'), { 'members.staff': 'manager', updatedAt: 2 }));
  await assertFails(updateDoc(doc(as('admin'), 'orgs/o1'), { ownerUid: 'admin' }));
  await assertFails(updateDoc(doc(as('admin'), 'orgs/o1'), { 'members.owner': 'staff' }));
  await assertFails(updateDoc(doc(as('mgr'), 'orgs/o1'), { 'members.staff': 'admin' }));
  await assertFails(updateDoc(doc(as('staff'), 'orgs/o1'), { 'perm.staff': ALL }));
  await assertFails(updateDoc(doc(as('owner'), 'orgs/o1'), { ownerUid: 'admin' })); // no silent ownership transfer
  // invited user joins with exactly the invited role
  const n = as('newbie', 'new@college.in');
  await assertFails(updateDoc(doc(n, 'orgs/o1'), { 'members.newbie': 'admin', memberUids: arrayUnion('newbie'), inviteEmails: [], 'invites.new@college,in': deleteField() }));
  await assertSucceeds(updateDoc(doc(n, 'orgs/o1'), { 'members.newbie': 'staff', memberUids: arrayUnion('newbie'), 'memberEmails.newbie': 'new@college.in', inviteEmails: [], 'invites.new@college,in': deleteField(), updatedAt: 3 }));
  // a member may leave
  await assertSucceeds(updateDoc(doc(as('view'), 'orgs/o1'), { 'members.view': deleteField() }));
  await assertFails(deleteDoc(doc(as('admin'), 'orgs/o1')));
  await assertSucceeds(deleteDoc(doc(as('owner'), 'orgs/o1')));
});

test('audit and activity logs are append-only and readable with viewAudit only', async () => {
  await seedOrg();
  await assertSucceeds(addDoc(collection(as('staff'), 'orgs/o1/audit'), { at: 1, uid: 'staff', action: 'execute' }));
  await assertFails(addDoc(collection(as('staff'), 'orgs/o1/audit'), { at: 1, uid: 'someone-else', action: 'x' }));
  await assertFails(getDocs(collection(as('staff'), 'orgs/o1/audit')));
  await assertSucceeds(getDocs(collection(as('mgr'), 'orgs/o1/audit')));
  const ref = await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'orgs/o1/audit/a1'), { at: 1, uid: 'staff' }); });
  void ref;
  await assertFails(updateDoc(doc(as('owner'), 'orgs/o1/audit/a1'), { action: 'tampered' }));
  await assertFails(deleteDoc(doc(as('owner'), 'orgs/o1/audit/a1')));
  await assertSucceeds(addDoc(collection(as('view'), 'orgs/o1/activity'), { at: 1, uid: 'view', kind: 'autofill', status: 'success' }));
  await assertFails(getDocs(collection(as('view'), 'orgs/o1/activity')));
});

test('devices: members register their own; only admins revoke or restore', async () => {
  await seedOrg();
  await assertSucceeds(setDoc(doc(as('staff'), 'orgs/o1/devices/d1'), { uid: 'staff', revoked: false, lastSeen: 1 }));
  await assertFails(setDoc(doc(as('staff'), 'orgs/o1/devices/d2'), { uid: 'admin', revoked: false }));
  await assertSucceeds(updateDoc(doc(as('admin'), 'orgs/o1/devices/d1'), { revoked: true }));
  await assertFails(updateDoc(doc(as('staff'), 'orgs/o1/devices/d1'), { revoked: false }));
  await assertSucceeds(updateDoc(doc(as('staff'), 'orgs/o1/devices/d1'), { lastSeen: 2 }));
  await assertFails(getDoc(doc(as('view'), 'orgs/o1/devices/d1')));
  await assertSucceeds(getDoc(doc(as('admin'), 'orgs/o1/devices/d1')));
});

test('shared-profile version history is append-only', async () => {
  await seedOrg();
  await assertSucceeds(addDoc(collection(as('staff'), 'orgs/o1/versions'), { recordId: 'p1', at: 1, snapshot: '{}' }));
  await assertFails(addDoc(collection(as('view'), 'orgs/o1/versions'), { recordId: 'p1', at: 1, snapshot: '{}' }));
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'orgs/o1/versions/v1'), { recordId: 'p1' }));
  await assertFails(updateDoc(doc(as('owner'), 'orgs/o1/versions/v1'), { recordId: 'x' }));
});
