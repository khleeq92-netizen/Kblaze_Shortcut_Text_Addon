// Core data model for K-Flow Automation. All records are local-first (IndexedDB) and
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
  /** K-Flow workspace the record belongs to (college / trading / general / custom). */
  workspaceId?: string;
  /** Set when the record is shared from an organization (enterprise). */
  orgId?: string | null;
  /** Monotonic version number, bumped on every save (profile versioning). */
  version?: number;
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
  /** Where the dataset came from (re-import / refresh). */
  source?: DataSourceRef;
  /** Column key that uniquely identifies a record (duplicate detection, record lookup). */
  keyColumn?: string;
  /** Column keys whose values must be present (missing-field detection). */
  requiredColumns?: string[];
  /** Column keys whose values are encrypted at rest (Aadhaar, phone, passwords…). */
  sensitiveColumns?: string[];
  /** Row currently selected for autofill / macros ("active record"). */
  currentRowId?: string | null;
}

export type DataSourceKind = 'manual' | 'csv' | 'xlsx' | 'json' | 'gsheet' | 'gsheet-public';
export interface DataSourceRef {
  kind: DataSourceKind;
  /** File name, spreadsheet id or URL. */
  ref?: string;
  sheet?: string;
  range?: string;
  importedAt?: number;
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
export type AIProvider = 'none' | 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';

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
  /** What a click on the toolbar icon opens. */
  actionOpens: 'popup' | 'sidepanel';
  /** Currently selected K-Flow workspace. */
  activeWorkspaceId: string;
  automation: AutomationSettings;
  ai: AISettings;
  security: SecuritySettings;
}

export interface AutomationSettings {
  /** Default time to wait for a field / element to appear (dynamic pages). */
  waitTimeoutMs: number;
  /** Delay between macro steps. */
  stepDelayMs: number;
  /** Highlight fields while autofilling. */
  highlight: boolean;
  /** Run autofill profiles marked "on page load" automatically. */
  autoRunEnabled: boolean;
  /** Global keyboard shortcut (in page) for "autofill this page". */
  autofillHotkey: string;
  /** Keep this many execution history entries. */
  historyLimit: number;
  /** Skip fields that already have a value unless the rule says "always overwrite". */
  respectExistingValues: boolean;
}

export interface AISettings {
  provider: AIProvider;
  model: string;
  /** Only for openai-compatible providers. */
  baseUrl: string;
  /** Send field labels / column names of the current page to the provider (never values). */
  allowPageContext: boolean;
}

