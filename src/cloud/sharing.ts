// Sharing: (1) offline share codes that embed the data (no account needed) and
// (2) cloud share links stored in Firestore shares/{id} (public-by-link or
// restricted to specific email addresses).
import { collection, doc, getDoc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { getFirebase } from './firebase';
import type { Snippet, Folder, ExportBundle } from '../shared/types';
import { parseImport } from '../shared/validate';
import { api } from '../shared/browser';

const CODE_PREFIX = 'QTH1.';
const SHARE_PREFIX = 'QTHS-';

function b64url(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export function bundleOf(snippets: Snippet[], folders: Folder[]): ExportBundle {
  return { format: 'quicktext-hub', version: 1, exportedAt: Date.now(), snippets: snippets.map((s) => ({ ...s, teamId: null })), folders: folders.map((f) => ({ ...f, teamId: null })) };
}

export async function makeShareCode(bundle: ExportBundle): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(bundle));
  return CODE_PREFIX + b64url(await pipe(raw, new CompressionStream('deflate-raw')));
}

export function shareLink(shareId: string) {
  return api.runtime.getURL(`dashboard/index.html#/import?share=${shareId}`);
}

export async function createCloudShare(bundle: ExportBundle, opts: { title: string; visibility: 'link' | 'restricted'; allowedEmails: string[] }) {
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!fb || !u) throw new Error('Sign in to create share links (or use an offline share code).');
  const ref = doc(collection(fb.db, 'shares'));
  const payload = JSON.stringify(bundle);
  if (payload.length > 900_000) throw new Error('This selection is too large to share via the cloud (max ~900 KB). Use export instead.');
  await setDoc(ref, {
    ownerUid: u.uid, ownerName: u.displayName || u.email || '', title: opts.title.slice(0, 200), visibility: opts.visibility,
    allowedEmails: opts.allowedEmails.map((e) => e.trim().toLowerCase()).filter(Boolean).slice(0, 100),
    payload, count: bundle.snippets.length, createdAt: Date.now(),
  });
  return { id: ref.id, code: SHARE_PREFIX + ref.id, link: shareLink(ref.id) };
}

export async function listMyShares() {
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!fb || !u) return [];
  const snap = await getDocs(query(collection(fb.db, 'shares'), where('ownerUid', '==', u.uid)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any), payload: undefined }));
}
export async function deleteShare(id: string) {
  const fb = await getFirebase();
  if (fb) await deleteDoc(doc(fb.db, 'shares', id));
}

/** Accepts an offline code, a QTHS-<id> code, or a dashboard import link. Returns a validated bundle. */
export async function resolveShare(input: string): Promise<{ bundle: ExportBundle; title: string; from: string }> {
  const s = input.trim();
  if (s.startsWith(CODE_PREFIX)) {
    const json = new TextDecoder().decode(await pipe(fromB64url(s.slice(CODE_PREFIX.length)), new DecompressionStream('deflate-raw')));
    const bundle = parseImport(json);
    return { bundle, title: `${bundle.snippets.length} shared snippet(s)`, from: 'share code' };
  }
  const m = /(?:QTHS-|[?&]share=)([A-Za-z0-9]{10,40})/.exec(s);
  if (!m) throw new Error('This is not a QuickText share link or code.');
  const fb = await getFirebase();
  if (!fb) throw new Error('Cloud share links need cloud features configured (Settings → Cloud & Account).');
  const snap = await getDoc(doc(fb.db, 'shares', m[1])).catch((e) => { throw new Error(e?.code === 'permission-denied' ? 'You do not have access to this share (it may be restricted — sign in with an invited email).' : e.message); });
  if (!snap.exists()) throw new Error('Share not found or deleted.');
  const d = snap.data() as any;
  return { bundle: parseImport(d.payload), title: d.title, from: d.ownerName || 'a QuickText user' };
}
