export function uid(prefix = ''): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const s = Array.from(bytes, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  return prefix ? `${prefix}_${s}` : s;
}
export function slugKey(name: string): string {
  const k = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[a-z_]/.test(k) ? k : 'f_' + k || 'field';
}
