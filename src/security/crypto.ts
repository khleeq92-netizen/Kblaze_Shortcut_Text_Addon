// Web Crypto helpers.
//  - Device key: AES-GCM-256, generated once, stored NON-EXTRACTABLE in IndexedDB.
//    Encrypts sensitive dataset columns and API keys at rest on this device.
//  - Master key: derived from the user's passphrase (PBKDF2-SHA256, 310k iterations).
//    Encrypts vault secrets and anything that leaves the device (cloud sync, backups).
// Ciphertext format: "enc:v1:<iv b64>:<ct b64>" (device) / "encm:v1:<iv>:<ct>" (master).
import { getOne, putOne } from '../shared/db';

export const PBKDF2_ITERATIONS = 310_000;
const subtle = () => {
  const s = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!s) throw new Error('Web Crypto is not available in this context');
  return s;
};

export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const u = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export function randomBytes(n: number): Uint8Array<ArrayBuffer> { const b = new Uint8Array(new ArrayBuffer(n)); crypto.getRandomValues(b); return b; }

const te = new TextEncoder();
const td = new TextDecoder();

export async function aesEncrypt(key: CryptoKey, plaintext: string, aad?: string): Promise<{ iv: string; ct: string }> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: te.encode(aad) } : {}) }, key, te.encode(plaintext));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function aesDecrypt(key: CryptoKey, iv: string, ct: string, aad?: string): Promise<string> {
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(iv), ...(aad ? { additionalData: te.encode(aad) } : {}) }, key, unb64(ct));
    return td.decode(pt);
  } catch { throw new Error('Decryption failed (wrong key or corrupted data)'); }
}

// ------------------------------------------------------------------ device key
let deviceKey: Promise<CryptoKey> | null = null;
export function resetDeviceKeyCache() { deviceKey = null; }
export function getDeviceKey(): Promise<CryptoKey> {
  if (deviceKey) return deviceKey;
  deviceKey = (async () => {
    const existing = await getOne<CryptoKey>('keys', 'device');
    if (existing) return existing;
    const k = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await putOne('keys', k, 'device');
    return k;
  })();
  deviceKey.catch(() => { deviceKey = null; });
  return deviceKey;
}

export const isEncrypted = (v: unknown): v is string => typeof v === 'string' && (v.startsWith('enc:v1:') || v.startsWith('encm:v1:'));

export async function encryptLocal(plain: string): Promise<string> {
  const { iv, ct } = await aesEncrypt(await getDeviceKey(), plain);
  return `enc:v1:${iv}:${ct}`;
}

export async function encryptWith(key: CryptoKey, plain: string): Promise<string> {
  const { iv, ct } = await aesEncrypt(key, plain);
  return `encm:v1:${iv}:${ct}`;
}

/** Decrypts device- or master-key ciphertext. Plain values pass through. */
export async function decryptValue(v: unknown, master?: CryptoKey | null): Promise<string> {
  if (!isEncrypted(v)) return v === null || v === undefined ? '' : String(v);
  const [prefix, , iv, ct] = v.split(':');
  if (prefix === 'enc') return aesDecrypt(await getDeviceKey(), iv, ct);
  if (!master) throw new Error('Unlock the K-Flow vault to read this encrypted value');
  return aesDecrypt(master, iv, ct);
}

// ------------------------------------------------------------------ passphrase
export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS, extractable = true): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', te.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}

export async function exportRaw(key: CryptoKey): Promise<string> { return b64(await subtle().exportKey('raw', key)); }
export async function importRaw(raw: string): Promise<CryptoKey> { return subtle().importKey('raw', unb64(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }

export interface PassphraseCheck { ok: boolean; score: number; message: string }
export function checkPassphrase(p: string): PassphraseCheck {
  let score = 0;
  if (p.length >= 10) score++;
  if (p.length >= 14) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  if (/^(.)\1+$/.test(p) || /^(password|12345|qwerty|admin)/i.test(p)) score = 0;
  if (p.length < 10) return { ok: false, score, message: 'Use at least 10 characters' };
  return { ok: score >= 3, score, message: score >= 4 ? 'Strong passphrase' : score >= 3 ? 'Good passphrase' : 'Add upper/lower case letters, numbers or symbols' };
}

export async function sha256(s: string): Promise<string> {
  return b64(await subtle().digest('SHA-256', te.encode(s)));
}
