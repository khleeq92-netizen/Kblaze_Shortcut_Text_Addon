import { api } from './browser';
import { STORAGE_KEYS } from './constants';
import { mergeSettings, buildTimeCloudConfig } from './defaults';
import type { Settings, CloudConfig } from './types';

export async function loadSettings(): Promise<Settings> {
  const r = await new Promise<any>((res) => api.storage.local.get(STORAGE_KEYS.settings, res));
  return mergeSettings(r?.[STORAGE_KEYS.settings]);
}
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await loadSettings();
  const next = mergeSettings({ ...cur, ...patch, profile: { ...cur.profile, ...(patch.profile || {}) }, automation: { ...cur.automation, ...(patch.automation || {}) }, ai: { ...cur.ai, ...(patch.ai || {}) }, security: { ...cur.security, ...(patch.security || {}) } });
  (next as any).updatedAt = Date.now();
  await new Promise<void>((res) => api.storage.local.set({ [STORAGE_KEYS.settings]: next }, () => res()));
  return next;
}
export function onSettingsChanged(cb: (s: Settings) => void) {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[STORAGE_KEYS.settings]) cb(mergeSettings(changes[STORAGE_KEYS.settings].newValue));
  };
  api.storage.onChanged.addListener(l);
  return () => api.storage.onChanged.removeListener(l);
}

export async function loadCloudConfig(): Promise<CloudConfig> {
  const r = await new Promise<any>((res) => api.storage.local.get(STORAGE_KEYS.cloud, res));
  const runtime = r?.[STORAGE_KEYS.cloud] as CloudConfig | undefined;
  const built = buildTimeCloudConfig();
  return {
    firebase: runtime?.firebase?.apiKey ? runtime.firebase : built.firebase,
    googleClientId: runtime?.googleClientId || built.googleClientId,
  };
}
export async function saveCloudConfig(c: CloudConfig) {
  await new Promise<void>((res) => api.storage.local.set({ [STORAGE_KEYS.cloud]: c }, () => res()));
}

export function isSiteBlocked(settings: Settings, host: string): boolean {
  const h = host.toLowerCase();
  return settings.blockedSites.some((b) => {
    const s = b.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return s && (h === s || h.endsWith('.' + s));
  });
}
