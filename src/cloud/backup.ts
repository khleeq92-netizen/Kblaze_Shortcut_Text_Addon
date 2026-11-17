// Backup & recovery.
//  Local file backup: everything (all workspaces, profiles, macros, scripts,
//  variables, datasets, templates, settings, vault ciphertext). With a passphrase
//  the whole file is AES-GCM encrypted and includes sensitive dataset values;
//  without one, sensitive column values are left out (never written in plain text).
//  Cloud backup: always encrypted with the vault master key, split into <800 KB
//  Firestore documents, last 5 kept.
import { getAll, putMany, hardDelete, notifyChanged, metaGet, metaSet } from '../shared/db';
import { loadSettings, saveSettings } from '../shared/settings';
import type { CollectionName, DataTable, Settings } from '../shared/types';
import { unprotectTable, protectTable } from '../data/protect';
import { masterKey, vaultConfig, adoptVaultConfig, type VaultConfig } from '../security/vault';
import { deriveKey, aesEncrypt, aesDecrypt, randomBytes, b64, unb64, PBKDF2_ITERATIONS } from '../security/crypto';

export const BACKUP_COLLECTIONS: CollectionName[] = ['workspaces', 'folders', 'snippets', 'templates', 'tables', 'autofill', 'macros', 'scripts', 'variables', 'vault', 'workflows'];
export const BACKUP_FORMAT = 'k-flow-backup';

export interface BackupBundle {
  format: typeof BACKUP_FORMAT;
  version: 2;
  createdAt: number;
  app: string;
  data: Partial<Record<CollectionName, any[]>>;
  settings?: Partial<Settings>;
  vaultConfig?: VaultConfig | null;
  sensitiveIncluded: boolean;
  counts: Record<string, number>;
  executions?: any[];
  audit?: any[];
}

export interface EncryptedBackup { format: 'k-flow-backup-enc'; version: 2; createdAt: number; salt?: string; iterations?: number; iv: string; ct: string; keyType: 'passphrase' | 'vault' }

export async function createBundle(opts: { includeSensitive: boolean; includeHistory?: boolean }): Promise<BackupBundle> {
  const data: BackupBundle['data'] = {};
  const counts: Record<string, number> = {};
  const mk = await masterKey();
  for (const c of BACKUP_COLLECTIONS) {
    let recs = (await getAll<any>(c)).filter((r) => !r.deleted && !r.orgId);
    if (c === 'tables') {
      recs = await Promise.all(recs.map(async (t: DataTable) => {
        const plain = await unprotectTable(t, mk);
        if (opts.includeSensitive) return plain;
        const sens = new Set(t.sensitiveColumns || []);
        return { ...plain, rows: plain.rows.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, sens.has(k) ? '' : v])) })), sensitiveStripped: sens.size > 0 };
      }));
    }
    data[c] = recs;
    counts[c] = recs.length;
  }
  const settings = await loadSettings();
  const b: BackupBundle = { format: BACKUP_FORMAT, version: 2, createdAt: Date.now(), app: 'K-Flow Automation', data, settings, vaultConfig: await vaultConfig(), sensitiveIncluded: opts.includeSensitive, counts };
  if (opts.includeHistory) { b.executions = await getAll('executions'); b.audit = await getAll('audit'); }
  return b;
}

export async function encryptBundle(bundle: BackupBundle, passphrase: string): Promise<EncryptedBackup> {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  const { iv, ct } = await aesEncrypt(key, JSON.stringify(bundle), BACKUP_FORMAT);
  return { format: 'k-flow-backup-enc', version: 2, createdAt: bundle.createdAt, salt: b64(salt), iterations: PBKDF2_ITERATIONS, iv, ct, keyType: 'passphrase' };
}

export async function exportBackup(opts: { passphrase?: string; includeHistory?: boolean }): Promise<string> {
  const bundle = await createBundle({ includeSensitive: !!opts.passphrase, includeHistory: opts.includeHistory });
  if (!opts.passphrase) return JSON.stringify(bundle, null, 2);
  return JSON.stringify(await encryptBundle(bundle, opts.passphrase));
}

export async function parseBackup(text: string, passphrase?: string, key?: CryptoKey): Promise<BackupBundle> {
  let o: any;
  try { o = JSON.parse(text); } catch { throw new Error('Not a K-Flow backup file (invalid JSON)'); }
  if (o?.format === 'k-flow-backup-enc') {
    let k = key;
    if (!k) {
      if (!passphrase) throw new Error('This backup is encrypted — enter its passphrase');
      k = await deriveKey(passphrase, unb64(o.salt), o.iterations || PBKDF2_ITERATIONS);
    }
    let plain: string;
    try { plain = await aesDecrypt(k, o.iv, o.ct, BACKUP_FORMAT); } catch { throw new Error('Wrong passphrase or damaged backup'); }
    o = JSON.parse(plain);
  }
  if (o?.format !== BACKUP_FORMAT || typeof o.data !== 'object') throw new Error('Not a K-Flow backup file');
  for (const [c, list] of Object.entries(o.data)) {
    if (!BACKUP_COLLECTIONS.includes(c as CollectionName) || !Array.isArray(list)) delete o.data[c];
    else o.data[c] = (list as any[]).filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id.length <= 80).slice(0, 100000);
  }
  return o as BackupBundle;
}

