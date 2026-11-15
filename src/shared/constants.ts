// Every identifier QuickText Hub uses in shared browser spaces is namespaced so
// it can coexist with other extensions (e.g. Jot Hub) without any collision.
export const NS = 'qth';
export const DB_NAME = 'quicktext-hub-db';
export const DB_VERSION = 1;
export const STORAGE_KEYS = {
  settings: 'qth.settings',
  cloud: 'qth.cloudConfig',
  revision: 'qth.revision',
  sync: 'qth.syncState',
  picked: 'qth.pickedElement',
  pausedSites: 'qth.pausedSites',
} as const;
export const MSG = {
  getIndex: 'qth/getIndex',
  expand: 'qth/expand',
  claimForm: 'qth/claimForm',
  recordUsage: 'qth/recordUsage',
  openDashboard: 'qth/openDashboard',
  listForAssistant: 'qth/listForAssistant',
  getWorkflow: 'qth/getWorkflow',
  listWorkflows: 'qth/listWorkflows',
  picked: 'qth/picked',
  // background -> content
  openAssistant: 'qth/openAssistant',
  runWorkflow: 'qth/runWorkflow',
  startPicker: 'qth/startPicker',
  insertSnippet: 'qth/insertSnippet',
  ping: 'qth/ping',
  insertText: 'qth/insertText',
} as const;
export const OVERLAY_MSG = 'qth-overlay';
export const FIREBASE_APP_NAME = 'quicktext-hub';
export const MAX_SHORTCUT_LEN = 48;
export const APP_NAME = 'QuickText Hub';
