// Template marketplace backed by Firestore marketplace/{id}. Submissions start as
// "pending" and only become publicly visible after an admin (admins/{uid})
// approves them. Personal use never depends on the marketplace.
import { collection, doc, getDocs, query, where, addDoc, updateDoc, getDoc, increment, orderBy, limit } from 'firebase/firestore';
import { getFirebase } from './firebase';
import type { ContentType } from '../shared/types';
import { sanitizeHtml } from '../shared/html';

export interface MarketTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  shortcut: string;
  content: string;
  contentType: ContentType;
  authorUid: string;
  authorName: string;
  status: 'pending' | 'approved' | 'rejected';
  downloads: number;
  createdAt: number;
  moderationNote?: string;
}

async function ctx(requireUser = true) {
  const fb = await getFirebase();
  if (!fb) throw new Error('The marketplace needs cloud features. Configure Firebase in Settings → Cloud & Account.');
  if (requireUser && !fb.auth.currentUser) throw new Error('Sign in to use the marketplace.');
  return fb;
}

export async function isAdmin(): Promise<boolean> {
  const fb = await getFirebase();
  const u = fb?.auth.currentUser;
  if (!fb || !u) return false;
  try { return (await getDoc(doc(fb.db, 'admins', u.uid))).exists(); } catch { return false; }
}

export async function browse(): Promise<MarketTemplate[]> {
  const fb = await ctx(false);
  const snap = await getDocs(query(collection(fb.db, 'marketplace'), where('status', '==', 'approved'), orderBy('downloads', 'desc'), limit(300)));
  return snap.docs.map((d) => ({ ...(d.data() as MarketTemplate), id: d.id }));
}

export async function mySubmissions(): Promise<MarketTemplate[]> {
  const fb = await ctx();
  const snap = await getDocs(query(collection(fb.db, 'marketplace'), where('authorUid', '==', fb.auth.currentUser!.uid)));
  return snap.docs.map((d) => ({ ...(d.data() as MarketTemplate), id: d.id }));
}

export async function pendingQueue(): Promise<MarketTemplate[]> {
  const fb = await ctx();
  const snap = await getDocs(query(collection(fb.db, 'marketplace'), where('status', '==', 'pending')));
  return snap.docs.map((d) => ({ ...(d.data() as MarketTemplate), id: d.id }));
}

export async function submit(t: { title: string; description: string; category: string; tags: string[]; shortcut: string; content: string; contentType: ContentType }) {
  const fb = await ctx();
  const u = fb.auth.currentUser!;
  if (t.title.trim().length < 3) throw new Error('Title is too short');
  if (t.content.length > 50000) throw new Error('Template is too large (max 50,000 characters)');
  await addDoc(collection(fb.db, 'marketplace'), {
    title: t.title.trim().slice(0, 120), description: t.description.slice(0, 1000), category: t.category.trim().slice(0, 60) || 'Other',
    tags: t.tags.slice(0, 10).map((x) => x.slice(0, 30)), shortcut: t.shortcut.slice(0, 48),
    content: t.contentType === 'html' ? sanitizeHtml(t.content) : t.content, contentType: t.contentType,
    authorUid: u.uid, authorName: u.displayName || (u.email || '').split('@')[0], status: 'pending', downloads: 0, createdAt: Date.now(),
  });
}

export async function moderate(id: string, status: 'approved' | 'rejected', note = '') {
  const fb = await ctx();
  await updateDoc(doc(fb.db, 'marketplace', id), { status, moderationNote: note.slice(0, 500), moderatedAt: Date.now(), moderatorUid: fb.auth.currentUser!.uid });
}

export async function countDownload(id: string) {
  const fb = await getFirebase();
  if (!fb?.auth.currentUser) return;
  await updateDoc(doc(fb.db, 'marketplace', id), { downloads: increment(1) }).catch(() => {});
}
