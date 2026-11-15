import React, { useState } from 'react';
import { useStore, useRoute } from '../store';
import { useCloud } from '../cloud';
import { FolderDialog } from './FolderDialog';
import { ConfirmModal } from '../common';
import type { Folder } from '../../../shared/types';
import { FileText, Folder as FolderIc, FolderOpen, Star, Clock, LayoutTemplate, Database, Store, Settings, Zap, Pin, BarChart3, Users, ChevronRight, ChevronDown, Plus, Pencil, Trash2, Cloud, CloudOff } from 'lucide-react';

export const DND_SNIPPETS = 'application/x-qth-snippets';
export const DND_FOLDER = 'application/x-qth-folder';

function useDrop(onDropSnippets: (ids: string[]) => void, onDropFolder?: (id: string) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes(DND_SNIPPETS) || (onDropFolder && e.dataTransfer.types.includes(DND_FOLDER))) { e.preventDefault(); setOver(true); }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const s = e.dataTransfer.getData(DND_SNIPPETS);
        const f = e.dataTransfer.getData(DND_FOLDER);
        if (s) onDropSnippets(JSON.parse(s));
        else if (f && onDropFolder) onDropFolder(f);
      },
    },
  };
}

function FolderNode({ f, depth }: { f: Folder; depth: number }) {
  const { folders, snippets, saveSnippets, saveFolders, toast } = useStore();
  const [path, , go] = useRoute();
  const [open, setOpen] = useState(true);
  const [edit, setEdit] = useState<null | 'edit' | 'child'>(null);
  const [del, setDel] = useState(false);
  const { deleteFolder } = useStore();
  const children = folders.filter((x) => x.parentId === f.id);
  const count = snippets.filter((s) => s.folderId === f.id).length;
  const isDescendant = (candidate: string) => {
    let cur: Folder | undefined = folders.find((x) => x.id === f.id);
    let guard = 0;
    while (cur && guard++ < 50) { if (cur.id === candidate) return true; cur = cur.parentId ? folders.find((x) => x.id === cur!.parentId) : undefined; }
    return false;
  };
  const drop = useDrop(
    async (ids) => {
      await saveSnippets(snippets.filter((s) => ids.includes(s.id)).map((s) => ({ ...s, folderId: f.id, teamId: f.teamId ?? null })));
      toast(`Moved ${ids.length} snippet(s) to ${f.name}`);
    },
    async (fid) => {
      if (fid === f.id || isDescendant(fid)) { toast('A folder cannot be moved into itself', 'error'); return; }
      const moving = folders.find((x) => x.id === fid);
      if (moving) await saveFolders([{ ...moving, parentId: f.id }]);
    },
  );
  const on = path === '/folder/' + f.id;
  return (
    <div>
      <div
        className={'nav-item' + (on ? ' on' : '') + (drop.over ? ' drop' : '')}
        style={{ paddingLeft: 10 + depth * 4 }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData(DND_FOLDER, f.id)}
        onClick={() => go('/folder/' + f.id)}
        {...drop.props}
      >
        <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ width: 14, display: 'inline-flex', visibility: children.length ? 'visible' : 'hidden' }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {on ? <FolderOpen size={16} color={f.color} /> : <FolderIc size={16} color={f.color} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
        {f.teamId && <Users size={12} className="muted" />}
        <span className="count">{count || ''}</span>
        {on && (
          <span className="row" style={{ gap: 0 }} onClick={(e) => e.stopPropagation()}>
            <button className="btn ghost icon sm" title="Add subfolder" onClick={() => setEdit('child')}><Plus size={13} /></button>
            <button className="btn ghost icon sm" title="Edit folder" onClick={() => setEdit('edit')}><Pencil size={13} /></button>
            <button className="btn ghost icon sm" title="Delete folder" onClick={() => setDel(true)}><Trash2 size={13} /></button>
          </span>
        )}
      </div>
      {open && children.length > 0 && <div className="tree-children">{children.map((c) => <FolderNode key={c.id} f={c} depth={depth + 1} />)}</div>}
      {edit === 'edit' && <FolderDialog folder={f} onClose={() => setEdit(null)} />}
      {edit === 'child' && <FolderDialog parentId={f.id} onClose={() => setEdit(null)} />}
      {del && (
        <ConfirmModal
          title={`Delete "${f.name}"?`}
          danger
          confirmLabel="Delete folder"
          message={<>Snippets and subfolders inside will be moved up one level. <br /><label className="check" style={{ marginTop: 10 }}><input type="checkbox" id="qth-del-contents" /> Delete its snippets and subfolders too</label></>}
          onConfirm={async () => {
            const all = (document.getElementById('qth-del-contents') as HTMLInputElement)?.checked;
            await deleteFolder(f.id, all ? 'delete-contents' : 'move-up');
            go('/snippets');
            toast('Folder deleted');
          }}
          onClose={() => setDel(false)}
        />
      )}
    </div>
  );
}

