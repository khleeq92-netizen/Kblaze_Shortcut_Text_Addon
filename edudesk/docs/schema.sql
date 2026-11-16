-- EduDesk Correspondence Manager – SQLite schema (version 1)
-- Generated from src/core/schema.js

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_name TEXT NOT NULL DEFAULT 'owner',
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  details TEXT
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  size_bytes INTEGER,
  file_count INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  note TEXT
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE inward (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inward_no TEXT UNIQUE,
  inward_seq INTEGER,
  scheme_id INTEGER REFERENCES numbering_schemes(id),
  period_key TEXT,
  academic_year TEXT,
  date_received TEXT NOT NULL,
  letter_date TEXT,
  sender_name TEXT,
  sender_office TEXT,
  sender_designation TEXT,
  subject TEXT NOT NULL,
  summary TEXT,
  category_id INTEGER REFERENCES categories(id),
  category_name TEXT,
  reference_no TEXT,
  received_through TEXT,
  assigned_to TEXT,
  action_required TEXT,
  reply_required INTEGER NOT NULL DEFAULT 0,
  reply_deadline TEXT,
  status TEXT NOT NULL DEFAULT 'Received',
  remarks TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE inward_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inward_id INTEGER NOT NULL REFERENCES inward(id),
  label TEXT,
  file_path TEXT NOT NULL,
  sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  deleted_at TEXT
);

CREATE TABLE letter_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  letter_id INTEGER NOT NULL REFERENCES letters(id),
  kind TEXT NOT NULL,
  label TEXT,
  file_path TEXT NOT NULL,
  sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  deleted_at TEXT
);

CREATE TABLE letter_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  letter_id INTEGER NOT NULL REFERENCES letters(id),
  version INTEGER NOT NULL,
  docx_path TEXT,
  pdf_path TEXT,
  docx_sha TEXT,
  pdf_sha TEXT,
  reason TEXT,
  revised_by TEXT,
  status TEXT NOT NULL DEFAULT 'Archived',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(letter_id, version)
);

CREATE TABLE letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  letter_kind TEXT NOT NULL DEFAULT 'letter',
  status TEXT NOT NULL DEFAULT 'Draft',
  archive_status TEXT NOT NULL DEFAULT 'None',
  pdf_status TEXT NOT NULL DEFAULT 'None',
  dispatch_status TEXT,
  ack_status TEXT,
  category_id INTEGER REFERENCES categories(id),
  subcategory_id INTEGER REFERENCES subcategories(id),
  category_name TEXT,
  subcategory_name TEXT,
  category_folder TEXT,
  template_id INTEGER REFERENCES templates(id),
  template_version_id INTEGER REFERENCES template_versions(id),
  recipient_id INTEGER REFERENCES recipients(id),
  recipient_office TEXT,
  recipient_name TEXT,
  recipient_designation TEXT,
  recipient_department TEXT,
  recipient_address TEXT,
  subject TEXT,
  letter_date TEXT,
  reference_no TEXT,
  body TEXT,
  summary TEXT,
  enclosures TEXT,
  enclosure_count INTEGER NOT NULL DEFAULT 0,
  remarks TEXT,
  signatory_name TEXT,
  signatory_designation TEXT,
  language TEXT DEFAULT 'en',
  outward_no TEXT UNIQUE,
  outward_seq INTEGER,
  outward_scheme_id INTEGER REFERENCES numbering_schemes(id),
  outward_period TEXT,
  outward_category_key TEXT,
  academic_year TEXT,
  number_reserved_at TEXT,
  number_override INTEGER NOT NULL DEFAULT 0,
  inward_id INTEGER REFERENCES inward(id),
  work_docx_path TEXT,
  work_generated_at TEXT,
  work_generated_sha TEXT,
  archive_dir TEXT,
  docx_path TEXT,
  pdf_path TEXT,
  docx_sha TEXT,
  pdf_sha TEXT,
  pdf_source_sha TEXT,
  pdf_error TEXT,
  current_version INTEGER NOT NULL DEFAULT 0,
  finalized_at TEXT,
  finalized_by TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  deleted_at TEXT,
  dispatch_date TEXT,
  dispatch_mode TEXT,
  tracking_no TEXT,
  courier_service TEXT,
  delivered_date TEXT,
  ack_received_date TEXT,
  dispatch_remarks TEXT,
  extra TEXT
);

CREATE TABLE number_counters (
  scheme_id INTEGER NOT NULL REFERENCES numbering_schemes(id),
  period_key TEXT NOT NULL,
  category_key TEXT NOT NULL DEFAULT '',
  next_value INTEGER NOT NULL,
  PRIMARY KEY (scheme_id, period_key, category_key)
);

CREATE TABLE numbering_schemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK (scope IN ('outward','inward')),
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  separator TEXT NOT NULL DEFAULT '/',
  digits INTEGER NOT NULL DEFAULT 3,
  start_number INTEGER NOT NULL DEFAULT 1,
  reset TEXT NOT NULL DEFAULT 'academic' CHECK (reset IN ('academic','calendar','never')),
  per_category INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  retired_at TEXT
);

CREATE TABLE recent_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  q TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_name TEXT NOT NULL,
  department TEXT,
  recipient_name TEXT,
  designation TEXT,
  address TEXT,
  district TEXT,
  state TEXT,
  pin_code TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  category_id INTEGER REFERENCES categories(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  permissions TEXT NOT NULL,
  system INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  language TEXT DEFAULT 'en',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gr_no TEXT,
  pen TEXT,
  name TEXT NOT NULL,
  gender TEXT,
  dob TEXT,
  is_cwsn TEXT,
  class_name TEXT,
  section TEXT,
  admission_date TEXT,
  father_name TEXT,
  mother_name TEXT,
  guardian_name TEXT,
  mobile TEXT,
  aadhaar TEXT,
  aadhaar_name TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE subcategories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE template_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES templates(id),
  version INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  sha256 TEXT,
  placeholders TEXT,
  note TEXT,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(template_id, version)
);

CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  subcategory_id INTEGER REFERENCES subcategories(id),
  language TEXT NOT NULL DEFAULT 'en',
  description TEXT,
  default_subject TEXT,
  default_body TEXT,
  is_letterhead INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0,
  current_version_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT
);

CREATE TABLE udise_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES udise_submissions(id),
  student_id INTEGER REFERENCES students(id),
  student_name TEXT,
  data TEXT NOT NULL,
  editable_pdf TEXT,
  flat_pdf TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE udise_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_type TEXT NOT NULL,
  letter_id INTEGER REFERENCES letters(id),
  template_id INTEGER NOT NULL REFERENCES udise_templates(id),
  status TEXT NOT NULL DEFAULT 'Prepared',
  student_count INTEGER NOT NULL DEFAULT 0,
  staging_dir TEXT,
  manifest_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE udise_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_type TEXT NOT NULL CHECK (form_type IN ('S02','S03')),
  version_label TEXT NOT NULL,
  file_path TEXT NOT NULL,
  original_name TEXT,
  sha256 TEXT NOT NULL,
  field_names TEXT NOT NULL,
  mapping TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

CREATE INDEX idx_letters_date ON letters(letter_date);

CREATE UNIQUE INDEX idx_letters_seq ON letters(outward_scheme_id, outward_period, outward_category_key, outward_seq) WHERE outward_seq IS NOT NULL;

CREATE INDEX idx_letters_status ON letters(status);

CREATE INDEX idx_letters_year ON letters(academic_year);
