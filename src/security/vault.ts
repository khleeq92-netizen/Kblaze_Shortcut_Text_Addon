// Credential vault. Secrets are encrypted with the master key derived from the
// user's passphrase; the passphrase itself is never stored. While unlocked, the
// derived key lives only in chrome.storage.session (memory, trusted contexts
// only, cleared when the browser closes) and is wiped after the auto-lock time.
import { metaGet, metaSet, listRecords, saveRecords } from '../shared/db';
import { deriveKey, exportRaw, importRaw, aesEncrypt, aesDecrypt, randomBytes, b64, unb64, PBKDF2_ITERATIONS, checkPassphrase } from './crypto';
import type { VaultEntry } from '../shared/types';
import { uid } from '../shared/ids';
import { hostMatches } from '../automation/sites';

const META = 'vault:config';
const SESSION_KEY = 'kf.vaultSession';
const VERIFIER = 'k-flow-vault-ok';

export interface VaultConfig { salt: string; iterations: number; verifierIv: string; verifierCt: string; createdAt: number; updatedAt: number }

// memory fallback for contexts without chrome.storage.session (tests)
let memSession: { key: string; expires: number } | null = null;
const sessionArea = () => (globalThis as any).chrome?.storage?.session as chrome.storage.StorageArea | undefined;

async function sessionGet(): Promise<{ key: string; expires: number } | null> {
  const s = sessionArea();
  if (!s) return memSession;
  const r = await new Promise<any>((res) => s.get(SESSION_KEY, res));
  return r?.[SESSION_KEY] || null;
}
async function sessionSet(v: { key: string; expires: number } | null) {
  const s = sessionArea();
  if (!s) { memSession = v; return; }
  await new Promise<void>((res) => (v ? s.set({ [SESSION_KEY]: v }, () => res()) : s.remove(SESSION_KEY, () => res())));
}

export async function vaultConfig(): Promise<VaultConfig | null> { return (await metaGet<VaultConfig>(META)) || null; }
export async function isVaultSetUp() { return !!(await vaultConfig()); }

export async function setupVault(passphrase: string, opts: { allowWeak?: boolean } = {}): Promise<void> {
  if (await vaultConfig()) throw new Error('The vault is already set up — use "Change passphrase" instead');
  const chk = checkPassphrase(passphrase);
  if (!chk.ok && !opts.allowWeak) throw new Error(chk.message);
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  const v = await aesEncrypt(key, VERIFIER);
  const now = Date.now();
  await metaSet(META, { salt: b64(salt), iterations: PBKDF2_ITERATIONS, verifierIv: v.iv, verifierCt: v.ct, createdAt: now, updatedAt: now } satisfies VaultConfig);
  await rememberKey(key, 15);
}

/** Imports a vault configuration from cloud (other device) so the same passphrase unlocks synced secrets. */
export async function adoptVaultConfig(cfg: VaultConfig) {
  const cur = await vaultConfig();
  if (!cur || cur.updatedAt < cfg.updatedAt) await metaSet(META, cfg);
}

async function rememberKey(key: CryptoKey, minutes: number) {
  await sessionSet({ key: await exportRaw(key), expires: Date.now() + Math.max(1, minutes) * 60_000 });
}

export async function unlockVault(passphrase: string, autoLockMin = 15): Promise<void> {
  const cfg = await vaultConfig();
  if (!cfg) throw new Error('Set up the vault first');
  const key = await deriveKey(passphrase, unb64(cfg.salt), cfg.iterations);
  try { if ((await aesDecrypt(key, cfg.verifierIv, cfg.verifierCt)) !== VERIFIER) throw new Error(); } catch { throw new Error('Wrong passphrase'); }
  await rememberKey(key, autoLockMin);
}

export async function lockVault() { await sessionSet(null); }

/** The master key if the vault is unlocked (and not expired); extends the auto-lock timer. */
export async function masterKey(touchMinutes?: number): Promise<CryptoKey | null> {
  const s = await sessionGet();
  if (!s) return null;
  if (Date.now() > s.expires) { await lockVault(); return null; }
  if (touchMinutes) await sessionSet({ key: s.key, expires: Date.now() + touchMinutes * 60_000 });
  return importRaw(s.key);
}
export async function isUnlocked() { return !!(await masterKey()); }

export async function changePassphrase(oldPass: string, newPass: string) {
  await unlockVault(oldPass);
  const oldKey = (await masterKey())!;
  const chk = checkPassphrase(newPass);
  if (!chk.ok) throw new Error(chk.message);
  const entries = await listRecords<VaultEntry>('vault');
  const plain = await Promise.all(entries.map(async (e) => ({ e, v: await aesDecrypt(oldKey, e.iv, e.cipher, e.id) })));
  const salt = randomBytes(16);
  const key = await deriveKey(newPass, salt);
  const ver = await aesEncrypt(key, VERIFIER);
  const re = await Promise.all(plain.map(async ({ e, v }) => { const c = await aesEncrypt(key, v, e.id); return { ...e, iv: c.iv, cipher: c.ct }; }));
  const cfg = (await vaultConfig())!;
  await metaSet(META, { ...cfg, salt: b64(salt), iterations: PBKDF2_ITERATIONS, verifierIv: ver.iv, verifierCt: ver.ct, updatedAt: Date.now() });
  if (re.length) await saveRecords('vault', re);
  await rememberKey(key, 15);
}

export async function saveSecret(p: { id?: string; name: string; key: string; secret?: string; username?: string; domains?: string[]; note?: string; workspaceId?: string }, existing?: VaultEntry): Promise<VaultEntry> {
  const mk = await masterKey(15);
  if (!mk) throw new Error('Unlock the vault first');
  if (!/^[A-Za-z_]\w{0,63}$/.test(p.key)) throw new Error('Key may contain letters, numbers and _ only');
  const id = existing?.id || p.id || uid('vlt');
  let iv = existing?.iv || '';
  let cipher = existing?.cipher || '';
  if (p.secret !== undefined || !existing) {
    const c = await aesEncrypt(mk, p.secret ?? '', id);
    iv = c.iv; cipher = c.ct;
  }
  const now = Date.now();
  const entry: VaultEntry = { ...(existing || { createdAt: now, updatedAt: now }), id, name: p.name, key: p.key, username: p.username, domains: p.domains || [], note: p.note, iv, cipher, workspaceId: p.workspaceId } as VaultEntry;
  const [saved] = await saveRecords('vault', [entry]);
  return saved;
}

export async function revealSecret(e: VaultEntry): Promise<string> {
  const mk = await masterKey(15);
  if (!mk) throw new Error('Unlock the vault first');
  return aesDecrypt(mk, e.iv, e.cipher, e.id);
}

/** Decrypted vault values by key for a given host (entries limited to domains). Null when locked. */
export async function vaultValues(host?: string): Promise<Record<string, string> | null> {
  const mk = await masterKey(15);
  if (!mk) return null;
  const out: Record<string, string> = {};
  for (const e of await listRecords<VaultEntry>('vault')) {
    if (host && e.domains?.length && !e.domains.some((d) => hostMatches(host, d))) continue;
    try { out[e.key] = await aesDecrypt(mk, e.iv, e.cipher, e.id); if (e.username) out[e.key + '_user'] = e.username; } catch { /* skip corrupted */ }
  }
  return out;
}
