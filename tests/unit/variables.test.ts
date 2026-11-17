import { describe, it, expect } from 'vitest';
import { resolveVariables, randomValue, validateVariableName, visibleVariables, rowToRecord, activeRecord } from '@/automation/variables';
import type { Variable, DataTable } from '@/shared/types';
import { collegePreset, tradingPreset, generalPreset } from '@/library/workspaces';

const fo = { locale: 'en-IN', currency: 'INR', dateFormat: 'DD/MM/YYYY', timeFormat: 'HH:mm' };
const V = (name: string, kind: Variable['kind'], value: string, extra: Partial<Variable> = {}): Variable => ({ id: 'v_' + name, name, kind, value, createdAt: 0, updatedAt: 0, ...extra });
const now = new Date(2025, 6, 15, 10, 30); // 15 Jul 2025

describe('variables', () => {
  it('resolves every kind, in dependency order', () => {
    const t: DataTable = { id: 't', name: 'S', key: 's', columns: [{ id: 'c', name: 'Name', key: 'student_name', type: 'text' }], rows: [{ id: 'r1', values: { student_name: 'Asha' } }, { id: 'r2', values: { student_name: 'Ravi' } }], currentRowId: 'r2', createdAt: 0, updatedAt: 0 };
    const r = resolveVariables([
      V('greeting', 'formula', 'concat("Hello ", upper(who))'),
      V('who', 'static', 'world'),
      V('due', 'date', 'today+7d', { format: 'DD MMM YYYY' }),
      V('code', 'random', 'digits:6'),
      V('pick', 'dataset', '', { datasetId: 't', column: 'student_name' }),
      V('size', 'conditional', 'small', { branches: [{ when: 'len(who) > 3', then: 'big' }] }),
      V('opts', 'list', '', { options: ['a', 'b'] }),
      V('pw', 'secret', 'vault.portal'),
      V('pw2', 'secret', 'vault.missing'),
    ], { fo, now, datasets: [t], vault: { portal: 's3cret' } });
    expect(r.values.greeting).toBe('Hello WORLD');
    expect(r.values.due).toBe('22 Jul 2025');
    expect(String(r.values.code)).toMatch(/^\d{6}$/);
    expect(r.values.pick).toBe('Ravi');
    expect(r.values.size).toBe('big');
    expect(r.values.opts).toBe('a, b');
    expect(r.values.pw).toBe('s3cret');
    expect(r.errors.pw2).toMatch(/not found/);
  });
  it('detects cycles and reports formula errors', () => {
    const r = resolveVariables([V('a', 'formula', 'b + 1'), V('b', 'formula', 'a + 1'), V('c', 'formula', 'nosuchfn(1)')], { fo, now });
    expect(r.errors.a).toMatch(/Circular/);
    expect(r.errors.c).toBeTruthy();
  });
  it('secret variables need an unlocked vault', () => {
    expect(resolveVariables([V('pw', 'secret', 'portal')], { fo, now, vault: null }).errors.pw).toMatch(/locked/);
  });
  it('scope precedence: profile > workspace > global; other workspaces hidden', () => {
    const vars = [V('x', 'static', 'global'), V('x', 'static', 'ws', { id: 'v2', workspaceId: 'w1' }), V('x', 'static', 'prof', { id: 'v3', workspaceId: 'w1', scopeRef: 'p1' }), V('y', 'static', 'other', { workspaceId: 'w2' })];
    expect(resolveVariables(vars, { fo, workspaceId: 'w1' }).values.x).toBe('ws');
    expect(resolveVariables(vars, { fo, workspaceId: 'w1', scopeRef: 'p1' }).values.x).toBe('prof');
    expect(resolveVariables(vars, { fo, workspaceId: 'w3' }).values.x).toBe('global');
    expect('y' in resolveVariables(vars, { fo, workspaceId: 'w1' }).values).toBe(false);
    expect(visibleVariables(vars, 'w2').map((v) => v.value).sort()).toEqual(['global', 'other']);
  });
  it('dataset record columns are exposed directly and as row.*', () => {
    const r = resolveVariables([V('n', 'formula', 'upper(row.student_name)')], { fo, record: { __id: 'r', student_name: 'Asha' } });
    expect(r.values.student_name).toBe('Asha');
    expect(r.values.n).toBe('ASHA');
  });
  it('random specs and names', () => {
    let i = 0;
    const seq = () => [0.1, 0.9, 0.5, 0.3][i++ % 4];
    expect(randomValue('int:10-20', [], () => 0.999)).toBe('20');
    expect(randomValue('float:0-1:3', [], () => 0.5)).toBe('0.500');
    expect(randomValue('letters:3', [], seq)).toMatch(/^[A-Z]{3}$/);
    expect(randomValue('uuid')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomValue('choice', ['x'])).toBe('x');
    expect(() => randomValue('bogus')).toThrow();
    expect(validateVariableName('1abc')).toBeTruthy();
    expect(validateVariableName('vault')).toMatch(/reserved/);
    expect(validateVariableName('student_name')).toBeNull();
  });
  it('workspace preset variables resolve: academic year, risk & lot size', () => {
    const col = collegePreset();
    const c = resolveVariables(col.variables, { fo, now, workspaceId: 'ws_college', datasets: col.tables });
    expect(c.errors).toEqual({});
    expect(c.values.academic_year).toBe('2025-26');
    expect(resolveVariables(col.variables, { fo, now: new Date(2026, 2, 1), workspaceId: 'ws_college' }).values.academic_year).toBe('2025-26');
    expect(c.values.college_name).toBe('Dr M.A. Aziz Jr College of Science, Phulambri');
    const g = resolveVariables(col.variables, { fo, now, workspaceId: 'ws_college', datasets: col.tables, record: { gender: 'Female', student_name: 'asha' } });
    expect(g.values.gender_code).toBe('F');
    expect(g.values.full_name_caps).toBe('ASHA');
    const tr = tradingPreset();
    const withLevels = tr.variables.map((v) => (v.name === 'trade_entry' ? { ...v, value: '2350.0' } : v.name === 'stop_loss' ? { ...v, value: '2345.0' } : v.name === 'take_profit' ? { ...v, value: '2365.0' } : v));
    const t = resolveVariables(withLevels, { fo, now, workspaceId: 'ws_trading' });
    expect(t.errors).toEqual({});
    expect(t.values.risk_amount).toBe(10);
    expect(t.values.sl_pips).toBe(50);
    expect(t.values.lot_size).toBe(0.02);
    expect(t.values.risk_reward).toBe(3);
    expect(t.values.session_name).toBe('Asian session');
    expect(resolveVariables(generalPreset().variables, { fo, now }).errors).toEqual({});
  });
  it('activeRecord / rowToRecord', () => {
    const t: DataTable = { id: 't', name: 'S', key: 's', columns: [{ id: 'c', name: 'A', key: 'a', type: 'text' }], rows: [{ id: 'r1', values: { a: 1 } }], createdAt: 0, updatedAt: 0 };
    expect(rowToRecord(t, activeRecord(t))).toEqual({ __id: 'r1', a: 1 });
    expect(activeRecord({ ...t, rows: [] })).toBeNull();
  });
});
