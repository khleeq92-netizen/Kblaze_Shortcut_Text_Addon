// Dashboard state: a live view over IndexedDB + settings, plus CRUD actions.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { listRecords, saveRecords, deleteRecords, getAll, onLocalChange, putMany } from '../../shared/db';
import { loadSettings, saveSettings, onSettingsChanged, loadCloudConfig } from '../../shared/settings';
import { api } from '../../shared/browser';
import { STORAGE_KEYS } from '../../shared/constants';
import { uid } from '../../shared/ids';
import { limitOf, hasFeature, type Feature } from '../../shared/plans';
import { applyTheme } from '../../ui/theme';
import type { Snippet, Folder, DataTable, Workflow, UserTemplate, UsageRecord, Settings, CloudConfig, ExportBundle } from '../../shared/types';

export interface AppData {
  ready: boolean;
  snippets: Snippet[];
  folders: Folder[];
  tables: DataTable[];
  workflows: Workflow[];
  templates: UserTemplate[];
  usage: Map<string, UsageRecord>;
  settings: Settings;
  cloud: CloudConfig;
}

interface Store extends AppData {
  reload: () => Promise<void>;
  setSettings: (p: Partial<Settings>) => Promise<void>;
  saveSnippet: (s: Partial<Snippet> & { id?: string }) => Promise<Snippet>;
  saveSnippets: (s: Snippet[]) => Promise<void>;
  deleteSnippets: (ids: string[]) => Promise<void>;
  saveFolder: (f: Partial<Folder> & { id?: string }) => Promise<Folder>;
  saveFolders: (f: Folder[]) => Promise<void>;
  deleteFolder: (id: string, mode: 'move-up' | 'delete-contents') => Promise<void>;
  saveTable: (t: DataTable) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  saveWorkflow: (w: Workflow) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  saveTemplate: (t: UserTemplate) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  importBundle: (b: ExportBundle, mode: 'merge' | 'replace' | 'copy', targetFolder?: string | null) => Promise<{ snippets: number; folders: number }>;
  can: (f: Feature) => boolean;
  limit: (k: 'snippets' | 'folders' | 'tables' | 'workflows' | 'libraryTemplates') => number;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  toasts: { id: number; msg: string; kind: 'ok' | 'error' }[];
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function emptySnippet(folderId: string | null = null): Snippet {
  const t = Date.now();
  return { id: uid('snp'), name: '', shortcut: '', content: '', contentType: 'text', folderId, enabled: true, favorite: false, pinned: false, tags: [], trigger: 'default', createdAt: t, updatedAt: t, teamId: null };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [toasts, setToasts] = useState<Store['toasts']>([]);
  const tid = useRef(0);

  const reload = useCallback(async () => {
    const [snippets, folders, tables, workflows, templates, usage, settings, cloud] = await Promise.all([
      listRecords<Snippet>('snippets'), listRecords<Folder>('folders'), listRecords<DataTable>('tables'), listRecords<Workflow>('workflows'),
      listRecords<UserTemplate>('templates'), getAll<UsageRecord>('usage'), loadSettings(), loadCloudConfig(),
    ]);
    applyTheme(settings.theme);
    setData({ ready: true, snippets, folders: folders.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), tables, workflows, templates, usage: new Map(usage.map((u) => [u.snippetId, u])), settings, cloud });
  }, []);

