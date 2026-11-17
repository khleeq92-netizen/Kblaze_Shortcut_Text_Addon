import { describe, it, expect, beforeEach } from 'vitest';
import { freshDB } from './helpers';
import { encryptLocal, decryptValue, isEncrypted, checkPassphrase, deriveKey, randomBytes, encryptWith, aesEncrypt, aesDecrypt } from '@/security/crypto';
import { setupVault, unlockVault, lockVault, isUnlocked, saveSecret, revealSecret, changePassphrase, vaultValues, masterKey } from '@/security/vault';
import { protectTable, unprotectTable, toPortable } from '@/data/protect';
import { getAll, listRecords } from '@/shared/db';
import type { DataTable, VaultEntry } from '@/shared/types';

const PASS = 'Phulambri#College2025';
beforeEach(() => { freshDB(); });

describe('encryption at rest', () => {
  it('device-key encryption round-trips; ciphertext hides the value', async () => {
    const c = await encryptLocal('1234 5678 9012');
    expect(isEncrypted(c)).toBe(true);
    expect(c).not.toContain('1234');
    expect(await decryptValue(c)).toBe('1234 5678 9012');
    expect(await decryptValue('plain')).toBe('plain');
    const c2 = await encryptLocal('1234 5678 9012');
    expect(c2).not.toBe(c); // random IV
  });
  it('the device key is stored non-extractable', async () => {
    await encryptLocal('x');
    const [key] = await getAll<CryptoKey>('keys');
    expect(key.extractable).toBe(false);
  });
  it('tampered ciphertext and wrong keys fail', async () => {
    const k1 = await deriveKey('a-long-passphrase-1', randomBytes(16), 1000);
    const k2 = await deriveKey('a-long-passphrase-2', randomBytes(16), 1000);
    const { iv, ct } = await aesEncrypt(k1, 'secret', 'aad');
    await expect(aesDecrypt(k2, iv, ct, 'aad')).rejects.toThrow(/Decryption failed/);
    await expect(aesDecrypt(k1, iv, ct, 'other-aad')).rejects.toThrow();
  });
  it('sensitive dataset columns are encrypted in storage and decrypted for use', async () => {
    const t: DataTable = { id: 't', name: 'S', key: 's', columns: [{ id: 'a', name: 'Name', key: 'name', type: 'text' }, { id: 'b', name: 'Aadhaar', key: 'aadhaar', type: 'text' }], rows: [{ id: 'r', values: { name: 'Asha', aadhaar: '123412341234' } }], sensitiveColumns: ['aadhaar'], createdAt: 0, updatedAt: 0 };
    const p = await protectTable(t);
    expect(p.rows[0].values.name).toBe('Asha');
    expect(String(p.rows[0].values.aadhaar)).toMatch(/^enc:v1:/);
    expect(JSON.stringify(p)).not.toContain('123412341234');
    expect((await protectTable(p)).rows[0].values.aadhaar).toBe(p.rows[0].values.aadhaar); // idempotent
    expect((await unprotectTable(p)).rows[0].values.aadhaar).toBe('123412341234');
    const mk = await deriveKey(PASS, randomBytes(16), 1000);
    const portable = await toPortable(p, mk);
    expect(String(portable.rows[0].values.aadhaar)).toMatch(/^encm:v1:/);
    expect((await unprotectTable(portable, mk)).rows[0].values.aadhaar).toBe('123412341234');
    const locked = await unprotectTable(portable, null);
    expect(locked.rows[0].values.aadhaar).toBe('');
    expect(locked.locked).toBe(1);
  });
});

describe('vault', () => {
  it('passphrase strength rules', () => {
    expect(checkPassphrase('short').ok).toBe(false);
    expect(checkPassphrase('password12345').ok).toBe(false);
    expect(checkPassphrase(PASS).ok).toBe(true);
  });
  it('setup, lock, wrong passphrase, unlock, secrets, rekey', async () => {
    await setupVault(PASS);
    expect(await isUnlocked()).toBe(true);
    const e = await saveSecret({ name: 'UDISE login', key: 'udise_pw', secret: 'S3cr3t!', username: 'school01', domains: ['udiseplus.gov.in'] });
    const stored = (await listRecords<VaultEntry>('vault'))[0];
    expect(JSON.stringify(stored)).not.toContain('S3cr3t!');
    expect(await revealSecret(e)).toBe('S3cr3t!');
    expect(await vaultValues('udiseplus.gov.in')).toEqual({ udise_pw: 'S3cr3t!', udise_pw_user: 'school01' });
    expect(await vaultValues('evil.com')).toEqual({});
    await lockVault();
    expect(await vaultValues()).toBeNull();
    await expect(revealSecret(e)).rejects.toThrow(/Unlock/);
    await expect(unlockVault('wrong passphrase!!')).rejects.toThrow(/Wrong passphrase/);
    await unlockVault(PASS);
    await changePassphrase(PASS, 'An0ther-Strong-Pass');
    await lockVault();
    await expect(unlockVault(PASS)).rejects.toThrow(/Wrong/);
    await unlockVault('An0ther-Strong-Pass');
    expect(await revealSecret((await listRecords<VaultEntry>('vault'))[0])).toBe('S3cr3t!');
    await expect(setupVault(PASS)).rejects.toThrow(/already/);
  }, 30000);
  it('auto-lock expires the session key', async () => {
    await setupVault(PASS);
    await unlockVault(PASS, 1);
    expect(await masterKey()).not.toBeNull();
    const real = Date.now;
    Date.now = () => real() + 61_000;
    try { expect(await masterKey()).toBeNull(); } finally { Date.now = real; }
    expect(await masterKey()).toBeNull(); // cleared, not just hidden
  }, 20000);
  it('portable master-key ciphertext', async () => {
    const mk = await deriveKey(PASS, randomBytes(16), 1000);
    const c = await encryptWith(mk, 'x');
    await expect(decryptValue(c, null)).rejects.toThrow(/Unlock/);
    expect(await decryptValue(c, mk)).toBe('x');
  });
});
