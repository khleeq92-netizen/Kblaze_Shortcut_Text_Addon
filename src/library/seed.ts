// First-run sample data: a few folders, the snippets from the product brief,
// Data Hub sample tables and a demo Autopilot workflow.
import { listRecords, saveRecords, metaGet, metaSet } from '../shared/db';
import type { Snippet, Folder, DataTable, Workflow } from '../shared/types';
import { LIBRARY } from './templates';

const now = () => Date.now();

export function sampleData() {
  const t = now();
  const folders: Folder[] = [
    { id: 'fld_personal', name: 'Personal', parentId: null, order: 0, createdAt: t, updatedAt: t, color: '#6366f1' },
    { id: 'fld_work', name: 'Work', parentId: null, order: 1, createdAt: t, updatedAt: t, color: '#0ea5e9' },
    { id: 'fld_billing', name: 'Billing', parentId: 'fld_work', order: 0, createdAt: t, updatedAt: t, color: '#f59e0b' },
    { id: 'fld_trading', name: 'Trading', parentId: null, order: 2, createdAt: t, updatedAt: t, color: '#10b981' },
  ];
  const fromLib = (libId: string, folderId: string | null, extra: Partial<Snippet> = {}): Snippet => {
    const l = LIBRARY.find((x) => x.id === libId)!;
    return {
      id: 'snp_' + libId.replace(/^lib-/, '').replace(/-/g, '_'), name: l.name, shortcut: l.shortcut, content: l.content, contentType: l.contentType,
      folderId, enabled: true, favorite: false, pinned: false, description: l.description, tags: [], trigger: 'default',
      source: { kind: 'template', ref: libId }, createdAt: t, updatedAt: t, ...extra,
    };
  };
  const snippets: Snippet[] = [
    fromLib('lib-email-signature', 'fld_personal', { pinned: true, favorite: true }),
    fromLib('lib-pay-reminder', 'fld_billing', { favorite: true }),
    fromLib('lib-trade-update', 'fld_trading', { pinned: true }),
    fromLib('lib-trade-recap', 'fld_trading'),
    fromLib('lib-meeting-notes', 'fld_work'),
    fromLib('lib-wa-greeting', 'fld_personal'),
    fromLib('lib-datahub-customer', 'fld_work'),
    {
      id: 'snp_quick_thanks', name: 'Quick thanks', shortcut: '/ty', content: 'Thank you so much! 🙏', contentType: 'text', folderId: 'fld_personal',
      enabled: true, favorite: false, pinned: false, tags: ['quick'], trigger: 'default', createdAt: t, updatedAt: t,
    },
    {
      id: 'snp_today', name: "Today's date", shortcut: '/date', content: '{{today; format=dddd, D MMMM YYYY}}', contentType: 'text', folderId: null,
      enabled: true, favorite: false, pinned: false, tags: ['date'], trigger: 'default', createdAt: t, updatedAt: t,
    },
  ];
  const tables: DataTable[] = [
    {
      id: 'tbl_customers', name: 'Customers', key: 'customers', description: 'Sample customer list used by /cust',
      columns: [
        { id: 'c1', name: 'Name', key: 'name', type: 'text' },
        { id: 'c2', name: 'Email', key: 'email', type: 'email' },
        { id: 'c3', name: 'Phone', key: 'phone', type: 'phone' },
        { id: 'c4', name: 'Plan', key: 'plan', type: 'category', options: ['Basic', 'Pro', 'Enterprise'] },
      ],
      rows: [
        { id: 'r1', values: { name: 'Aisha Khan', email: 'aisha@example.com', phone: '+91 98765 43210', plan: 'Pro' } },
        { id: 'r2', values: { name: 'Daniel Brooks', email: 'daniel@example.com', phone: '+1 415 555 0134', plan: 'Basic' } },
        { id: 'r3', values: { name: 'Mei Lin', email: 'mei@example.com', phone: '+65 8123 4567', plan: 'Enterprise' } },
      ],
      createdAt: t, updatedAt: t,
    },
    {
      id: 'tbl_students', name: 'Students', key: 'students', description: 'Sample student roster',
      columns: [
        { id: 's1', name: 'Name', key: 'name', type: 'text' },
        { id: 's2', name: 'Roll no', key: 'roll', type: 'text' },
        { id: 's3', name: 'Class', key: 'class', type: 'category', options: ['10-A', '10-B', '11-A'] },
        { id: 's4', name: 'Guardian phone', key: 'guardian_phone', type: 'phone' },
      ],
      rows: [
        { id: 'st1', values: { name: 'Rohan Mehta', roll: '1012', class: '10-A', guardian_phone: '+91 90000 11111' } },
        { id: 'st2', values: { name: 'Sara Ali', roll: '1027', class: '10-B', guardian_phone: '+91 90000 22222' } },
      ],
      createdAt: t, updatedAt: t,
    },
  ];
  const workflows: Workflow[] = [
    {
      id: 'wf_contact_form', name: 'Fill a contact form (demo)', description: 'Fills Name, Email and Message fields by their labels, then asks before submitting.', enabled: true,
      steps: [
        { id: 'w1', type: 'type', target: { kind: 'label', value: 'Name' }, value: '{{me.name}}', clear: true },
        { id: 'w2', type: 'type', target: { kind: 'label', value: 'Email' }, value: '{{me.email}}', clear: true },
        { id: 'w3', type: 'type', target: { kind: 'label', value: 'Message' }, value: 'Hello, I would like more information. Thanks!', clear: true },
        { id: 'w4', type: 'click', target: { kind: 'selector', value: 'button[type=submit], input[type=submit]' }, requireConfirm: true, note: 'Submit the form' },
      ],
      createdAt: t, updatedAt: t,
    },
  ];
  return { folders, snippets, tables, workflows };
}

export async function seedIfEmpty(force = false) {
  if (!force && (await metaGet('seeded'))) return false;
  const existing = await listRecords<Snippet>('snippets', true);
  if (existing.length && !force) { await metaSet('seeded', true); return false; }
  const d = sampleData();
  await saveRecords('folders', d.folders);
  await saveRecords('snippets', d.snippets);
  await saveRecords('tables', d.tables);
  await saveRecords('workflows', d.workflows);
  await metaSet('seeded', true);
  return true;
}
