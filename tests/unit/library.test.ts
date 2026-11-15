import { describe, it, expect } from 'vitest';
import { LIBRARY, LIBRARY_CATEGORIES } from '@/library/templates';
import { render } from '@/engine';
import { sampleData } from '@/library/seed';

const data = Object.fromEntries(sampleData().tables.map((t) => [t.key, { columns: t.columns.map((c) => c.key), rows: t.rows.map((r) => ({ __id: r.id, ...r.values })) }]));
const profile = { name: 'Sam Lee', email: 'sam@example.com', phone: '+1 555 0100', company: 'Acme', title: 'Manager', website: 'https://acme.test', signature: 'Sam Lee\nAcme' };

// Fill every visible field with a plausible value and re-render until stable.
function autofill(t: (typeof LIBRARY)[number]) {
  let values: Record<string, any> = {};
  let out = render(t.content, t.contentType, { values, profile, data });
  for (let pass = 0; pass < 4; pass++) {
    const next: Record<string, any> = { ...values };
    const fill = (f: any) => {
      if (f.type === 'number' || f.type === 'currency') return f.min !== undefined ? Math.max(f.min, 2) : 10 + f.name.length;
      if (f.type === 'checkbox' || f.type === 'toggle' || f.type === 'section') return true;
      if (f.type === 'date') return '2025-03-10';
      if (f.type === 'time') return '10:30';
      if (f.type === 'datetime') return '2025-03-10T10:30';
      if (f.type === 'select') return f.multiple ? [f.options[0]] : f.options[0];
      if (f.type === 'pick') return f.options[0].split('\u0000')[0];
      if (f.pattern === 'email') return 'a@b.co';
      if (f.pattern === 'url') return 'https://x.io';
      return 'Sample ' + f.name;
    };
    for (const item of out.form as any[]) {
      if (item.type === 'repeat') next[item.name] = item.rows.map((row: any[]) => Object.fromEntries(row.map((f) => [f.name, fill(f)])));
      else if (next[item.name] === undefined) next[item.name] = fill(item);
    }
    values = next;
    out = render(t.content, t.contentType, { values, profile, data });
  }
  return out;
}

describe('built-in template library', () => {
  it('has at least 25 templates in known categories with unique ids/shortcuts', () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(25);
    expect(new Set(LIBRARY.map((t) => t.id)).size).toBe(LIBRARY.length);
    expect(new Set(LIBRARY.map((t) => t.shortcut)).size).toBe(LIBRARY.length);
    for (const t of LIBRARY) expect(LIBRARY_CATEGORIES).toContain(t.category);
  });
  for (const t of LIBRARY) {
    it(`${t.shortcut} renders without errors once filled`, () => {
      const out = autofill(t);
      expect(out.errors).toEqual([]);
      expect(out.validation).toEqual([]);
      expect(out.text.length).toBeGreaterThan(5);
      expect(out.text).not.toMatch(/\{\{|\}\}/);
    });
  }
  it('trade update computes risk/reward', () => {
    const t = LIBRARY.find((x) => x.shortcut === '/trade')!;
    const out = render(t.content, 'text', { values: { side: 'BUY', symbol: 'NIFTY', entry: 100, sl: 95, target: 115 } });
    expect(out.text).toContain('Risk/Reward: 1 : 3');
  });
});
