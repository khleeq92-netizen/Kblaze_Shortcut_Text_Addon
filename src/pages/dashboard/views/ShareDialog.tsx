import React, { useState } from 'react';
import { Modal } from '../common';
import { useStore } from '../store';
import { useCloud } from '../cloud';
import { makeShareCode, bundleOf } from '../../../shared/shareCode';
import { Copy, Link2, KeyRound } from 'lucide-react';

/** Share snippets (or a whole folder incl. subfolders) by offline code or cloud link. */
export function ShareDialog({ snippetIds, folderId, onClose }: { snippetIds?: string[]; folderId?: string; onClose: () => void }) {
  const { snippets, folders, toast } = useStore();
  const { mod, user, configured } = useCloud();
  const [code, setCode] = useState('');
  const [link, setLink] = useState<{ link: string; code: string } | null>(null);
  const [visibility, setVisibility] = useState<'link' | 'restricted'>('link');
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);

  let fset: typeof folders = [];
  let list = snippets.filter((s) => snippetIds?.includes(s.id));
  if (folderId) {
    const ids = new Set([folderId]);
    let grew = true;
    while (grew) { grew = false; for (const f of folders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; } }
    fset = folders.filter((f) => ids.has(f.id)).map((f) => (f.id === folderId ? { ...f, parentId: null } : f));
    list = snippets.filter((s) => s.folderId && ids.has(s.folderId));
  }
  const title = folderId ? folders.find((f) => f.id === folderId)?.name || 'Folder' : list.length === 1 ? list[0].name : `${list.length} snippets`;
  const bundle = () => bundleOf(list, fset);
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Copied'));

  return (
    <Modal title={`Share “${title}”`} onClose={onClose} width={620}>
      <p className="muted" style={{ marginTop: 0 }}>{list.length} snippet(s){fset.length ? ` in ${fset.length} folder(s)` : ''}. Recipients import a copy into their own K-Flow Automation; your originals stay private.</p>
      <div className="section card" style={{ boxShadow: 'none' }}>
        <div className="section-head"><div><h3><KeyRound size={15} /> Offline share code</h3><div className="muted" style={{ fontSize: 13 }}>Works without an account. The code contains the snippets themselves — send it by email or chat.</div></div></div>
        {code ? (
          <>
            <textarea className="textarea mono" readOnly value={code} rows={4} onFocus={(e) => e.target.select()} />
            <button className="btn sm" onClick={() => copy(code)}><Copy size={13} /> Copy code</button> <span className="hint">{(code.length / 1024).toFixed(1)} KB</span>
          </>
        ) : <button className="btn" onClick={async () => setCode(await makeShareCode(bundle()))}>Generate share code</button>}
      </div>
      <div className="section card" style={{ boxShadow: 'none' }}>
        <div className="section-head"><div><h3><Link2 size={15} /> Cloud share link</h3><div className="muted" style={{ fontSize: 13 }}>Short link stored in your Firebase project. Public to anyone with the link, or restricted to specific accounts.</div></div></div>
        {!configured ? <div className="muted">Configure cloud features in <a href="#/settings?tab=cloud">Settings → Cloud & Account</a> to create links.</div>
          : !user ? <div className="muted"><a href="#/settings?tab=cloud">Sign in</a> to create share links.</div>
          : link ? (
            <>
              <div className="field"><label className="label">Share code</label><div className="row"><input className="input mono" readOnly value={link.code} /><button className="btn" onClick={() => copy(link.code)}><Copy size={14} /></button></div></div>
              <div className="field"><label className="label">Direct link (for people with K-Flow Automation installed)</label><div className="row"><input className="input mono" readOnly value={link.link} /><button className="btn" onClick={() => copy(link.link)}><Copy size={14} /></button></div></div>
            </>
          ) : (
            <>
              <div className="row" style={{ marginBottom: 10 }}>
                <label className="check"><input type="radio" checked={visibility === 'link'} onChange={() => setVisibility('link')} /> Anyone with the link</label>
                <label className="check"><input type="radio" checked={visibility === 'restricted'} onChange={() => setVisibility('restricted')} /> Only these people</label>
              </div>
              {visibility === 'restricted' && <div className="field"><input className="input" placeholder="emails, comma separated" value={emails} onChange={(e) => setEmails(e.target.value)} /></div>}
              <button className="btn primary" disabled={busy || (visibility === 'restricted' && !emails.trim())} onClick={async () => {
                setBusy(true);
                try { setLink(await mod!.sharing.createCloudShare(bundle(), { title, visibility, allowedEmails: emails.split(',') })); } catch (e: any) { toast(e.message, 'error'); }
                setBusy(false);
              }}>{busy ? 'Creating…' : 'Create link'}</button>
            </>
          )}
      </div>
    </Modal>
  );
}
