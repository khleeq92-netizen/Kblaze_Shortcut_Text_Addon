// Execution history + local audit log (IndexedDB). Both are append-mostly and
// pruned to configurable limits. Sensitive values are never written here.
import { getAll, putOne, putMany, hardDelete, notifyChanged, getOne } from './db';
import { uid } from './ids';
import type { Execution, AuditEntry } from './types';
import { toCSV } from './validate';
import { writeXlsx } from '../data/xlsx';

export const AUDIT_LIMIT = 5000;

export async function addExecution(e: Omit<Execution, 'id'> & { id?: string }, limit = 500): Promise<Execution> {
  const rec: Execution = { ...e, id: e.id || uid('exe') } as Execution;
  await putOne('executions', rec);
  await prune('executions', 'startedAt', limit);
  await notifyChanged(['executions']);
  return rec;
}
export async function updateExecution(id: string, patch: Partial<Execution>) {
  const cur = await getOne<Execution>('executions', id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  await putOne('executions', next);
  await notifyChanged(['executions']);
  return next;
}
export async function listExecutions(): Promise<Execution[]> {
  return (await getAll<Execution>('executions')).sort((a, b) => b.startedAt - a.startedAt);
}
export async function clearExecutions() {
  const all = await getAll<Execution>('executions');
  await hardDelete('executions', all.map((x) => x.id));
  await notifyChanged(['executions']);
}

async function prune(store: string, field: string, limit: number) {
  const all = await getAll<any>(store);
  if (all.length <= limit) return;
  all.sort((a, b) => a[field] - b[field]);
  await hardDelete(store, all.slice(0, all.length - limit).map((x) => x.id));
}

let auditActor = 'local user';
export function setAuditActor(a: string) { auditActor = a || 'local user'; }

export async function audit(action: string, resource: string, p: { resourceId?: string; name?: string; details?: string; workspaceId?: string; orgId?: string | null; actor?: string } = {}): Promise<AuditEntry> {
  const e: AuditEntry = { id: uid('aud'), at: Date.now(), actor: p.actor || auditActor, action, resource, resourceId: p.resourceId, name: p.name, details: p.details?.slice(0, 2000), workspaceId: p.workspaceId, orgId: p.orgId ?? null };
  try {
    await putOne('audit', e);
    await prune('audit', 'at', AUDIT_LIMIT);
    await notifyChanged(['audit']);
  } catch { /* audit is best-effort locally */ }
  return e;
}
export async function listAudit(): Promise<AuditEntry[]> {
  return (await getAll<AuditEntry>('audit')).sort((a, b) => b.at - a.at);
}
export async function importAudit(entries: AuditEntry[]) { await putMany('audit', entries); }

// ------------------------------------------------------------------ reports
export function executionRows(list: Execution[]): (string | number)[][] {
  return [
    ['Started', 'Finished', 'Type', 'Name', 'Status', 'Record', 'Website', 'Filled', 'Problems', 'Skipped', 'Duration (s)', 'Error'],
    ...list.map((e) => [
      new Date(e.startedAt).toISOString().replace('T', ' ').slice(0, 19),
      e.endedAt ? new Date(e.endedAt).toISOString().replace('T', ' ').slice(0, 19) : '',
      e.kind, e.name, e.status, e.recordLabel || '', e.host || '', e.filled ?? '', e.failed ?? '', e.skipped ?? '',
      e.endedAt ? Math.round((e.endedAt - e.startedAt) / 100) / 10 : '', e.error || '',
    ]),
  ];
}
export function executionsCSV(list: Execution[]) { return toCSV(executionRows(list) as any); }
export function executionsXLSX(list: Execution[]) {
  const steps: (string | number)[][] = [['Execution', 'Step', 'Label', 'Status', 'ms', 'Error']];
  for (const e of list) for (const s of e.steps || []) steps.push([e.id, s.i + 1, s.label, s.status, s.ms ?? '', s.error || '']);
  return writeXlsx([{ name: 'Executions', rows: executionRows(list) }, { name: 'Steps', rows: steps }]);
}
