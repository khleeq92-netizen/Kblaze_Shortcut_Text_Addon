// Built-in workspace presets: College Administration (Dr M.A. Aziz Jr College of
// Science, Phulambri), Trading & Business (Mr K Technical Levels) and General
// Productivity. Each preset provides folders, snippets, variables, dataset
// schemas (no fabricated records), starter autofill profiles, macros and scripts.
//
// Starter portal profiles target fields by their on-screen LABEL with regex
// fallbacks, because portal markup changes between academic years. They are
// marked `starter: true` and must be verified with the visual Field Selector.
import type { Workspace, Folder, Snippet, Variable, DataTable, AutofillProfile, AutofillRule, Macro, ScriptRecord, DataColumn, ColumnType, MacroSettings } from '../shared/types';
import { LIBRARY } from './templates';

export const WS_COLLEGE = 'ws_college';
export const WS_TRADING = 'ws_trading';
export const WS_GENERAL = 'ws_general';

const t0 = () => Date.now();

export const DEFAULT_MACRO_SETTINGS: MacroSettings = { stepDelayMs: 150, retries: 1, retryDelayMs: 800, timeoutMs: 10000, onError: 'stop', speed: 1 };

export function presetWorkspaces(): Workspace[] {
  const t = t0();
  return [
    {
      id: WS_COLLEGE, name: 'College Administration', kind: 'college', color: '#2563eb', icon: 'GraduationCap', expansionActive: true,
      description: 'Dr M.A. Aziz Jr College of Science, Phulambri — UDISE+, FYJC/CAP admissions, HSC exam forms, student & staff records, letters and certificates.',
      domains: ['udiseplus.gov.in', '11thadmission.org.in', 'mahahsscboard.in', 'shikshadesk.com'],
      officialDomains: ['udiseplus.gov.in', '11thadmission.org.in', 'mahahsscboard.in', 'gov.in', 'nic.in'],
      createdAt: t, updatedAt: t,
    },
    {
      id: WS_TRADING, name: 'Trading & Business', kind: 'trading', color: '#059669', icon: 'CandlestickChart', expansionActive: true,
      description: 'Mr K Technical Levels — XAUUSD signals, trade journal, risk & lot-size calculations, Telegram/WhatsApp community messages and reports. Assists with reporting only; it never places trades.',
      domains: ['tradingview.com', 'web.telegram.org', 'web.whatsapp.com'], officialDomains: [], createdAt: t, updatedAt: t,
    },
    {
      id: WS_GENERAL, name: 'General Productivity', kind: 'general', color: '#7c3aed', icon: 'Sparkles', expansionActive: true,
      description: 'Personal autofill, email templates, text expansion, browser macros and spreadsheet-driven workflows for any website.',
      domains: [], officialDomains: [], createdAt: t, updatedAt: t,
    },
  ];
}

const col = (name: string, key: string, type: ColumnType = 'text', options?: string[]): DataColumn => ({ id: 'col_' + key, name, key, type, options });

function dataset(id: string, ws: string, name: string, key: string, description: string, columns: DataColumn[], extra: Partial<DataTable> = {}): DataTable {
  const t = t0();
  return { id, name, key, description, columns, rows: [], workspaceId: ws, source: { kind: 'manual' }, createdAt: t, updatedAt: t, currentRowId: null, ...extra };
}

function v(id: string, ws: string | undefined, name: string, kind: Variable['kind'], value: string, extra: Partial<Variable> = {}): Variable {
  const t = t0();
  return { id, workspaceId: ws, name, kind, value, createdAt: t, updatedAt: t, ...extra };
}

let ruleN = 0;
function rule(label: string, labelRegex: string, value: string, action: AutofillRule['action'] = 'fill', extra: Partial<AutofillRule> = {}): AutofillRule {
  ruleN++;
  return {
    id: `rul_preset_${ruleN}`, enabled: true, label, action, value, overwrite: 'always', fieldKind: 'auto',
    target: { by: 'label', value: label, fallbacks: [{ by: 'regex', value: labelRegex }] },
    ...extra,
  };
}

