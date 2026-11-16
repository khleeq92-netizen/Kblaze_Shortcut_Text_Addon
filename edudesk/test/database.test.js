'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeApp, cleanup, category } = require('./helpers');
const { Database } = require('../src/core/db');
const { formatNumber } = require('../src/core/numbering');

test('database is created, seeded, persisted and passes integrity check', async () => {
  const app = await makeApp('db');
  try {
    assert.ok(fs.existsSync(app.dbPath));
    assert.equal(app.db.integrityCheck().ok, true);
    assert.equal(app.services.categories.list().length, 6);
    assert.ok(category(app, 'UDISE').subcategories.some((s) => s.name.startsWith('S02')));
    // persistence: reopen file and read the same data
    const db2 = await Database.open(app.dbPath);
    assert.equal(db2.get('SELECT COUNT(*) AS n FROM categories').n, 6);
    db2.raw.close();
  } finally { cleanup(app); }
});

test('transactions roll back completely on error', async () => {
  const app = await makeApp('tx');
  try {
    const before = app.db.get('SELECT COUNT(*) AS n FROM recipients').n;
    assert.throws(() => app.db.tx(() => {
      app.db.run("INSERT INTO recipients(office_name) VALUES('Temp')");
      throw new Error('boom');
    }), /boom/);
    assert.equal(app.db.get('SELECT COUNT(*) AS n FROM recipients').n, before);
  } finally { cleanup(app); }
});

test('record insertion, editing, search, filtering and sorting', async () => {
  const app = await makeApp('crud');
  try {
    const R = app.services.recipients;
    const r = R.save({ office_name: 'Divisional Board', designation: 'Divisional Secretary', district: 'Latur', pin_code: '413512' });
    R.save({ ...r, district: 'Sample District' });
    assert.equal(R.get(r.id).district, 'Sample District');
    assert.equal(R.list({ q: 'Divisional' }).length >= 1, true);
    assert.throws(() => R.save({ office_name: 'X', pin_code: '12' }), /PIN code/);
    const L = app.services.letters;
    const cat = category(app, 'HSC');
    for (const s of ['Zeta subject', 'Alpha subject', 'Mid subject']) L.saveDraft({ category_id: cat.id, subject: s, recipient_office: 'Board' });
    assert.equal(L.list({ q: 'Alpha' }).length, 1);
    assert.equal(L.list({ categoryId: cat.id }).length, 3);
    const srch = app.services.search.run({ q: 'subject', type: 'drafts' });
    assert.equal(srch.length, 3);
  } finally { cleanup(app); }
});

test('numbering patterns format correctly', () => {
  const base = { prefix: 'OUT', separator: '/', digits: 3, suffix: '' };
  assert.equal(formatNumber({ ...base, pattern: '{SEQ}{SEP}{AY}' }, { seq: 1, dateISO: '2026-11-14', startMonth: 6 }), '001/2026-27');
  assert.equal(formatNumber({ ...base, pattern: '{PREFIX}{SEP}{SEQ}{SEP}{AY}' }, { seq: 1, dateISO: '2026-11-14', startMonth: 6 }), 'OUT/001/2026-27');
  assert.equal(formatNumber({ ...base, pattern: '{CAT}{SEP}{SEQ}{SEP}{AY}' }, { seq: 1, dateISO: '2026-11-14', startMonth: 6, categoryCode: 'BEO' }), 'BEO/001/2026-27');
  assert.equal(formatNumber({ ...base, pattern: '{AY}{SEP}{SEQ}' }, { seq: 1, dateISO: '2026-11-14', startMonth: 6 }), '2026-27/001');
  assert.equal(formatNumber({ ...base, pattern: '{PREFIX}{SEP}{SEQ}{SEP}{AY}' }, { seq: 7, dateISO: '2027-03-01', startMonth: 6 }), 'OUT/007/2026-27');
  assert.equal(formatNumber({ ...base, pattern: '{PREFIX}{SEP}{AYFULL}{SEP}{SEQ}', prefix: 'COLLEGE' }, { seq: 29, dateISO: '2026-10-05', startMonth: 6 }), 'COLLEGE/2026-2027/029');
  // empty prefix does not leave a dangling separator
  assert.equal(formatNumber({ ...base, prefix: '', pattern: '{PREFIX}{SEP}{SEQ}{SEP}{AY}' }, { seq: 2, dateISO: '2026-11-14', startMonth: 6 }), '002/2026-27');
});