export function Sidebar() {
  const { snippets, folders, usage, saveSnippets, saveFolders, tables, workflows, settings, can, toast } = useStore();
  const { configured, user, sync } = useCloud();
  const [path, , go] = useRoute();
  const [newFolder, setNewFolder] = useState(false);
  const rootDrop = useDrop(
    async (ids) => { await saveSnippets(snippets.filter((s) => ids.includes(s.id)).map((s) => ({ ...s, folderId: null, teamId: null }))); toast('Moved to My Snippets'); },
    async (fid) => { const f = folders.find((x) => x.id === fid); if (f) await saveFolders([{ ...f, parentId: null }]); },
  );
  const item = (to: string, icon: React.ReactNode, label: string, count?: number, extra?: any) => (
    <div className={'nav-item' + (path === to || (to !== '/snippets' && path.startsWith(to + '/')) ? ' on' : '')} onClick={() => go(to)} {...extra}>
      {icon}<span>{label}</span>{count !== undefined && <span className="count">{count}</span>}
    </div>
  );
  const recent = [...usage.values()].filter((u) => snippets.some((s) => s.id === u.snippetId)).length;
  const dot = !configured ? 'var(--qth-muted)' : !user ? 'var(--qth-warning)' : sync.status === 'error' ? 'var(--qth-danger)' : sync.status === 'syncing' ? 'var(--qth-accent)' : 'var(--qth-success)';
  return (
    <aside className="sidebar">
      <div className="brand"><div className="logo">⚡</div>QuickText Hub</div>
      <nav className="nav">
        <div className={'nav-item' + (path === '/snippets' || path === '/' ? ' on' : '') + (rootDrop.over ? ' drop' : '')} onClick={() => go('/snippets')} {...rootDrop.props}>
          <FileText size={16} /><span>My Snippets</span><span className="count">{snippets.length}</span>
        </div>
        {item('/pinned', <Pin size={16} />, 'Pinned', snippets.filter((s) => s.pinned).length)}
        {item('/favorites', <Star size={16} />, 'Favorites', snippets.filter((s) => s.favorite).length)}
        {item('/recent', <Clock size={16} />, 'Recently used', recent)}
        <div className="nav-sep">Folders <button className="btn ghost icon sm" title="New folder" onClick={() => setNewFolder(true)}><Plus size={13} /></button></div>
        {folders.filter((f) => !f.parentId).map((f) => <FolderNode key={f.id} f={f} depth={0} />)}
        {!folders.length && <div className="muted" style={{ padding: '2px 10px', fontSize: 12.5 }}>No folders yet</div>}
        <div className="nav-sep">Workspace</div>
        {item('/templates', <LayoutTemplate size={16} />, 'Templates')}
        {item('/data', <Database size={16} />, 'Data Hub', tables.length)}
        {item('/autopilot', <Zap size={16} />, 'Autopilot', workflows.length)}
        {item('/marketplace', <Store size={16} />, 'Marketplace')}
        {item('/stats', <BarChart3 size={16} />, 'Usage statistics')}
        {can('teams') && item('/team', <Users size={16} />, 'Team')}
        {item('/settings', <Settings size={16} />, 'Settings')}
      </nav>
      <div className="side-foot row" style={{ justifyContent: 'space-between' }}>
        <span className="row" style={{ gap: 6, cursor: 'pointer' }} onClick={() => go('/settings?tab=cloud')} title={sync.lastError || ''}>
          <span className="sync-dot" style={{ background: dot }} />
          {!configured ? <><CloudOff size={13} /> Local only</> : !user ? 'Not signed in' : sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Sync error' : <><Cloud size={13} /> Synced {sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</>}
        </span>
        <span className="badge primary">{settings.plan.toUpperCase()}</span>
      </div>
      {newFolder && <FolderDialog onClose={() => setNewFolder(false)} />}
    </aside>
  );
}
