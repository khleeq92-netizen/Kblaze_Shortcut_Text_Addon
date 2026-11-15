// Offline-first sync engine: IndexedDB is the source of truth; Firestore mirrors
// it per user (users/{uid}/...) and per team (teams/{teamId}/...).
// - Incremental: pulls docs with updatedAt > lastPull, pushes local changes since lastPush.
// - Deletions propagate as tombstones (deleted: true), purged locally after 30 days.
// - Conflicts (changed on both sides since last sync) are resolved by the user's
//   strategy: "newest" wins or "keep-both" (local copy saved as a duplicate).
import { collection, doc, getDocs, query, where, writeBatch, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { getAll, getOne, putMany, metaGet, metaSet, notifyChanged, hardDelete } from '../shared/db';
import { loadSettings, saveSettings } from '../shared/settings';
import { storageSet, storageGet } from '../shared/browser';
import { STORAGE_KEYS } from '../shared/constants';
import { uid as newId } from '../shared/ids';
import type { CollectionName, SyncState, ConflictEntry } from '../shared/types';
import { listMyTeams } from './teams';

const PERSONAL: CollectionName[] = ['folders', 'snippets', 'tables', 'workflows', 'templates'];
const TEAM: CollectionName[] = ['folders', 'snippets'];
const TOMBSTONE_TTL = 30 * 864e5;
const MAX_DOC_BYTES = 900_000;

let running: Promise<SyncState> | null = null;

export async function getSyncState(): Promise<SyncState> {
  return (await storageGet<SyncState>(STORAGE_KEYS.sync)) || { status: 'disabled', lastSyncAt: null, conflicts: [] };
}
async function setSyncState(p: Partial<SyncState>) {
  const next = { ...(await getSyncState()), ...p };
  await storageSet(STORAGE_KEYS.sync, next);
  return next;
}

function clean(r: any) {
  const o: any = {};
  for (const [k, v] of Object.entries(r)) if (v !== undefined) o[k] = v;
  return o;
}

async function syncCollection(db: any, basePath: string, coll: CollectionName, scopeKey: string, teamId: string | null, conflicts: ConflictEntry[], strategy: 'newest' | 'keep-both', readOnly: boolean) {
  const metaKey = `sync:${scopeKey}:${coll}`;
  const meta = ((await metaGet<any>(metaKey)) || { lastPull: 0, lastPush: 0 }) as { lastPull: number; lastPush: number };
  const remoteRef = collection(db, `${basePath}/${coll}`);
  const snap = await getDocs(meta.lastPull ? query(remoteRef, where('updatedAt', '>', meta.lastPull)) : remoteRef);
  const toPut: any[] = [];
  const pulledIds = new Set<string>();
  let maxPulled = meta.lastPull;
  for (const d of snap.docs) {
    const r = { ...(d.data() as any), id: d.id, teamId };
    maxPulled = Math.max(maxPulled, r.updatedAt || 0);
    const l = await getOne<any>(coll, d.id);
    pulledIds.add(d.id);
    if (!l) { toPut.push(r); continue; }
    if (l.updatedAt === r.updatedAt) continue;
    if (r.updatedAt > l.updatedAt) {
      if (l.updatedAt > meta.lastPush && !readOnly) {
        // changed locally since last sync AND remotely → conflict
        if (strategy === 'keep-both' && !l.deleted && !r.deleted) {
          const copy = { ...l, id: newId(coll.slice(0, 3)), name: `${l.name} (conflict copy)`, shortcut: l.shortcut ? l.shortcut + '-copy' : l.shortcut, updatedAt: Date.now() };
          toPut.push(copy);
          conflicts.push({ at: Date.now(), collection: coll, id: l.id, name: l.name || l.id, resolution: 'kept-both' });
        } else conflicts.push({ at: Date.now(), collection: coll, id: l.id, name: l.name || l.id, resolution: 'remote-won' });
      }
      toPut.push(r);
    } else {
      if (r.updatedAt > meta.lastPush) conflicts.push({ at: Date.now(), collection: coll, id: l.id, name: l.name || l.id, resolution: 'local-won' });
      pulledIds.delete(d.id); // local is newer → push it
    }
  }
  if (toPut.length) await putMany(coll, toPut);

  // push
  let pushed = 0;
  if (!readOnly) {
    const local = (await getAll<any>(coll)).filter((x) => (x.teamId || null) === teamId && x.updatedAt > meta.lastPush && !pulledIds.has(x.id));
    for (let i = 0; i < local.length; i += 400) {
      const batch = writeBatch(db);
      for (const rec of local.slice(i, i + 400)) {
        const { teamId: _t, ...rest } = rec;
        const data = clean(rest);
        if (JSON.stringify(data).length > MAX_DOC_BYTES) { conflicts.push({ at: Date.now(), collection: coll, id: rec.id, name: `${rec.name || rec.id} (too large to sync, >900 KB)`, resolution: 'local-won' }); continue; }
        batch.set(doc(db, `${basePath}/${coll}/${rec.id}`), data);
        pushed++;
      }
      await batch.commit();
    }
  }
  const now = Date.now();
  await metaSet(metaKey, { lastPull: maxPulled, lastPush: now });
  // purge synced tombstones
  const old = (await getAll<any>(coll)).filter((x) => x.deleted && (x.teamId || null) === teamId && now - x.updatedAt > TOMBSTONE_TTL);
  if (old.length) await hardDelete(coll, old.map((x) => x.id));
  return { pulled: toPut.length, pushed };
}

async function syncSettings(db: any, uid: string) {
  const s = await loadSettings();
  if (!s.syncSettings) return;
  const ref = doc(db, `users/${uid}/meta/settings`);
  const remote = await getDoc(ref);
  const localAt = (s as any).updatedAt || 0;
  const r = remote.exists() ? (remote.data() as any) : null;
  if (r && r.updatedAt > localAt) {
    const { plan, enforcePlanLimits, ...rest } = r.settings || {};
    await saveSettings({ ...rest });
  } else if (!r || localAt > r.updatedAt) {
    await setDoc(ref, { settings: clean(s), updatedAt: localAt || Date.now() });
  }
}

export async function syncNow(): Promise<SyncState> {
  if (running) return running;
  running = (async () => {
    const fb = await getFirebase();
    if (!fb) return setSyncState({ status: 'disabled' });
    const user = fb.auth.currentUser;
    if (!user) return setSyncState({ status: 'idle', uid: null, email: null });
    if (typeof navigator !== 'undefined' && !navigator.onLine) return setSyncState({ status: 'offline' });
    await setSyncState({ status: 'syncing', uid: user.uid, email: user.email });
    const settings = await loadSettings();
    const conflicts: ConflictEntry[] = [];
    try {
      // If a different account signs in on this device, start fresh sync cursors.
      const lastUid = await metaGet<string>('sync:lastUid');
      if (lastUid && lastUid !== user.uid) for (const c of PERSONAL) await metaSet(`sync:${lastUid}:${c}`, null);
      await metaSet('sync:lastUid', user.uid);
      let total = { pulled: 0, pushed: 0 };
      for (const c of PERSONAL) {
        const r = await syncCollection(fb.db, `users/${user.uid}`, c, user.uid, null, conflicts, settings.conflictStrategy, false);
        total = { pulled: total.pulled + r.pulled, pushed: total.pushed + r.pushed };
      }
      if (settings.plan === 'business' || settings.plan === 'enterprise') {
        const teams = await listMyTeams().catch(() => []);
        for (const t of teams) {
          const ro = t.myRole === 'viewer';
          for (const c of TEAM) await syncCollection(fb.db, `teams/${t.id}`, c, `team:${t.id}`, t.id, conflicts, settings.conflictStrategy, ro);
        }
      }
      await syncSettings(fb.db, user.uid);
      if (total.pulled) await notifyChanged(PERSONAL, 'sync');
      const prev = await getSyncState();
      return setSyncState({ status: 'idle', lastSyncAt: Date.now(), lastError: undefined, conflicts: [...conflicts, ...prev.conflicts].slice(0, 50) });
    } catch (e: any) {
      return setSyncState({ status: 'error', lastError: e?.code === 'permission-denied' ? 'Permission denied — deploy firebase/firestore.rules to your project.' : e?.message || String(e) });
    }
  })();
  try { return await running; } finally { running = null; }
}

/** Forces a full re-sync on next run (e.g. after restoring a backup). */
export async function resetSyncCursors() {
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!u) return;
  for (const c of PERSONAL) await metaSet(`sync:${u.uid}:${c}`, null);
}