function profile(id: string, ws: string, name: string, sites: string[], rules: AutofillRule[], extra: Partial<AutofillProfile> = {}): AutofillProfile {
  const t = t0();
  return { id, workspaceId: ws, name, enabled: true, sites: sites.map((s) => ({ kind: 'domain', value: s })), rules, datasetId: null, runMode: 'manual', tags: [], fieldDelayMs: 60, createdAt: t, updatedAt: t, ...extra };
}

// ---------------------------------------------------------------- college
const STUDENT_COLUMNS: DataColumn[] = [
  col('GR No', 'gr_no'), col('Student Name', 'student_name'), col('First Name', 'first_name'), col('Middle Name', 'middle_name'), col('Last Name', 'last_name'),
  col("Mother's Name", 'mother_name'), col("Father's Name", 'father_name'), col('Gender', 'gender', 'category', ['Male', 'Female', 'Transgender']),
  col('Date of Birth', 'student_dob', 'date'), col('Category', 'category', 'category', ['OPEN', 'SC', 'ST', 'VJ/DT(A)', 'NT(B)', 'NT(C)', 'NT(D)', 'OBC', 'SBC', 'EWS']),
  col('Religion', 'religion'), col('Caste', 'caste'), col('Mother Tongue', 'mother_tongue'), col('Aadhaar No', 'aadhaar_no'), col('Mobile', 'mobile', 'phone'),
  col('Email', 'email', 'email'), col('Address', 'address'), col('Taluka', 'taluka'), col('District', 'district'), col('Pincode', 'pincode'),
  col('Class', 'class', 'category', ['11th', '12th']), col('Stream', 'stream', 'category', ['Science']), col('Division', 'division'), col('Admission Date', 'admission_date', 'date'),
  col('Application ID', 'application_id'), col('SSC Seat No', 'ssc_seat_no'), col('SSC Marks %', 'ssc_percent', 'number'), col('Blood Group', 'blood_group'), col('PEN / UDISE Student ID', 'pen_id'),
];

