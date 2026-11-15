import React, { useEffect, useState } from 'react';
import { useStore, useRoute, download, pickFile } from '../store';
import { useCloud } from '../cloud';
import { Section, Switch, ConfirmModal } from '../common';
import { PLANS, FEATURE_LABELS } from '../../../shared/plans';
import { saveCloudConfig } from '../../../shared/settings';
import { parseImport } from '../../../shared/validate';
import { listRecords, clearStore } from '../../../shared/db';
import { seedIfEmpty } from '../../../library/seed';
import { FUNCTIONS } from '../../../engine/expr';
import { formatDate } from '../../../engine/dates';
import { api } from '../../../shared/browser';
import type { PlanId, Settings } from '../../../shared/types';
import { Cloud, LogOut, RefreshCw, Download, Upload, KeyRound, Mail, AlertTriangle } from 'lucide-react';

const TABS = [['general', 'General'], ['expansion', 'Text expansion'], ['profile', 'Profile'], ['format', 'Formats'], ['cloud', 'Cloud & Account'], ['backup', 'Backup & restore'], ['plan', 'Plan'], ['syntax', 'Syntax guide'], ['privacy', 'Privacy & security']] as const;

function General() {
  const { settings: s, setSettings } = useStore();
  return (
    <Section title="Appearance">
      <div className="field"><label className="label">Theme</label>
        <select className="select" style={{ maxWidth: 240 }} value={s.theme} onChange={(e) => setSettings({ theme: e.target.value as any })}><option value="system">Match system</option><option value="light">Light</option><option value="dark">Dark</option></select>
      </div>
      <Switch checked={s.showToasts} onChange={(v) => setSettings({ showToasts: v })} label="Show notifications on web pages (errors, autopilot progress)" />
    </Section>
  );
}

function Expansion() {
  const { settings: s, setSettings } = useStore();
  const [blocked, setBlocked] = useState(s.blockedSites.join('\n'));
  const [hk, setHk] = useState(s.assistantHotkey);
  return (
    <>
      <Section title="Expansion">
        <div className="field"><Switch checked={s.expansionEnabled} onChange={(v) => setSettings({ expansionEnabled: v })} label="Expand shortcuts while typing" /></div>
        <div className="field"><label className="label">When to expand</label>
          <label className="check"><input type="radio" checked={s.triggerMode === 'immediate'} onChange={() => setSettings({ triggerMode: 'immediate' })} /> Instantly, as soon as the shortcut is typed</label><br />
          <label className="check"><input type="radio" checked={s.triggerMode === 'delimiter'} onChange={() => setSettings({ triggerMode: 'delimiter' })} /> After a space, Enter or punctuation (lets “/pay” and “/payment” coexist)</label>
        </div>
        {s.triggerMode === 'delimiter' && (
          <div className="grid-2">
            <div className="field"><label className="label">Delimiter characters</label><input className="input mono" value={s.delimiters.replace(/\n/g, '\\n').replace(/\t/g, '\\t')} onChange={(e) => setSettings({ delimiters: e.target.value.replace(/\\n/g, '\n').replace(/\\t/g, '\t') })} /></div>
            <div className="field" style={{ paddingTop: 24 }}><Switch checked={s.keepDelimiter} onChange={(v) => setSettings({ keepDelimiter: v })} label="Keep the typed delimiter after the text" /></div>
          </div>
        )}
        <div className="field"><Switch checked={s.caseSensitive} onChange={(v) => setSettings({ caseSensitive: v })} label="Case-sensitive shortcuts" /></div>
        <div className="field"><Switch checked={s.wordBoundary} onChange={(v) => setSettings({ wordBoundary: v })} label="Only expand at the start of a word (e.g. not inside “site.com/sig”)" /></div>
      </Section>
      <Section title="Snippet assistant" desc="A searchable list of snippets you can open in any text field.">
        <div className="field"><label className="label">Keyboard shortcut</label>
          <div className="row" style={{ maxWidth: 420 }}>
            <input className="input mono" value={hk} onKeyDown={(e) => {
              e.preventDefault();
              if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
              const parts = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean);
              setHk(parts.join('+'));
            }} onChange={() => {}} />
            <button className="btn" onClick={() => setSettings({ assistantHotkey: hk })} disabled={hk === s.assistantHotkey}>Save</button>
          </div>
          <div className="hint">Click the box and press a key combination. Also available: right-click → “Insert QuickText snippet…”, and the browser command (chrome://extensions/shortcuts, default Alt+Shift+Q).</div>
        </div>
        <Switch checked={s.showFloatingButton} onChange={(v) => setSettings({ showFloatingButton: v })} label="Show a floating ⚡ button in focused text fields" />
      </Section>
      <Section title="Disabled websites" desc="One domain per line. Expansion and the assistant are switched off there (subdomains included).">
        <textarea className="textarea mono" rows={5} value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder={'bank.example.com\nintranet.local'} />
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setSettings({ blockedSites: blocked.split(/\n+/).map((x) => x.trim()).filter(Boolean) })}>Save list</button>
      </Section>
      <Section title="Google Docs (experimental)" desc="Google Docs draws text on a canvas, so normal insertion does not work there.">
        <Switch checked={s.googleDocsExperimental} onChange={(v) => setSettings({ googleDocsExperimental: v })} label="Try typed-shortcut expansion in Google Docs" />
        <div className="hint"><AlertTriangle size={12} /> Uses simulated Backspace + paste events, which Google may ignore. Not covered by automated tests. If it doesn't work, open the assistant, pick a snippet and paste when prompted (“Copy text” in the notification).</div>
      </Section>
    </>
  );
}

