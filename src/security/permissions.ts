// Role-based access control for organization (enterprise) workspaces.
// The same matrix is mirrored in firebase/firestore.rules so the cloud enforces it;
// the extension uses it to hide/disable actions and to refuse executions.
export type Role = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
export type Action = 'create' | 'edit' | 'execute' | 'share' | 'delete' | 'export' | 'viewAudit' | 'manageMembers' | 'manageSettings' | 'manageDevices';
export type Resource = 'autofill' | 'macros' | 'scripts' | 'snippets' | 'templates' | 'variables' | 'datasets' | 'workspaces' | 'folders';

export const ROLES: Role[] = ['owner', 'admin', 'manager', 'staff', 'viewer'];
export const ACTIONS: Action[] = ['create', 'edit', 'execute', 'share', 'delete', 'export', 'viewAudit', 'manageMembers', 'manageSettings', 'manageDevices'];
export const RESOURCES: Resource[] = ['autofill', 'macros', 'scripts', 'snippets', 'templates', 'variables', 'datasets', 'workspaces', 'folders'];
export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Administrator', manager: 'Manager', staff: 'Staff', viewer: 'Viewer' };
export const ACTION_LABELS: Record<Action, string> = {
  create: 'Create', edit: 'Edit', execute: 'Run', share: 'Share', delete: 'Delete', export: 'Export',
  viewAudit: 'View audit log', manageMembers: 'Manage members', manageSettings: 'Organization settings', manageDevices: 'Manage devices',
};

export const DEFAULT_MATRIX: Record<Role, Action[]> = {
  owner: [...ACTIONS],
  admin: [...ACTIONS],
  manager: ['create', 'edit', 'execute', 'share', 'delete', 'export', 'viewAudit'],
  staff: ['execute', 'create', 'edit'],
  viewer: ['execute'],
};

export interface PermissionPolicy {
  /** Per-role override of the default matrix. */
  roles?: Partial<Record<Role, Action[]>>;
  /** Per-resource override, e.g. scripts: { staff: ['execute'] } */
  resources?: Partial<Record<Resource, Partial<Record<Role, Action[]>>>>;
  /** Per-user grants / denials (deny wins). */
  users?: Record<string, { allow?: Action[]; deny?: Action[] }>;
}

export interface Member { uid: string; role: Role }

const ADMIN_ONLY: Action[] = ['manageMembers', 'manageSettings', 'manageDevices'];

export function roleActions(role: Role, policy: PermissionPolicy = {}, resource?: Resource): Set<Action> {
  if (role === 'owner') return new Set(ACTIONS);
  const base = (resource && policy.resources?.[resource]?.[role]) || policy.roles?.[role] || DEFAULT_MATRIX[role] || [];
  return new Set(base.filter((a) => role === 'admin' || !ADMIN_ONLY.includes(a) || (policy.roles?.[role] || []).includes(a)));
}

export function can(member: Member | null | undefined, action: Action, policy: PermissionPolicy = {}, resource?: Resource): boolean {
  if (!member) return false;
  if (member.role === 'owner') return true;
  const u = policy.users?.[member.uid];
  if (u?.deny?.includes(action)) return false;
  if (u?.allow?.includes(action) && !ADMIN_ONLY.includes(action)) return true;
  return roleActions(member.role, policy, resource).has(action);
}

/** Who may change whose role: owners anything except removing themselves, admins can't touch owners/admins. */
export function canManage(actor: Member, target: Member): boolean {
  if (actor.uid === target.uid) return false;
  if (actor.role === 'owner') return true;
  if (actor.role === 'admin') return target.role !== 'owner' && target.role !== 'admin';
  return false;
}

export function assignableRoles(actor: Member): Role[] {
  if (actor.role === 'owner') return ['admin', 'manager', 'staff', 'viewer'];
  if (actor.role === 'admin') return ['manager', 'staff', 'viewer'];
  return [];
}

/** Firestore-friendly flattened map: { "<role>": ["create", ...] } for every role (used by rules). */
export function flattenPolicy(policy: PermissionPolicy): Record<string, Action[]> {
  const out: Record<string, Action[]> = {};
  for (const r of ROLES) out[r] = [...roleActions(r, policy)];
  return out;
}
