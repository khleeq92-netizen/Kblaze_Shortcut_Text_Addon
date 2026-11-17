// Firestore-backed synchronization (dashboard / side panel only — Firebase is
// never loaded into content scripts). Personal data lives in users/{uid}/…,
// organization-shared data in orgs/{orgId}/…. Free-tier friendly: incremental
// queries, batched writes, sync only while a K-Flow page is open.
import { collection, doc, getDocs, query, where, writeBatch, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { metaGet, metaSet, notifyChanged } from '../shared/db';
import { loadSettings, saveSettings } from '../shared/settings';
import { storageSet, storageGet } from '../shared/browser';
import { STORAGE_KEYS } from '../shared/constants';
import type { CollectionName, SyncState, ConflictEntry, DataTable } from '../shared/types';
import { syncCollection, resetCursors, type RemoteStore } from './engine';
import { masterKey, vaultConfig, adoptVaultConfig } from '../security/vault';
import { toPortable, unprotectTable, protectTable, hasSensitive } from '../data/protect';
import { getOrgState } from '../shared/orgState';
import { refreshOrgState, ORG_COLLECTIONS, heartbeatDevice } from './org';
import { canOnRecord } from '../shared/orgState';
import type { Resource } from '../security/permissions';

export const PERSONAL: CollectionName[] = ['workspaces', 'folders', 'snippets', 'tables', 'templates', 'autofill', 'macros', 'scripts', 'variables', 'vault', 'workflows'];

let running: Promise<SyncState> | null = null;

export async function getSyncState(): Promise<SyncState> {
  return (await storageGet<SyncState>(STORAGE_KEYS.sync)) || { status: 'disabled', lastSyncAt: null, conflicts: [] };
}
async function setSyncState(p: Partial<SyncState>) {
  const next = { ...(await getSyncState()), ...p };
  await storageSet(STORAGE_KEYS.sync, next);
  return next;
}

export function firestoreRemote(db: any): RemoteStore {
  return {
    async pull(path, since) {
      const ref = collection(db, path);
      const snap = await getDocs(since ? query(ref, where('updatedAt', '>', since)) : ref);
      return snap.docs.map((d) => ({ ...(d.data() as any), id: d.id }));
    },
    async push(path, docs) {
      const batch = writeBatch(db);
      for (const d of docs) batch.set(doc(db, `${path}/${d.id}`), d);
      await batch.commit();
    },
  };
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
    await setDoc(ref, { settings: JSON.parse(JSON.stringify(s)), updatedAt: localAt || Date.now() });
  }
}

/** The vault config (salt + verifier, never the passphrase or key) syncs so the same passphrase unlocks secrets on every device. */
async function syncVaultConfig(db: any, uid: string) {
  const ref = doc(db, `users/${uid}/meta/crypto`);
  const remote = await getDoc(ref);
  const local = await vaultConfig();
  const r = remote.exists() ? (remote.data() as any) : null;
  if (r?.vault && (!local || r.vault.updatedAt > local.updatedAt)) await adoptVaultConfig(r.vault);
  else if (local && (!r?.vault || local.updatedAt > r.vault.updatedAt)) await setDoc(ref, { vault: local, updatedAt: Date.now() });
}

/** Datasets with sensitive columns leave the device only re-encrypted with the passphrase key, and only if enabled. */
async function tableOutgoing(rec: DataTable, allowSensitive: boolean, notes: ConflictEntry[]): Promise<any | null> {
  if (!hasSensitive(rec) || rec.deleted) return rec;
  if (!allowSensitive) { notes.push({ at: Date.now(), collection: 'tables', id: rec.id, name: `${rec.name} (not synced: contains sensitive columns — enable encrypted sync in Settings → Security)`, resolution: 'local-won' }); return null; }
  const mk = await masterKey();
  if (!mk) { notes.push({ at: Date.now(), collection: 'tables', id: rec.id, name: `${rec.name} (not synced: unlock the vault to encrypt sensitive columns)`, resolution: 'local-won' }); return null; }
  return toPortable(rec, mk);
}
async function tableIncoming(rec: DataTable): Promise<DataTable> {
  if (!hasSensitive(rec)) return rec;
  const mk = await masterKey();
  if (!mk) return rec; // stays passphrase-encrypted until the vault is unlocked
  return protectTable(await unprotectTable(rec, mk));
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
    const remote = firestoreRemote(fb.db);
    try {
      const lastUid = await metaGet<string>('sync:lastUid');
      if (lastUid && lastUid !== user.uid) await resetCursors(lastUid, PERSONAL);
      await metaSet('sync:lastUid', user.uid);
      await syncVaultConfig(fb.db, user.uid);
      const org = await refreshOrgState().catch(() => getOrgState());
      const allowSensitive = settings.security.syncSensitive && (!org || org.policies.allowSensitiveSync || !org.orgId);
      let pulled = 0;
      for (const c of PERSONAL) {
        const r = await syncCollection({
          remote, basePath: `users/${user.uid}`, coll: c, scopeKey: user.uid, scopeOrg: null, strategy: settings.conflictStrategy, readOnly: false, conflicts,
          outgoing: c === 'tables' ? (rec) => tableOutgoing(rec, allowSensitive, conflicts) : undefined,
          incoming: c === 'tables' ? tableIncoming : undefined,
        });
        pulled += r.pulled;
      }
      if (org && !org.revoked) {
        for (const c of ORG_COLLECTIONS) {
          const res: Resource = c === 'tables' ? 'datasets' : (c as Resource);
          const r = await syncCollection({
            remote, basePath: `orgs/${org.orgId}`, coll: c, scopeKey: `org:${org.orgId}`, scopeOrg: org.orgId, strategy: settings.conflictStrategy, readOnly: false, conflicts,
            canWrite: (rec) => canOnRecord(org, rec, rec.deleted ? 'delete' : 'edit', res),
            outgoing: c === 'tables' ? (rec) => tableOutgoing(rec, allowSensitive && org.policies.allowSensitiveSync, conflicts) : async (rec) => ({ ...rec, updatedBy: user.uid }),
            incoming: c === 'tables' ? tableIncoming : undefined,
          });
          pulled += r.pulled;
        }
        await heartbeatDevice().catch(() => {});
      }
      await syncSettings(fb.db, user.uid);
      if (pulled) await notifyChanged([...PERSONAL], 'sync');
      const prev = await getSyncState();
      return setSyncState({ status: 'idle', lastSyncAt: Date.now(), lastError: undefined, conflicts: [...conflicts, ...prev.conflicts].slice(0, 50) });
    } catch (e: any) {
      return setSyncState({ status: 'error', lastError: e?.code === 'permission-denied' ? 'Permission denied — deploy firebase/firestore.rules to your project (or your organization role does not allow this change).' : e?.message || String(e) });
    }
  })();
  try { return await running; } finally { running = null; }
}

/** Forces a full re-sync on next run (e.g. after restoring a backup). */
export async function resetSyncCursors() {
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!u) return;
  await resetCursors(u.uid, PERSONAL);
  const org = await getOrgState();
  if (org) await resetCursors(`org:${org.orgId}`, ORG_COLLECTIONS);
}
