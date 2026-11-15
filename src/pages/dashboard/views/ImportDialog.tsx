import React, { useState } from 'react';
import { Modal } from '../common';
import { useStore, pickFile, folderPath } from '../store';
import { useCloud } from '../cloud';
import { parseImport, MAX_IMPORT_BYTES } from '../../../shared/validate';
import type { ExportBundle } from '../../../shared/types';
import { decodeShareCode } from '../../../shared/shareCode';
import { FileUp, ClipboardPaste } from 'lucide-react';

export function ImportDialog({ onClose, targetFolder = null, initialCode = '' }: { onClose: () => void; targetFolder?: string | null; initialCode?: string }) {
  const { importBundle, toast, folders } = useStore();
  const { mod } = useCloud();
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [meta, setMeta] = useState('');
  const [code, setCode] = useState(initialCode);
  const [mode, setMode] = useState<'merge' | 'copy' | 'replace'>('copy');
  const [folder, setFolder] = useState<string | null>(targetFolder);
  const [err, setErr] = useState('');

  const fromFile = async () => {
    setErr('');
    const f = await pickFile('.json,application/json');
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) { setErr('File is larger than 15 MB'); return; }
    try { setBundle(parseImport(await f.text())); setMeta(f.name); setMode('merge'); } catch (e: any) { setErr(e.message); }
  };
  const fromCode = async () => {
    setErr('');
    try {
      const s = code.trim();
      let res: { bundle: ExportBundle; title: string; from: string };
      if (s.startsWith('QTH1.')) { const b = await decodeShareCode(s); res = { bundle: b, title: `${b.snippets.length} snippet(s)`, from: 'a share code' }; }
      else if (mod) res = await mod.sharing.resolveShare(s);
      else throw new Error('Cloud share links need cloud features configured (Settings → Cloud & Account). Offline codes (QTH1.…) always work.');
      setBundle(res.bundle); setMeta(`“${res.title}” from ${res.from}`); setMode('copy');
    } catch (e: any) { setErr(e.message); }
  };
  const run = async () => {
    if (!bundle) return;
    try {
      const r = await importBundle(bundle, mode, folder);
      toast(`Imported ${r.snippets} snippet(s) and ${r.folders} folder(s)`);
      onClose();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal title="Import snippets" onClose={onClose} width={600} footer={bundle ? <><button className="btn" onClick={() => setBundle(null)}>Back</button><button className="btn primary" onClick={run}>Import</button></> : undefined}>
      {!bundle ? (
        <>
          <button className="btn" onClick={fromFile}><FileUp size={15} /> Choose a JSON file…</button>
          <div className="hint">QuickText Hub exports, a JSON array of snippets, or a simple {'{ "shortcut": "text" }'} map.</div>
          <div className="label" style={{ marginTop: 16 }}>…or paste a share code / link</div>
          <textarea className="textarea mono" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="QTH1.…  or  QTHS-…" />
          <button className="btn" onClick={fromCode} disabled={!code.trim()}><ClipboardPaste size={15} /> Read share</button>
        </>
      ) : (
        <>
          <p><b>{bundle.snippets.length}</b> snippet(s), <b>{bundle.folders.length}</b> folder(s){bundle.tables?.length ? `, ${bundle.tables.length} table(s)` : ''}{bundle.workflows?.length ? `, ${bundle.workflows.length} workflow(s)` : ''} — {meta}</p>
          <div style={{ maxHeight: 160, overflow: 'auto', marginBottom: 12 }} className="card">
            <table className="list"><tbody>{bundle.snippets.slice(0, 100).map((s) => <tr key={s.id}><td>{s.name}</td><td className="mono">{s.shortcut}</td></tr>)}</tbody></table>
          </div>
          <div className="field">
            <label className="label">How to import</label>
            <label className="check"><input type="radio" checked={mode === 'copy'} onChange={() => setMode('copy')} /> Add as new copies (never overwrites)</label><br />
            <label className="check"><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Merge — update matching snippets if the imported version is newer</label><br />
            <label className="check"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> <span style={{ color: 'var(--qth-danger)' }}>Replace all my snippets and folders</span></label>
          </div>
          <div className="field">
            <label className="label">Put snippets without a folder into</label>
            <select className="select" value={folder || ''} onChange={(e) => setFolder(e.target.value || null)}>
              <option value="">— No folder —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}
            </select>
          </div>
        </>
      )}
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}
