import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Empty, Modal, ConfirmModal } from '../common';
import type { VaultEntry } from '../../../shared/types';
import { PageHead } from './kit';
import { isVaultSetUp, setupVault, unlockVault, lockVault, saveSecret, revealSecret, changePassphrase } from '../../../security/vault';
import { checkPassphrase } from '../../../security/crypto';
import { audit } from '../../../shared/history';
import { KeyRound, Lock, Unlock, Plus, Eye, Trash2, Pencil, ShieldCheck } from 'lucide-react';

function EntryDialog({ e, onClose }: { e?: VaultEntry; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState(e?.name || '');
  const [key, setKey] = useState(e?.key || '');
  const [username, setUsername] = useState(e?.username || '');
  const [secret, setSecret] = useState('');
  const [domains, setDomains] = useState((e?.domains || []).join(', '));
  const [note, setNote] = useState(e?.note || '');
  const [err, setErr] = useState('');
  const save = async () => {
    try {
      await saveSecret({ name: name || key, key, username, secret: e && !secret ? undefined : secret, domains: domains.split(',').map((x) => x.trim()).filter(Boolean), note, workspaceId: s.ws.id }, e);
      await audit(e ? 'edit' : 'create', 'vault', { name: key });
      await s.reload();
      onClose();
    } catch (x: any) { setErr(x.message); }
  };
  return (
    <Modal title={e ? `Edit ${e.name}` : 'New secret'} onClose={onClose} width={520} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save encrypted</button></>}>
      <div className="grid-2">
        <div className="field"><label className="label">Name</label><input className="input" value={name} onChange={(x) => setName(x.target.value)} placeholder="UDISE+ login" /></div>
        <div className="field"><label className="label">Key (use as {'{{vault.key}}'})</label><input className="input mono" value={key} onChange={(x) => setKey(x.target.value.replace(/[^A-Za-z0-9_]/g, '_'))} placeholder="udise_password" /></div>
      </div>
      <div className="field"><label className="label">Username (optional, {'{{vault.key_user}}'})</label><input className="input" autoComplete="off" value={username} onChange={(x) => setUsername(x.target.value)} /></div>
      <div className="field"><label className="label">Secret {e && <span className="muted">(leave empty to keep the current value)</span>}</label><input className="input" type="password" autoComplete="new-password" value={secret} onChange={(x) => setSecret(x.target.value)} /></div>
      <div className="field"><label className="label">Only on these domains (comma separated, empty = any)</label><input className="input mono" value={domains} onChange={(x) => setDomains(x.target.value)} placeholder="udiseplus.gov.in" /></div>
      <div className="field"><label className="label">Note</label><input className="input" value={note} onChange={(x) => setNote(x.target.value)} /></div>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}

export function VaultView() {
  const s = useStore();
  const [setup, setSetup] = useState<boolean | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<VaultEntry | null | 'new'>(null);
  const [del, setDel] = useState<VaultEntry | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [chg, setChg] = useState(false);
  useEffect(() => { isVaultSetUp().then(setSetup); }, [s.vaultUnlocked]);
  const chk = checkPassphrase(pass);
  const doSetup = async () => {
    setErr('');
    if (pass !== pass2) { setErr('Passphrases do not match'); return; }
    try { await setupVault(pass); await audit('create', 'vault', { details: 'vault set up' }); setPass(''); setPass2(''); await s.reload(); setSetup(true); s.toast('Vault created and unlocked'); } catch (e: any) { setErr(e.message); }
  };
  const doUnlock = async () => { setErr(''); try { await unlockVault(pass, s.settings.security.vaultAutoLockMin); setPass(''); await s.reload(); s.toast('Vault unlocked'); } catch (e: any) { setErr(e.message); await audit('unlock-failed', 'vault'); } };
  const reveal = async (e: VaultEntry) => { try { const v = await revealSecret(e); setShown({ ...shown, [e.id]: v }); await audit('reveal', 'vault', { name: e.key }); setTimeout(() => setShown((x) => { const n = { ...x }; delete n[e.id]; return n; }), 15000); } catch (x: any) { s.toast(x.message, 'error'); } };
  const list = s.vault;
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <PageHead title="Credential vault" icon={<KeyRound size={20} />} sub="Passwords, portal logins and other secrets — encrypted with a passphrase only you know (AES-256-GCM, PBKDF2 310,000 iterations).">
        {s.vaultUnlocked && <><button className="btn" onClick={() => setChg(true)}>Change passphrase</button><button className="btn" onClick={async () => { await lockVault(); await s.reload(); }}><Lock size={15} /> Lock now</button><button className="btn primary" onClick={() => setEdit('new')}><Plus size={15} /> Add secret</button></>}
      </PageHead>
      {setup === false && (
        <section className="card section" style={{ maxWidth: 520 }}>
          <h3 style={{ marginTop: 0 }}>Create your vault</h3>
          <p className="muted">Choose a passphrase. It is never stored — if you forget it, the secrets cannot be recovered. The same passphrase also encrypts cloud backups and sensitive data you choose to sync.</p>
          <div className="field"><label className="label">Passphrase</label><input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />{pass && <div className={chk.ok ? 'hint' : 'err'}>{chk.message}</div>}</div>
          <div className="field"><label className="label">Repeat passphrase</label><input className="input" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></div>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" disabled={!chk.ok} onClick={doSetup}><ShieldCheck size={15} /> Create vault</button>
        </section>
      )}
      {setup && !s.vaultUnlocked && (
        <section className="card section" style={{ maxWidth: 460 }}>
          <h3 style={{ marginTop: 0 }}><Lock size={16} /> Vault is locked</h3>
          <div className="field"><input className="input" type="password" autoFocus placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doUnlock()} /></div>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" onClick={doUnlock}><Unlock size={15} /> Unlock</button>
          <div className="hint">Locks automatically after {s.settings.security.vaultAutoLockMin} minutes of inactivity and when the browser closes. {list.length} encrypted secret(s) stored.</div>
        </section>
      )}
      {s.vaultUnlocked && (list.length ? (
        <div className="card"><table className="list">
          <thead><tr><th>Name</th><th>Use as</th><th>Username</th><th>Secret</th><th>Domains</th><th /></tr></thead>
          <tbody>{list.map((e) => (
            <tr key={e.id}>
              <td><b>{e.name}</b>{e.note && <div className="muted" style={{ fontSize: 12 }}>{e.note}</div>}</td>
              <td className="mono">{`{{vault.${e.key}}}`}</td>
              <td>{e.username}</td>
              <td className="mono">{shown[e.id] ?? '••••••••'} <button className="btn ghost icon sm" title="Reveal for 15 seconds" onClick={() => reveal(e)}><Eye size={13} /></button></td>
              <td className="muted">{e.domains.join(', ') || 'any'}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn ghost icon sm" onClick={() => setEdit(e)}><Pencil size={14} /></button><button className="btn ghost icon sm danger" onClick={() => setDel(e)}><Trash2 size={14} /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty icon={<KeyRound size={32} />} title="No secrets yet">Add portal passwords and use them in autofill rules as {'{{vault.key}}'} — they are only decrypted while the vault is unlocked and are never logged or given to scripts.</Empty>)}
      {edit && <EntryDialog e={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {del && <ConfirmModal title={`Delete ${del.name}?`} danger message="The encrypted secret is removed." onConfirm={() => s.deleteRec('vault', [del.id], del.key)} onClose={() => setDel(null)} />}
      {chg && <ChangePass onClose={() => setChg(false)} />}
    </div>
  );
}

function ChangePass({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal title="Change vault passphrase" onClose={onClose} width={440} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={async () => { try { await changePassphrase(a, b); await audit('rekey', 'vault'); await s.reload(); s.toast('Passphrase changed — all secrets re-encrypted'); onClose(); } catch (e: any) { setErr(e.message); } }}>Change</button></>}>
      <div className="field"><label className="label">Current passphrase</label><input className="input" type="password" value={a} onChange={(e) => setA(e.target.value)} /></div>
      <div className="field"><label className="label">New passphrase</label><input className="input" type="password" value={b} onChange={(e) => setB(e.target.value)} /><div className="hint">{b && checkPassphrase(b).message}</div></div>
      <div className="hint">Existing cloud backups stay encrypted with the old passphrase.</div>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