const COLLEGE_SNIPPETS_EXTRA = (t: number): Snippet[] => [
  {
    id: 'snp_col_bonafide', name: 'Bonafide certificate text', shortcut: '/bonafide', contentType: 'text', folderId: 'fld_col_letters', workspaceId: WS_COLLEGE,
    content: 'BONAFIDE CERTIFICATE\n\nThis is to certify that {{text: student; label=Student name; required}} is a bonafide student of {{college_name}}, studying in {{select: class; options=11th Science,12th Science; label=Class}} during the academic year {{academic_year}}. As per our General Register (GR No. {{text: gr; label=GR No}}), the date of birth is {{date: dob; format=DD/MM/YYYY; label=Date of birth}}.\n\nThis certificate is issued on request for {{text: purpose; label=Purpose; default=scholarship purpose}}.\n\nDate: {{today; format=DD/MM/YYYY}}\nPlace: {{college_place}}\n\nPrincipal\n{{college_name}}',
    enabled: true, favorite: true, pinned: false, tags: ['certificate'], trigger: 'default', createdAt: t, updatedAt: t,
  },
  {
    id: 'snp_col_lc_request', name: 'Leaving certificate – office note', shortcut: '/lcnote', contentType: 'text', folderId: 'fld_col_letters', workspaceId: WS_COLLEGE,
    content: 'Office note — Leaving Certificate\nStudent: {{text: student; required}}\nGR No: {{text: gr}}\nClass: {{select: class; options=11th Science,12th Science}}\nReason for leaving: {{select: reason; options=Passed HSC,Transfer,Personal reasons,Other}}\nFees cleared: {{checkbox: fees; label=All fees cleared}}{{if: fees}} ✔{{else}} ✘ (pending){{endif}}\nPrepared on {{today; format=DD/MM/YYYY}} by {{me.name}}',
    enabled: true, favorite: false, pinned: false, tags: ['certificate'], trigger: 'default', createdAt: t, updatedAt: t,
  },
  {
    id: 'snp_col_letter', name: 'Official letter (letterhead text)', shortcut: '/colletter', contentType: 'text', folderId: 'fld_col_letters', workspaceId: WS_COLLEGE,
    content: '{{college_name}}\n{{college_place}}, Dist. {{college_district}}  ·  UDISE: {{udise_code}}\n\nOutward No: {{text: outward; label=Outward No}}\nDate: {{today; format=DD/MM/YYYY}}\n\nTo,\n{{textarea: to; label=To (name & address); required}}\n\nSubject: {{text: subject; required}}\n\nRespected Sir/Madam,\n\n{{textarea: body; label=Letter body; required}}\n\nThanking you,\n\nYours faithfully,\n\n{{principal_name}}\nPrincipal',
    enabled: true, favorite: true, pinned: true, tags: ['letter'], trigger: 'default', createdAt: t, updatedAt: t,
  },
  {
    id: 'snp_col_staff', name: 'Staff information summary', shortcut: '/staffinfo', contentType: 'text', folderId: 'fld_col_staff', workspaceId: WS_COLLEGE,
    content: 'Staff: {{text: name; required}}\nDesignation: {{select: desig; options=Principal,Lecturer,Lab Assistant,Clerk,Peon,Librarian}}\nSubject: {{text: subject}}\nDate of joining: {{date: doj; format=DD/MM/YYYY}}\nQualification: {{text: qual}}\nMobile: {{text: mobile}}',
    enabled: true, favorite: false, pinned: false, tags: ['staff'], trigger: 'default', createdAt: t, updatedAt: t,
  },
  {
    id: 'snp_col_admit_wa', name: 'Admission reminder (WhatsApp)', shortcut: '/fyjcwa', contentType: 'text', folderId: 'fld_col_msgs', workspaceId: WS_COLLEGE,
    content: 'Dear Parent,\n{{student_name}}\'s FYJC admission at {{college_name}} is pending. Please visit the college office before {{date: last; format=DD MMM YYYY; label=Last date}} with the original documents (SSC marksheet, LC, Aadhaar, 2 photos).\n— College Office, {{college_place}}',
    enabled: true, favorite: false, pinned: false, tags: ['whatsapp'], trigger: 'default', createdAt: t, updatedAt: t,
  },
];

