import { describe, it, expect } from 'vitest';
import { can, canManage, assignableRoles, roleActions, flattenPolicy, ACTIONS } from '@/security/permissions';
import { canOnRecord, orgCan, DEFAULT_POLICIES, type OrgState } from '@/shared/orgState';

const org = (role: any, permissions = {}): OrgState => ({ orgId: 'o1', orgName: 'College', uid: 'u1', email: 'x', role, permissions, policies: DEFAULT_POLICIES, deviceId: 'd', revoked: false, updatedAt: 0 });

describe('role-based access control', () => {
  it('default matrix', () => {
    expect(ACTIONS.every((a) => can({ uid: 'o', role: 'owner' }, a))).toBe(true);
    expect(can({ uid: 'a', role: 'admin' }, 'manageMembers')).toBe(true);
    expect(can({ uid: 'm', role: 'manager' }, 'delete')).toBe(true);
    expect(can({ uid: 'm', role: 'manager' }, 'manageMembers')).toBe(false);
    expect(can({ uid: 's', role: 'staff' }, 'execute')).toBe(true);
    expect(can({ uid: 's', role: 'staff' }, 'delete')).toBe(false);
    expect(can({ uid: 's', role: 'staff' }, 'share')).toBe(false);
    expect(can({ uid: 'v', role: 'viewer' }, 'edit')).toBe(false);
    expect(can(null, 'execute')).toBe(false);
  });
  it('custom role, resource and per-user policies; deny wins; admin powers cannot be granted per user', () => {
    const p = { roles: { staff: ['execute' as const] }, resources: { scripts: { manager: ['execute' as const] } }, users: { u2: { deny: ['execute' as const] }, u3: { allow: ['delete' as const, 'manageMembers' as const] } } };
    expect(can({ uid: 'x', role: 'staff' }, 'edit', p)).toBe(false);
    expect(can({ uid: 'x', role: 'manager' }, 'edit', p, 'scripts')).toBe(false);
    expect(can({ uid: 'x', role: 'manager' }, 'edit', p, 'macros')).toBe(true);
    expect(can({ uid: 'u2', role: 'staff' }, 'execute', p)).toBe(false);
    expect(can({ uid: 'u3', role: 'staff' }, 'delete', p)).toBe(true);
    expect(can({ uid: 'u3', role: 'staff' }, 'manageMembers', p)).toBe(false);
    expect(roleActions('manager', { roles: { manager: ['execute', 'manageMembers'] } }).has('manageMembers')).toBe(true);
    expect(flattenPolicy({}).owner.length).toBe(ACTIONS.length);
  });
  it('who may manage whom', () => {
    expect(canManage({ uid: 'o', role: 'owner' }, { uid: 'a', role: 'admin' })).toBe(true);
    expect(canManage({ uid: 'a', role: 'admin' }, { uid: 'a2', role: 'admin' })).toBe(false);
    expect(canManage({ uid: 'a', role: 'admin' }, { uid: 's', role: 'staff' })).toBe(true);
    expect(canManage({ uid: 'a', role: 'admin' }, { uid: 'a', role: 'admin' })).toBe(false);
    expect(assignableRoles({ uid: 'a', role: 'admin' })).not.toContain('admin');
    expect(assignableRoles({ uid: 's', role: 'staff' })).toEqual([]);
  });
  it('record-level checks: personal records always allowed, other orgs and revoked devices never', () => {
    expect(canOnRecord(null, { orgId: null }, 'delete', 'macros')).toBe(true);
    expect(canOnRecord(org('viewer'), { orgId: 'o1' }, 'execute', 'macros')).toBe(true);
    expect(canOnRecord(org('viewer'), { orgId: 'o1' }, 'edit', 'macros')).toBe(false);
    expect(canOnRecord(org('owner'), { orgId: 'other' }, 'execute', 'macros')).toBe(false);
    expect(canOnRecord({ ...org('owner'), revoked: true }, { orgId: 'o1' }, 'execute', 'macros')).toBe(false);
    expect(orgCan(org('staff'), 'viewAudit')).toBe(false);
    expect(orgCan(org('manager'), 'viewAudit')).toBe(true);
  });
});
