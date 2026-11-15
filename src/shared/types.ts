// Core data model for QuickText Hub. All records are local-first (IndexedDB) and
// optionally mirrored to Firestore. Every record carries timestamps + a tombstone
// flag so the sync engine can merge changes from several devices.

export type ID = string;

export interface BaseRecord {
  id: ID;
  createdAt: number;
  updatedAt: number;
  /** Tombstone: record was deleted but deletion is not yet propagated to cloud. */
  deleted?: boolean;
  /** Set when the record belongs to a team workspace (Business plan). */
  teamId?: string | null;
}

export type ContentType = 'text' | 'html';
export type TriggerMode = 'immediate' | 'delimiter';

export interface Snippet extends BaseRecord {
  name: string;
  shortcut: string;
  content: string;
  contentType: ContentType;
  folderId: ID | null;
  enabled: boolean;
  favorite: boolean;
  pinned: boolean;
  description?: string;
  tags: string[];
  /** Per-snippet override of the global trigger mode. */
  trigger?: 'default' | TriggerMode;
  source?: { kind: 'template' | 'marketplace' | 'share' | 'team' | 'import'; ref?: string };
  readOnly?: boolean;
}

export interface Folder extends BaseRecord {
  name: string;
  parentId: ID | null;
  order: number;
  color?: string;
}

export type ColumnType = 'text' | 'number' | 'email' | 'phone' | 'date' | 'category' | 'url' | 'boolean';

export interface DataColumn {
  id: ID;
  name: string;
  /** Identifier used in templates: data.<table>.<key> */
  key: string;
  type: ColumnType;
  options?: string[];
}

export interface DataRow {
  id: ID;
  values: Record<string, string | number | boolean | null>;
}

export interface DataTable extends BaseRecord {
  name: string;
  /** Identifier used in templates: data.<key> */
  key: string;
  description?: string;
  columns: DataColumn[];
  rows: DataRow[];
}

export type WorkflowStepType =
  | 'focus'
  | 'type'
  | 'tab'
  | 'select'
  | 'check'
  | 'click'
  | 'key'
  | 'wait'
  | 'waitFor'
  | 'snippet'
  | 'confirm';

export type TargetKind = 'focused' | 'selector' | 'label';

export interface WorkflowStep {
  id: ID;
  type: WorkflowStepType;
  target?: { kind: TargetKind; value: string };
  /** text for "type", option label/value for "select", key name for "key", message for "confirm" */
  value?: string;
  /** snippet id for "snippet" step */
  snippetId?: ID;
  ms?: number;
  checked?: boolean;
  /** Forces a confirmation prompt before the step runs. */
  requireConfirm?: boolean;
  /** Replace existing field content instead of appending (type step). */
  clear?: boolean;
  note?: string;
}

export interface Workflow extends BaseRecord {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  /** Optional: limit to sites whose host contains this text. */
  siteFilter?: string;
  enabled: boolean;
}

export interface UserTemplate extends BaseRecord {
  name: string;
  category: string;
  description?: string;
  shortcut: string;
  content: string;
  contentType: ContentType;
}

export interface UsageRecord {
  snippetId: ID;
  count: number;
  lastUsedAt: number;
  /** yyyy-mm-dd -> count (last 90 days kept) */
  daily: Record<string, number>;
}

export interface Profile {
  name: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  website: string;
  signature: string;
}

export type PlanId = 'free' | 'pro' | 'business' | 'enterprise';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  expansionEnabled: boolean;
  triggerMode: TriggerMode;
  /** Characters that complete a shortcut in "delimiter" mode. */
  delimiters: string;
  keepDelimiter: boolean;
  caseSensitive: boolean;
  /** Only expand when the shortcut starts at a word boundary. */
  wordBoundary: boolean;
  assistantHotkey: string;
  showFloatingButton: boolean;
  showToasts: boolean;
  blockedSites: string[];
  dateFormat: string;
  timeFormat: string;
  locale: string;
  currency: string;
  profile: Profile;
  plan: PlanId;
  enforcePlanLimits: boolean;
  googleDocsExperimental: boolean;
  autoSync: boolean;
  conflictStrategy: 'newest' | 'keep-both';
  syncSettings: boolean;
  onboarded: boolean;
}

export interface CloudConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId: string;
  } | null;
  googleClientId: string;
}

export interface SyncState {
  status: 'disabled' | 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncAt: number | null;
  lastError?: string;
  uid?: string | null;
  email?: string | null;
  conflicts: ConflictEntry[];
}

export interface ConflictEntry {
  at: number;
  collection: string;
  id: ID;
  name: string;
  resolution: 'local-won' | 'remote-won' | 'kept-both';
}

export type CollectionName = 'snippets' | 'folders' | 'tables' | 'workflows' | 'templates';

export interface ExportBundle {
  format: 'quicktext-hub';
  version: 1;
  exportedAt: number;
  snippets: Snippet[];
  folders: Folder[];
  tables?: DataTable[];
  workflows?: Workflow[];
  templates?: UserTemplate[];
  settings?: Partial<Settings>;
}