export function collegePreset() {
  const t = t0();
  ruleN = 1000;
  const folders: Folder[] = [
    { id: 'fld_col_root', name: 'College Administration', parentId: null, order: 10, color: '#2563eb', workspaceId: WS_COLLEGE, createdAt: t, updatedAt: t },
    { id: 'fld_col_letters', name: 'Letters & certificates', parentId: 'fld_col_root', order: 0, color: '#2563eb', workspaceId: WS_COLLEGE, createdAt: t, updatedAt: t },
    { id: 'fld_col_msgs', name: 'Notices & messages', parentId: 'fld_col_root', order: 1, color: '#2563eb', workspaceId: WS_COLLEGE, createdAt: t, updatedAt: t },
    { id: 'fld_col_staff', name: 'Staff', parentId: 'fld_col_root', order: 2, color: '#2563eb', workspaceId: WS_COLLEGE, createdAt: t, updatedAt: t },
  ];
  const variables: Variable[] = [
    v('var_col_name', WS_COLLEGE, 'college_name', 'static', 'Dr M.A. Aziz Jr College of Science, Phulambri', { label: 'College name' }),
    v('var_col_place', WS_COLLEGE, 'college_place', 'static', 'Phulambri', { label: 'Place' }),
    v('var_col_dist', WS_COLLEGE, 'college_district', 'static', 'Chhatrapati Sambhajinagar', { label: 'District' }),
    v('var_col_udise', WS_COLLEGE, 'udise_code', 'static', '', { label: 'College UDISE code', description: 'Enter your 11-digit UDISE code' }),
    v('var_col_principal', WS_COLLEGE, 'principal_name', 'static', '', { label: 'Principal name' }),
    v('var_col_ay', WS_COLLEGE, 'academic_year', 'formula', 'if(month(today()) >= 6, concat(year(today()), "-", right(text(year(today()) + 1), 2)), concat(year(today()) - 1, "-", right(text(year(today())), 2)))', { label: 'Academic year (June–May)' }),
    v('var_col_date', WS_COLLEGE, 'current_date', 'date', 'today', { format: 'DD/MM/YYYY', label: "Today's date" }),
    v('var_col_fullname', WS_COLLEGE, 'full_name_caps', 'formula', 'upper(coalesce(student_name, concat(first_name, " ", middle_name, " ", last_name)))', { label: 'Student name in CAPITALS (from dataset)' }),
    v('var_col_gender_short', WS_COLLEGE, 'gender_code', 'conditional', '', { label: 'Gender code (M/F/T)', branches: [{ when: 'lower(gender) = "male"', then: 'M' }, { when: 'lower(gender) = "female"', then: 'F' }, { when: 'lower(gender) = "transgender"', then: 'T' }] }),
  ];
  const tables: DataTable[] = [
    dataset('tbl_col_students', WS_COLLEGE, 'Students (FYJC / 12th)', 'students', 'Import your student register (Excel/CSV/Google Sheets). Columns can be mapped on import.', STUDENT_COLUMNS, { keyColumn: 'gr_no', requiredColumns: ['student_name', 'student_dob', 'gender'], sensitiveColumns: ['aadhaar_no', 'mobile', 'email', 'student_dob', 'address', 'caste', 'religion'] }),
    dataset('tbl_col_staff', WS_COLLEGE, 'Staff', 'staff', 'Teaching and non-teaching staff', [col('Staff ID', 'staff_id'), col('Name', 'name'), col('Designation', 'designation'), col('Subject', 'subject'), col('Date of joining', 'doj', 'date'), col('Mobile', 'mobile', 'phone'), col('Email', 'email', 'email'), col('Aadhaar No', 'aadhaar_no'), col('Qualification', 'qualification')], { keyColumn: 'staff_id', sensitiveColumns: ['mobile', 'email', 'aadhaar_no'] }),
  ];
  const studentRules = (): AutofillRule[] => [
    rule('Student Name', '(student|candidate|applicant).*name|^name$|full ?name', '{{student_name}}'),
    rule("Mother's Name", 'mother', '{{mother_name}}'),
    rule("Father's Name", 'father|guardian', '{{father_name}}'),
    rule('Gender', 'gender|sex', '{{gender}}', 'select'),
    rule('Date of Birth', 'birth|dob', '{{student_dob}}', 'fill', { dateFormat: 'DD/MM/YYYY' }),
    rule('Category', 'social.?category|caste.?category|^category', '{{category}}', 'select'),
    rule('Religion', 'religion', '{{religion}}', 'select'),
    rule('Mother Tongue', 'mother.?tongue', '{{mother_tongue}}', 'select'),
    rule('Aadhaar', 'aadh?a?a?r|uid', '{{aadhaar_no}}', 'fill', { sensitive: true }),
    rule('Mobile Number', 'mobile|contact|phone', '{{mobile}}'),
    rule('Email', 'e.?mail', '{{email}}'),
    rule('Address', 'address', '{{address}}'),
    rule('Pincode', 'pin.?code|postal', '{{pincode}}'),
  ];
  const profiles: AutofillProfile[] = [
    profile('afp_udise_s02', WS_COLLEGE, 'UDISE+ S02 – Student general profile', ['udiseplus.gov.in'], [...studentRules(), rule('PEN', 'pen|student.?id', '{{pen_id}}')], { datasetId: 'tbl_col_students', portal: 'UDISE+', academicYear: '', starter: true, description: 'Starter mapping for the student general-profile section. Verify each field with the Field Selector on the live portal and save.' }),
    profile('afp_udise_s03', WS_COLLEGE, 'UDISE+ S03 – Enrolment & schooling details', ['udiseplus.gov.in'], [
      rule('Class', 'class|grade|standard', '{{class}}', 'select'), rule('Stream', 'stream|faculty', '{{stream}}', 'select'), rule('Section', 'section|division', '{{division}}', 'select'),
      rule('Admission Number', 'admission.?(no|number)|gr', '{{gr_no}}'), rule('Date of Admission', 'admission.?date|date.?of.?admission', '{{admission_date}}', 'fill', { dateFormat: 'DD/MM/YYYY' }),
      rule('Previous class marks %', 'percent|marks', '{{ssc_percent}}'),
    ], { datasetId: 'tbl_col_students', portal: 'UDISE+', starter: true, description: 'Starter mapping for the enrolment section. Verify on the live portal.' }),
    profile('afp_fyjc', WS_COLLEGE, 'FYJC Online Admission – Part 1 (student details)', ['11thadmission.org.in'], [...studentRules(), rule('SSC Seat No', 'seat.?no|ssc.?seat', '{{ssc_seat_no}}')], { datasetId: 'tbl_col_students', portal: 'FYJC', starter: true, description: 'Fills the student-details page. Never submits — review and click Save/Submit yourself.' }),
    profile('afp_cap', WS_COLLEGE, 'CAP round – college admission confirmation', ['11thadmission.org.in'], [
      rule('Application ID', 'application.?(id|no)|form.?no', '{{application_id}}'), rule('Student Name', '(student|candidate).*name', '{{student_name}}'), rule('Mobile Number', 'mobile', '{{mobile}}'),
    ], { datasetId: 'tbl_col_students', portal: 'FYJC CAP', starter: true, description: 'Looks up the allotted student on the college login. Confirmation buttons always require your approval.' }),
    profile('afp_hsc', WS_COLLEGE, 'HSC examination form – student details', ['mahahsscboard.in'], [...studentRules(), rule('Stream', 'stream|faculty', '{{stream}}', 'select')], { datasetId: 'tbl_col_students', portal: 'HSC Board', starter: true, description: 'Exam-form student details. Payment / final submit steps are never automated.' }),
    profile('afp_shiksha_desk', WS_COLLEGE, 'Shiksha Desk – student registration', ['shikshadesk.com'], studentRules(), { datasetId: 'tbl_col_students', portal: 'Shiksha Desk', starter: true, description: 'Generic label-based mapping for the Shiksha Desk student registration form.' }),
  ];
  const macros: Macro[] = [
    {
      id: 'mac_col_batch', workspaceId: WS_COLLEGE, name: 'Batch: fill student form for every record', enabled: true, sites: [], datasetId: 'tbl_col_students', tags: ['batch'],
      description: 'Fills the current page with the active student, waits for you to review & submit manually, then moves to the next student. Stops after the last record.',
      settings: { ...DEFAULT_MACRO_SETTINGS },
      steps: [
        { id: 'm1', type: 'label', value: 'next_student' },
        { id: 'm2', type: 'autofill', refId: 'afp_fyjc', note: 'Fill student details (FYJC profile)' },
        { id: 'm3', type: 'confirm', value: 'Review the form for {{student_name}}, submit it yourself, then press Continue for the next student.' },
        { id: 'm4', type: 'nextRecord' },
        { id: 'm5', type: 'goto', value: 'next_student', maxIterations: 500 },
      ],
      createdAt: t, updatedAt: t,
    },
  ];
  const scripts: ScriptRecord[] = [
    {
      id: 'scr_col_fields', workspaceId: WS_COLLEGE, name: 'List all form fields on this page', enabled: true, sites: [], runMode: 'manual', timeoutMs: 15000, maxLoopIterations: 5000, tags: ['diagnostics'],
      description: 'Logs every detected field with its label, name and selector — useful when mapping a new portal.',
      code: "const fields = kf.fields();\nkf.log(`Found ${fields.length} fields on ${kf.title}`);\nfor (const f of fields) kf.log(`${f.kind.padEnd(10)} ${f.label || '(no label)'}  →  ${f.css}`);\nreturn fields.length;",
      createdAt: t, updatedAt: t,
    },
  ];
  const libCats = new Set(['College administration', 'Admissions', 'Attendance', 'Office']);
  const snippets = [...libSnippets(libCats, 'fld_col_msgs', WS_COLLEGE, t), ...COLLEGE_SNIPPETS_EXTRA(t)];
  return { folders, snippets, variables, tables, profiles, macros, scripts };
}

