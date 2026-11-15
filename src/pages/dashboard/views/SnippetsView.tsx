import React, { useEffect, useMemo, useState } from 'react';
import { useStore, useRoute, emptySnippet, folderPath, download, pickFile } from '../store';
import { SnippetEditor } from '../editor/SnippetEditor';
import { Empty, ConfirmModal, timeAgo } from '../common';
import { DND_SNIPPETS } from './Sidebar';
import { ShareDialog } from './ShareDialog';
import { ImportDialog } from './ImportDialog';
import { htmlToText } from '../../../shared/html';
import type { Snippet } from '../../../shared/types';
import { FileText, Pin, Star, Download, Upload, Trash2, Power, PowerOff, FolderInput, Share2, X, Users, Sparkles } from 'lucide-react';

export function SnippetsView() {
  const { snippets, folders, usage, saveSnippets, deleteSnippets, toast, settings } = useStore();
  const [path, qs, go] = useRoute();
  const seg = path.split('/').filter(Boolean);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'smart' | 'name' | 'shortcut' | 'updated' | 'usage'>('smart');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [moveTo, setMoveTo] = useState<string>('');
  const [share, setShare] = useState<string[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  const view = seg[0] || 'snippets';
  const editingId = view === 'snippet' ? seg[1] : null;
  const isNew = view === 'new';
  const [newDraft, setNewDraft] = useState<Snippet | null>(null);
  useEffect(() => {
    if (isNew) {
      const d = emptySnippet(qs.get('folder') || null);
      const text = qs.get('text');
      if (text) { d.content = text.slice(0, 20000); d.name = text.split('\n')[0].slice(0, 40); }
      setNewDraft(d);
    }
  }, [isNew, qs.toString()]);

  const listScope = view === 'snippet' || view === 'new' ? (lastId || 'snippets') : path;
  useEffect(() => { if (view !== 'snippet' && view !== 'new') setLastId(path); setSelected(new Set()); }, [path]);

  const { title, list } = useMemo(() => {
    const p = (listScope || '/snippets').split('/').filter(Boolean);
    const v = p[0] || 'snippets';
    let title = 'My Snippets';
    let list = snippets;
    if (v === 'folder') {
      const f = folders.find((x) => x.id === p[1]);
      title = f ? folderPath(folders, f.id) : 'Folder';
      list = snippets.filter((s) => s.folderId === p[1]);
    } else if (v === 'favorites') { title = 'Favorites'; list = snippets.filter((s) => s.favorite); }
    else if (v === 'pinned') { title = 'Pinned'; list = snippets.filter((s) => s.pinned); }
    else if (v === 'recent') { title = 'Recently used'; list = snippets.filter((s) => usage.has(s.id)).sort((a, b) => usage.get(b.id)!.lastUsedAt - usage.get(a.id)!.lastUsedAt).slice(0, 50); }
    else if (v === 'search') {
      const q = (qs.get('q') || '').toLowerCase().trim();
      title = q ? `Search: “${q}”` : 'Search';
      list = !q ? snippets : snippets.filter((s) => s.name.toLowerCase().includes(q) || s.shortcut.toLowerCase().includes(q) || (s.contentType === 'html' ? htmlToText(s.content) : s.content).toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q)));
    }
    if (v !== 'recent') {
      list = [...list].sort((a, b) => {
        switch (sort) {
          case 'name': return a.name.localeCompare(b.name);
          case 'shortcut': return a.shortcut.localeCompare(b.shortcut);
          case 'updated': return b.updatedAt - a.updatedAt;
          case 'usage': return (usage.get(b.id)?.count || 0) - (usage.get(a.id)?.count || 0);
          default: return Number(b.pinned) - Number(a.pinned) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name);
        }
      });
    }
    return { title, list };
  }, [listScope, snippets, folders, usage, sort, qs.toString()]);

  const toggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };
  const sel = snippets.filter((s) => selected.has(s.id));
  const bulk = async (patch: Partial<Snippet>, msg: string) => { await saveSnippets(sel.map((s) => ({ ...s, ...patch }))); toast(msg); };
  const exportList = (items: Snippet[]) => {
    const fids = new Set(items.map((s) => s.folderId).filter(Boolean));
    download(`quicktext-snippets-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'quicktext-hub', version: 1, exportedAt: Date.now(), snippets: items, folders: folders.filter((f) => fids.has(f.id)) }, null, 2));
  };
  const currentFolder = listScope.startsWith('/folder/') ? listScope.split('/')[2] : null;
  const editing = editingId ? snippets.find((s) => s.id === editingId) : null;

  return (
    <div className="split">
      <div className="list-pane">
        <div className="list-head">
          <h2 title={title}>{title}</h2>
          <select className="select" style={{ width: 'auto', padding: '4px 6px', fontSize: 12.5 }} value={sort} onChange={(e) => setSort(e.target.value as any)} title="Sort">
            <option value="smart">Pinned first</option><option value="name">Name</option><option value="shortcut">Shortcut</option><option value="updated">Recently edited</option><option value="usage">Most used</option>
          </select>
          <button className="btn ghost icon sm" title="Import snippets" onClick={() => setImportOpen(true)}><Upload size={15} /></button>
          <button className="btn ghost icon sm" title="Export this list" onClick={() => exportList(list)}><Download size={15} /></button>
        </div>
        {selected.size > 0 && (
          <div className="bulkbar">
            <b style={{ fontSize: 12.5 }}>{selected.size} selected</b>
            <button className="btn sm" onClick={() => bulk({ enabled: true }, 'Enabled')}><Power size={13} /> Enable</button>
            <button className="btn sm" onClick={() => bulk({ enabled: false }, 'Disabled')}><PowerOff size={13} /> Disable</button>
            <button className="btn sm" onClick={() => bulk({ favorite: true }, 'Added to favourites')}><Star size={13} /></button>
            <select className="select" style={{ width: 'auto', padding: '3px 6px', fontSize: 12 }} value={moveTo} onChange={async (e) => { const v = e.target.value; setMoveTo(''); if (!v) return; const fid = v === '__root' ? null : v; await bulk({ folderId: fid, teamId: folders.find((f) => f.id === fid)?.teamId ?? null }, 'Moved'); }}>
              <option value="">Move to…</option><option value="__root">— No folder —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}
            </select>
            <button className="btn sm" onClick={() => exportList(sel)}><Download size={13} /></button>
            <button className="btn sm" onClick={() => setShare([...selected])}><Share2 size={13} /></button>
            <button className="btn sm danger" onClick={() => setConfirmBulk(true)}><Trash2 size={13} /></button>
            <button className="btn ghost icon sm" onClick={() => setSelected(new Set())}><X size={13} /></button>
          </div>
        )}
        {list.length > 0 && (
          <label className="check muted" style={{ padding: '6px 14px', fontSize: 12, borderBottom: '1px solid var(--qth-border)' }}>
            <input type="checkbox" checked={list.length > 0 && list.every((s) => selected.has(s.id))} onChange={(e) => setSelected(e.target.checked ? new Set(list.map((s) => s.id)) : new Set())} /> Select all
          </label>
        )}
        {list.map((s) => (
          <div
            key={s.id}
            className={'snip' + (s.id === editingId ? ' on' : '') + (s.enabled ? '' : ' off')}
            onClick={() => go('/snippet/' + s.id)}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND_SNIPPETS, JSON.stringify(selected.has(s.id) ? [...selected] : [s.id]))}
          >
            <input type="checkbox" checked={selected.has(s.id)} onClick={(e) => toggle(s.id, e)} onChange={() => {}} aria-label={'Select ' + s.name} />
            <span className="nm">{s.name || <i className="muted">Untitled</i>}</span>
            <span className="meta">
              {s.teamId && <Users size={12} className="muted" />}
              {s.pinned && <Pin size={12} />}
              {s.favorite && <Star size={12} fill="#f59e0b" color="#f59e0b" />}
              <span className="kbd">{s.shortcut || '—'}</span>
            </span>
            <span className="pv">{!s.enabled && '(disabled) '}{(s.contentType === 'html' ? htmlToText(s.content) : s.content).slice(0, 120) || ' '}{view === 'recent' || listScope === '/recent' ? ` · ${timeAgo(usage.get(s.id)?.lastUsedAt || 0)}` : ''}</span>
          </div>
        ))}
        {!list.length && (
          <Empty icon={<FileText size={32} />} title={snippets.length ? 'No snippets here' : 'No snippets yet'}>
            {snippets.length ? 'Drag snippets onto a folder in the sidebar to organise them.' : <>Create your first snippet or <a href="#/templates">start from a template</a>.</>}
          </Empty>
        )}
      </div>
      <div className="editor-pane">
        {isNew && newDraft ? (
          <SnippetEditor key={newDraft.id} snippet={{ ...newDraft, folderId: newDraft.folderId ?? currentFolder }} isNew onDone={(id) => go(id ? '/snippet/' + id : '/snippets')} />
        ) : editing ? (
          <SnippetEditor key={editing.id} snippet={editing} onDone={(id) => { if (!id) go(lastId || '/snippets'); }} />
        ) : editingId ? (
          <Empty title="Snippet not found">It may have been deleted.</Empty>
        ) : (
          <Empty icon={<Sparkles size={34} />} title="Select a snippet to edit">
            <p>Or <a href={'#/new' + (currentFolder ? '?folder=' + currentFolder : '')}>create a new snippet</a>. Type a shortcut like <span className="kbd">/sig</span> in any text field to expand it, or press <span className="kbd">{settings.assistantHotkey}</span> to open the snippet assistant.</p>
          </Empty>
        )}
      </div>
      {confirmBulk && <ConfirmModal title={`Delete ${selected.size} snippet(s)?`} danger confirmLabel="Delete" message="This cannot be undone (export first if you want a backup)." onConfirm={async () => { await deleteSnippets([...selected]); setSelected(new Set()); toast('Deleted'); }} onClose={() => setConfirmBulk(false)} />}
      {share && <ShareDialog snippetIds={share} onClose={() => setShare(null)} />}
      {importOpen && <ImportDialog targetFolder={currentFolder} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
