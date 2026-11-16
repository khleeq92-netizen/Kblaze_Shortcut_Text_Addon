'use strict';
/** First-run data: roles, owner account, categories, numbering schemes, sample recipients. */

const PERMISSIONS = [
  ['letters.create', 'Create letters'],
  ['letters.editDraft', 'Edit drafts'],
  ['letters.approve', 'Approve letters'],
  ['letters.finalize', 'Finalize & archive letters'],
  ['letters.revise', 'Revise finalized letters'],
  ['letters.dispatch', 'Record dispatch'],
  ['registers.view', 'View registers'],
  ['inward.manage', 'Manage inward register'],
  ['reports.export', 'Export reports'],
  ['templates.manage', 'Manage templates'],
  ['records.cancelDelete', 'Cancel / delete records'],
  ['numbering.override', 'Manual outward number override'],
  ['settings.manage', 'Manage settings'],
  ['backup.manage', 'Backup & restore'],
];
const ALL = PERMISSIONS.map((p) => p[0]);

const ROLES = [
  ['Owner', ALL],
  ['Administrator', ALL],
  ['Principal', ['letters.create', 'letters.editDraft', 'letters.approve', 'letters.finalize', 'letters.revise', 'letters.dispatch', 'registers.view', 'inward.manage', 'reports.export', 'templates.manage', 'records.cancelDelete']],
  ['Clerk', ['letters.create', 'letters.editDraft', 'letters.finalize', 'letters.dispatch', 'registers.view', 'inward.manage', 'reports.export']],
  ['Read-only User', ['registers.view']],
];

const CATEGORIES = [
  ['BEO Office', 'BEO', 'BEO', ['Student Information', 'Student Name Correction', 'Student DOB Correction', 'Staff Information', 'General Correspondence', 'Information Submission', 'Other']],
  ['UDISE', 'UDISE', 'UDISE', ['S02 – New Student Record', 'S03 – Student Information Correction', 'Student Verification', 'Data Correction Request', 'UDISE Information Submission', 'Other']],
  ['Maharashtra HSC Board', 'HSC', 'HSC_Board', ['12th Mark Memo Collection', 'Passing Certificate Collection', 'Preliminary Examination Form List', 'Examination Fee Submission', 'Teacher and Invigilator Details', 'Practical Examination Marks', 'Practical Examination Papers Submission', 'General Board Correspondence', 'Other']],
  ['Divisional Secretary / HSC Board', 'DIVSEC', 'Divisional_Secretary', ['Examination Correspondence', 'Student Certificate Requests', 'Examination Fee', 'Practical Examination', 'Other']],
  ['Zilla Parishad / Education Department', 'ZP', 'Zilla_Parishad', ['Student Information', 'Staff Information', 'Official Data Submission', 'Correction Requests', 'Other']],
  ['General Correspondence', 'GEN', 'General', ['Banks', 'Government Departments', 'Other Educational Institutions', 'Vendors', 'Other Offices', 'Miscellaneous']],
];

const RECIPIENTS = [
  { office_name: 'Block Education Office, Panchayat Samiti', recipient_name: '', designation: 'Block Education Officer (Gatshikshanadhikari)', department: 'Education Department', cat: 'BEO' },
  { office_name: 'UDISE+ Cell, Block Resource Centre', recipient_name: '', designation: 'Block Education Officer / UDISE Coordinator', department: 'Samagra Shiksha', cat: 'UDISE' },
  { office_name: 'Maharashtra State Board of Secondary and Higher Secondary Education, Divisional Board', recipient_name: '', designation: 'The Divisional Secretary', department: 'Divisional Board', cat: 'DIVSEC' },
  { office_name: 'Maharashtra State Board of Secondary and Higher Secondary Education', recipient_name: '', designation: 'The Secretary', department: '', state: 'Maharashtra', cat: 'HSC' },
  { office_name: 'Zilla Parishad, Education Department (Secondary)', recipient_name: '', designation: 'Education Officer (Secondary)', department: 'Education Department', cat: 'ZP' },
  { office_name: 'Branch Manager', recipient_name: '', designation: 'Branch Manager', department: 'Bank', cat: 'GEN' },
];

function seed(app) {
  const { db } = app;
  if (db.get('SELECT COUNT(*) AS n FROM roles').n > 0) return false;
  db.tx(() => {
    for (const [name, perms] of ROLES) db.run('INSERT INTO roles(name, permissions, system) VALUES(?,?,1)', [name, JSON.stringify(perms)]);
    const owner = db.get("SELECT id FROM roles WHERE name='Owner'").id;
    db.run("INSERT INTO users(username, display_name, role_id) VALUES('owner','Owner',?)", [owner]);

    CATEGORIES.forEach(([name, code, folder, subs], i) => {
      const id = db.run('INSERT INTO categories(name, code, folder_name, sort_order) VALUES(?,?,?,?)', [name, code, folder, i + 1]).lastInsertRowid;
      subs.forEach((s, j) => db.run('INSERT INTO subcategories(category_id, name, sort_order) VALUES(?,?,?)', [id, s, j + 1]));
    });

    db.run(`INSERT INTO numbering_schemes(scope, name, pattern, prefix, separator, digits, start_number, reset, per_category, active)
      VALUES('outward','Outward – OUT/001/2026-27','{PREFIX}{SEP}{SEQ}{SEP}{AY}','OUT','/',3,1,'academic',0,1)`);
    db.run(`INSERT INTO numbering_schemes(scope, name, pattern, prefix, separator, digits, start_number, reset, per_category, active)
      VALUES('inward','Inward – IN/001/2026-27','{PREFIX}{SEP}{SEQ}{SEP}{AY}','IN','/',3,1,'academic',0,1)`);

    for (const r of RECIPIENTS) {
      const cat = db.get('SELECT id FROM categories WHERE code=?', [r.cat]);
      db.run('INSERT INTO recipients(office_name, recipient_name, designation, department, state, category_id) VALUES(?,?,?,?,?,?)',
        [r.office_name, r.recipient_name, r.designation, r.department, r.state || 'Maharashtra', cat && cat.id]);
    }
    app.audit('system', 'seed', 'app', null, { categories: CATEGORIES.length });
  });
  return true;
}

module.exports = { seed, PERMISSIONS, ROLES, CATEGORIES };
