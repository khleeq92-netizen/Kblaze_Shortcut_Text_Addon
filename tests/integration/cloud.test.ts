// Integration: the real Firestore adapter + sync engine against the Firestore
// emulator with the production security rules. Run with `npm run test:cloud`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { setIndexedDB, saveRecords, getOne, deleteRecords } from '@/shared/db';
import { syncCollection } from '@/cloud/engine';
import { firestoreRemote } from '@/cloud/sync';
import { flattenPolicy } from '@/security/permissions';
import type { ConflictEntry } from '@/shared/types';

let env: RulesTestEnvironment;
const mac = (id: string, name: string) => ({ id, name, enabled: true, sites: [], steps: [], settings: {}, tags: [], createdAt: 1, updatedAt: 1 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'k-flow-cloud-test', firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } });
  await env.clearFirestore();
});
afterAll(async () => { await env?.cleanup(); });

describe('cloud sync through Firestore', () => {
  it('two devices of one user sync profiles, edits and deletions; other users see nothing', async () => {
    const db = env.authenticatedContext('u1').firestore() as any;
    const remote = firestoreRemote(db);
    const o = (conflicts: ConflictEntry[] = []) => ({ remote, basePath: 'users/u1', coll: 'macros' as const, scopeKey: 'u1', scopeOrg: null, strategy: 'newest' as const, readOnly: false, conflicts });
    const A = new IDBFactory(), B = new IDBFactory();
    setIndexedDB(A as any);
    await saveRecords('macros', [mac('m1', 'Fill UDISE'), mac('m2', 'HSC form')]);
    expect((await syncCollection(o())).pushed).toBe(2);
    setIndexedDB(B as any);
    expect((await syncCollection(o())).pulled).toBe(2);
    await sleep(10);
    await saveRecords('macros', [{ ...(await getOne<any>('macros', 'm1')), name: 'Fill UDISE (2025-26)' }]);
    await deleteRecords('macros', ['m2']);
    await syncCollection(o());
    setIndexedDB(A as any);
    const r = await syncCollection(o());
    expect(r.pulled).toBe(2); // incremental: only the 2 changed docs
    expect((await getOne<any>('macros', 'm1')).name).toBe('Fill UDISE (2025-26)');
    expect((await getOne<any>('macros', 'm2')).deleted).toBe(true);
    const other = firestoreRemote(env.authenticatedContext('u2').firestore() as any);
    await expect(other.pull('users/u1/macros', 0)).rejects.toThrow();
  });

  it('organization sync enforces roles: staff edits succeed, viewer writes are rejected', async () => {
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'orgs/org1'), {
      name: 'College', ownerUid: 'boss', members: { boss: 'owner', st: 'staff', vw: 'viewer' }, memberUids: ['boss', 'st', 'vw'], memberEmails: {}, inviteEmails: [], invites: {},
      permissions: {}, perm: flattenPolicy({}), deny: {}, allow: {}, policies: {}, createdAt: 1, updatedAt: 1,
    }));
    const staff = firestoreRemote(env.authenticatedContext('st').firestore() as any);
    const viewer = firestoreRemote(env.authenticatedContext('vw').firestore() as any);
    const so = (remote: any, scope: string) => ({ remote, basePath: 'orgs/org1', coll: 'autofill' as const, scopeKey: scope, scopeOrg: 'org1', strategy: 'newest' as const, readOnly: false, conflicts: [] as ConflictEntry[] });
    setIndexedDB(new IDBFactory() as any);
    await saveRecords('autofill', [{ id: 'shared1', name: 'FYJC shared', orgId: 'org1', rules: [], sites: [], enabled: true, runMode: 'manual', tags: [], createdAt: 1, updatedAt: 1 } as any]);
    expect((await syncCollection(so(staff, 'org:st'))).pushed).toBe(1);
    setIndexedDB(new IDBFactory() as any);
    expect((await syncCollection(so(viewer, 'org:vw'))).pulled).toBe(1);
    await sleep(10);
    await saveRecords('autofill', [{ ...(await getOne<any>('autofill', 'shared1')), name: 'viewer tampering' }]);
    await expect(syncCollection(so(viewer, 'org:vw'))).rejects.toThrow(/permission|PERMISSION/i);
  });
});
