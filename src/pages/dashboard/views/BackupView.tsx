import React, { useEffect, useState } from 'react';
import { useStore, download, pickFile } from '../store';
import { useCloud } from '../cloud';
import { Modal } from '../common';
import { PageHead } from './kit';
import { exportBackup, parseBackup, restoreBackup, type BackupBundle } from '../../../cloud/backup';
import { audit } from '../../../shared/history';
import { checkPassphrase } from '../../../security/crypto';
import { HardDriveDownload, Upload, CloudUpload, CloudDownload, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';

export function BackupView() {
  const s = useStore();
  const { configured, user, mod } = useCloud();
  const [pass, setPass] = useState('');
  const [history, setHistory] = useState(false);
  const [cloud, setCloud] = useState<any[]>([]);
  const [restore, setRestore] = useState<BackupBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const loadCloud = () => mod && user && mod.backup.listCloudBackups().then(setCloud).catch(() => setCloud([]));
  useEffect(() => { loadCloud(); }, [mod, user]);
  const doExport = async () => {
    setBusy(true);
    try {
      const text = await exportBackup({ passphrase: pass || undefined, includeHistory: history });
      download(`k-flow-backup-${new Date().toISOString().slice(0, 10)}${pass ? '.encrypted' : ''}.json`, text);
      await audit('export', 'backup', { details: pass ? 'encrypted, includes sensitive values' : 'unencrypted, sensitive values omitted' });
      s.toast('Backup downloaded');
    } catch (e: any) { s.toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const doImport = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    const text = await f.text();
    try {
      let p: string | undefined;
      if (text.includes('"k-flow-backup-enc"')) { p = prompt('This backup is encrypted. Enter its passphrase:') || undefined; if (!p) return; }
      setRestore(await parseBackup(text, p));
    } catch (e: any) { s.toast(e.message, 'error'); }
  };
  const doRestore = async (mode: 'merge' | 'replace') => {
    if (!restore) return;
    setBusy(true);
    try {
      const r = await restoreBackup(restore, mode);
      await mod?.resetSyncCursors();
      await audit('restore', 'backup', { details: `${mode}: ${Object.entries(r).map(([k, v]) => `${v} ${k}`).join(', ')}` });
      await s.reload();
      s.toast('Backup restored');
      setRestore(null);
    } catch (e: any) { s.toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const chk = pass ? checkPassphrase(pass) : null;
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageHead title="Backup & recovery" icon={<HardDriveDownload size={20} />} sub="Full backups of every workspace, profile, macro, script, variable, dataset and template — on your computer or encrypted in your cloud account." />
      <section className="card section">
        <h3 style={{ marginTop: 0 }}>Download a backup file</h3>
        <div className="grid-2">
          <div className="field"><label className="label">Encryption passphrase (recommended)</label><input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Leave empty for an unencrypted file" />
            {chk && <div className={chk.ok ? 'hint' : 'err'}>{chk.message}</div>}
            <div className="hint">{pass ? <><ShieldCheck size={12} /> AES-256-GCM encrypted — includes sensitive dataset values and vault ciphertext.</> : <><AlertTriangle size={12} /> Without a passphrase, sensitive columns (Aadhaar, phone, DOB…) are left out — never written in plain text.</>}</div></div>
          <div className="field"><label className="label">Options</label><label className="check"><input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Include execution history & audit log</label></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" disabled={busy || (!!pass && !chk?.ok)} onClick={doExport}><HardDriveDownload size={15} /> Download backup</button>
          <button className="btn" disabled={busy} onClick={doImport}><Upload size={15} /> Restore from file…</button>
        </div>
      </section>
      <section className="card section">
        <div className="section-head"><div><h3>Cloud backups</h3><div className="muted" style={{ fontSize: 13 }}>Encrypted with your vault passphrase before upload. The last 5 are kept; a weekly automatic backup runs while the vault is unlocked.</div></div>
          <button className="btn primary" disabled={!configured || !user || !s.vaultUnlocked || busy} title={!s.vaultUnlocked ? 'Unlock the vault first' : ''} onClick={async () => { setBusy(true); try { await mod!.backup.uploadCloudBackup('Manual backup'); await audit('backup', 'cloud'); s.toast('Cloud backup saved'); loadCloud(); } catch (e: any) { s.toast(e.message, 'error'); } finally { setBusy(false); } }}><CloudUpload size={15} /> Back up now</button></div>
        {!configured || !user ? <div className="muted">Sign in (Settings → Cloud & Account) to use cloud backups.</div> : !s.vaultUnlocked ? <div className="muted">Set up / unlock the vault to create or restore cloud backups.</div> : null}
        {cloud.length > 0 && <table className="list"><tbody>{cloud.map((b) => (
          <tr key={b.id}><td><b>{b.label}</b><div className="muted" style={{ fontSize: 12 }}>{Object.entries(b.counts || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(' · ')}</div></td><td className="muted">{new Date(b.createdAt).toLocaleString()}</td><td className="muted">{Math.round(b.size / 1024)} KB</td>
            <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" disabled={!s.vaultUnlocked} onClick={async () => { try { setRestore(await mod!.backup.downloadCloudBackup(b.id)); } catch (e: any) { s.toast(e.message, 'error'); } }}><CloudDownload size={13} /> Restore</button>
              <button className="btn ghost sm danger" onClick={async () => { await mod!.backup.deleteCloudBackup(b.id); loadCloud(); }}><Trash2 size={13} /></button></td></tr>
        ))}</tbody></table>}
      </section>
      <section className="card section">
        <h3 style={{ marginTop: 0 }}>Version history</h3>
        <div className="muted">Every save of a profile, macro, script, variable or snippet keeps a version (last 25 per item). Open an item and click <b>Versions</b> to compare and restore. Deleted items stay recoverable from backups.</div>
      </section>
      {restore && (
        <Modal title="Restore backup" onClose={() => setRestore(null)} width={560} footer={<><button className="btn" onClick={() => setRestore(null)}>Cancel</button><button className="btn" disabled={busy} onClick={() => doRestore('merge')}>Merge</button><button className="btn danger solid" disabled={busy} onClick={() => doRestore('replace')}>Replace everything</button></>}>
          <div>Backup from <b>{new Date(restore.createdAt).toLocaleString()}</b>{restore.sensitiveIncluded ? ' (includes sensitive values)' : ' (sensitive values were not included)'}.</div>
          <ul>{Object.entries(restore.counts || {}).map(([k, v]) => <li key={k}>{v} {k}</li>)}</ul>
          <div className="hint"><b>Merge</b> keeps newer local items; <b>Replace</b> deletes current personal data first (organization items are untouched).</div>
        </Modal>
      )}
    </div>
  );
}
