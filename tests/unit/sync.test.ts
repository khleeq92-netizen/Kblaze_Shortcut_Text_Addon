import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { setIndexedDB, saveRecords, getAll, getOne, deleteRecords, putMany } from '@/shared/db';
import { syncCollection, MemoryRemote, decide, TOMBSTONE_TTL } from '@/cloud/engine';
import type { ConflictEntry } from '@/shared/types';

// two "devices" = two independent IndexedDB instances sharing one remote
let devA: IDBFactory;
let devB: IDBFactory;
let remote: MemoryRemote;
const use = (f: IDBFactory) => setIndexedDB(f as any);
const opts = (conflicts: ConflictEntry[] = [], extra: any = {}) => ({ remote, basePath: 'users/u1', coll: 'macros' as const, scopeKey: 'u1', scopeOrg: null, strategy: 'newest' as const, readOnly: false, conflicts, ...extra });
const mac = (id: string, name: string) => ({ id, name, enabled: true, sites: [], steps: [], settings: {}, tags: [], createdAt: 1, updatedAt: 1 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => { remote = new MemoryRemote(); devA = new IDBFactory(); devB = new IDBFactory(); });

describe('sync engine', () => {
  it('decide()', () => {
    expect(decide(undefined, { updatedAt: 5 }, 0, false)).toBe('take-remote');
    expect(decide({ updatedAt: 5 }, { updatedAt: 5 }, 0, false)).toBe('same');
    expect(decide({ updatedAt: 3 }, { updatedAt: 5 }, 4, false)).toBe('take-remote');
    expect(decide({ updatedAt: 6 }, { updatedAt: 8 }, 4, false)).toBe('conflict-remote-wins');
    expect(decide({ updatedAt: 9 }, { updatedAt: 8 }, 4, false)).toBe('conflict-local-wins');
    expect(decide({ updatedAt: 9 }, { updatedAt: 3 }, 4, false)).toBe('keep-local');
  });
  it('pushes from one device, pulls on another, propagates edits and deletions', async () => {
    use(devA);
    await saveRecords('macros', [mac('m1', 'Fill FYJC')]);
    expect((await syncCollection(opts())).pushed).toBe(1);
    use(devB);
    expect((await syncCollection(opts())).pulled).toBe(1);
    expect((await getOne<any>('macros', 'm1')).name).toBe('Fill FYJC');
    await sleep(5);
    await saveRecords('macros', [{ ...(await getOne<any>('macros', 'm1')), name: 'Fill FYJC v2' }]);
    await syncCollection(opts());
    use(devA);
    await syncCollection(opts());
    expect((await getOne<any>('macros', 'm1')).name).toBe('Fill FYJC v2');
    await sleep(5);
    await deleteRecords('macros', ['m1']);
    await syncCollection(opts());
    use(devB);
    await syncCollection(opts());
    expect((await getOne<any>('macros', 'm1')).deleted).toBe(true);
  });
  it('conflicts: newest wins, keep-both keeps a local copy', async () => {
    use(devA); await saveRecords('macros', [mac('c1', 'Base')]); await syncCollection(opts());
    use(devB); await syncCollection(opts());
    await sleep(5);
    use(devA); await saveRecords('macros', [{ ...(await getOne<any>('macros', 'c1')), name: 'Edited on A' }]);
    await sleep(5);
    use(devB); await saveRecords('macros', [{ ...(await getOne<any>('macros', 'c1')), name: 'Edited on B' }]);
    use(devA); await syncCollection(opts());
    use(devB);
    const conflicts: ConflictEntry[] = [];
    await syncCollection(opts(conflicts, { strategy: 'keep-both' }));
    expect(conflicts[0].resolution).toBe('local-won'); // B's edit is newer
    use(devA);
    const ca: ConflictEntry[] = [];
    await syncCollection(opts(ca, { strategy: 'keep-both' }));
    const names = (await getAll<any>('macros')).map((m) => m.name).sort();
    expect(names).toEqual(['Edited on B']);
  });
  it('keep-both strategy duplicates the local version when the remote wins', async () => {
    use(devA); await saveRecords('macros', [mac('k1', 'Base')]); await syncCollection(opts());
    use(devB); await syncCollection(opts());
    await sleep(5);
    use(devB); await saveRecords('macros', [{ ...(await getOne<any>('macros', 'k1')), name: 'B edit' }]);
    await sleep(5);
    use(devA); await saveRecords('macros', [{ ...(await getOne<any>('macros', 'k1')), name: 'A edit (newer)' }]); await syncCollection(opts());
    use(devB);
    const c: ConflictEntry[] = [];
    await syncCollection(opts(c, { strategy: 'keep-both' }));
    expect(c[0].resolution).toBe('kept-both');
    expect((await getAll<any>('macros')).filter((m) => m.id === 'k1' || m.name.includes('conflict copy')).map((m) => m.name).sort()).toEqual(['A edit (newer)', 'B edit (conflict copy)']);
  });
  it('outgoing transforms can skip records; canWrite enforces RBAC; readOnly never pushes', async () => {
    const dev = new IDBFactory(); use(dev);
    await saveRecords('macros', [mac('a', 'ok'), mac('b', 'secret')]);
    const r = await syncCollection(opts([], { outgoing: async (x: any) => (x.name === 'secret' ? null : x) }));
    expect(r).toMatchObject({ pushed: 1, skipped: 1 });
    const dev2 = new IDBFactory(); use(dev2);
    await saveRecords('macros', [{ ...mac('o1', 'shared'), orgId: 'org1' }]);
    const r2 = await syncCollection({ ...opts(), basePath: 'orgs/org1', scopeKey: 'org:org1', scopeOrg: 'org1', canWrite: () => false });
    expect(r2.pushed).toBe(0);
    const r3 = await syncCollection({ ...opts(), basePath: 'orgs/org1', scopeKey: 'org:org1b', scopeOrg: 'org1', readOnly: true });
    expect(r3.pushed).toBe(0);
    expect(remote.data.get('orgs/org1/macros')).toBeUndefined();
  });
  it('purges old tombstones after sync', async () => {
    const dev = new IDBFactory(); use(dev);
    await putMany('macros', [{ ...mac('t', 'gone'), deleted: true, updatedAt: Date.now() - TOMBSTONE_TTL - 1000 }]);
    await syncCollection(opts());
    expect(await getOne('macros', 't')).toBeUndefined();
  });
  it('incremental: second sync with no changes writes nothing', async () => {
    const dev = new IDBFactory(); use(dev);
    await saveRecords('macros', [mac('i', 'x')]);
    await syncCollection(opts());
    const w = remote.writes;
    await syncCollection(opts());
    expect(remote.writes).toBe(w);
  });
});