  useEffect(() => {
    reload();
    const off1 = onLocalChange(() => reload());
    const off2 = onSettingsChanged(() => reload());
    const l = (c: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && (c[STORAGE_KEYS.revision] || c[STORAGE_KEYS.cloud])) reload(); };
    api.storage.onChanged.addListener(l);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => data && applyTheme(data.settings.theme);
    mq.addEventListener?.('change', onMq);
    return () => { off1(); off2(); api.storage.onChanged.removeListener(l); mq.removeEventListener?.('change', onMq); };
  }, [reload]);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);

  const store = useMemo<Store | null>(() => {
    if (!data) return null;
    const s = data.settings;
    const can = (f: Feature) => hasFeature(s.plan, f, s.enforcePlanLimits);
    const limit = (k: any) => limitOf(s.plan, k, s.enforcePlanLimits);
    return {
      ...data,
      toasts,
      toast,
      reload,
      can,
      limit,
      setSettings: async (p) => { await saveSettings(p); await reload(); },
      saveSnippet: async (p) => {
        const existing = p.id ? data.snippets.find((x) => x.id === p.id) : undefined;
        if (!existing && data.snippets.length >= limit('snippets')) throw new Error(`Your plan allows ${limit('snippets')} snippets. Change the plan in Settings → Plan.`);
        const base = existing || emptySnippet();
        const next = { ...base, ...p, id: base.id } as Snippet;
        const [saved] = await saveRecords('snippets', [next]);
        return saved;
      },
      saveSnippets: async (list) => { await saveRecords('snippets', list); },
      deleteSnippets: async (ids) => { await deleteRecords('snippets', ids); },
      saveFolder: async (p) => {
        const existing = p.id ? data.folders.find((x) => x.id === p.id) : undefined;
        if (!existing && data.folders.length >= limit('folders')) throw new Error(`Your plan allows ${limit('folders')} folders.`);
        const t = Date.now();
        const base: Folder = existing || { id: uid('fld'), name: 'New folder', parentId: null, order: data.folders.length, createdAt: t, updatedAt: t, teamId: null };
        const [saved] = await saveRecords('folders', [{ ...base, ...p, id: base.id } as Folder]);
        return saved;
      },
      saveFolders: async (list) => { await saveRecords('folders', list); },
      deleteFolder: async (id, mode) => {
        const all = data.folders;
        const desc = new Set<string>([id]);
        let grew = true;
        while (grew) { grew = false; for (const f of all) if (f.parentId && desc.has(f.parentId) && !desc.has(f.id)) { desc.add(f.id); grew = true; } }
        const folder = all.find((f) => f.id === id);
        if (mode === 'delete-contents') {
          await deleteRecords('snippets', data.snippets.filter((x) => x.folderId && desc.has(x.folderId)).map((x) => x.id));
          await deleteRecords('folders', [...desc]);
        } else {
          await saveRecords('snippets', data.snippets.filter((x) => x.folderId === id).map((x) => ({ ...x, folderId: folder?.parentId ?? null })));
          await saveRecords('folders', all.filter((f) => f.parentId === id).map((f) => ({ ...f, parentId: folder?.parentId ?? null })));
          await deleteRecords('folders', [id]);
        }
      },
      saveTable: async (t) => {
        if (!data.tables.some((x) => x.id === t.id) && data.tables.length >= limit('tables')) throw new Error(`Your plan allows ${limit('tables')} Data Hub tables.`);
        await saveRecords('tables', [t]);
      },
      deleteTable: async (id) => deleteRecords('tables', [id]),
      saveWorkflow: async (w) => {
        if (!data.workflows.some((x) => x.id === w.id) && data.workflows.length >= limit('workflows')) throw new Error(`Your plan allows ${limit('workflows')} workflows.`);
        await saveRecords('workflows', [w]);
      },
      deleteWorkflow: async (id) => deleteRecords('workflows', [id]),
      saveTemplate: async (t) => { await saveRecords('templates', [t]); },
      deleteTemplate: async (id) => deleteRecords('templates', [id]),
      importBundle: async (b, mode, targetFolder = null) => {
        const existingSnippets = await listRecords<Snippet>('snippets', true);
        const existingIds = new Set(existingSnippets.map((x) => x.id));
        const existingFolderIds = new Set((await listRecords<Folder>('folders', true)).map((x) => x.id));
        const fmap = new Map<string, string>();
        let folders = b.folders;
        let snippets = b.snippets;
        if (mode === 'copy') {
          // New ids for everything so nothing is overwritten.
          folders = b.folders.map((f) => { const id = uid('fld'); fmap.set(f.id, id); return { ...f, id }; });
          folders = folders.map((f) => ({ ...f, parentId: f.parentId ? fmap.get(f.parentId) ?? targetFolder : targetFolder }));
          snippets = b.snippets.map((x) => ({ ...x, id: uid('snp'), folderId: x.folderId ? fmap.get(x.folderId) ?? targetFolder : targetFolder, source: x.source || { kind: 'share' } }));
        } else {
          folders = folders.map((f) => ({ ...f, parentId: f.parentId && (existingFolderIds.has(f.parentId) || b.folders.some((y) => y.id === f.parentId)) ? f.parentId : null }));
          snippets = snippets.map((x) => ({ ...x, folderId: x.folderId && (existingFolderIds.has(x.folderId) || b.folders.some((y) => y.id === x.folderId)) ? x.folderId : targetFolder }));
        }
        if (mode === 'replace') {
          await deleteRecords('snippets', existingSnippets.filter((x) => !x.deleted).map((x) => x.id));
          await deleteRecords('folders', [...existingFolderIds]);
        }
        const newCount = snippets.filter((x) => !existingIds.has(x.id)).length;
        if (mode !== 'replace' && data.snippets.length + newCount > limit('snippets')) throw new Error(`Import would exceed your plan limit of ${limit('snippets')} snippets.`);
        // merge: keep the newer version of records that exist on both sides
        if (mode === 'merge') {
          const byId = new Map(existingSnippets.map((x) => [x.id, x]));
          snippets = snippets.filter((x) => !byId.has(x.id) || byId.get(x.id)!.deleted || x.updatedAt >= byId.get(x.id)!.updatedAt);
        }
        await putMany('folders', folders.map((f) => ({ ...f, updatedAt: Date.now() })));
        await saveRecords('snippets', snippets.map((x) => ({ ...x, deleted: false })));
        if (b.tables?.length) await saveRecords('tables', b.tables);
        if (b.workflows?.length) await saveRecords('workflows', b.workflows);
        if (b.templates?.length) await saveRecords('templates', b.templates);
        await reload();
        return { snippets: snippets.length, folders: folders.length };
      },
    };
  }, [data, toasts, toast, reload]);

  if (!store) return <div style={{ padding: 40 }} className="muted">Loading QuickText Hub…</div>;
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// ---------- tiny hash router
export function useRoute(): [string, URLSearchParams, (to: string) => void] {
  const parse = () => {
    const h = location.hash.slice(1) || '/snippets';
    const [path, qs] = h.split('?');
    return { path, qs: new URLSearchParams(qs || '') };
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [r.path, r.qs, (to: string) => { location.hash = to; }];
}

export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => resolve(i.files?.[0] || null);
    i.click();
  });
}

export function folderPath(folders: Folder[], id: string | null): string {
  const parts: string[] = [];
  let cur = id ? folders.find((f) => f.id === id) : undefined;
  let guard = 0;
  while (cur && guard++ < 20) { parts.unshift(cur.name); cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined; }
  return parts.join(' / ');
}
