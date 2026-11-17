// Locally cached organization membership + policy (written by the cloud layer
// after each sync). Used by the background worker and pages to enforce RBAC on
// organization-shared automations, the domain allowlist and feature policies.
import { storageGet, storageSet } from './browser';
import { can, type Action, type Resource, type Role, type PermissionPolicy } from '../security/permissions';

export const ORG_KEY = 'kf.org';

export interface OrgPolicies {
  /** Domains where automations may run (in addition to personal allowlist). Empty = no restriction. */
  allowedDomains: string[];
  disableScripts: boolean;
  disableAI: boolean;
  requireConfirmOnSubmit: boolean;
  /** Allow members to sync encrypted sensitive datasets. */
  allowSensitiveSync: boolean;
  /** Push activity (execution summaries, no values) to the organization log. */
  activityMonitoring: boolean;
}
export const DEFAULT_POLICIES: OrgPolicies = { allowedDomains: [], disableScripts: false, disableAI: false, requireConfirmOnSubmit: true, allowSensitiveSync: false, activityMonitoring: true };

export interface OrgState {
  orgId: string;
  orgName: string;
  uid: string;
  email: string;
  role: Role;
  permissions: PermissionPolicy;
  policies: OrgPolicies;
  deviceId: string;
  revoked: boolean;
  updatedAt: number;
}

export async function getOrgState(): Promise<OrgState | null> {
  return (await storageGet<OrgState>(ORG_KEY)) || null;
}
export async function setOrgState(s: OrgState | null) {
  await storageSet(ORG_KEY, s);
}

/** Personal (non-org) records are always allowed for their owner. */
export function canOnRecord(org: OrgState | null, rec: { orgId?: string | null } | null | undefined, action: Action, resource: Resource): boolean {
  if (!rec?.orgId) return true;
  if (!org || org.orgId !== rec.orgId || org.revoked) return false;
  return can({ uid: org.uid, role: org.role }, action, org.permissions, resource);
}

export function orgCan(org: OrgState | null, action: Action, resource?: Resource): boolean {
  if (!org || org.revoked) return false;
  return can({ uid: org.uid, role: org.role }, action, org.permissions, resource);
}

const DEVICE_KEY = 'kf.deviceId';
export async function deviceId(): Promise<string> {
  let id = await storageGet<string>(DEVICE_KEY);
  if (!id) {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    id = 'dev_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    await storageSet(DEVICE_KEY, id);
  }
  return id;
}
