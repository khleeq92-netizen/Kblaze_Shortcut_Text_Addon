import React, { useMemo, useState } from 'react';
import { useStore, useRoute, folderPath } from '../store';
import { LIBRARY, LIBRARY_CATEGORIES } from '../../../library/templates';
import { Modal, ConfirmModal } from '../common';
import { render } from '../../../engine/render';
import { buildRenderContext } from '../../../shared/renderContext';
import { FormRenderer } from '../../../ui/FormRenderer';
import { sanitizeHtml, htmlToText } from '../../../shared/html';
import { uid } from '../../../shared/ids';
import type { ContentType } from '../../../shared/types';
import { Lock, Search, Trash2 } from 'lucide-react';

interface Tpl { id: string; name: string; category: string; description?: string; shortcut: string; content: string; contentType: ContentType; mine?: boolean; locked?: boolean }

export function UseTemplateDialog({ tpl, onClose, onUsed }: { tpl: Tpl; onClose: () => void; onUsed?: (snippetId: string) => void }) {
  const { settings, snippets, tables, folders, saveSnippet, toast } = useStore();
  const [, , go] = useRoute();
  const [values, setValues] = useState<Record<string, any>>({});
  const taken = (sc: string) => snippets.some((s) => s.shortcut === sc);
  let sug = tpl.shortcut; let n = 2;
  while (taken(sug)) sug = tpl.shortcut + n++;
  const [shortcut, setShortcut] = useState(sug);
  const [name, setName] = useState(tpl.name);
  const [folder, setFolder] = useState<string>('');
  const out = useMemo(() => render(tpl.content, tpl.contentType, buildRenderContext({ settings, snippets, tables, values })), [tpl, values, settings, snippets, tables]);
  const use = async () => {
    if (taken(shortcut)) { toast('That shortcut is already used', 'error'); return; }
    try {
      const s = await saveSnippet({ id: uid('snp'), name, shortcut, content: tpl.content, contentType: tpl.contentType, folderId: folder || null, description: tpl.description, source: { kind: tpl.mine ? 'template' : 'template', ref: tpl.id }, createdAt: 0 } as any);
      toast('Added to your snippets');
      onUsed?.(s.id);
      onClose();
      go('/snippet/' + s.id);
    } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={tpl.name} onClose={onClose} width={820} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={use} disabled={tpl.locked}>{tpl.locked ? 'Locked on this plan' : 'Add to my snippets'}</button></>}>
      <div className="grid-2">
        <div>
          <div className="muted" style={{ marginBottom: 10 }}>{tpl.description}</div>
          <div className="grid-2">
            <div className="field"><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label className="label">Shortcut</label><input className="input mono" value={shortcut} onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ''))} /></div>
          </div>
          <div className="field"><label className="label">Folder</label><select className="select" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">— No folder —</option>{folders.map((f) => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}</select></div>
          <div className="label">Template source</div>
          <div className="code-out" style={{ maxHeight: 220, overflow: 'auto' }}>{tpl.contentType === 'html' ? tpl.content : tpl.content}</div>
        </div>
        <div>
          {out.form.length > 0 && <><div className="label">Try the form</div><div className="card" style={{ padding: 12, marginBottom: 10 }}><FormRenderer items={out.form} values={values} onChange={setValues} /></div></>}
          <div className="label">Preview</div>
          {out.isRich ? <div className="preview-box" dangerouslySetInnerHTML={{ __html: sanitizeHtml(out.html) }} /> : <div className="preview-box">{out.text}</div>}
        </div>
      </div>
    </Modal>
  );
}

export function TemplatesView() {
  const { templates, deleteTemplate, limit, toast } = useStore();
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Tpl | null>(null);
  const [del, setDel] = useState<Tpl | null>(null);
  const max = limit('libraryTemplates');
  const all: Tpl[] = [
    ...templates.map((t) => ({ ...t, mine: true })),
    ...LIBRARY.map((t, i) => ({ ...t, locked: i >= max })),
  ];
  const cats = ['All', ...(templates.length ? ['My templates'] : []), ...LIBRARY_CATEGORIES, ...[...new Set(templates.map((t) => t.category))].filter((c) => !LIBRARY_CATEGORIES.includes(c) && c !== 'My templates')];
  const list = all.filter((t) => (cat === 'All' || (cat === 'My templates' ? t.mine : t.category === cat)) && (!q || (t.name + t.description + t.shortcut + t.category).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="page">
      <div className="page-head">
        <h2>Template library</h2>
        <div className="search" style={{ maxWidth: 320 }}><Search size={16} /><input className="input" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>{LIBRARY.length} ready-made templates plus your own. Open one to try its form, then add it to your snippets and customise it. Save any snippet as a template from the editor.</p>
      <div className="cat-bar">{cats.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="tpl-grid">
        {list.map((t) => (
          <div key={t.id} className="card tpl">
            <div className="row"><h4 className="grow">{t.name}</h4>{t.locked && <Lock size={14} className="muted" />}<span className="kbd">{t.shortcut}</span></div>
            <div className="row" style={{ gap: 6 }}><span className="badge primary">{t.category}</span>{t.contentType === 'html' && <span className="badge">Rich</span>}{t.mine && <span className="badge success">Mine</span>}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{t.description}</div>
            <div className="pv">{(t.contentType === 'html' ? htmlToText(t.content) : t.content).slice(0, 240)}</div>
            <div className="row">
              <button className="btn sm primary" onClick={() => setOpen(t)}>Preview & use</button>
              {t.mine && <button className="btn sm ghost danger" onClick={() => setDel(t)}><Trash2 size={13} /></button>}
            </div>
          </div>
        ))}
      </div>
      {open && <UseTemplateDialog tpl={open} onClose={() => setOpen(null)} />}
      {del && <ConfirmModal title="Delete template?" danger message={`“${del.name}” will be removed from My templates.`} onConfirm={async () => { await deleteTemplate(del.id); toast('Template deleted'); }} onClose={() => setDel(null)} />}
    </div>
  );
}
