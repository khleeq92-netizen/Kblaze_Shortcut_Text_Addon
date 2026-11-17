// First-run setup: installs the three K-Flow workspaces with their folders,
// templates, variables, dataset schemas (empty — import your own data), starter
// autofill profiles, macros and scripts. Also migrates legacy Autopilot workflows
// into macros (one automation model).
import { listRecords, saveRecords, metaGet, metaSet, getAll } from '../shared/db';
import type { Snippet, Workflow, Macro, MacroStep, ElementTarget } from '../shared/types';
import { allPresets, DEFAULT_MACRO_SETTINGS, WS_GENERAL } from './workspaces';

export function workflowToMacro(w: Workflow): Macro {
  const tgt = (t?: Workflow['steps'][0]['target']): ElementTarget | undefined => (!t || t.kind === 'focused' ? undefined : { by: t.kind === 'label' ? 'label' : 'css', value: t.value });
  const steps: MacroStep[] = w.steps.map((s) => {
    const base = { id: s.id, note: s.note, target: tgt(s.target) } as MacroStep;
    switch (s.type) {
      case 'focus': return { ...base, type: 'focus' };
      case 'type': return { ...base, type: 'type', value: s.value, clear: s.clear !== false };
      case 'tab': return { ...base, type: 'key', value: 'Tab', target: undefined };
      case 'select': return { ...base, type: 'select', value: s.value };
      case 'check': return { ...base, type: s.checked === false ? 'uncheck' : 'check' };
      case 'click': return { ...base, type: 'click' };
      case 'key': return { ...base, type: 'key', value: s.value };
      case 'wait': return { ...base, type: 'delay', ms: s.ms };
      case 'waitFor': return { ...base, type: 'waitFor', ms: s.ms };
      case 'snippet': return { ...base, type: 'snippet', refId: s.snippetId };
      case 'confirm': return { ...base, type: 'confirm', value: s.value };
    }
    return { ...base, type: 'delay', ms: 0 };
  });
  return {
    id: 'mac_' + w.id.replace(/^wf_/, ''), name: w.name, description: w.description, enabled: w.enabled, workspaceId: w.workspaceId || WS_GENERAL,
    sites: w.siteFilter ? [{ kind: 'domain', value: w.siteFilter }] : [], steps, settings: { ...DEFAULT_MACRO_SETTINGS }, tags: ['migrated'],
    createdAt: w.createdAt, updatedAt: Date.now(),
  };
}

export async function migrateWorkflows() {
  if (await metaGet('migrated:workflows')) return 0;
  const wfs = await listRecords<Workflow>('workflows');
  const existing = new Set((await getAll<Macro>('macros')).map((m) => m.id));
  const macros = wfs.map(workflowToMacro).filter((m) => !existing.has(m.id));
  if (macros.length) await saveRecords('macros', macros);
  await metaSet('migrated:workflows', true);
  return macros.length;
}

export async function installPresets(opts: { only?: ('college' | 'trading' | 'general')[] } = {}) {
  const p = allPresets();
  const which = opts.only || ['college', 'trading', 'general'];
  const existingWs = new Set((await getAll<any>('workspaces')).filter((w) => !w.deleted).map((w) => w.id));
  await saveRecords('workspaces', p.workspaces.filter((w) => !existingWs.has(w.id) && which.includes(w.kind as any)), { snapshot: false });
  const existingShortcuts = new Set((await listRecords<Snippet>('snippets')).map((s) => s.shortcut));
  for (const k of which) {
    const d = p[k];
    const skip = async (store: any, list: any[]) => { const ids = new Set((await getAll<any>(store)).map((x) => x.id)); return list.filter((x) => !ids.has(x.id)); };
    await saveRecords('folders', await skip('folders', d.folders), { snapshot: false });
    const sn = (await skip('snippets', d.snippets)).filter((s: Snippet) => !existingShortcuts.has(s.shortcut));
    sn.forEach((s: Snippet) => existingShortcuts.add(s.shortcut));
    await saveRecords('snippets', sn, { snapshot: false });
    await saveRecords('variables', await skip('variables', d.variables), { snapshot: false });
    await saveRecords('tables', await skip('tables', d.tables), { snapshot: false });
    await saveRecords('autofill', await skip('autofill', d.profiles), { snapshot: false });
    await saveRecords('macros', await skip('macros', d.macros), { snapshot: false });
    await saveRecords('scripts', await skip('scripts', d.scripts), { snapshot: false });
  }
}

export async function seedIfEmpty(force = false) {
  if (!force && (await metaGet('seeded'))) { await migrateWorkflows(); return false; }
  const t = Date.now();
  await installPresets();
  const quick: Snippet[] = [
    { id: 'snp_quick_thanks', name: 'Quick thanks', shortcut: '/ty', content: 'Thank you so much! 🙏', contentType: 'text', folderId: 'fld_gen_root', workspaceId: WS_GENERAL, enabled: true, favorite: false, pinned: false, tags: ['quick'], trigger: 'default', createdAt: t, updatedAt: t },
    { id: 'snp_today', name: "Today's date", shortcut: '/date', content: '{{today; format=dddd, D MMMM YYYY}}', contentType: 'text', folderId: 'fld_gen_root', workspaceId: WS_GENERAL, enabled: true, favorite: false, pinned: false, tags: ['date'], trigger: 'default', createdAt: t, updatedAt: t },
  ];
  const have = new Set((await listRecords<Snippet>('snippets')).map((s) => s.shortcut));
  await saveRecords('snippets', quick.filter((q) => !have.has(q.shortcut)), { snapshot: false });
  await migrateWorkflows();
  await metaSet('seeded', true);
  return true;
}

/** Legacy export kept for the e2e/sample scripts. */
export function sampleData() {
  const p = allPresets();
  return { folders: [...p.college.folders, ...p.trading.folders, ...p.general.folders], snippets: [...p.college.snippets, ...p.trading.snippets, ...p.general.snippets], tables: [...p.college.tables, ...p.trading.tables, ...p.general.tables], workflows: [] as Workflow[] };
}