function Profile() {
  const { settings: s, setSettings, toast } = useStore();
  const [p, setP] = useState(s.profile);
  const f = (k: keyof Settings['profile'], label: string) => <div className="field"><label className="label">{label} <span className="mono muted">{`{{me.${k}}}`}</span></label><input className="input" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></div>;
  return (
    <Section title="Your profile" desc="Reusable personal details for templates. Stored locally (and in your cloud account if sync is on).">
      <div className="grid-2">{f('name', 'Full name')}{f('email', 'Email')}{f('phone', 'Phone')}{f('company', 'Company / institution')}{f('title', 'Job title')}{f('website', 'Website')}</div>
      <div className="field"><label className="label">Signature <span className="mono muted">{'{{me.signature}}'}</span></label><textarea className="textarea" rows={5} value={p.signature} onChange={(e) => setP({ ...p, signature: e.target.value })} /></div>
      <button className="btn primary" onClick={async () => { await setSettings({ profile: p }); toast('Profile saved'); }}>Save profile</button>
    </Section>
  );
}

function Formats() {
  const { settings: s, setSettings } = useStore();
  const now = new Date();
  return (
    <Section title="Default formats" desc="Used when a template doesn't specify format=…">
      <div className="grid-2">
        <div className="field"><label className="label">Date format</label><input className="input mono" value={s.dateFormat} onChange={(e) => setSettings({ dateFormat: e.target.value })} /><div className="hint">Preview: {formatDate(now, s.dateFormat)} · tokens YYYY MM MMM MMMM DD D Do dddd ddd</div></div>
        <div className="field"><label className="label">Time format</label><input className="input mono" value={s.timeFormat} onChange={(e) => setSettings({ timeFormat: e.target.value })} /><div className="hint">Preview: {formatDate(now, s.timeFormat)} · tokens HH H hh h mm ss A a</div></div>
        <div className="field"><label className="label">Number locale</label><input className="input" value={s.locale} onChange={(e) => { try { new Intl.NumberFormat(e.target.value); setSettings({ locale: e.target.value }); } catch { /* invalid */ } }} /><div className="hint">e.g. en-US, en-IN, de-DE · {new Intl.NumberFormat(s.locale).format(1234567.89)}</div></div>
        <div className="field"><label className="label">Default currency</label><input className="input mono" maxLength={3} value={s.currency} onChange={(e) => /^[A-Za-z]{0,3}$/.test(e.target.value) && setSettings({ currency: e.target.value.toUpperCase() })} /><div className="hint">{s.currency.length === 3 ? (() => { try { return new Intl.NumberFormat(s.locale, { style: 'currency', currency: s.currency }).format(1250); } catch { return 'Unknown currency code'; } })() : 'ISO code, e.g. USD, INR, EUR'}</div></div>
      </div>
    </Section>
  );
}

