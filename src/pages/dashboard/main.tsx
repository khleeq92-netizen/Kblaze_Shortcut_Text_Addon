import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../ui/theme.css';
import './dashboard.css';
import { StoreProvider, useStore, useRoute } from './store';
import { CloudProvider, useCloud } from './cloud';
import { Sidebar } from './views/Sidebar';
import { SnippetsView } from './views/SnippetsView';
import { TemplatesView } from './views/TemplatesView';
import { DataHubView } from './views/DataHubView';
import { MarketplaceView } from './views/MarketplaceView';
import { OverviewView } from './views/OverviewView';
import { AutofillView } from './views/AutofillView';
import { MacrosView } from './views/MacrosView';
import { ScriptsView } from './views/ScriptsView';
import { VariablesView } from './views/VariablesView';
import { VaultView } from './views/VaultView';
import { BuilderView } from './views/BuilderView';
import { HistoryView, AuditView } from './views/HistoryView';
import { OrgView } from './views/OrgView';
import { BackupView } from './views/BackupView';
import { WorkspacesView } from './views/WorkspacesView';
import { StatsView } from './views/StatsView';
import { SettingsView } from './views/SettingsView';
import { ImportView, WelcomeView } from './views/ImportView';
import { FolderDialog } from './views/FolderDialog';
import { Search, Plus, FolderPlus, Store as StoreIc, UserCircle2, Moon, Sun, FormInput, Clapperboard, FileCode2, Database as DatabaseIc, Braces, Zap, Wand2 } from 'lucide-react';

function Topbar() {
  const { settings, setSettings } = useStore();
  const { user } = useCloud();
  const [path, qs, go] = useRoute();
  const [folderOpen, setFolderOpen] = useState(false);
  const [create, setCreate] = useState(false);
  const q = path === '/search' ? qs.get('q') || '' : '';
  const dark = document.documentElement.dataset.theme === 'dark';
  return (
    <header className="topbar">
      <div className="search">
        <Search size={16} />
        <input
          className="input"
          placeholder="Search snippets…  ( / )"
          value={q}
          id="global-search"
          onChange={(e) => go('/search?q=' + encodeURIComponent(e.target.value))}
        />
      </div>
      <div className="grow" />
      <div className="kf-create">
        <button className="btn primary" onClick={() => setCreate(!create)}><Plus size={16} /> Create</button>
        {create && (
          <div className="kf-create-menu" onMouseLeave={() => setCreate(false)}>
            <button onClick={() => { setCreate(false); go('/autofill?new=1'); }}><FormInput size={15} /> Autofill profile</button>
            <button onClick={() => { setCreate(false); go('/macros'); }}><Clapperboard size={15} /> Macro / recording</button>
            <button onClick={() => { setCreate(false); go('/scripts'); }}><FileCode2 size={15} /> Script</button>
            <button onClick={() => { setCreate(false); go('/data'); }}><DatabaseIc size={15} /> Dataset import</button>
            <button onClick={() => { setCreate(false); go('/variables'); }}><Braces size={15} /> Variable</button>
            <button onClick={() => { setCreate(false); go('/new'); }}><Zap size={15} /> Snippet</button>
            <button onClick={() => { setCreate(false); setFolderOpen(true); }}><FolderPlus size={15} /> Snippet folder</button>
            <button onClick={() => { setCreate(false); go('/builder'); }}><Wand2 size={15} /> With AI builder</button>
          </div>
        )}
      </div>
      <button className="btn ghost" title="Template marketplace" onClick={() => go('/marketplace')}><StoreIc size={17} /></button>
      <button className="btn ghost" title="Toggle dark mode" onClick={() => setSettings({ theme: dark ? 'light' : 'dark' })}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
      <button className="btn ghost" title="Account settings" onClick={() => go('/settings?tab=cloud')}>
        {user?.photoURL ? <img src={user.photoURL} width={22} height={22} style={{ borderRadius: '50%' }} alt="" /> : <UserCircle2 size={19} />}
      </button>
      {folderOpen && <FolderDialog onClose={() => setFolderOpen(false)} />}
    </header>
  );
}

function Routes() {
  const [path] = useRoute();
  const seg = path.split('/').filter(Boolean);
  switch (seg[0]) {
    case 'templates': return <TemplatesView />;
    case 'data': return <DataHubView tableId={seg[1]} />;
    case 'marketplace': return <MarketplaceView />;
    case 'overview': return <OverviewView />;
    case 'autofill': return <AutofillView id={seg[1]} />;
    case 'macros': case 'autopilot': return <MacrosView id={seg[1]} />;
    case 'scripts': return <ScriptsView id={seg[1]} />;
    case 'variables': return <VariablesView />;
    case 'vault': return <VaultView />;
    case 'builder': return <BuilderView />;
    case 'history': return <HistoryView />;
    case 'audit': return <AuditView />;
    case 'org': case 'team': return <OrgView />;
    case 'backup': return <BackupView />;
    case 'workspaces': return <WorkspacesView />;
    case 'stats': return <StatsView />;
    case 'settings': return <SettingsView />;
    case 'import': return <ImportView />;
    case 'welcome': return <WelcomeView />;
    case 'snippets': case 'snippet': case 'pinned': case 'favorites': case 'recent': case 'folder': case 'search': case 'new': return <SnippetsView />;
    default: return <OverviewView />;
  }
}

function Toasts() {
  const { toasts } = useStore();
  return <div className="toasts">{toasts.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div>;
}

function App() {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !(e.target as HTMLElement).isContentEditable) { e.preventDefault(); document.getElementById('global-search')?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="app">
      <Sidebar />
      <Topbar />
      <main className="main"><Routes /></main>
      <Toasts />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <CloudProvider>
      <App />
    </CloudProvider>
  </StoreProvider>,
);
