import React, { useState } from 'react';
import { Modal } from '../common';
import { useStore, folderPath } from '../store';
import type { Folder } from '../../../shared/types';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

export function FolderDialog({ folder, parentId = null, onClose }: { folder?: Folder; parentId?: string | null; onClose: () => void }) {
  const { saveFolder, folders, toast } = useStore();
  const [name, setName] = useState(folder?.name || '');
  const [parent, setParent] = useState<string | null>(folder ? folder.parentId : parentId);
  const [color, setColor] = useState(folder?.color || COLORS[0]);
  // a folder cannot be moved inside itself or its descendants
  const invalid = new Set<string>();
  if (folder) {
    invalid.add(folder.id);
    let grew = true;
    while (grew) { grew = false; for (const f of folders) if (f.parentId && invalid.has(f.parentId) && !invalid.has(f.id)) { invalid.add(f.id); grew = true; } }
  }
  const save = async () => {
    if (!name.trim()) return;
    try {
      await saveFolder({ id: folder?.id, name: name.trim(), parentId: parent, color, teamId: parent ? folders.find((f) => f.id === parent)?.teamId ?? null : folder?.teamId ?? null });
      toast(folder ? 'Folder updated' : 'Folder created');
      onClose();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={folder ? 'Edit folder' : 'New folder'} onClose={onClose} width={440} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!name.trim()}>Save</button></>}>
      <div className="field"><label className="label">Name</label><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></div>
      <div className="field">
        <label className="label">Parent folder</label>
        <select className="select" value={parent || ''} onChange={(e) => setParent(e.target.value || null)}>
          <option value="">— Top level —</option>
          {folders.filter((f) => !invalid.has(f.id)).map((f) => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="label">Colour</label>
        <div className="row">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: c === color ? '3px solid var(--qth-text)' : '0', cursor: 'pointer' }} aria-label={c} />)}</div>
      </div>
    </Modal>
  );
}
