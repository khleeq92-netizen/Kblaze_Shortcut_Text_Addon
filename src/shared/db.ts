// Minimal promise-based IndexedDB layer. Used from extension pages and the
// background service worker (all share the extension origin => one database).
import { DB_NAME, DB_VERSION, STORAGE_KEYS } from './constants';
import type { CollectionName, UsageRecord } from './types';
import { api } from './browser';

export const STORES: (CollectionName | 'usage' | 'meta' | 'executions' | 'audit' | 'versions' | 'keys')[] = [
  'snippets', 'folders', 'tables', 'workflows', 'templates', 'usage', 'meta',
  'workspaces', 'autofill', 'macros', 'scripts', 'variables', 'vault', 'executions', 'audit', 'versions', 'keys',
];
const LOG_STORES = new Set(['executions', 'audit', 'versions']);

let dbPromise: Promise<IDBDatabase> | null = null;
let idbFactory: IDBFactory | null = null;
/** For tests: inject fake-indexeddb or similar. */
export function setIndexedDB(f: IDBFactory) {
  idbFactory = f;
  dbPromise = null;
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = (idbFactory || indexedDB).open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (db.objectStoreNames.contains(s)) continue;
        if (s === 'usage') db.createObjectStore(s, { keyPath: 'snippetId' });
        else if (s === 'meta' || s === 'keys') db.createObjectStore(s);
        else if (LOG_STORES.has(s)) {
          const store = db.createObjectStore(s, { keyPath: 'id' });
          store.createIndex(s === 'executions' ? 'startedAt' : 'at', s === 'executions' ? 'startedAt' : 'at');
          if (s === 'versions') store.createIndex('recordId', 'recordId');
        }
        else {
          const store = db.createObjectStore(s, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
}
export async function getOne<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return wrap(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>;
}
export async function putMany(store: string, values: any[], key?: IDBValidKey): Promise<void> {
  if (!values.length) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const v of values) key !== undefined ? os.put(v, key) : os.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function putOne(store: string, value: any, key?: IDBValidKey) {
  return putMany(store, [value], key);
}
export async function hardDelete(store: string, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    for (const k of keys) tx.objectStore(store).delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function clearStore(store: string) {
  const db = await openDB();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).clear());
}

// ---------- Change notification ----------
// Writers bump a revision counter in chrome.storage.local; content scripts and
// other extension pages listen to storage.onChanged and refresh their caches.
type Listener = (info: { collections: string[]; origin: 'local' | 'sync' }) => void;
const listeners = new Set<Listener>();
export function onLocalChange(l: Listener) { listeners.add(l); return () => listeners.delete(l); }

export async function notifyChanged(collections: string[], origin: 'local' | 'sync' = 'local') {
  listeners.forEach((l) => { try { l({ collections, origin }); } catch { /* ignore */ } });
  try {
    if (api?.storage?.local) await new Promise<void>((r) => api.storage.local.set({ [STORAGE_KEYS.revision]: { at: Date.now(), collections, origin } }, () => r()));
  } catch { /* not in extension context (tests) */ }
}

// ---------- Generic record helpers ----------
export async function listRecords<T extends { deleted?: boolean }>(store: CollectionName, includeDeleted = false): Promise<T[]> {
  const all = await getAll<T>(store);
  return includeDeleted ? all : all.filter((r) => !r.deleted);
}

const VERSIONED = new Set<CollectionName>(['snippets', 'autofill', 'macros', 'scripts', 'variables', 'workspaces', 'templates', 'workflows']);
export const VERSIONS_KEPT = 25;
let versionActor = 'local';
export function setVersionActor(a: string) { versionActor = a || 'local'; }

export async function saveRecords<T extends { id: string; updatedAt: number; createdAt: number }>(store: CollectionName, records: T[], opts: { touch?: boolean; origin?: 'local' | 'sync'; snapshot?: boolean } = {}): Promise<T[]> {
  const now = Date.now();
  const out = records.map((r: any) => (opts.touch === false ? r : { ...r, createdAt: r.createdAt || now, updatedAt: now, version: (r.version || 0) + 1 }));
  await putMany(store, out);
  if (VERSIONED.has(store) && opts.origin !== 'sync' && opts.snapshot !== false) await snapshotVersions(store, out);
  await notifyChanged([store], opts.origin || 'local');
  return out;
}

async function snapshotVersions(store: CollectionName, records: any[]) {
  try {
    const entries = records.filter((r) => !r.deleted).map((r) => ({ id: `${r.id}@${r.version || 1}@${r.updatedAt}`, collection: store, recordId: r.id, version: r.version || 1, at: r.updatedAt, actor: versionActor, name: r.name || r.id, snapshot: r }));
    if (!entries.length) return;
    await putMany('versions', entries);
    const db = await openDB();
    for (const rid of new Set(entries.map((e) => e.recordId))) {
      const list = await wrap(db.transaction('versions', 'readonly').objectStore('versions').index('recordId').getAll(rid)) as any[];
      if (list.length > VERSIONS_KEPT) await hardDelete('versions', list.sort((a, b) => a.at - b.at).slice(0, list.length - VERSIONS_KEPT).map((v) => v.id));
    }
  } catch { /* history is best-effort */ }
}

export async function listVersions(recordId: string): Promise<any[]> {
  const db = await openDB();
  const list = await wrap(db.transaction('versions', 'readonly').objectStore('versions').index('recordId').getAll(recordId)) as any[];
  return list.sort((a, b) => b.at - a.at);
}

/** Soft-delete (tombstone) so the deletion can sync. */
export async function deleteRecords(store: CollectionName, ids: string[]) {
  const now = Date.now();
  const existing = await Promise.all(ids.map((id) => getOne<any>(store, id)));
  const toPut = existing.filter(Boolean).map((r) => ({ ...r, deleted: true, updatedAt: now }));
  await putMany(store, toPut);
  if (store === 'snippets') await hardDelete('usage', ids);
  await notifyChanged([store]);
}

// ---------- Usage statistics (local only) ----------
export async function recordUsage(snippetId: string) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const rec = (await getOne<UsageRecord>('usage', snippetId)) || { snippetId, count: 0, lastUsedAt: 0, daily: {} };
  rec.count++;
  rec.lastUsedAt = now.getTime();
  rec.daily[day] = (rec.daily[day] || 0) + 1;
  const keys = Object.keys(rec.daily).sort();
  while (keys.length > 90) delete rec.daily[keys.shift()!];
  await putOne('usage', rec);
  await notifyChanged(['usage']);
}

export async function metaGet<T>(key: string): Promise<T | undefined> {
  return getOne<T>('meta', key);
}
export async function metaSet(key: string, value: unknown) {
  return putOne('meta', value, key);
}
