// AI provider API keys: encrypted at rest with the non-extractable device key
// (never synced). Only extension pages read them, right before a request.
import { metaGet, metaSet } from '../shared/db';
import { encryptLocal, decryptValue } from '../security/crypto';

const k = (provider: string) => `ai:key:${provider}`;

export async function setApiKey(provider: string, key: string) {
  if (!key) { await metaSet(k(provider), null); return; }
  await metaSet(k(provider), await encryptLocal(key.trim()));
}
export async function getApiKey(provider: string): Promise<string | null> {
  const v = await metaGet<string>(k(provider));
  if (!v) return null;
  try { return await decryptValue(v); } catch { return null; }
}
export async function hasApiKey(provider: string) { return !!(await metaGet<string>(k(provider))); }
