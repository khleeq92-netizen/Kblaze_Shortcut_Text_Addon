import React, { useEffect, useState } from 'react';
import { useRoute, useStore } from '../store';
import { ImportDialog } from './ImportDialog';
import { Section } from '../common';
import { Zap, Keyboard, MousePointerClick, Cloud } from 'lucide-react';

export function ImportView() {
  const [, qs, go] = useRoute();
  const share = qs.get('share');
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(true), [share]);
  return (
    <div className="page">
      <div className="page-head"><h2>Import shared snippets</h2></div>
      {open && <ImportDialog initialCode={share ? 'KFS-' + share : ''} onClose={() => { setOpen(false); go('/snippets'); }} />}
    </div>
  );
}

export function WelcomeView() {
  const { settings, setSettings, snippets } = useStore();
  const [, , go] = useRoute();
  const [name, setName] = useState(settings.profile.name);
  const [sig, setSig] = useState(settings.profile.signature);
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><h2>Welcome to K-Flow Automation ⚡</h2></div>
      <p className="muted" style={{ fontSize: 15 }}>Type short shortcuts anywhere on the web and K-Flow Automation replaces them with full text, smart forms and calculations. Everything works locally — an account is optional.</p>
      <div className="grid-3" style={{ margin: '18px 0' }}>
        <div className="card section"><Keyboard /><h3>Type a shortcut</h3><div className="muted">Try <span className="kbd">/sig</span>, <span className="kbd">/payment</span> or <span className="kbd">/trade</span> in any text box.</div></div>
        <div className="card section"><MousePointerClick /><h3>Or pick from a list</h3><div className="muted">Press <span className="kbd">{settings.assistantHotkey}</span> or right-click → “Insert K-Flow snippet…”.</div></div>
        <div className="card section"><Zap /><h3>Automate forms</h3><div className="muted">Autopilot fills repetitive web forms, always asking before submitting.</div></div>
      </div>
      <Section title="Personalise your snippets" desc="Used by {{me.name}} and {{me.signature}} (e.g. the /sig snippet). You can change this later in Settings.">
        <div className="field"><label className="label">Your name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label className="label">Email signature</label><textarea className="textarea" rows={4} value={sig} onChange={(e) => setSig(e.target.value)} placeholder={'Best regards,\nYour Name\nCompany'} /></div>
        <div className="row">
          <button className="btn primary" onClick={async () => { await setSettings({ profile: { ...settings.profile, name, signature: sig }, onboarded: true }); go('/snippets'); }}>Save & start</button>
          <button className="btn ghost" onClick={() => go('/snippets')}>Skip</button>
          <span className="muted grow" style={{ textAlign: 'right' }}>{snippets.length} sample snippets are ready. <a href="#/settings?tab=cloud"><Cloud size={13} /> Set up sync</a></span>
        </div>
      </Section>
    </div>
  );
}
