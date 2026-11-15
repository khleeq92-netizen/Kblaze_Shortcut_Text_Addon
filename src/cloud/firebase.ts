// Firebase bootstrap. Loaded lazily (dynamic import) by the dashboard only, so the
// content script, background worker and popup never ship Firebase.
// Uses a dedicated named app ("quicktext-hub") and its own IndexedDB persistence,
// so it never collides with another extension's Firebase project.
import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, signOut as fbSignOut, GoogleAuthProvider, signInWithCredential, updateProfile, type Auth, type User,
} from 'firebase/auth/web-extension';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { FIREBASE_APP_NAME } from '../shared/constants';
import { loadCloudConfig } from '../shared/settings';
import { api } from '../shared/browser';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let configKey = '';

export async function getFirebase(): Promise<{ app: FirebaseApp; auth: Auth; db: Firestore } | null> {
  const cfg = await loadCloudConfig();
  if (!cfg.firebase?.apiKey || !cfg.firebase.projectId) return null;
  const key = JSON.stringify(cfg.firebase);
  if (app && key === configKey) return { app, auth: auth!, db: db! };
  if (app) { await deleteApp(app).catch(() => {}); app = null; }
  const existing = getApps().find((a) => a.name === FIREBASE_APP_NAME);
  app = existing || initializeApp(cfg.firebase, FIREBASE_APP_NAME);
  auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  configKey = key;
  return { app, auth, db };
}

export async function isCloudConfigured() {
  return !!(await loadCloudConfig()).firebase?.apiKey;
}

export async function onUser(cb: (u: User | null) => void): Promise<() => void> {
  const fb = await getFirebase();
  if (!fb) { cb(null); return () => {}; }
  return onAuthStateChanged(fb.auth, cb);
}

function friendly(e: any): Error {
  const code = String(e?.code || '');
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'No account exists for this email.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in your Firebase project (Authentication → Sign-in method).',
    'auth/unauthorized-domain': 'This extension origin is not an authorized domain in Firebase Authentication settings.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase API key is not valid. Check Settings → Cloud.',
  };
  return new Error(map[code] || e?.message || String(e));
}

async function needAuth() {
  const fb = await getFirebase();
  if (!fb) throw new Error('Cloud features are not configured. Add your Firebase config in Settings → Cloud & Account.');
  return fb.auth;
}

export async function signInEmail(email: string, password: string) {
  try { return (await signInWithEmailAndPassword(await needAuth(), email.trim(), password)).user; } catch (e) { throw friendly(e); }
}
export async function signUpEmail(email: string, password: string, name: string) {
  try {
    const u = (await createUserWithEmailAndPassword(await needAuth(), email.trim(), password)).user;
    if (name) await updateProfile(u, { displayName: name });
    await sendEmailVerification(u).catch(() => {});
    return u;
  } catch (e) { throw friendly(e); }
}
export async function resetPassword(email: string) {
  try { await sendPasswordResetEmail(await needAuth(), email.trim()); } catch (e) { throw friendly(e); }
}
export async function signOut() {
  const fb = await getFirebase();
  if (fb) await fbSignOut(fb.auth);
}

/**
 * Google Sign-In for MV3 extensions: OAuth implicit flow through
 * chrome.identity.launchWebAuthFlow (works in Chrome and Firefox), then exchange
 * the Google ID token for a Firebase credential.
 */
export async function signInGoogle() {
  const authInst = await needAuth();
  const { googleClientId } = await loadCloudConfig();
  if (!googleClientId) throw new Error('Google Sign-In needs an OAuth Client ID. Add it in Settings → Cloud & Account (see docs/FIREBASE_SETUP.md).');
  if (!api.identity?.launchWebAuthFlow) throw new Error('This browser does not support chrome.identity.');
  const redirect = api.identity.getRedirectURL();
  const nonce = crypto.getRandomValues(new Uint32Array(4)).join('');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', googleClientId);
  url.searchParams.set('response_type', 'id_token');
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('prompt', 'select_account');
  const resultUrl: string = await new Promise((resolve, reject) =>
    api.identity.launchWebAuthFlow({ url: url.toString(), interactive: true }, (r) => {
      if (api.runtime.lastError || !r) reject(new Error(api.runtime.lastError?.message || 'Sign-in was cancelled'));
      else resolve(r);
    }),
  );
  const params = new URLSearchParams(new URL(resultUrl).hash.slice(1));
  const idToken = params.get('id_token');
  if (!idToken) throw new Error(params.get('error_description') || params.get('error') || 'Google did not return an ID token');
  try {
    return (await signInWithCredential(authInst, GoogleAuthProvider.credential(idToken))).user;
  } catch (e) { throw friendly(e); }
}

export function redirectUri() {
  try { return api.identity.getRedirectURL(); } catch { return `https://${api.runtime.id}.chromiumapp.org/`; }
}
export type { User };