export async function restoreBackup(b: BackupBundle, mode: 'merge' | 'replace'): Promise<Record<string, number>> {
  const restored: Record<string, number> = {};
  for (const c of BACKUP_COLLECTIONS) {
    let incoming = (b.data[c] || []).map((r) => ({ ...r, orgId: null }));
    if (c === 'tables') incoming = await Promise.all(incoming.map((t: DataTable) => protectTable(t)));
    const existing = await getAll<any>(c);
    if (mode === 'replace') {
      const personal = existing.filter((r) => !r.orgId).map((r) => r.id);
      if (personal.length) await hardDelete(c, personal);
    } else {
      const byId = new Map(existing.map((r) => [r.id, r]));
      incoming = incoming.filter((r: any) => !byId.has(r.id) || (byId.get(r.id).updatedAt || 0) <= (r.updatedAt || 0) || byId.get(r.id).deleted);
    }
    // bump timestamps so the restored state wins the next cloud sync
    const now = Date.now();
    if (incoming.length) await putMany(c, incoming.map((r: any) => ({ ...r, updatedAt: Math.max(now, r.updatedAt || 0), deleted: false })));
    restored[c] = incoming.length;
  }
  if (b.settings) { const { plan, enforcePlanLimits, ...rest } = b.settings as any; await saveSettings(rest); }
  if (b.vaultConfig) await adoptVaultConfig(b.vaultConfig);
  if (b.executions?.length) await putMany('executions', b.executions);
  if (b.audit?.length) await putMany('audit', b.audit);
  await notifyChanged([...BACKUP_COLLECTIONS]);
  return restored;
}

// ---------------------------------------------------------------- cloud
const CHUNK = 750_000;

async function fs() {
  const { getFirebase } = await import('./firebase');
  const f = await import('firebase/firestore');
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!fb || !u) throw new Error('Sign in to use cloud backups');
  return { f, db: fb.db, uid: u.uid };
}

export async function uploadCloudBackup(label = 'Manual backup'): Promise<string> {
  const mk = await masterKey();
  if (!mk) throw new Error('Unlock the vault first — cloud backups are encrypted with your vault passphrase');
  const { f, db, uid } = await fs();
  const bundle = await createBundle({ includeSensitive: true });
  const { iv, ct } = await aesEncrypt(mk, JSON.stringify(bundle), BACKUP_FORMAT);
  const ref = f.doc(f.collection(db, `users/${uid}/backups`));
  const chunks = Math.ceil(ct.length / CHUNK) || 1;
  for (let i = 0; i < chunks; i++) await f.setDoc(f.doc(db, `users/${uid}/backups/${ref.id}/chunks/${i}`), { i, data: ct.slice(i * CHUNK, (i + 1) * CHUNK) });
  await f.setDoc(ref, { createdAt: bundle.createdAt, label: label.slice(0, 100), iv, chunks, size: ct.length, counts: bundle.counts, keyType: 'vault', device: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '' });
  await pruneCloudBackups(5);
  await metaSet('backup:lastCloud', Date.now());
  return ref.id;
}

export async function listCloudBackups(): Promise<{ id: string; createdAt: number; label: string; size: number; counts: Record<string, number> }[]> {
  const { f, db, uid } = await fs();
  const snap = await f.getDocs(f.query(f.collection(db, `users/${uid}/backups`), f.orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function downloadCloudBackup(id: string): Promise<BackupBundle> {
  const mk = await masterKey();
  if (!mk) throw new Error('Unlock the vault to decrypt the backup');
  const { f, db, uid } = await fs();
  const head = await f.getDoc(f.doc(db, `users/${uid}/backups/${id}`));
  if (!head.exists()) throw new Error('Backup not found');
  const h = head.data() as any;
  let ct = '';
  for (let i = 0; i < h.chunks; i++) { const c = await f.getDoc(f.doc(db, `users/${uid}/backups/${id}/chunks/${i}`)); ct += (c.data() as any)?.data || ''; }
  return parseBackup(JSON.stringify({ format: 'k-flow-backup-enc', version: 2, createdAt: h.createdAt, iv: h.iv, ct, keyType: 'vault' }), undefined, mk);
}

export async function deleteCloudBackup(id: string) {
  const { f, db, uid } = await fs();
  const head = await f.getDoc(f.doc(db, `users/${uid}/backups/${id}`));
  const n = head.exists() ? (head.data() as any).chunks || 0 : 0;
  for (let i = 0; i < n; i++) await f.deleteDoc(f.doc(db, `users/${uid}/backups/${id}/chunks/${i}`));
  await f.deleteDoc(f.doc(db, `users/${uid}/backups/${id}`));
}

async function pruneCloudBackups(keep: number) {
  const list = await listCloudBackups();
  for (const b of list.slice(keep)) await deleteCloudBackup(b.id);
}

/** Weekly automatic cloud backup (only while the vault is unlocked). */
export async function maybeAutoBackup(): Promise<boolean> {
  const last = (await metaGet<number>('backup:lastCloud')) || 0;
  if (Date.now() - last < 7 * 864e5) return false;
  if (!(await masterKey())) return false;
  await uploadCloudBackup('Automatic weekly backup');
  return true;
}
