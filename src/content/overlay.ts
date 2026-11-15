// Hosts extension UI (snippet picker, fill-in form, confirmations) in an
// isolated extension-origin iframe. The page cannot read or script it.
import { api } from '../shared/browser';
import { OVERLAY_MSG } from '../shared/constants';
import { toTopRect } from './editable';

export type OverlayResult =
  | { type: 'pick'; snippetId: string }
  | { type: 'submit'; text: string; html: string; isRich: boolean; cursorBack: number | null; snippetId: string }
  | { type: 'confirm'; ok: boolean }
  | { type: 'runWorkflow'; workflowId: string }
  | { type: 'cancel' };

let current: { host: HTMLElement; frame: HTMLIFrameElement; resolve: (r: OverlayResult) => void; nonce: string; listener: (e: MessageEvent) => void; win: Window } | null = null;

/** Small same-origin iframes (e.g. TinyMCE) host the overlay in the top document instead. */
function hostWindow(): Window {
  if (window.innerWidth >= 520 && window.innerHeight >= 360) return window;
  try { if (window.top && window.top.document) return window.top; } catch { /* cross-origin */ }
  return window;
}

export function closeOverlay(result: OverlayResult = { type: 'cancel' }) {
  if (!current) return;
  const c = current;
  current = null;
  c.win.removeEventListener('message', c.listener, true);
  c.host.remove();
  c.resolve(result);
}

export function overlayOpen() {
  return !!current;
}

export async function openOverlay(opts: { mode: 'picker' | 'form' | 'confirm'; nonce?: string; anchor?: DOMRect; doc?: Document; page: any; payload?: any; snippetId?: string }): Promise<OverlayResult> {
  closeOverlay();
  let nonce = opts.nonce;
  if (!nonce) {
    const r: any = await api.runtime.sendMessage({ type: 'qth/openOverlay', mode: opts.mode, page: opts.page, payload: opts.payload, snippetId: opts.snippetId });
    nonce = r?.nonce;
  }
  if (!nonce) return { type: 'cancel' };
  // The overlay must live in the top document of this frame; position near the anchor.
  const win = hostWindow();
  const hdoc = win.document;
  const host = hdoc.createElement('qth-overlay-root');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const backdrop = hdoc.createElement('div');
  backdrop.style.cssText = `position:fixed;inset:0;background:${opts.mode === 'confirm' ? 'rgba(15,23,42,.35)' : 'transparent'};`;
  const frame = hdoc.createElement('iframe');
  const width = opts.mode === 'picker' ? 440 : 480;
  const a = opts.anchor ? (win === window ? opts.anchor : toTopRect(opts.anchor, opts.doc || document)) : null;
  const W = win.innerWidth, H = win.innerHeight;
  let left = a ? a.left : (W - width) / 2;
  left = Math.max(8, Math.min(left, W - width - 8));
  let top = a ? a.bottom + 6 : 80;
  const initialH = opts.mode === 'picker' ? 380 : 420;
  if (opts.mode === 'confirm') { left = (W - width) / 2; top = Math.max(40, H / 2 - 140); }
  else if (top + initialH > H - 8) top = Math.max(8, (a ? a.top : H) - initialH - 6);
  frame.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${width}px;height:${initialH}px;border:0;border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.28);background:transparent;color-scheme:normal;`;
  frame.setAttribute('allow', 'clipboard-write');
  const origin = (() => { try { return win.location.origin; } catch { return '*'; } })();
  const url = api.runtime.getURL('overlay/index.html') + `#nonce=${nonce}&origin=${encodeURIComponent(origin && origin !== 'null' ? origin : '*')}`;
  frame.src = url;
  shadow.append(backdrop, frame);
  hdoc.documentElement.appendChild(host);
  backdrop.addEventListener('mousedown', () => closeOverlay());
  const frameOrigin = new URL(url).origin;

  return new Promise<OverlayResult>((resolve) => {
    const listener = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow || e.origin !== frameOrigin) return;
      const d = e.data;
      if (!d || d.channel !== OVERLAY_MSG || d.nonce !== nonce) return;
      e.stopImmediatePropagation();
      if (d.kind === 'resize') {
        const h = Math.min(win.innerHeight - 16, Math.max(120, d.height));
        frame.style.height = h + 'px';
        const t = parseFloat(frame.style.top);
        if (t + h > win.innerHeight - 8) frame.style.top = Math.max(8, win.innerHeight - h - 8) + 'px';
        return;
      }
      if (d.kind === 'result') closeOverlay(d.result as OverlayResult);
    };
    current = { host, frame, resolve, nonce: nonce!, listener, win };
    win.addEventListener('message', listener, true);
    setTimeout(() => frame.focus(), 50);
  });
}
