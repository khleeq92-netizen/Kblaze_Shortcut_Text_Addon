// Builds the template-engine context (profile, Data Hub, snippet includes,
// formatting, plan features) from local storage. Used by background + pages.
import type { Snippet, DataTable, Settings } from './types';
import type { RenderContext } from '../engine/render';
import { hasFeature } from './plans';

export function buildRenderContext(opts: {
  settings: Settings;
  snippets: Snippet[];
  tables: DataTable[];
  values?: Record<string, any>;
  page?: { url: string; title: string; host: string };
}): RenderContext {
  const { settings: s } = opts;
  const byShortcut = new Map(opts.snippets.filter((x) => !x.deleted).map((x) => [x.shortcut, x]));
  const data: RenderContext['data'] = {};
  for (const t of opts.tables) {
    if (t.deleted) continue;
    data[t.key] = { label: t.name, columns: t.columns.map((c) => c.key), rows: t.rows.map((r) => ({ __id: r.id, ...r.values })) };
  }
  const enforce = s.enforcePlanLimits;
  return {
    values: opts.values || {},
    profile: { ...s.profile } as any,
    data: hasFeature(s.plan, 'dataHub', enforce) ? data : {},
    page: opts.page,
    resolveSnippet: (sc) => {
      const sn = byShortcut.get(sc);
      return sn ? { content: sn.content, contentType: sn.contentType } : null;
    },
    fo: { locale: s.locale, currency: s.currency, dateFormat: s.dateFormat, timeFormat: s.timeFormat },
    features: {
      forms: hasFeature(s.plan, 'dynamicForms', enforce),
      formulas: hasFeature(s.plan, 'formulas', enforce),
      conditionals: hasFeature(s.plan, 'conditionals', enforce),
    },
  };
}
