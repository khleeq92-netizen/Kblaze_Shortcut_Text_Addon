import { describe, it, expect, beforeEach, vi } from 'vitest';
import { freshDB } from './helpers';

const { saveRecords, getAll, listRecords } = await import('@/shared/db');
const { createBundle, exportBackup, parseBackup, restoreBackup } = await import('@/cloud/backup');
const { protectTable } = await import('@/data/protect');

const table = { id: 'tbl', name: 'Students', key: 'students', columns: [{ id: 'a', name: 'Name', key: 'name', type: 'text' }, { id: 'b', name: 'Aadhaar', key: 'aadhaar', type: 'text' }], rows: [{ id: 'r', values: { name: 'Asha', aadhaar: '123412341234' } }], sensitiveColumns: ['aadhaar'], createdAt: 0, updatedAt: 0 } as any;

beforeEach(async () => {
  freshDB();
  await saveRecords('tables', [await protectTable(table)]);
  await saveRecords('macros', [{ id: 'm1', name: 'Macro', enabled: true, sites: [], steps: [], settings: {}, tags: [], createdAt: 1, updatedAt: 1 } as any]);
});

describe('backup & recovery', () => {
  it('unencrypted backups never contain sensitive values', async () => {
    const text = await exportBackup({});
    expect(text).not.toContain('123412341234');
    expect(text).not.toContain('enc:v1'); // device-key ciphertext is useless elsewhere and not exported
    const b = await parseBackup(text);
    expect(b.sensitiveIncluded).toBe(false);
    expect(b.data.tables![0].rows[0].values).toEqual({ name: 'Asha', aadhaar: '' });
  });
  it('encrypted backups include sensitive values and need the passphrase', async () => {
    const text = await exportBackup({ passphrase: 'Backup-Pass-2025!' });
    expect(text).not.toContain('Asha');
    expect(JSON.parse(text).format).toBe('k-flow-backup-enc');
    await expect(parseBackup(text)).rejects.toThrow(/passphrase/);
    await expect(parseBackup(text, 'wrong-pass-xx')).rejects.toThrow(/Wrong passphrase/);
    const b = await parseBackup(text, 'Backup-Pass-2025!');
    expect(b.data.tables![0].rows[0].values.aadhaar).toBe('123412341234');
  }, 20000);
  it('restore: merge keeps local items, replace clears personal data; sensitive values re-encrypted', async () => {
    const b = await createBundle({ includeSensitive: true });
    await saveRecords('macros', [{ id: 'm2', name: 'Local only', enabled: true, sites: [], steps: [], settings: {}, tags: [], createdAt: 1, updatedAt: 1 } as any]);
    await restoreBackup(b, 'merge');
    expect((await listRecords<any>('macros')).map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    await restoreBackup(b, 'replace');
    expect((await listRecords<any>('macros')).map((m) => m.id)).toEqual(['m1']);
    const [t] = await getAll<any>('tables');
    expect(String(t.rows[0].values.aadhaar)).toMatch(/^enc:v1:/);
  });
  it('rejects foreign files', async () => {
    await expect(parseBackup('{"hello":1}')).rejects.toThrow(/Not a K-Flow backup/);
    await expect(parseBackup('not json')).rejects.toThrow(/invalid JSON/);
  });
});
void vi;
