// Commercial plan definitions. No payment gateway exists: the active plan is a
// local setting. Change limits here to activate commercial tiers later.
import type { PlanId } from './types';

export type Feature =
  | 'dynamicForms'
  | 'formulas'
  | 'conditionals'
  | 'richText'
  | 'dataHub'
  | 'autopilot'
  | 'analytics'
  | 'sharing'
  | 'marketplaceSubmit'
  | 'cloudSync'
  | 'teams'
  | 'teamAnalytics'
  | 'auditLogs'
  | 'roles';

export interface PlanDef {
  id: PlanId;
  name: string;
  tagline: string;
  limits: { snippets: number; folders: number; tables: number; workflows: number; libraryTemplates: number; teamMembers: number };
  features: Feature[];
}

const ALL_PERSONAL: Feature[] = ['dynamicForms', 'formulas', 'conditionals', 'richText', 'dataHub', 'autopilot', 'analytics', 'sharing', 'marketplaceSubmit', 'cloudSync'];

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Basic text expansion for individuals',
    limits: { snippets: 40, folders: 5, tables: 1, workflows: 1, libraryTemplates: 10, teamMembers: 0 },
    features: ['dynamicForms', 'sharing', 'cloudSync'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Advanced forms, formulas, rich content and analytics',
    limits: { snippets: 5000, folders: 500, tables: 50, workflows: 100, libraryTemplates: Infinity, teamMembers: 0 },
    features: ALL_PERSONAL,
  },
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'Teams, shared folders, roles and team analytics',
    limits: { snippets: 20000, folders: 2000, tables: 200, workflows: 500, libraryTemplates: Infinity, teamMembers: 250 },
    features: [...ALL_PERSONAL, 'teams', 'teamAnalytics', 'roles'],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom limits, access management and audit logs',
    limits: { snippets: Infinity, folders: Infinity, tables: Infinity, workflows: Infinity, libraryTemplates: Infinity, teamMembers: Infinity },
    features: [...ALL_PERSONAL, 'teams', 'teamAnalytics', 'roles', 'auditLogs'],
  },
};

export function planOf(id: PlanId | undefined): PlanDef {
  return PLANS[id || 'pro'] || PLANS.pro;
}
export function hasFeature(plan: PlanId, feature: Feature, enforce = true): boolean {
  return !enforce || planOf(plan).features.includes(feature);
}
export function limitOf(plan: PlanId, key: keyof PlanDef['limits'], enforce = true): number {
  return enforce ? planOf(plan).limits[key] : Infinity;
}
export const FEATURE_LABELS: Record<Feature, string> = {
  dynamicForms: 'Dynamic forms',
  formulas: 'Formulas & calculations',
  conditionals: 'Conditional rules',
  richText: 'Rich text snippets',
  dataHub: 'Data Hub',
  autopilot: 'Autopilot workflows',
  analytics: 'Usage analytics',
  sharing: 'Sharing',
  marketplaceSubmit: 'Marketplace submissions',
  cloudSync: 'Cloud sync',
  teams: 'Team workspaces',
  teamAnalytics: 'Team analytics',
  auditLogs: 'Audit logs',
  roles: 'Roles & permissions',
};
