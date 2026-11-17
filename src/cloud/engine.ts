// Backend-independent sync engine. IndexedDB is the source of truth; a
// RemoteStore (Firestore in production, an in-memory store in tests) mirrors it.
//  - incremental: pull docs with updatedAt > lastPull, push local changes since lastPush
//  - tombstones (deleted: true) propagate deletions and are purged after 30 days
//  - conflicts (changed on both sides since the last sync) follow the strategy:
//    "newest" wins, or "keep-both" (local copy kept as a duplicate)
import { getAll, getOne, putMany, metaGet, metaSet, hardDelete } from '../shared/db';
import { uid as newId } from '../shared/ids';
import type { CollectionName, ConflictEntry } from '../shared/types';

export interface RemoteStore {
  /** Documents of a collection path changed after `since` (0 = all). */
  pull(path: string, since: number): Promise<any[]>;
  /** Writes (creates/overwrites) documents by id. */
  push(path: string, docs: any[]): Promise<void>;
}

export const TOMBSTONE_TTL = 30 * 864e5;
export const MAX_DOC_BYTES = 900_000;

export interface CollectionSyncOptions {
  remote: RemoteStore;
  basePath: string;
  coll: CollectionName;
  /** cursor namespace, e.g. uid or "org:<id>" */
  scopeKey: string;
  /** Records of this scope carry orgId = scopeOrg (null = personal). */
  scopeOrg: string | null;
  strategy: 'newest' | 'keep-both';
  readOnly: boolean;
  conflicts: ConflictEntry[];
  /** Transform before upload (encryption, field stripping). Return null to skip a record. */
  outgoing?: (rec: any) => Promise<any | null>;
  /** Transform after download (re-encryption with the device key). */
  incoming?: (rec: any) => Promise<any>;
  /** Only push records the user is allowed to write (RBAC). */
  canWrite?: (rec: any) => boolean;
  now?: () => number;
}

export function clean(r: any) {
  const o: any = {};
  for (const [k, v] of Object.entries(r)) if (v !== undefined) o[k] = v;
  return o;
}

/** Pure decision for one record present on both sides. */
export function decide(local: { updatedAt: number; deleted?: boolean } | undefined, remote: { updatedAt: number; deleted?: boolean }, lastPush: number, readOnly: boolean): 'take-remote' | 'keep-local' | 'same' | 'conflict-remote-wins' | 'conflict-local-wins' {
  if (!local) return 'take-remote';
  if (local.updatedAt === remote.updatedAt) return 'same';
  if (remote.updatedAt > local.updatedAt) return local.updatedAt > lastPush && !readOnly ? 'conflict-remote-wins' : 'take-remote';
  return remote.updatedAt > lastPush ? 'conflict-local-wins' : 'keep-local';
}

export async function syncCollection(o: CollectionSyncOptions): Promise<{ pulled: number; pushed: number; skipped: number }> {
  const now = o.now || Date.now;
  const metaKey = `sync:${o.scopeKey}:${o.coll}`;
  const meta = ((await metaGet<any>(metaKey)) || { lastPull: 0, lastPush: 0 }) as { lastPull: number; lastPush: number };
  const path = `${o.basePath}/${o.coll}`;
  const remoteDocs = await o.remote.pull(path, meta.lastPull);
  const toPut: any[] = [];
  const keepLocal = new Set<string>();
  let maxPulled = meta.lastPull;
  for (const raw of remoteDocs) {
    const r = { ...(o.incoming ? await o.incoming(raw) : raw), orgId: o.scopeOrg };
    maxPulled = Math.max(maxPulled, r.updatedAt || 0);
    const l = await getOne<any>(o.coll, r.id);
    const d = decide(l, r, meta.lastPush, o.readOnly);
    const name = l?.name || r.name || r.id;
    switch (d) {
      case 'take-remote': toPut.push(r); break;
      case 'same': break;
      case 'keep-local': keepLocal.add(r.id); break;
      case 'conflict-remote-wins':
        if (o.strategy === 'keep-both' && !l.deleted && !r.deleted) {
          toPut.push({ ...l, id: newId(o.coll.slice(0, 3)), name: `${l.name} (conflict copy)`, shortcut: l.shortcut ? l.shortcut + '-copy' : l.shortcut, updatedAt: now() });
          o.conflicts.push({ at: now(), collection: o.coll, id: l.id, name, resolution: 'kept-both' });
        } else o.conflicts.push({ at: now(), collection: o.coll, id: l.id, name, resolution: 'remote-won' });
        toPut.push(r);
        break;
      case 'conflict-local-wins':
        o.conflicts.push({ at: now(), collection: o.coll, id: l.id, name, resolution: 'local-won' });
        keepLocal.add(r.id);
        break;
    }
  }
  if (toPut.length) await putMany(o.coll, toPut);
  const pulledIds = new Set(toPut.map((x) => x.id));
  let pushed = 0;
  let skipped = 0;
  if (!o.readOnly) {
    const local = (await getAll<any>(o.coll)).filter((x) => (x.orgId || null) === o.scopeOrg && !pulledIds.has(x.id) && (x.updatedAt > meta.lastPush || keepLocal.has(x.id)));
    const out: any[] = [];
    for (const rec of local) {
      if (o.canWrite && !o.canWrite(rec)) { skipped++; continue; }
      const { orgId: _o, teamId: _t, ...rest } = rec;
      const data = o.outgoing ? await o.outgoing(rest) : rest;
      if (!data) { skipped++; continue; }
      const c = clean(data);
      if (JSON.stringify(c).length > MAX_DOC_BYTES) { o.conflicts.push({ at: now(), collection: o.coll, id: rec.id, name: `${rec.name || rec.id} (too large to sync, >900 KB)`, resolution: 'local-won' }); skipped++; continue; }
      out.push(c);
    }
    for (let i = 0; i < out.length; i += 400) await o.remote.push(path, out.slice(i, i + 400));
    pushed = out.length;
  }
  const t = now();
  await metaSet(metaKey, { lastPull: maxPulled, lastPush: t });
  const old = (await getAll<any>(o.coll)).filter((x) => x.deleted && (x.orgId || null) === o.scopeOrg && t - x.updatedAt > TOMBSTONE_TTL);
  if (old.length) await hardDelete(o.coll, old.map((x) => x.id));
  return { pulled: toPut.length, pushed, skipped };
}

export async function resetCursors(scopeKey: string, colls: CollectionName[]) {
  for (const c of colls) await metaSet(`sync:${scopeKey}:${c}`, null);
}

/** In-memory RemoteStore (tests, offline simulation). */
export class MemoryRemote implements RemoteStore {
  data = new Map<string, Map<string, any>>();
  writes = 0;
  async pull(path: string, since: number) {
    return [...(this.data.get(path)?.values() || [])].filter((d) => (d.updatedAt || 0) > since).map((d) => JSON.parse(JSON.stringify(d)));
  }
  async push(path: string, docs: any[]) {
    if (!this.data.has(path)) this.data.set(path, new Map());
    for (const d of docs) { this.data.get(path)!.set(d.id, JSON.parse(JSON.stringify(d))); this.writes++; }
  }
}