test('numbering: sequential, no duplicates, academic-year reset, category-wise, scheme history', async () => {
  const app = await makeApp('num');
  try {
    const N = app.numbering;
    const alloc = (date, cat) => app.db.tx(() => N.allocate('outward', { dateISO: date, categoryCode: cat, exists: () => false }).formatted);
    assert.equal(alloc('2026-11-14'), 'OUT/001/2026-27');
    assert.equal(alloc('2026-11-15'), 'OUT/002/2026-27');
    // new academic year starts again at 001
    assert.equal(alloc('2027-06-02'), 'OUT/001/2027-28');
    assert.equal(alloc('2026-12-01'), 'OUT/003/2026-27');
    // allocate outside a transaction is refused
    assert.throws(() => N.allocate('outward', { dateISO: '2026-11-14', exists: () => false }), /transaction/);
    // existing numbers are skipped
    const taken = new Set(['OUT/004/2026-27']);
    assert.equal(app.db.tx(() => N.allocate('outward', { dateISO: '2026-11-14', exists: (f) => taken.has(f) }).formatted), 'OUT/005/2026-27');
    // change scheme -> the used one is retired, not edited
    const old = N.activeScheme('outward');
    const s2 = N.saveScheme({ scope: 'outward', name: 'Category', pattern: '{CAT}{SEP}{SEQ}{SEP}{AY}', digits: 3, start_number: 1, reset: 'academic', per_category: true });
    assert.notEqual(s2.id, old.id);
    const oldRow = app.db.get('SELECT * FROM numbering_schemes WHERE id=?', [old.id]);
    assert.equal(oldRow.pattern, old.pattern);
    assert.ok(oldRow.retired_at);
    assert.equal(alloc('2026-11-14', 'BEO'), 'BEO/001/2026-27');
    assert.equal(alloc('2026-11-14', 'HSC'), 'HSC/001/2026-27');
    assert.equal(alloc('2026-11-14', 'BEO'), 'BEO/002/2026-27');
    // invalid schemes are rejected
    assert.throws(() => N.saveScheme({ scope: 'outward', pattern: '{PREFIX}{SEP}{AY}', digits: 3, reset: 'academic' }), /SEQ/);
    assert.throws(() => N.saveScheme({ scope: 'outward', pattern: '{SEQ}', digits: 3, reset: 'academic' }), /AY/);
    assert.throws(() => N.saveScheme({ scope: 'outward', pattern: '{SEQ}{AY}', digits: 3, reset: 'academic', per_category: true }), /CAT/);
  } finally { cleanup(app); }
});

test('outward numbers are unique across letters, cancelled numbers are kept and never reused, overrides are audited', async () => {
  const app = await makeApp('cancel');
  try {
    const L = app.services.letters;
    const cat = category(app, 'BEO');
    const mk = () => L.saveDraft({ category_id: cat.id, subject: 's', recipient_office: 'o', template_id: app.settings.get('letter').defaultTemplateId });
    const a = mk(); const b = mk();
    assert.equal(a.outward_no, null, 'drafts do not consume numbers');
    app.db.tx(() => L.reserveNumber(L.get(a.id), 'owner'));
    app.db.tx(() => L.reserveNumber(L.get(b.id), 'owner'));
    const na = L.get(a.id).outward_no; const nb = L.get(b.id).outward_no;
    assert.notEqual(na, nb);
    L.cancel(a.id, 'Wrong recipient');
    const ca = L.get(a.id);
    assert.equal(ca.status, 'Cancelled');
    assert.equal(ca.outward_no, na, 'cancelled number stays in the register');
    const c = mk();
    app.db.tx(() => L.reserveNumber(L.get(c.id), 'owner'));
    assert.notEqual(L.get(c.id).outward_no, na, 'cancelled number not reused');
    // duplicate prevention by the database itself
    assert.throws(() => app.db.run('UPDATE letters SET outward_no=? WHERE id=?', [nb, c.id]), /UNIQUE/);
    // manual override requires a reason, rejects duplicates and is audited
    assert.throws(() => L.overrideNumber(c.id, 'MAN/1', ''), /reason/);
    assert.throws(() => L.overrideNumber(c.id, nb, 'test'), /already used/);
    L.overrideNumber(c.id, 'MAN/1/2026-27', 'Number given by office');
    assert.equal(L.get(c.id).outward_no, 'MAN/1/2026-27');
    const audit = app.db.get("SELECT * FROM audit_log WHERE action='outward.override' AND entity_id=?", [c.id]);
    assert.ok(audit && audit.details.includes('Number given by office'));
    // drafts without number can be deleted, numbered letters cannot
    assert.throws(() => L.deleteDraft(b.id), /Cancel it instead/);
  } finally { cleanup(app); }
});

test('historical letters keep category name when the category is renamed or disabled', async () => {
  const app = await makeApp('cathist');
  try {
    const cat = category(app, 'ZP');
    const d = app.services.letters.saveDraft({ category_id: cat.id, subject: 's', recipient_office: 'o' });
    app.services.categories.save({ ...cat, name: 'Renamed ZP' });
    app.services.categories.setActive(cat.id, false);
    assert.equal(app.services.letters.get(d.id).category_name, 'Zilla Parishad / Education Department');
    assert.throws(() => app.services.categories.remove(cat.id), /Disable it instead/);
    const n = app.services.categories.save({ name: 'Temporary', code: 'TMP' });
    app.services.categories.remove(n.id);
    assert.ok(!app.services.categories.list().some((c) => c.id === n.id));
  } finally { cleanup(app); }
});

test('inward numbering, linking a reply and correspondence history', async () => {
  const app = await makeApp('inward');
  try {
    const I = app.services.inward;
    const a = I.save({ date_received: '2026-11-10', sender_office: 'Divisional Board', subject: 'Pre-list submission circular', reply_required: true, reply_deadline: '2026-11-20' });
    const b = I.save({ date_received: '2026-11-11', sender_office: 'BEO Office', subject: 'UDISE data' });
    assert.equal(a.inward_no, 'IN/001/2026-27');
    assert.equal(b.inward_no, 'IN/002/2026-27');
    assert.throws(() => I.save({ date_received: '2026-11-10', sender_office: 'x', subject: 's', reply_deadline: '2026-11-01' }), /deadline/);
    const draft = I.createReply(a.id);
    assert.equal(draft.inward_id, a.id);
    assert.equal(I.get(a.id).status, 'In Progress');
    assert.equal(I.get(a.id).replies.length, 1);
    const rep = app.services.reports.run('pending_inward', {});
    assert.equal(rep.rows.length, 2);
  } finally { cleanup(app); }
});