// ---------------------------------------------------------------- trading
export function tradingPreset() {
  const t = t0();
  ruleN = 2000;
  const folders: Folder[] = [
    { id: 'fld_trd_root', name: 'Mr K Technical Levels', parentId: null, order: 20, color: '#059669', workspaceId: WS_TRADING, createdAt: t, updatedAt: t },
    { id: 'fld_trd_signals', name: 'Signals & trade management', parentId: 'fld_trd_root', order: 0, color: '#059669', workspaceId: WS_TRADING, createdAt: t, updatedAt: t },
    { id: 'fld_trd_reports', name: 'Reports & journal', parentId: 'fld_trd_root', order: 1, color: '#059669', workspaceId: WS_TRADING, createdAt: t, updatedAt: t },
    { id: 'fld_trd_community', name: 'Community (Telegram / WhatsApp)', parentId: 'fld_trd_root', order: 2, color: '#059669', workspaceId: WS_TRADING, createdAt: t, updatedAt: t },
  ];
  const variables: Variable[] = [
    v('var_trd_brand', WS_TRADING, 'brand_name', 'static', 'Mr K Technical Levels', { label: 'Brand' }),
    v('var_trd_symbol', WS_TRADING, 'symbol', 'static', 'XAUUSD', { label: 'Symbol' }),
    v('var_trd_balance', WS_TRADING, 'account_balance', 'static', '1000', { label: 'Account balance (USD)' }),
    v('var_trd_risk', WS_TRADING, 'risk_percent', 'static', '1', { label: 'Risk per trade (%)' }),
    v('var_trd_entry', WS_TRADING, 'trade_entry', 'static', '0', { label: 'Entry price (update per trade)' }),
    v('var_trd_sl', WS_TRADING, 'stop_loss', 'static', '0', { label: 'Stop loss price' }),
    v('var_trd_tp', WS_TRADING, 'take_profit', 'static', '0', { label: 'Take profit price' }),
    v('var_trd_risk_amt', WS_TRADING, 'risk_amount', 'formula', 'round(number(account_balance) * number(risk_percent) / 100, 2)', { label: 'Risk amount (USD)' }),
    v('var_trd_pips', WS_TRADING, 'sl_pips', 'formula', 'round(abs(number(trade_entry) - number(stop_loss)) * 10, 1)', { label: 'SL distance in pips (XAUUSD: 1 pip = 0.10)' }),
    v('var_trd_lot', WS_TRADING, 'lot_size', 'formula', 'if(number(sl_pips) > 0, round(number(risk_amount) / (number(sl_pips) * 10), 2), 0)', { label: 'Lot size (pip value $10 per lot)' }),
    v('var_trd_rr', WS_TRADING, 'risk_reward', 'formula', 'if(abs(number(trade_entry) - number(stop_loss)) > 0, round(abs(number(take_profit) - number(trade_entry)) / abs(number(trade_entry) - number(stop_loss)), 2), 0)', { label: 'Risk : reward' }),
    v('var_trd_week', WS_TRADING, 'week_range', 'formula', 'concat(formatdate(shift(today(), "-6d"), "DD MMM"), " – ", formatdate(today(), "DD MMM YYYY"))', { label: 'Last 7 days' }),
    v('var_trd_session', WS_TRADING, 'session_name', 'conditional', 'New York session', { label: 'Current trading session (IST)', branches: [{ when: 'number(formatdate(now(), "H")) < 12', then: 'Asian session' }, { when: 'number(formatdate(now(), "H")) < 18', then: 'London session' }] }),
  ];
  const tables: DataTable[] = [
    dataset('tbl_trd_journal', WS_TRADING, 'Trade journal', 'journal', 'One row per trade. Import from your broker export or add rows as you trade.', [
      col('Trade ID', 'trade_id'), col('Date', 'date', 'date'), col('Symbol', 'symbol', 'category', ['XAUUSD']), col('Direction', 'direction', 'category', ['BUY', 'SELL']),
      col('Entry', 'entry', 'number'), col('Stop loss', 'sl', 'number'), col('Take profit', 'tp', 'number'), col('Lots', 'lots', 'number'), col('Result (pips)', 'pips', 'number'),
      col('P/L (USD)', 'pnl', 'number'), col('Status', 'status', 'category', ['Running', 'TP hit', 'SL hit', 'Breakeven', 'Closed']), col('Notes', 'notes'),
    ], { keyColumn: 'trade_id', requiredColumns: ['date', 'direction', 'entry', 'sl'] }),
    dataset('tbl_trd_members', WS_TRADING, 'VIP members', 'members', 'Community subscribers (for renewal reminders).', [col('Member ID', 'member_id'), col('Name', 'name'), col('Telegram', 'telegram'), col('WhatsApp', 'whatsapp', 'phone'), col('Plan', 'plan', 'category', ['Monthly', 'Quarterly', 'Yearly']), col('Expiry', 'expiry', 'date')], { keyColumn: 'member_id', sensitiveColumns: ['whatsapp'] }),
  ];
  const profiles: AutofillProfile[] = [
    profile('afp_tv_alert', WS_TRADING, 'TradingView – price alert form', ['tradingview.com'], [
      rule('Value', 'value|price', '{{trade_entry}}'),
      rule('Alert name', 'alert.?name|name', '{{symbol}} entry {{trade_entry}}'),
      rule('Message', 'message', '{{symbol}} reached {{trade_entry}} — SL {{stop_loss}} / TP {{take_profit}} ({{brand_name}})'),
    ], { starter: true, description: 'Fills the alert dialog with your current levels. It only prepares the alert text — K-Flow never places or modifies trades.' }),
  ];
  const scripts: ScriptRecord[] = [
    {
      id: 'scr_trd_risk', workspaceId: WS_TRADING, name: 'Risk / lot-size check', enabled: true, sites: [], runMode: 'manual', timeoutMs: 10000, maxLoopIterations: 1000, tags: ['risk'],
      description: 'Computes lot size from balance, risk % and SL distance and logs the result (calculation only).',
      code: "const bal = Number(kf.vars.account_balance), risk = Number(kf.vars.risk_percent);\nconst entry = Number(kf.vars.trade_entry), sl = Number(kf.vars.stop_loss);\nconst pips = Math.abs(entry - sl) * 10;\nkf.assert(pips > 0, 'Set trade_entry and stop_loss variables first');\nconst lots = Math.round((bal * risk / 100) / (pips * 10) * 100) / 100;\nkf.log(`Risk $${(bal * risk / 100).toFixed(2)} over ${pips.toFixed(1)} pips → ${lots} lots`);\nkf.setVar('calc_lots', lots);\nreturn lots;",
      createdAt: t, updatedAt: t,
    },
  ];
  const macros: Macro[] = [];
  const libCats = new Set(['Market analysis', 'Trade signals', 'Trade management', 'Risk & journal', 'VIP channel', 'Payments', 'Trading']);
  const snippets = libSnippets(libCats, 'fld_trd_signals', WS_TRADING, t).map((s) => {
    const l = LIBRARY.find((x) => s.source?.ref === x.id);
    if (l && ['Risk & journal'].includes(l.category)) return { ...s, folderId: 'fld_trd_reports' };
    if (l && ['VIP channel', 'Payments'].includes(l.category)) return { ...s, folderId: 'fld_trd_community' };
    return s;
  });
  snippets.push({
    id: 'snp_trd_levels_vars', name: 'Signal from my levels (variables)', shortcut: '/mysignal', contentType: 'text', folderId: 'fld_trd_signals', workspaceId: WS_TRADING,
    content: '🟡 {{symbol}} — {{select: dir; options=BUY,SELL; label=Direction}} NOW\n\n📍 Entry: {{trade_entry}}\n🛑 SL: {{stop_loss}} ({{sl_pips}} pips)\n🎯 TP: {{take_profit}}\n⚖️ R:R 1:{{risk_reward}}\n📦 Suggested lot ({{risk_percent}}% of ${{account_balance}}): {{lot_size}}\n\n— {{brand_name}} · Not financial advice.',
    enabled: true, favorite: true, pinned: true, tags: ['signal'], trigger: 'default', createdAt: t, updatedAt: t,
  });
  return { folders, snippets, variables, tables, profiles, macros, scripts };
}

