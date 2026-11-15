import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useRoute, folderPath } from '../store';
import { CodeEditor, EditorHandle } from './CodeEditor';
import { RichEditor } from './RichEditor';
import { CommandBuilder } from './CommandBuilder';
import { parseForEdit, COMMANDS } from './commands';
import { render, FieldDef, RepeatItem } from '../../../engine/render';
import { buildRenderContext } from '../../../shared/renderContext';
import { FormRenderer } from '../../../ui/FormRenderer';
import { shortcutConflicts } from '../../../content/match';
import { sanitizeHtml, htmlToText, textToHtml } from '../../../shared/html';
import { uid } from '../../../shared/ids';
import { ConfirmModal, Switch, PlanGate, timeAgo } from '../common';
import { ShareDialog } from '../views/ShareDialog';
import type { Snippet } from '../../../shared/types';
import { Save, Copy, Trash2, Share2, Star, Pin, Plus, Pencil, RotateCcw, LayoutTemplate, BookOpen, AlertTriangle, Type, Code2 } from 'lucide-react';

export function SnippetEditor({ snippet, isNew, onDone }: { snippet: Snippet; isNew?: boolean; onDone?: (id: string | null) => void }) {
  const store = useStore();
  const { folders, snippets, settings, tables, saveSnippet, deleteSnippets, toast, can, saveTemplate } = store;
  const [, , go] = useRoute();
  const [draft, setDraft] = useState<Snippet>(snippet);
  const [builder, setBuilder] = useState<null | { initial?: any; range?: [number, number] }>(null);
  const [tab, setTab] = useState<'preview' | 'fields'>('preview');
  const [values, setValues] = useState<Record<string, any>>({});
  const [confirmDel, setConfirmDel] = useState(false);
  const [share, setShare] = useState(false);
  const ed = useRef<EditorHandle>(null);

  useEffect(() => { setDraft(snippet); setValues({}); }, [snippet.id]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(snippet) || isNew;
  const set = (p: Partial<Snippet>) => setDraft((d) => ({ ...d, ...p }));

  const ctx = useMemo(() => buildRenderContext({ settings, snippets: snippets.map((s) => (s.id === draft.id ? draft : s)), tables, values, page: { url: 'https://example.com/page', title: 'Example page', host: 'example.com' } }), [settings, snippets, tables, values, draft]);
  const out = useMemo(() => render(draft.content, draft.contentType, ctx), [draft.content, draft.contentType, ctx]);
  const fieldNames = useMemo(() => {
    const n = new Set<string>();
    const walk = (items: any[]) => items.forEach((i) => { n.add(i.name); if (i.type === 'repeat') i.rows.forEach((r: any[]) => walk(r)); });
    walk(out.form);
    return [...n, 'me.name', 'me.email', 'me.company', ...tables.map((t) => 'data.' + t.key)];
  }, [out.form, tables]);

  const conflicts = useMemo(() => {
    const list = snippets.filter((s) => s.id !== draft.id).map((s) => ({ id: s.id, shortcut: s.shortcut })).concat([{ id: draft.id, shortcut: draft.shortcut }]);
    const c = shortcutConflicts(list, settings.caseSensitive);
    const rev = Object.entries(c).filter(([id, msgs]) => id !== draft.id && msgs.some((m) => m.includes(`"${draft.shortcut}"`))).map(() => `"${draft.shortcut}" is blocked by a shorter shortcut that starts the same way`);
    return [...(c[draft.id] || []), ...rev];
  }, [snippets, draft.id, draft.shortcut, settings.caseSensitive]);
  const shortcutError = !draft.shortcut ? 'Add a shortcut so the snippet can be typed' : /\s/.test(draft.shortcut) ? 'Shortcuts cannot contain spaces' : draft.shortcut.length > 48 ? 'Max 48 characters' : '';

  const save = async () => {
    if (!draft.name.trim()) { toast('Give the snippet a name', 'error'); return; }
    if (conflicts.some((c) => c.startsWith('Same shortcut'))) { toast('Another snippet already uses this shortcut', 'error'); return; }
    if (draft.contentType === 'html' && !can('richText')) { toast('Rich text requires the Pro plan', 'error'); return; }
    try {
      const saved = await saveSnippet({ ...draft, content: draft.contentType === 'html' ? sanitizeHtml(draft.content) : draft.content });
      toast('Snippet saved');
      onDone?.(saved.id);
    } catch (e: any) { toast(e.message, 'error'); }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const duplicate = async () => {
    try {
      const copy = await saveSnippet({ ...draft, id: uid('snp'), name: draft.name + ' (copy)', shortcut: draft.shortcut + '2', createdAt: 0, teamId: draft.teamId ?? null });
      toast('Duplicated');
      go('/snippet/' + copy.id);
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const switchType = (t: 'text' | 'html') => {
    if (t === draft.contentType) return;
    if (t === 'html') set({ contentType: 'html', content: textToHtml(draft.content) });
    else set({ contentType: 'text', content: htmlToText(draft.content) });
  };
  const insertCmd = (open: string, close?: string, middle?: string) => {
    if (builder?.range) {
      const [s, e] = builder.range;
      set({ content: draft.content.slice(0, s) + open + draft.content.slice(e) });
      return;
    }
    if (close) ed.current?.insert('', { before: open, after: (middle ? '\n' + middle + '\n…' : '') + close });
    else ed.current?.insert(open);
  };
  const editField = (f: FieldDef | RepeatItem) => {
    const fd = f as FieldDef;
    if (fd.start === undefined || fd.start < 0 || fd.end === undefined) {
      const text = COMMANDS.find((c) => c.id === 'text')!;
      setBuilder({ initial: { def: text, values: { main: fd.name } } });
      return;
    }
    const body = draft.content.slice(fd.start + 2, fd.end - 2);
    const parsed = draft.contentType === 'html' ? parseForEdit(htmlToText(body)) : parseForEdit(body);
    if (fd.implicit || !parsed) {
      const text = COMMANDS.find((c) => c.id === 'text')!;
      setBuilder({ initial: { def: text, values: { main: fd.name } }, range: [fd.start, fd.end] });
    } else setBuilder({ initial: parsed, range: [fd.start, fd.end] });
  };
  const usage = store.usage.get(draft.id);
  const ro = !!draft.readOnly;

  const fieldRows: (FieldDef | RepeatItem)[] = [];
  const walk = (items: any[]) => items.forEach((i) => { fieldRows.push(i); if (i.type === 'repeat' && i.rows[0]) walk(i.rows[0]); });
  walk(out.form);

  return (
    <div className="editor fade-in">
      <div className="row" style={{ marginBottom: 6 }}>
        <input className="name-input" placeholder="Snippet name" value={draft.name} onChange={(e) => set({ name: e.target.value })} readOnly={ro} autoFocus={isNew} />
        {dirty && <span className="badge warn">Unsaved</span>}
        <button className="btn ghost icon" title={draft.pinned ? 'Unpin' : 'Pin'} onClick={() => set({ pinned: !draft.pinned })}><Pin size={17} fill={draft.pinned ? 'currentColor' : 'none'} /></button>
        <button className="btn ghost icon" title={draft.favorite ? 'Remove favourite' : 'Favourite'} onClick={() => set({ favorite: !draft.favorite })}><Star size={17} fill={draft.favorite ? '#f59e0b' : 'none'} color={draft.favorite ? '#f59e0b' : 'currentColor'} /></button>
        {!isNew && <button className="btn ghost icon" title="Duplicate" onClick={duplicate}><Copy size={17} /></button>}
        {!isNew && can('sharing') && <button className="btn ghost icon" title="Share" onClick={() => setShare(true)}><Share2 size={17} /></button>}
        {!isNew && <button className="btn ghost icon" title="Save as template" onClick={async () => { await saveTemplate({ id: uid('tpl'), name: draft.name, category: 'My templates', description: draft.description, shortcut: draft.shortcut, content: draft.content, contentType: draft.contentType, createdAt: 0, updatedAt: 0, teamId: null }); toast('Saved to My templates'); }}><LayoutTemplate size={17} /></button>}
        {!isNew && !ro && <button className="btn ghost icon danger" title="Delete" onClick={() => setConfirmDel(true)}><Trash2 size={17} /></button>}
        <button className="btn primary" onClick={save} disabled={ro}><Save size={15} /> Save</button>
      </div>
      {ro && <div className="badge warn" style={{ marginBottom: 10 }}>Read-only: shared by your team with viewer access</div>}

      <div className="editor-top">
        <div className="field">
          <label className="label">Shortcut</label>
          <input className={'input mono' + (shortcutError || conflicts.length ? ' invalid' : '')} placeholder="/sig" value={draft.shortcut} onChange={(e) => set({ shortcut: e.target.value.replace(/\s/g, '') })} readOnly={ro} />
          {shortcutError ? <div className="err">{shortcutError}</div> : conflicts.map((c, i) => <div key={i} className="err"><AlertTriangle size={11} /> {c}</div>)}
        </div>
        <div className="field">
          <label className="label">Folder</label>
          <select className="select" value={draft.folderId || ''} onChange={(e) => { const f = folders.find((x) => x.id === e.target.value); set({ folderId: e.target.value || null, teamId: f?.teamId ?? null }); }} disabled={ro}>
            <option value="">— No folder —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label">Expand</label>
          <select className="select" value={draft.trigger || 'default'} onChange={(e) => set({ trigger: e.target.value as any })}>
            <option value="default">Default ({settings.triggerMode === 'immediate' ? 'instantly' : 'after space/punctuation'})</option>
            <option value="immediate">Instantly when typed</option>
            <option value="delimiter">After space / punctuation</option>
          </select>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 12, gap: 16 }}>
        <Switch checked={draft.enabled} onChange={(v) => set({ enabled: v })} label="Enabled" />
        <div className="row" style={{ gap: 4 }}>
          <button className={'tabbtn' + (draft.contentType === 'text' ? ' on' : '')} onClick={() => switchType('text')}><Code2 size={13} /> Plain text</button>
          <button className={'tabbtn' + (draft.contentType === 'html' ? ' on' : '')} onClick={() => switchType('html')}><Type size={13} /> Rich text</button>
        </div>
        {draft.contentType === 'html' && <PlanGate feature="richText" inline><span /></PlanGate>}
        <input className="input grow" style={{ maxWidth: 360 }} placeholder="Description (optional)" value={draft.description || ''} onChange={(e) => set({ description: e.target.value })} />
        <input className="input" style={{ maxWidth: 220 }} placeholder="tags, comma separated" value={draft.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
      </div>

      <div className="editor-grid">
        <div className="panel">
          <div className="panel-head">
            <span className="grow">Content</span>
            <a className="btn ghost sm" href="#/settings?tab=syntax"><BookOpen size={13} /> Syntax guide</a>
            <button className="btn sm primary" onClick={() => setBuilder({})} disabled={ro}><Plus size={13} /> Insert field / command</button>
          </div>
          {draft.contentType === 'html'
            ? <RichEditor ref={ed} value={draft.content} onChange={(v) => set({ content: v })} readOnly={ro} />
            : <CodeEditor ref={ed} value={draft.content} onChange={(v) => set({ content: v })} readOnly={ro} placeholder={'Type your snippet. Example:\nDear {{name}},\nYour payment of {{currency: amount}} is due on {{date: due; default=+7d}}.'} />}
          <div className="chips">
            <span className="muted" style={{ fontSize: 12 }}>Quick insert:</span>
            {[['Text field', '{{text: name}}'], ['Date', '{{today}}'], ['Dropdown', '{{select: choice; options=A,B,C}}'], ['Formula', '{{= 1 + 1}}'], ['Signature', '{{me.signature}}'], ['Cursor', '{{cursor}}']].map(([l, c]) => (
              <button key={l} className="chip" onClick={() => ed.current?.insert(c)} disabled={ro}>{l}</button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="tabs">
              <button className={'tabbtn' + (tab === 'preview' ? ' on' : '')} onClick={() => setTab('preview')}>Live preview</button>
              <button className={'tabbtn' + (tab === 'fields' ? ' on' : '')} onClick={() => setTab('fields')}>Form builder ({fieldRows.length})</button>
            </div>
            <div className="grow" />
            {tab === 'preview' && <button className="btn ghost sm" onClick={() => setValues({})} title="Reset form values"><RotateCcw size={13} /> Reset</button>}
          </div>
          <div className="panel-body">
            {out.errors.length > 0 && <div className="locked" style={{ marginBottom: 10, color: 'var(--qth-danger)' }}>{out.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}</div>}
            {tab === 'preview' ? (
              <>
                {out.form.length > 0 && (
                  <>
                    <div className="label">Form shown when the shortcut is typed</div>
                    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                      <FormRenderer items={out.form} values={values} onChange={setValues} showErrors />
                    </div>
                  </>
                )}
                {out.validation.length > 0 && <div className="hint" style={{ color: 'var(--qth-warning)', marginBottom: 8 }}>{out.validation.length} validation message(s) — insertion is blocked until resolved.</div>}
                <div className="label">Output {out.cursor !== null && <span className="badge">cursor at {out.cursor}</span>}</div>
                {out.isRich ? <div className="preview-box" dangerouslySetInnerHTML={{ __html: sanitizeHtml(out.html) }} /> : <div className="preview-box">{out.text || <span className="muted">Nothing to show yet</span>}</div>}
              </>
            ) : (
              <div className="fieldlist">
                {fieldRows.length === 0 && <div className="muted" style={{ marginBottom: 10 }}>No form fields yet. Fields create a small form that appears when the shortcut is typed.</div>}
                {fieldRows.map((f, i) => (
                  <div className="fi" key={i} style={{ marginLeft: Math.min(2, f.depth) * 14 }}>
                    <span className="badge primary t">{(f as any).type}</span>
                    <b className="grow mono">{f.name}</b>
                    <span className="muted" style={{ fontSize: 12 }}>{f.label}{(f as FieldDef).required ? ' *' : ''}{(f as FieldDef).implicit ? ' (auto)' : ''}</span>
                    {(f as any).type !== 'repeat' && <button className="btn ghost icon sm" title="Edit field" onClick={() => editField(f)} disabled={ro}><Pencil size={13} /></button>}
                  </div>
                ))}
                <button className="btn sm" onClick={() => setBuilder({})} disabled={ro}><Plus size={13} /> Add field</button>
                <div className="hint" style={{ marginTop: 10 }}>Fields appear in the order they are used. Fields inside "if" blocks only appear when the condition is true.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isNew && (
        <div className="row muted" style={{ marginTop: 14, fontSize: 12.5, gap: 18 }}>
          <span>Used <b>{usage?.count || 0}</b> times</span>
          <span>Last used {timeAgo(usage?.lastUsedAt || 0)}</span>
          <span>Created {new Date(draft.createdAt).toLocaleDateString()}</span>
          <span>Updated {timeAgo(snippet.updatedAt)}</span>
          {draft.source?.kind && <span>Source: {draft.source.kind}</span>}
        </div>
      )}

      {builder && <CommandBuilder names={fieldNames} initial={builder.initial} onClose={() => setBuilder(null)} onInsert={insertCmd} />}
      {confirmDel && <ConfirmModal title="Delete snippet?" danger confirmLabel="Delete" message={<>“{draft.name}” will be deleted{store.cloud.firebase ? ' on all synced devices' : ''}.</>} onConfirm={async () => { await deleteSnippets([draft.id]); toast('Snippet deleted'); onDone?.(null); }} onClose={() => setConfirmDel(false)} />}
      {share && <ShareDialog snippetIds={[draft.id]} onClose={() => setShare(false)} />}
    </div>
  );
}
