import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useCloud } from '../cloud';
import { Empty, Modal, PlanGate } from '../common';
import { UseTemplateDialog } from './TemplatesView';
import { LIBRARY, LIBRARY_CATEGORIES } from '../../../library/templates';
import type { MarketTemplate } from '../../../cloud/marketplace';
import { Store, Upload, ShieldCheck, Download, Search, Check, X } from 'lucide-react';

function SubmitDialog({ onClose }: { onClose: () => void }) {
  const { snippets, toast } = useStore();
  const { mod } = useCloud();
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState(LIBRARY_CATEGORIES[0]);
  const [custom, setCustom] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const s = snippets.find((x) => x.id === id);
  return (
    <Modal title="Submit a template" onClose={onClose} width={560} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!s || busy || title.length < 3} onClick={async () => {
      setBusy(true);
      try { await mod!.marketplace.submit({ title, description: desc, category: custom.trim() || cat, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), shortcut: s!.shortcut, content: s!.content, contentType: s!.contentType }); toast('Submitted for review'); onClose(); }
      catch (e: any) { toast(e.message, 'error'); }
      setBusy(false);
    }}>Submit for review</button></>}>
      <div className="field"><label className="label">Snippet</label><select className="select" value={id} onChange={(e) => { setId(e.target.value); const sn = snippets.find((x) => x.id === e.target.value); if (sn) { setTitle(sn.name); setDesc(sn.description || ''); } }}><option value="">Choose one of your snippets…</option>{snippets.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.shortcut})</option>)}</select></div>
      <div className="field"><label className="label">Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="field"><label className="label">Description</label><textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div className="grid-2">
        <div className="field"><label className="label">Category</label><select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>{LIBRARY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label className="label">…or a custom category</label><input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} /></div>
      </div>
      <div className="field"><label className="label">Tags</label><input className="input" placeholder="comma separated" value={tags} onChange={(e) => setTags(e.target.value)} /></div>
      <div className="hint">Do not include personal data. Submissions are public after a moderator approves them.</div>
    </Modal>
  );
}

