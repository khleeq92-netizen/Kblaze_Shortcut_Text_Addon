// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { freshDB } from './helpers';
import { addExecution, updateExecution, listExecutions, audit, listAudit, executionsCSV, executionsXLSX } from '@/shared/history';
import { saveRecords, listVersions } from '@/shared/db';
import { readXlsx } from '@/data/xlsx';

beforeEach(() => { freshDB(); });

describe('history, audit & versions', () => {
  it('executions are pruned to the limit and exported as CSV/XLSX', async () => {
    for (let i = 0; i < 6; i++) await addExecution({ kind: 'autofill', refId: 'p', name: `Run ${i}`, startedAt: 1000 + i, status: 'success', steps: [{ i: 0, label: 'Name', status: 'done' }], host: 'x.in', filled: 1 }, 4);
    const l = await listExecutions();
    expect(l.map((e) => e.name)).toEqual(['Run 5', 'Run 4', 'Run 3', 'Run 2']);
    await updateExecution(l[0].id, { status: 'failed', error: '=cmd()' });
    const csv = executionsCSV(await listExecutions());
    expect(csv.split('\r\n')[0]).toMatch(/^Started,Finished,Type,Name,Status/);
    expect(csv).toContain("'=cmd()"); // spreadsheet formula injection neutralised
    const sheets = readXlsx(executionsXLSX(await listExecutions()));
    expect(sheets.map((s) => s.name)).toEqual(['Executions', 'Steps']);
    expect(sheets[1].rows.length).toBe(5);
  });
  it('audit entries are recorded newest first', async () => {
    await audit('create', 'macros', { name: 'A' });
    await new Promise((r) => setTimeout(r, 2));
    await audit('delete', 'macros', { name: 'A' });
    expect((await listAudit()).map((a) => a.action)).toEqual(['delete', 'create']);
  });
  it('every save keeps a version (bounded)', async () => {
    const base = { id: 'p1', name: 'Profile', rules: [], sites: [], enabled: true, runMode: 'manual', tags: [], createdAt: 1, updatedAt: 1 } as any;
    let cur = (await saveRecords('autofill', [base]))[0];
    for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 1)); cur = (await saveRecords('autofill', [{ ...cur, name: 'v' + i }]))[0]; }
    const v = await listVersions('p1');
    expect(v.length).toBe(25);
    expect(v[0].snapshot.name).toBe('v29');
    expect(cur.version).toBe(31);
  });
});