function CloudTab() {
  const { cloud, settings: s, setSettings, toast, reload } = useStore();
  const { configured, user, mod, sync, syncNow, loading } = useCloud();
  const [cfgText, setCfgText] = useState(cloud.firebase ? JSON.stringify(cloud.firebase, null, 2) : '');
  const [clientId, setClientId] = useState(cloud.googleClientId);
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const redirect = (() => { try { return api.identity.getRedirectURL(); } catch { return ''; } })();

  const saveCfg = async () => {
    try {
      let txt = cfgText.trim();
      if (!txt) { await saveCloudConfig({ firebase: null, googleClientId: clientId.trim() }); await reload(); toast('Cloud disabled'); return; }
      // Accept the JS snippet from the Firebase console as well as JSON.
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) txt = m[0];
      txt = txt.replace(/([{,]\s*)([A-Za-z_]+)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/g, '}');
      const cfg = JSON.parse(txt);
      if (!cfg.apiKey || !cfg.projectId || !cfg.appId || !cfg.authDomain) throw new Error('Config must include apiKey, authDomain, projectId and appId');
      await saveCloudConfig({ firebase: { apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId }, googleClientId: clientId.trim() });
      await reload();
      toast('Cloud configuration saved');
    } catch (e: any) { toast('Invalid configuration: ' + e.message, 'error'); }
  };
  const run = async (fn: () => Promise<any>, ok: string) => { setBusy(true); try { await fn(); toast(ok); } catch (e: any) { toast(e.message, 'error'); } setBusy(false); };

  return (
    <>
      <Section title="Account" desc="Optional. QuickText Hub works fully offline; sign in to back up and sync across devices.">
        {!configured ? <div className="muted">Add your Firebase configuration below to enable accounts and sync.</div>
          : loading ? <div className="muted">Connecting…</div>
          : user ? (
            <>
              <div className="row" style={{ marginBottom: 12 }}>
                {user.photoURL && <img src={user.photoURL} width={36} height={36} style={{ borderRadius: '50%' }} alt="" />}
                <div className="grow"><b>{user.displayName || user.email}</b><div className="muted" style={{ fontSize: 12.5 }}>{user.email}{!user.emailVerified && ' · email not verified'}</div></div>
                <button className="btn" onClick={() => run(() => mod!.signOut(), 'Signed out')}><LogOut size={14} /> Sign out</button>
              </div>
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="grow">Status: <b>{sync.status}</b>{sync.lastSyncAt && <> · last sync {new Date(sync.lastSyncAt).toLocaleString()}</>}{sync.lastError && <span style={{ color: 'var(--qth-danger)' }}> · {sync.lastError}</span>}</span>
                <button className="btn primary" disabled={sync.status === 'syncing'} onClick={() => run(syncNow, 'Synchronised')}><RefreshCw size={14} className={sync.status === 'syncing' ? 'spin' : ''} /> Sync now</button>
              </div>
              <div className="grid-2">
                <Switch checked={s.autoSync} onChange={(v) => setSettings({ autoSync: v })} label="Automatic sync (on change + every 2 min)" />
                <Switch checked={s.syncSettings} onChange={(v) => setSettings({ syncSettings: v })} label="Also sync settings & profile" />
              </div>
              <div className="field" style={{ marginTop: 10 }}><label className="label">When the same snippet changed on two devices</label>
                <select className="select" style={{ maxWidth: 360 }} value={s.conflictStrategy} onChange={(e) => setSettings({ conflictStrategy: e.target.value as any })}><option value="newest">Keep the most recent edit</option><option value="keep-both">Keep both (save a conflict copy)</option></select>
              </div>
              {sync.conflicts.length > 0 && (
                <details><summary className="muted">{sync.conflicts.length} recent conflict(s)</summary>
                  <table className="list"><tbody>{sync.conflicts.map((c, i) => <tr key={i}><td>{new Date(c.at).toLocaleString()}</td><td>{c.collection}</td><td>{c.name}</td><td>{c.resolution}</td></tr>)}</tbody></table>
                </details>
              )}
            </>
          ) : (
            <div style={{ maxWidth: 420 }}>
              <button className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 14 }} disabled={busy} onClick={() => run(() => mod!.signInGoogle(), 'Signed in with Google')}>
                <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
                Continue with Google
              </button>
              <div className="row" style={{ marginBottom: 10, gap: 4 }}>
                <button className={'tabbtn' + (mode === 'in' ? ' on' : '')} onClick={() => setMode('in')}>Sign in</button>
                <button className={'tabbtn' + (mode === 'up' ? ' on' : '')} onClick={() => setMode('up')}>Create account</button>
                <button className={'tabbtn' + (mode === 'reset' ? ' on' : '')} onClick={() => setMode('reset')}>Forgot password</button>
              </div>
              {mode === 'up' && <div className="field"><input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /></div>}
              <div className="field"><input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
              {mode !== 'reset' && <div className="field"><input className="input" type="password" placeholder="Password (min 6 characters)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></div>}
              <button className="btn primary" disabled={busy || !email || (mode !== 'reset' && pw.length < 6)} onClick={() => run(
                () => (mode === 'in' ? mod!.signInEmail(email, pw) : mode === 'up' ? mod!.signUpEmail(email, pw, name) : mod!.resetPassword(email)),
                mode === 'in' ? 'Signed in' : mode === 'up' ? 'Account created — check your inbox to verify your email' : 'Password reset email sent',
              )}><Mail size={14} /> {mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
            </div>
          )}
      </Section>
      <Section title="Cloud configuration" desc={<>Paste the Firebase web-app config (Firebase console → Project settings → Your apps). See <span className="mono">docs/FIREBASE_SETUP.md</span>. This is separate from any other extension's configuration.</>}>
        <div className="field"><label className="label">Firebase config (JSON or the firebaseConfig snippet)</label><textarea className="textarea mono" rows={8} value={cfgText} onChange={(e) => setCfgText(e.target.value)} placeholder={'{\n  "apiKey": "…",\n  "authDomain": "your-app.firebaseapp.com",\n  "projectId": "your-app",\n  "appId": "1:…:web:…"\n}'} /></div>
        <div className="field"><label className="label"><KeyRound size={12} /> Google OAuth client ID (for “Continue with Google”)</label><input className="input mono" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890-abc.apps.googleusercontent.com" />
          <div className="hint">Create an OAuth client of type “Web application” and add this authorized redirect URI: <span className="mono" style={{ userSelect: 'all' }}>{redirect}</span></div>
        </div>
        <div className="row"><button className="btn primary" onClick={saveCfg}><Cloud size={14} /> Save configuration</button>{configured && <button className="btn ghost danger" onClick={() => { setCfgText(''); saveCloudConfig({ firebase: null, googleClientId: '' }).then(reload); }}>Disconnect cloud</button>}</div>
      </Section>
    </>
  );
}

function Backup() {
  const { settings, toast, importBundle, reload } = useStore();
  const { mod, user } = useCloud();
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const exportAll = async () => {
    const [snippets, folders, tables, workflows, templates] = await Promise.all([listRecords('snippets'), listRecords('folders'), listRecords('tables'), listRecords('workflows'), listRecords('templates')]);
    download(`quicktext-hub-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: 'quicktext-hub', version: 1, exportedAt: Date.now(), snippets, folders, tables, workflows, templates, settings }, null, 2));
    toast('Backup downloaded');
  };
  const restore = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try { setPending(parseImport(await f.text())); } catch (e: any) { toast(e.message, 'error'); }
  };
  return (
    <>
      <Section title="Manual backup" desc="Everything — snippets, folders, Data Hub tables, workflows, templates and settings — in one JSON file.">
        <button className="btn primary" onClick={exportAll}><Download size={14} /> Download full backup</button>
      </Section>
      <Section title="Restore or merge" desc="Imported files are validated and rich content is sanitized before saving.">
        <button className="btn" onClick={restore}><Upload size={14} /> Choose backup file…</button>
        {pending && (
          <div className="card locked" style={{ marginTop: 12 }}>
            <p style={{ marginTop: 0 }}>{pending.snippets.length} snippets, {pending.folders.length} folders, {pending.tables?.length || 0} tables, {pending.workflows?.length || 0} workflows.</p>
            <div className="row">
              <button className="btn primary" onClick={async () => { const r = await importBundle(pending, 'merge'); toast(`Merged ${r.snippets} snippets`); setPending(null); }}>Merge (keep newest)</button>
              <button className="btn danger" onClick={async () => { await importBundle(pending, 'replace'); if (pending.settings) await (await import('../../../shared/settings')).saveSettings(pending.settings); if (mod && user) await mod.resetSyncCursors(); toast('Backup restored'); setPending(null); }}>Replace everything</button>
              <button className="btn ghost" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Section>
      <Section title="Sample data">
        <div className="row">
          <button className="btn" onClick={async () => { await seedIfEmpty(true); await reload(); toast('Sample snippets added'); }}>Re-add sample snippets & tables</button>
          <button className="btn danger" onClick={() => setConfirmReset(true)}>Delete all local data…</button>
        </div>
      </Section>
      {confirmReset && <ConfirmModal title="Delete all local data?" danger confirmLabel="Delete everything" message="All snippets, folders, tables, workflows, templates and statistics on this device will be erased. Cloud data is not affected; sign out first if you don't want it to sync back." onConfirm={async () => { for (const s of ['snippets', 'folders', 'tables', 'workflows', 'templates', 'usage', 'meta']) await clearStore(s); await reload(); toast('Local data deleted'); }} onClose={() => setConfirmReset(false)} />}
    </>
  );
}

function Plan() {
  const { settings: s, setSettings, snippets, folders, tables, workflows } = useStore();
  const fmt = (n: number) => (n === Infinity ? 'Unlimited' : n.toLocaleString());
  return (
    <>
      <Section title="Plan" desc="Billing is not enabled yet. Plans and limits are fully configurable in src/shared/plans.ts; choose the plan that should apply locally.">
        <div className="plan-grid">
          {(Object.keys(PLANS) as PlanId[]).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className={'card plan' + (s.plan === id ? ' on' : '')} onClick={() => setSettings({ plan: id })}>
                <div className="row"><b className="grow" style={{ fontSize: 16 }}>{p.name}</b>{s.plan === id && <span className="badge primary">Active</span>}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{p.tagline}</div>
                <ul><li>{fmt(p.limits.snippets)} snippets</li><li>{fmt(p.limits.folders)} folders</li><li>{fmt(p.limits.tables)} data tables</li><li>{fmt(p.limits.libraryTemplates)} library templates</li>{p.limits.teamMembers > 0 && <li>{fmt(p.limits.teamMembers)} team members</li>}{p.features.map((f) => <li key={f}>{FEATURE_LABELS[f]}</li>)}</ul>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14 }}><Switch checked={s.enforcePlanLimits} onChange={(v) => setSettings({ enforcePlanLimits: v })} label="Enforce plan limits (turn off for development / unlimited personal use)" /></div>
      </Section>
      <Section title="Current usage">
        <div className="stat-cards">
          <div className="card stat"><div className="v">{snippets.length}</div><div className="l">of {fmt(PLANS[s.plan].limits.snippets)} snippets</div></div>
          <div className="card stat"><div className="v">{folders.length}</div><div className="l">of {fmt(PLANS[s.plan].limits.folders)} folders</div></div>
          <div className="card stat"><div className="v">{tables.length}</div><div className="l">of {fmt(PLANS[s.plan].limits.tables)} tables</div></div>
          <div className="card stat"><div className="v">{workflows.length}</div><div className="l">of {fmt(PLANS[s.plan].limits.workflows)} workflows</div></div>
        </div>
      </Section>
    </>
  );
}

const EXAMPLES: [string, string][] = [
  ['Text field', 'Dear {{name}},'],
  ['Field options', '{{text: customer; label=Customer name; required; default=Sir/Madam}}'],
  ['Dropdown', '{{select: plan; options=Basic,Pro,Enterprise; default=Pro}}'],
  ['Checkbox output', '{{checkbox: urgent; label=Urgent?; value=⚠ URGENT}}'],
  ['Date with default', '{{date: due; default=+7d; format=dddd, D MMM YYYY}}'],
  ['Currency', '{{currency: amount; currency=INR; min=0}}'],
  ['Current date', '{{today; format=DD/MM/YYYY}}  {{today; shift=+1M}}  {{now; format=HH:mm}}'],
  ['Formula', '{{= qty * price * 1.18; format=currency}}'],
  ['Variable', '{{set: total = qty * price}}Total: {{= total; format=currency}}'],
  ['If / else', '{{if: amount > 1000}}Large order{{elseif: amount > 100}}Medium{{else}}Small{{endif}}'],
  ['Optional section', '{{section: ps; label=Add P.S.?}}\nP.S. {{text: note}}{{endsection}}'],
  ['Repeating section', '{{repeat: items; label=Item}}- {{text: item}} x {{number: qty}}\n{{endrepeat}}Total qty: {{= sum(items.qty)}}'],
  ['Table', '{{table: items; columns=Item:item|Qty:qty; total=Qty}}'],
  ['Data Hub', '{{pick: c; table=customers; display=name}} — {{c.email}}'],
  ['Link', '{{link: ="https://pay.example.com/" & invoice; text=Pay now}}'],
  ['Text transform', '{{upper: name}}  {{replace: phone; find=-; with= }}  {{= title(city)}}'],
  ['Validation', '{{validate: amount > 0; message=Amount must be positive}}'],
  ['Profile & page', '{{me.signature}}  {{page.host}}'],
  ['Include snippet', '{{snippet: /sig}}'],
  ['Cursor', 'Hi {{cursor}}, …'],
  ['Literal braces', '\\{{ not a command }}'],
];

function Syntax() {
  const groups: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(FUNCTIONS)) (groups[v.group] ||= []).push(k);
  return (
    <>
      <Section title="Template syntax" desc="Commands live inside {{ … }}. Options follow a ; as key=value or a flag. Option values that begin with = are formulas. Full guide: docs/TEMPLATE_SYNTAX.md">
        <table className="list"><tbody>{EXAMPLES.map(([l, e]) => <tr key={l}><td style={{ width: 170 }}><b>{l}</b></td><td className="mono" style={{ whiteSpace: 'pre-wrap' }}>{e}</td></tr>)}</tbody></table>
      </Section>
      <Section title="Field options" desc="Available on form fields">
        <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.8 }}>label= · default= · placeholder= · required · hidden · format= · min= · max= · step= · minlength= · maxlength= · pattern=email|phone|url|digits|&lt;regex&gt; · message= · rows= · options=a,b,c (or a|b|c) · multiple · value= / off= (checkbox, toggle) · currency= · table= / display= (pick) · hint=</div>
      </Section>
      <Section title="Formats" desc="format=…">
        <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.8 }}>currency · currency:EUR · number · number:2 · integer · percent · percent:1 · upper · lower · title · date:DD/MM/YYYY · time:HH:mm · any date pattern (YYYY YY MMMM MMM MM M Do DD D dddd ddd HH H hh h mm ss A a [literal])</div>
      </Section>
      <Section title="Operators" desc="Precedence high → low">
        <div className="mono" style={{ fontSize: 12.5 }}>( ) · ^ · * / % · + - · &amp; (join text) · = != &lt; &lt;= &gt; &gt;= · not · and · or · cond ? a : b — dates: date + 3 (days), date2 - date1 (days) — lists: items.qty * items.price works item by item</div>
      </Section>
      {Object.entries(groups).map(([g, fns]) => (
        <Section key={g} title={`${g} functions`}>
          <table className="list"><tbody>{fns.map((f) => <tr key={f}><td className="mono" style={{ width: 320 }}>{FUNCTIONS[f].sig}</td><td className="muted">{FUNCTIONS[f].doc}</td></tr>)}</tbody></table>
        </Section>
      ))}
    </>
  );
}

function Privacy() {
  return (
    <Section title="Privacy & security">
      <ul style={{ lineHeight: 1.8, marginTop: 0 }}>
        <li>All data is stored locally in this browser (IndexedDB database <span className="mono">quicktext-hub-db</span>, settings under <span className="mono">qth.*</span>). Nothing leaves your device unless you configure and sign in to cloud sync.</li>
        <li>The page script only reads the few characters right before your cursor in the field you are typing in, to detect shortcuts. It never reads other page content, and no browsing history is collected.</li>
        <li>Snippet content stays inside the extension; web pages only receive the final inserted text. Fill-in forms and confirmations open in an isolated extension frame that pages cannot read or click.</li>
        <li>Expansion never runs in password fields. You can disable QuickText Hub per site.</li>
        <li>Imported files and share codes are validated, size-limited and rich HTML is sanitized (scripts, event handlers and javascript: links are removed).</li>
        <li>Autopilot only runs when you start it, shows every step, can be stopped, and always asks before submitting forms, sending, purchasing, deleting or typing into password/payment fields.</li>
        <li>Cloud data is isolated per user by Firestore security rules (<span className="mono">firebase/firestore.rules</span>); shared items are readable only via their link or by the listed accounts.</li>
        <li>Permissions: storage, contextMenus, identity (Google sign-in only) and access to pages for text expansion. No tabs, history, cookies or webRequest permissions.</li>
      </ul>
    </Section>
  );
}

export function SettingsView() {
  const [, qs, go] = useRoute();
  const tab = qs.get('tab') || 'general';
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head"><h2>Settings</h2><span className="muted">v{__QTH_VERSION__}</span></div>
      <div className="row wrap" style={{ gap: 4, marginBottom: 16 }}>
        {TABS.map(([id, l]) => <button key={id} className={'tabbtn' + (tab === id ? ' on' : '')} onClick={() => go('/settings?tab=' + id)}>{l}</button>)}
      </div>
      {tab === 'general' && <General />}
      {tab === 'expansion' && <Expansion />}
      {tab === 'profile' && <Profile />}
      {tab === 'format' && <Formats />}
      {tab === 'cloud' && <CloudTab />}
      {tab === 'backup' && <Backup />}
      {tab === 'plan' && <Plan />}
      {tab === 'syntax' && <Syntax />}
      {tab === 'privacy' && <Privacy />}
    </div>
  );
}