// ---------------------------------------------------------------- general
export function generalPreset() {
  const t = t0();
  ruleN = 3000;
  const folders: Folder[] = [
    { id: 'fld_gen_root', name: 'Personal & email', parentId: null, order: 30, color: '#7c3aed', workspaceId: WS_GENERAL, createdAt: t, updatedAt: t },
  ];
  const variables: Variable[] = [
    v('var_gen_today', undefined, 'today_long', 'date', 'today', { format: 'dddd, D MMMM YYYY', label: 'Today (long) — global' }),
    v('var_gen_ref', undefined, 'ref_no', 'random', 'alnum:8', { label: 'Random reference number — global' }),
    v('var_gen_greeting', undefined, 'greeting_now', 'formula', 'greeting()', { label: 'Good morning/afternoon/evening — global' }),
  ];
  const profiles: AutofillProfile[] = [
    profile('afp_gen_contact', WS_GENERAL, 'Contact form (any site)', [], [
      rule('Name', '^(full ?)?name$|your.?name', '{{me.name}}'), rule('Email', 'e.?mail', '{{me.email}}'), rule('Phone', 'phone|mobile', '{{me.phone}}'), rule('Company', 'company|organi[sz]ation', '{{me.company}}'),
    ], { description: 'Uses your profile (Settings → Profile). Works on most contact / sign-up forms.' }),
  ];
  const macros: Macro[] = [];
  const scripts: ScriptRecord[] = [
    {
      id: 'scr_gen_highlight_empty', workspaceId: WS_GENERAL, name: 'Highlight empty required fields', enabled: true, sites: [], runMode: 'manual', timeoutMs: 10000, maxLoopIterations: 5000, tags: ['validation'],
      description: 'Outlines required fields that are still empty before you submit.',
      code: "let n = 0;\nfor (const el of kf.$$('input[required],select[required],textarea[required]')) {\n  if (!String(el.value || '').trim()) { el.style.outline = '3px solid #dc2626'; n++; }\n}\nkf.log(`${n} required field(s) empty`);\nreturn n;",
      createdAt: t, updatedAt: t,
    },
  ];
  const tables: DataTable[] = [
    dataset('tbl_gen_customers', WS_GENERAL, 'Customers', 'customers', 'Used by the /cust template — import or add your customers.', [col('Name', 'name'), col('Email', 'email', 'email'), col('Phone', 'phone', 'phone'), col('Plan', 'plan', 'category', ['Basic', 'Pro', 'Enterprise'])], { sensitiveColumns: ['email', 'phone'] }),
  ];
  const libCats = new Set(['Professional email', 'Personal', 'WhatsApp', 'Customer support', 'Follow-up', 'Meetings', 'Sales & proposals', 'Social media']);
  const snippets = libSnippets(libCats, 'fld_gen_root', WS_GENERAL, t);
  return { folders, snippets, variables, tables, profiles, macros, scripts };
}

function libSnippets(cats: Set<string>, folderId: string, ws: string, t: number): Snippet[] {
  return LIBRARY.filter((l) => cats.has(l.category)).map((l) => ({
    id: 'snp_' + l.id.replace(/^lib-/, '').replace(/-/g, '_'), name: l.name, shortcut: l.shortcut, content: l.content, contentType: l.contentType,
    folderId, enabled: true, favorite: false, pinned: false, description: l.description, tags: [l.category.toLowerCase()], trigger: 'default' as const,
    source: { kind: 'template' as const, ref: l.id }, workspaceId: ws, createdAt: t, updatedAt: t,
  }));
}

export function allPresets() {
  return { workspaces: presetWorkspaces(), college: collegePreset(), trading: tradingPreset(), general: generalPreset() };
}
