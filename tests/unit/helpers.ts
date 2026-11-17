// Test helpers: a fresh in-memory IndexedDB per test file / test.
import { IDBFactory } from 'fake-indexeddb';
import { setIndexedDB } from '@/shared/db';
import { resetDeviceKeyCache } from '@/security/crypto';

export function freshDB() {
  const f = new IDBFactory();
  setIndexedDB(f as any);
  resetDeviceKeyCache();
  return f;
}

export function html(body: string) {
  document.body.innerHTML = body;
  return document;
}
