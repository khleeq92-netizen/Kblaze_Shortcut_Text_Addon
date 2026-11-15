// Offline share codes: the snippet bundle itself, deflated and base64url-encoded.
import type { ExportBundle } from './types';
import { parseImport } from './validate';

export const CODE_PREFIX = 'QTH1.';

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
  return new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function makeShareCode(bundle: ExportBundle): Promise<string> {
  return CODE_PREFIX + b64url(await pipe(new TextEncoder().encode(JSON.stringify(bundle)), new CompressionStream('deflate-raw')));
}

export async function decodeShareCode(code: string): Promise<ExportBundle> {
  const s = code.trim();
  if (!s.startsWith(CODE_PREFIX)) throw new Error('Not a QuickText share code');
  let json: string;
  try { json = new TextDecoder().decode(await pipe(fromB64url(s.slice(CODE_PREFIX.length).replace(/\s+/g, '')), new DecompressionStream('deflate-raw'))); }
  catch { throw new Error('This share code is damaged or incomplete.'); }
  return parseImport(json);
}

export function bundleOf(snippets: any[], folders: any[]): ExportBundle {
  return { format: 'quicktext-hub', version: 1, exportedAt: Date.now(), snippets: snippets.map((s) => ({ ...s, teamId: null })), folders: folders.map((f) => ({ ...f, teamId: null })) };
}
