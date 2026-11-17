// Every identifier K-Flow Automation uses in shared browser spaces is namespaced so
// it can coexist with other extensions (e.g. Jot Hub) without any collision.
export const NS = 'kf';
export const DB_NAME = 'k-flow-db';
export const DB_VERSION = 2;
export const STORAGE_KEYS = {
  settings: 'kf.settings',
  cloud: 'kf.cloudConfig',
  revision: 'kf.revision',
  sync: 'kf.syncState',
  picked: 'kf.pickedElement',
  pausedSites: 'kf.pausedSites',
} as const;
export const MSG = {
  getIndex: 'kf/getIndex',
  expand: 'kf/expand',
  claimForm: 'kf/claimForm',
  recordUsage: 'kf/recordUsage',
  openDashboard: 'kf/openDashboard',
  listForAssistant: 'kf/listForAssistant',
  getWorkflow: 'kf/getWorkflow',
  listWorkflows: 'kf/listWorkflows',
  picked: 'kf/picked',
  // background -> content
  openAssistant: 'kf/openAssistant',
  runWorkflow: 'kf/runWorkflow',
  startPicker: 'kf/startPicker',
  insertSnippet: 'kf/insertSnippet',
  ping: 'kf/ping',
  insertText: 'kf/insertText',
} as const;
export const OVERLAY_MSG = 'kf-overlay';
export const FIREBASE_APP_NAME = 'k-flow';
export const MAX_SHORTCUT_LEN = 48;
export const APP_NAME = 'K-Flow Automation';
