// Cloud context for the dashboard. Firebase is imported lazily and only when a
// configuration exists, so the app is fully functional offline without it.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { onLocalChange } from '../../shared/db';
import { api, storageGet } from '../../shared/browser';
import { STORAGE_KEYS } from '../../shared/constants';
import type { SyncState } from '../../shared/types';

type CloudMod = typeof import('../../cloud');
export interface CloudUser { uid: string; email: string | null; displayName: string | null; emailVerified: boolean; photoURL: string | null }

interface CloudCtx {
  configured: boolean;
  mod: CloudMod | null;
  user: CloudUser | null;
  sync: SyncState;
  syncNow: () => Promise<void>;
  loading: boolean;
}
const Ctx = createContext<CloudCtx>({ configured: false, mod: null, user: null, sync: { status: 'disabled', lastSyncAt: null, conflicts: [] }, syncNow: async () => {}, loading: false });
export const useCloud = () => useContext(Ctx);

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const { cloud, settings } = useStore();
  const configured = !!cloud.firebase?.apiKey;
  const [mod, setMod] = useState<CloudMod | null>(null);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [sync, setSync] = useState<SyncState>({ status: 'disabled', lastSyncAt: null, conflicts: [] });
  const [loading, setLoading] = useState(configured);
  const timer = useRef<any>(null);

  useEffect(() => {
    storageGet<SyncState>(STORAGE_KEYS.sync).then((s) => s && setSync(s));
    const l = (c: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && c[STORAGE_KEYS.sync]) setSync(c[STORAGE_KEYS.sync].newValue); };
    api.storage.onChanged.addListener(l);
    return () => api.storage.onChanged.removeListener(l);
  }, []);

  useEffect(() => {
    if (!configured) { setMod(null); setUser(null); setLoading(false); return; }
    let off = () => {};
    let cancelled = false;
    setLoading(true);
    import('../../cloud').then(async (m) => {
      if (cancelled) return;
      setMod(m);
      off = await m.onUser((u) => {
        setLoading(false);
        setUser(u ? { uid: u.uid, email: u.email, displayName: u.displayName, emailVerified: u.emailVerified, photoURL: u.photoURL } : null);
        if (u) m.syncNow();
      });
    }).catch(() => setLoading(false));
    return () => { cancelled = true; off(); };
  }, [configured, JSON.stringify(cloud.firebase)]);

  // Automatic sync: debounce after local edits + periodic while the dashboard is open.
  useEffect(() => {
    if (!mod || !user || !settings.autoSync) return;
    const offChange = onLocalChange(({ origin, collections }) => {
      if (origin === 'sync' || (collections.length === 1 && collections[0] === 'usage')) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => mod.syncNow(), 2500);
    });
    const iv = setInterval(() => mod.syncNow(), 2 * 60 * 1000);
    const online = () => mod.syncNow();
    window.addEventListener('online', online);
    return () => { offChange(); clearInterval(iv); clearTimeout(timer.current); window.removeEventListener('online', online); };
  }, [mod, user, settings.autoSync]);

  const value: CloudCtx = { configured, mod, user, sync, loading, syncNow: async () => { if (mod) await mod.syncNow(); } };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
