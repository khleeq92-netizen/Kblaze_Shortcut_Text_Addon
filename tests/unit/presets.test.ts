import { describe, it, expect } from 'vitest';
import { allPresets, collegePreset } from '@/library/workspaces';
import { workflowToMacro } from '@/library/seed';
import { planAutofill } from '@/automation/autofill';
import { validateMacro } from '@/automation/macro';
import { checkScript, hasErrors } from '@/automation/script/instrument';
import { render } from '@/engine';
import { resolveVariables } from '@/automation/variables';
import { LIBRARY } from '@/library/templates';

const fo = { locale: 'en-IN', currency: 'INR', dateFormat: 'DD/MM/YYYY', timeFormat: 'HH:mm' };

describe('workspace presets', () => {
  const p = allPresets();
  const parts = [p.college, p.trading, p.general];
  it('three workspaces with unique ids everywhere', () => {
    expect(p.workspaces.map((w) => w.kind)).toEqual(['college', 'trading', 'general']);
    expect(p.workspaces[0].description).toMatch(/Dr M\.A\. Aziz Jr College of Science, Phulambri/);
    expect(p.workspaces[1].description).toMatch(/Mr K Technical Levels/);
    for (const key of ['folders', 'snippets', 'variables', 'tables', 'profiles', 'macros', 'scripts'] as const) {
      const ids = parts.flatMap((x) => (x as any)[key].map((r: any) => r.id));
      expect(new Set(ids).size, key).toBe(ids.length);
    }
  });
  it('snippet shortcuts are unique and never a prefix of another (with the library)', () => {
    const sc = [...new Set([...parts.flatMap((x) => x.snippets.map((s) => s.shortcut)), ...LIBRARY.map((l) => l.shortcut), '/ty', '/date'])];
    const bad = sc.flatMap((a) => sc.filter((b) => a !== b && b.startsWith(a)).map((b) => `${a}→${b}`));
    expect(bad).toEqual([]);
    expect(sc).toContain('/welcome');
  });
  it('datasets ship as empty schemas — no fabricated student or member records', () => {
    for (const t of parts.flatMap((x) => x.tables)) expect(t.rows).toEqual([]);
    const students = p.college.tables.find((t) => t.key === 'students')!;
    expect(students.sensitiveColumns).toEqual(expect.arrayContaining(['aadhaar_no', 'mobile', 'student_dob']));
  });
  it('every starter profile rule references a column of its dataset or a variable', () => {
    const col = collegePreset();
    const names = new Set([...col.variables.map((v) => v.name), 'me']);
    for (const prof of [...col.profiles, ...p.trading.profiles, ...p.general.profiles]) {
      const ds = parts.flatMap((x) => x.tables).find((t) => t.id === prof.datasetId);
      const cols = new Set(ds?.columns.map((c) => c.key) || []);
      const vars = new Set([...parts.flatMap((x) => x.variables.map((v) => v.name)), 'me']);
      for (const r of prof.rules) for (const m of r.value.matchAll(/\{\{\s*([A-Za-z_]\w*)/g)) expect(cols.has(m[1]) || vars.has(m[1]) || names.has(m[1]), `${prof.name}: ${m[1]}`).toBe(true);
      // plan with an all-columns record: no rule errors
      const record = Object.fromEntries([...cols].map((c) => [c, 'x']));
      const values = { ...resolveVariables(parts.flatMap((x) => x.variables), { fo, record, workspaceId: prof.workspaceId }).values, ...record, me: { name: 'n', email: 'e', phone: 'p', company: 'c' } } as any;
      expect(planAutofill(prof, { values, fo, url: 'https://' + (prof.sites[0]?.value || 'x.com') + '/' }).filter((x) => x.error)).toEqual([]);
    }
  });
  it('preset macros and scripts are valid', () => {
    for (const m of parts.flatMap((x) => x.macros)) expect(validateMacro(m)).toEqual([]);
    for (const s of parts.flatMap((x) => x.scripts)) expect(hasErrors(checkScript(s.code)), s.name).toBe(false);
  });
  it('preset snippets render once their form fields are filled', () => {
    const vars = resolveVariables(parts.flatMap((x) => x.variables), { fo, workspaceId: 'ws_college', record: { student_name: 'Test Student' } }).values;
    for (const s of p.college.snippets.filter((x) => !x.source)) {
      const out = render(s.content, s.contentType, { globals: vars as any, values: { student: 'A', gr: '1', class: '11th Science', dob: '2008-01-01', purpose: 'x', reason: 'Transfer', to: 'x', subject: 'x', body: 'x', outward: '1', name: 'x', desig: 'Clerk', last: '2025-06-30' } });
      expect(out.errors, s.name).toEqual([]);
    }
  });
  it('legacy Autopilot workflows migrate to macros', () => {
    const m = workflowToMacro({ id: 'wf_x', name: 'Old', enabled: true, siteFilter: 'a.com', steps: [
      { id: '1', type: 'type', target: { kind: 'label', value: 'Name' }, value: 'x' }, { id: '2', type: 'tab' }, { id: '3', type: 'wait', ms: 200 },
      { id: '4', type: 'check', target: { kind: 'selector', value: '#c' }, checked: false }, { id: '5', type: 'click', target: { kind: 'focused', value: '' } },
    ], createdAt: 1, updatedAt: 1 });
    expect(m.id).toBe('mac_x');
    expect(m.steps.map((s) => s.type)).toEqual(['type', 'key', 'delay', 'uncheck', 'click']);
    expect(m.steps[0].target).toEqual({ by: 'label', value: 'Name' });
    expect(m.sites).toEqual([{ kind: 'domain', value: 'a.com' }]);
  });
});