export interface SecuritySettings {
  /** Hosts on which macros / scripts / autofill may run. Empty = all sites (except blocked). */
  automationAllowlist: string[];
  /** Require a confirmation before any submit-like click on these (government/official) domains. */
  officialDomains: string[];
  /** Allow running custom JavaScript at all. */
  scriptsEnabled: boolean;
  /** Auto-lock the vault after N minutes of inactivity. */
  vaultAutoLockMin: number;
  /** Write local audit log entries. */
  auditEnabled: boolean;
  /** Include sensitive (encrypted) dataset columns in cloud sync — needs a sync passphrase. */
  syncSensitive: boolean;
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

export type CollectionName = 'snippets' | 'folders' | 'tables' | 'workflows' | 'templates' | 'workspaces' | 'autofill' | 'macros' | 'scripts' | 'variables' | 'vault';

export interface ExportBundle {
  format: 'k-flow';
  version: 1;
  exportedAt: number;
  snippets: Snippet[];
  folders: Folder[];
  tables?: DataTable[];
  workflows?: Workflow[];
  templates?: UserTemplate[];
  workspaces?: Workspace[];
  autofill?: AutofillProfile[];
  macros?: Macro[];
  scripts?: ScriptRecord[];
  variables?: Variable[];
  settings?: Partial<Settings>;
}

// ===================================================================
// K-Flow automation model
// ===================================================================

export type WorkspaceKind = 'college' | 'trading' | 'general' | 'custom';
export interface Workspace extends BaseRecord {
  name: string;
  kind: WorkspaceKind;
  description?: string;
  color: string;
  /** lucide icon name */
  icon: string;
  /** Snippets in this workspace expand while typing. */
  expansionActive: boolean;
  /** Hosts this workspace's automations are meant for (informational + suggestions). */
  domains: string[];
  /** Extra hosts treated as official/government for this workspace (submit confirmation). */
  officialDomains: string[];
  archived?: boolean;
}

/** How a site is matched. `domain` matches the host and its subdomains. */
export type SiteMatchKind = 'domain' | 'prefix' | 'wildcard' | 'regex' | 'any';
export interface SitePattern { kind: SiteMatchKind; value: string }

export type TargetBy = 'auto' | 'css' | 'xpath' | 'id' | 'name' | 'label' | 'regex' | 'placeholder' | 'aria';
export interface ElementTarget {
  by: TargetBy;
  value: string;
  /** Fallbacks tried in order if the primary target is not found. */
  fallbacks?: { by: TargetBy; value: string }[];
  /** Index if the target matches several elements (0-based). */
  nth?: number;
  /** CSS selector of the (same-origin) iframe that contains the element. */
  frame?: string;
}

export type FieldKind = 'text' | 'number' | 'email' | 'tel' | 'date' | 'time' | 'datetime' | 'month' | 'url' | 'password' | 'textarea' | 'select' | 'multiselect' | 'radio' | 'checkbox' | 'contenteditable' | 'combobox' | 'file' | 'hidden' | 'button' | 'other';

export type AutofillAction = 'fill' | 'select' | 'check' | 'uncheck' | 'radio' | 'click' | 'clear' | 'focus';
export interface AutofillRule {
  id: ID;
  enabled: boolean;
  /** Human label shown in the editor ("Student name"). */
  label: string;
  target: ElementTarget;
  action: AutofillAction;
  /** Value template: static text or {{variables}} / {{column}} / formulas. */
  value: string;
  /** Optional condition (formula) — rule runs only when it is truthy. e.g. gender = "Female" */
  condition?: string;
  /** Rule applies only on pages whose URL matches (multi-page forms). */
  page?: SitePattern | null;
  /** Expected field type (validation in preview). */
  fieldKind?: FieldKind | 'auto';
  overwrite: 'always' | 'ifEmpty';
  /** Wait this long for the element (dynamic fields). 0 = automation default. */
  waitMs?: number;
  delayAfterMs?: number;
  /** Values that need extra care — never logged in history. */
  sensitive?: boolean;
  /** For date fields: format the value is typed in (e.g. DD/MM/YYYY). */
  dateFormat?: string;
  /** Allow filling hidden inputs (off by default). */
  includeHidden?: boolean;
}

export interface AutofillProfile extends BaseRecord {
  name: string;
  description?: string;
  enabled: boolean;
  sites: SitePattern[];
  rules: AutofillRule[];
  /** Dataset providing {{column}} values; uses the dataset's active record. */
  datasetId?: string | null;
  runMode: 'manual' | 'pageLoad';
  /** In-page shortcut, e.g. Alt+1 */
  shortcut?: string;
  /** Delay between fields (some portals need it). */
  fieldDelayMs?: number;
  tags: string[];
  /** Portal / academic year labels for college workspace profiles. */
  portal?: string;
  academicYear?: string;
  /** Built-in starter profile – selectors must be verified on the real portal. */
  starter?: boolean;
}

export type MacroStepType =
  | 'click' | 'type' | 'select' | 'check' | 'uncheck' | 'radio' | 'scroll' | 'navigate' | 'waitFor' | 'waitGone'
  | 'delay' | 'key' | 'autofill' | 'script' | 'extract' | 'assert' | 'confirm' | 'label' | 'goto' | 'stop' | 'snippet' | 'hover' | 'focus' | 'nextRecord';

export interface StepCondition {
  kind: 'exists' | 'notExists' | 'visible' | 'textContains' | 'valueEquals' | 'urlMatches' | 'formula';
  target?: ElementTarget;
  value?: string;
}

export interface MacroStep {
  id: ID;
  type: MacroStepType;
  target?: ElementTarget;
  /** Text / option / key / URL / variable name / label name, depending on the type. */
  value?: string;
  ms?: number;
  /** scroll: x,y or "element" */
  x?: number;
  y?: number;
  /** Run only if the condition holds. */
  condition?: StepCondition | null;
  /** Error handling for this step. */
  onError?: 'default' | 'stop' | 'continue' | 'retry';
  retries?: number;
  clear?: boolean;
  /** goto: maximum number of jumps (loop limit). */
  maxIterations?: number;
  /** Reference for autofill / script / snippet steps. */
  refId?: ID;
  note?: string;
  disabled?: boolean;
  /** Recorded steps keep the page they were captured on. */
  url?: string;
  sensitive?: boolean;
}

export interface MacroSettings {
  stepDelayMs: number;
  retries: number;
  retryDelayMs: number;
  timeoutMs: number;
  onError: 'stop' | 'continue';
  /** Speed multiplier for recorded delays. */
  speed: number;
}

export interface Macro extends BaseRecord {
  name: string;
  description?: string;
  enabled: boolean;
  sites: SitePattern[];
  steps: MacroStep[];
  settings: MacroSettings;
  datasetId?: string | null;
  shortcut?: string;
  tags: string[];
  /** Start URL used when the macro is run from the dashboard. */
  startUrl?: string;
}

export interface ScriptRecord extends BaseRecord {
  name: string;
  description?: string;
  enabled: boolean;
  code: string;
  sites: SitePattern[];
  runMode: 'manual' | 'pageLoad';
  timeoutMs: number;
  maxLoopIterations: number;
  datasetId?: string | null;
  tags: string[];
  /** Reusable library script – its functions are available to other scripts via kf.require(name). */
  library?: boolean;
}

export type VariableKind = 'static' | 'formula' | 'date' | 'random' | 'dataset' | 'conditional' | 'list' | 'secret' | 'counter';
export interface Variable extends BaseRecord {
  /** Name used in templates: {{name}} */
  name: string;
  label?: string;
  kind: VariableKind;
  /** static: the text; formula/conditional: formula; date: date expression (today, +7d…); random: spec */
  value: string;
  /** date: output format, number formats etc. */
  format?: string;
  /** dataset: table + column; null workspaceId on the record = global variable */
  datasetId?: string | null;
  column?: string;
  /** Only for one autofill profile / macro. */
  scopeRef?: ID | null;
  /** conditional: ordered branches; first truthy condition wins, else `value`. */
  branches?: { when: string; then: string }[];
  /** list: options for random choice */
  options?: string[];
  description?: string;
  /** counter: current value (incremented on use by executions). */
  counter?: number;
}

/** Credentials / secrets encrypted with the vault key (passphrase). */
export interface VaultEntry extends BaseRecord {
  name: string;
  /** usable as {{vault.key}} */
  key: string;
  username?: string;
  /** AES-GCM ciphertext of the secret (base64) */
  cipher: string;
  iv: string;
  domains: string[];
  note?: string;
}

export type ExecutionKind = 'autofill' | 'macro' | 'script' | 'batch' | 'expansion' | 'ai';
export type ExecutionStatus = 'running' | 'success' | 'failed' | 'partial' | 'stopped';
export interface ExecutionStepLog { i: number; label: string; status: 'done' | 'fail' | 'skip' | 'warn'; ms?: number; error?: string }
export interface Execution {
  id: ID;
  kind: ExecutionKind;
  refId: ID;
  name: string;
  workspaceId?: string;
  startedAt: number;
  endedAt?: number;
  status: ExecutionStatus;
  url?: string;
  host?: string;
  steps: ExecutionStepLog[];
  error?: string;
  /** dataset record used */
  recordId?: string | null;
  recordLabel?: string;
  logs?: string[];
  filled?: number;
  failed?: number;
  skipped?: number;
}

export interface AuditEntry {
  id: ID;
  at: number;
  actor: string;
  action: string;
  resource: string;
  resourceId?: string;
  name?: string;
  details?: string;
  workspaceId?: string;
  orgId?: string | null;
}

export interface VersionEntry {
  id: ID;
  collection: CollectionName;
  recordId: ID;
  version: number;
  at: number;
  actor: string;
  name: string;
  snapshot: any;
}

export interface DetectedField {
  kind: FieldKind;
  label: string;
  name: string;
  id: string;
  placeholder: string;
  required: boolean;
  options?: { value: string; label: string }[];
  css: string;
  xpath: string;
  value?: string;
  hidden: boolean;
  frame?: string;
  maxLength?: number;
  pattern?: string;
  group?: string;
}