export function MarketplaceView() {
  const { configured, user, mod } = useCloud();
  const { toast } = useStore();
  const [items, setItems] = useState<MarketTemplate[]>([]);
  const [mine, setMine] = useState<MarketTemplate[]>([]);
  const [queue, setQueue] = useState<MarketTemplate[]>([]);
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [open, setOpen] = useState<any>(null);
  const [submit, setSubmit] = useState(false);
  const [tab, setTab] = useState<'browse' | 'mine' | 'moderate' | 'collections'>(configured ? 'browse' : 'collections');

  const load = async () => {
    if (!mod) return;
    setErr('');
    try {
      setItems(await mod.marketplace.browse());
      if (user) { setMine(await mod.marketplace.mySubmissions()); const a = await mod.marketplace.isAdmin(); setAdmin(a); if (a) setQueue(await mod.marketplace.pendingQueue()); }
    } catch (e: any) { setErr(e?.code === 'failed-precondition' ? 'Firestore needs the composite index from firebase/firestore.indexes.json (deploy it with the Firebase CLI).' : e.message); }
  };
  useEffect(() => { load(); }, [mod, user?.uid]);

  const cats = ['All', ...new Set([...LIBRARY_CATEGORIES, ...items.map((i) => i.category)])];
  const shown = items.filter((t) => (cat === 'All' || t.category === cat) && (!q || (t.title + t.description + t.tags.join(' ')).toLowerCase().includes(q.toLowerCase())));
  const collections = LIBRARY_CATEGORIES.map((c) => ({ c, items: LIBRARY.filter((t) => t.category === c) }));

  return (
    <div className="page">
      <div className="page-head">
        <h2>Template marketplace</h2>
        {user && <button className="btn primary" onClick={() => setSubmit(true)}><Upload size={15} /> Submit template</button>}
      </div>
      <div className="row" style={{ marginBottom: 14, gap: 4 }}>
        <button className={'tabbtn' + (tab === 'collections' ? ' on' : '')} onClick={() => setTab('collections')}>Ready-made collections</button>
        <button className={'tabbtn' + (tab === 'browse' ? ' on' : '')} onClick={() => setTab('browse')}>Community templates</button>
        {user && <button className={'tabbtn' + (tab === 'mine' ? ' on' : '')} onClick={() => setTab('mine')}>My submissions ({mine.length})</button>}
        {admin && <button className={'tabbtn' + (tab === 'moderate' ? ' on' : '')} onClick={() => setTab('moderate')}><ShieldCheck size={13} /> Moderation ({queue.length})</button>}
      </div>
      {tab === 'collections' && (
        <>
          <p className="muted">Built-in collections work offline. Open any template to preview its form and copy it into your folders.</p>
          {collections.map(({ c, items: its }) => (
            <div key={c} style={{ marginBottom: 18 }}>
              <div className="cmd-group">{c} · {its.length}</div>
              <div className="tpl-grid">{its.map((t) => <div key={t.id} className="card tpl"><div className="row"><h4 className="grow">{t.name}</h4><span className="kbd">{t.shortcut}</span></div><div className="muted" style={{ fontSize: 12.5 }}>{t.description}</div><button className="btn sm" onClick={() => setOpen(t)}>Preview & copy</button></div>)}</div>
            </div>
          ))}
        </>
      )}
      {tab !== 'collections' && !configured && <Empty icon={<Store size={32} />} title="Community marketplace needs cloud features">The marketplace is optional. Configure Firebase in <a href="#/settings?tab=cloud">Settings → Cloud & Account</a> to browse and publish community templates. The ready-made collections work without it.</Empty>}
      {tab !== 'collections' && configured && err && <div className="locked" style={{ color: 'var(--kf-danger)' }}>{err}</div>}
      {tab === 'browse' && configured && (
        <>
          <div className="row" style={{ marginBottom: 10 }}><div className="search" style={{ maxWidth: 320 }}><Search size={15} /><input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
          <div className="cat-bar">{cats.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
          {shown.length ? (
            <div className="tpl-grid">
              {shown.map((t) => (
                <div key={t.id} className="card tpl">
                  <div className="row"><h4 className="grow">{t.title}</h4><span className="kbd">{t.shortcut}</span></div>
                  <div className="row" style={{ gap: 6 }}><span className="badge primary">{t.category}</span><span className="badge"><Download size={10} /> {t.downloads}</span><span className="muted" style={{ fontSize: 12 }}>by {t.authorName}</span></div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{t.description}</div>
                  <button className="btn sm" onClick={() => { setOpen({ id: t.id, name: t.title, category: t.category, description: t.description, shortcut: t.shortcut, content: t.content, contentType: t.contentType, market: true }); }}>Preview & copy</button>
                </div>
              ))}
            </div>
          ) : !err && <Empty title="No community templates yet">Be the first to submit one.</Empty>}
        </>
      )}
      {tab === 'mine' && (
        <table className="list card"><thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Downloads</th></tr></thead>
          <tbody>{mine.map((t) => <tr key={t.id}><td>{t.title}</td><td>{t.category}</td><td><span className={'badge ' + (t.status === 'approved' ? 'success' : t.status === 'rejected' ? 'danger' : 'warn')}>{t.status}</span> {t.moderationNote && <span className="muted">{t.moderationNote}</span>}</td><td>{t.downloads}</td></tr>)}
            {!mine.length && <tr><td colSpan={4} className="muted">No submissions yet.</td></tr>}</tbody></table>
      )}
      {tab === 'moderate' && admin && (
        <PlanGate feature="marketplaceSubmit">
          {queue.map((t) => (
            <div key={t.id} className="card section">
              <div className="row"><h3 className="grow" style={{ margin: 0 }}>{t.title}</h3><span className="badge">{t.category}</span><span className="muted">by {t.authorName}</span></div>
              <p className="muted">{t.description}</p>
              <div className="code-out" style={{ maxHeight: 200, overflow: 'auto' }}>{t.content}</div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary" onClick={async () => { await mod!.marketplace.moderate(t.id, 'approved'); toast('Approved'); load(); }}><Check size={14} /> Approve</button>
                <button className="btn danger" onClick={async () => { const note = prompt('Reason for rejection (shown to the author)') || ''; await mod!.marketplace.moderate(t.id, 'rejected', note); toast('Rejected'); load(); }}><X size={14} /> Reject</button>
              </div>
            </div>
          ))}
          {!queue.length && <Empty title="Nothing to review" />}
        </PlanGate>
      )}
      {open && <UseTemplateDialog tpl={open} onClose={() => setOpen(null)} onUsed={() => open.market && mod?.marketplace.countDownload(open.id)} />}
      {submit && <SubmitDialog onClose={() => { setSubmit(false); load(); }} />}
    </div>
  );
}
