import type { Settings, CloudConfig } from './types';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  expansionEnabled: true,
  triggerMode: 'immediate',
  delimiters: ' \t\n.,;:!?)]}\'"',
  keepDelimiter: true,
  caseSensitive: true,
  wordBoundary: true,
  assistantHotkey: 'Ctrl+Shift+Space',
  showFloatingButton: false,
  showToasts: true,
  blockedSites: [],
  dateFormat: 'DD MMM YYYY',
  timeFormat: 'h:mm A',
  locale: 'en-US',
  currency: 'USD',
  profile: { name: '', email: '', phone: '', company: '', title: '', website: '', signature: '' },
  // No billing exists yet. "pro" keeps personal use unrestricted while plan limits
  // stay fully configurable in src/shared/plans.ts.
  plan: 'enterprise',
  enforcePlanLimits: true,
  googleDocsExperimental: false,
  autoSync: true,
  conflictStrategy: 'newest',
  syncSettings: true,
  onboarded: false,
  actionOpens: 'popup',
  activeWorkspaceId: 'ws_general',
  automation: {
    waitTimeoutMs: 8000,
    stepDelayMs: 150,
    highlight: true,
    autoRunEnabled: true,
    autofillHotkey: 'Alt+Shift+F',
    historyLimit: 500,
    respectExistingValues: false,
  },
  ai: { provider: 'none', model: '', baseUrl: '', allowPageContext: true },
  security: {
    automationAllowlist: [],
    officialDomains: ['gov.in', 'nic.in', 'udiseplus.gov.in', 'mahahsscboard.in', 'mahafyjcadmissions.in', 'maharashtra.gov.in', 'mahadbt.maharashtra.gov.in'],
    scriptsEnabled: true,
    vaultAutoLockMin: 15,
    auditEnabled: true,
    syncSensitive: false,
  },
};

export function mergeSettings(s: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(s || {}),
    profile: { ...DEFAULT_SETTINGS.profile, ...(s?.profile || {}) },
    automation: { ...DEFAULT_SETTINGS.automation, ...(s?.automation || {}) },
    ai: { ...DEFAULT_SETTINGS.ai, ...(s?.ai || {}) },
    security: { ...DEFAULT_SETTINGS.security, ...(s?.security || {}) },
  };
}

// Build-time Firebase configuration (from .env). Runtime configuration entered in
// Settings takes precedence, see cloud/config.ts.
export function buildTimeCloudConfig(): CloudConfig {
  const env = (import.meta as any).env || {};
  const apiKey = env.VITE_FIREBASE_API_KEY;
  return {
    firebase: apiKey
      ? {
          apiKey,
          authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: env.VITE_FIREBASE_PROJECT_ID,
          storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId: env.VITE_FIREBASE_APP_ID,
        }
      : null,
    googleClientId: env.VITE_GOOGLE_OAUTH_CLIENT_ID || '',
  };
}
