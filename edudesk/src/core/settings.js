'use strict';
const { json } = require('./util');

const DEFAULTS = {
  college: {
    name: '',
    address: '',
    college_code: '',
    index_no: '',
    udise_code: '',
    affiliation: '',
    principal_name: '',
    principal_designation: 'Principal',
    phone: '',
    email: '',
    state: 'Maharashtra',
    district: '',
    block: '',
    hos_contact: '',
    logo_path: '',
    other: [],
  },
  letter: {
    dateFormat: 'DD/MM/YYYY',
    language: 'en',
    signatoryName: '',
    signatoryDesignation: 'Principal',
    defaultTemplateId: null,
  },
  archive: {
    documentsRoot: '',
    fileNamePattern: '{TYPE}_{SEQ}_{AY}_{DATE}_{SUBJECT}',
    fileDateFormat: 'DD-MM-YYYY',
  },
  academic: { startMonth: 6 },
  workflow: { approvalRequired: false, assignNumberAt: 'generate' },
  conversion: { engine: 'auto', libreOfficePath: '', timeoutSeconds: 180 },
  backup: { auto: 'daily', destination: '', keep: 30, lastAutoAt: null },
  ui: { onboardingDone: false, libraryImported: false },
  session: { currentUser: 'owner' },
};

const SECTIONS = Object.keys(DEFAULTS);

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

class Settings {
  constructor(db) {
    this.db = db;
  }

  get(section) {
    if (!SECTIONS.includes(section)) throw new Error(`Unknown settings section ${section}`);
    const row = this.db.get('SELECT value FROM settings WHERE key = ?', [section]);
    return deepMerge(DEFAULTS[section], json(row && row.value, {}));
  }

  all() {
    const out = {};
    for (const s of SECTIONS) out[s] = this.get(s);
    return out;
  }

  set(section, value) {
    if (!SECTIONS.includes(section)) throw new Error(`Unknown settings section ${section}`);
    const merged = deepMerge(this.get(section), value);
    this.db.run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [section, JSON.stringify(merged)]);
    return merged;
  }
}

module.exports = { Settings, DEFAULTS, SECTIONS };
