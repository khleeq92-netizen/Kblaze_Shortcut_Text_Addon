// Encryption at rest for sensitive dataset columns (Aadhaar, mobile, DOB…).
// Values are encrypted with the non-extractable device key before they are written
// to IndexedDB and decrypted in memory only when an automation or the grid needs them.
import type { DataTable } from '../shared/types';
import { encryptLocal, decryptValue, isEncrypted, encryptWith } from '../security/crypto';

export async function protectTable(t: DataTable): Promise<DataTable> {
  const cols = t.sensitiveColumns || [];
  if (!cols.length) return t;
  const rows = await Promise.all(t.rows.map(async (r) => {
    const values = { ...r.values };
    for (const c of cols) {
      const v = values[c];
      if (v === null || v === undefined || v === '' || isEncrypted(v)) continue;
      values[c] = await encryptLocal(String(v));
    }
    return { ...r, values };
  }));
  return { ...t, rows };
}

/** Decrypts all encrypted values. Values that cannot be decrypted (master key locked) become ''. */
export async function unprotectTable(t: DataTable, master?: CryptoKey | null): Promise<DataTable & { locked?: number }> {
  let locked = 0;
  const rows = await Promise.all(t.rows.map(async (r) => {
    let changed = false;
    const values = { ...r.values };
    for (const [k, v] of Object.entries(values)) {
      if (!isEncrypted(v)) continue;
      changed = true;
      try { values[k] = await decryptValue(v, master); } catch { values[k] = ''; locked++; }
    }
    return changed ? { ...r, values } : r;
  }));
  return { ...t, rows, locked };
}

/** For cloud sync: re-encrypt sensitive values with the passphrase-derived key so other devices can read them. */
export async function toPortable(t: DataTable, master: CryptoKey): Promise<DataTable> {
  const cols = t.sensitiveColumns || [];
  const rows = await Promise.all(t.rows.map(async (r) => {
    const values = { ...r.values };
    for (const c of cols) {
      const v = values[c];
      if (v === null || v === undefined || v === '') continue;
      const plain = await decryptValue(v, master);
      values[c] = await encryptWith(master, plain);
    }
    return { ...r, values };
  }));
  return { ...t, rows };
}

export function hasSensitive(t: DataTable) { return (t.sensitiveColumns || []).length > 0; }
