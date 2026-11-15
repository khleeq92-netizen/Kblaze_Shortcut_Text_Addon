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
import { AutopilotView } from './views/AutopilotView';
import { StatsView } from './views/StatsView';
import { SettingsView } from './views/SettingsView';
import { TeamView } from './views/TeamView';
import { ImportView, WelcomeView } from './views/ImportView';
import { FolderDialog } from './views/FolderDialog';
import { Search, Plus, FolderPlus, Store as StoreIc, BarChart3, UserCircle2, Moon, Sun } from 'lucide-react';

function Topbar() {
  const { settings, setSettings } = useStore();
  const { user } = useCloud();
  const [path, qs, go] = useRoute();
  const [folderOpen, setFolderOpen] = useState(false);
  const q = path === '/search' ? qs.get('q') || '' : '';
  const dark = document.documentElement.dataset.theme === 'dark';
  return (
    <header className="topbar">
      <div className="search">
        <Search size={16} />
        <input
          className="input"
          placeholder="Search snippets by name, shortcut or content…  ( / )"
          value={q}
          id="global-search"
          onChange={(e) => go('/search?q=' + encodeURIComponent(e.target.value))}
        />
      </div>
      <div className="grow" />
      <button className="btn primary" onClick={() => go('/new')}><Plus size={16} /> New snippet</button>
      <button className="btn" onClick={() => setFolderOpen(true)}><FolderPlus size={16} /> New folder</button>
      <button className="btn ghost" title="Template marketplace" onClick={() => go('/marketplace')}><StoreIc size={17} /></button>
      <button className="btn ghost" title="Usage statistics" onClick={() => go('/stats')}><BarChart3 size={17} /></button>
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
    case 'autopilot': return <AutopilotView workflowId={seg[1]} />;
    case 'stats': return <StatsView />;
    case 'settings': return <SettingsView />;
    case 'team': return <TeamView />;
    case 'import': return <ImportView />;
    case 'welcome': return <WelcomeView />;
    default: return <SnippetsView />;
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
