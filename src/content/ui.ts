// Page-level UI (toasts, workflow progress panel, element highlight). Rendered
// in a closed shadow root so page CSS cannot affect it and it cannot affect the page.
let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;

const CSS = `
:host{all:initial}
.wrap{position:fixed;z-index:2147483646;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.toast{background:#1e1b4b;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:360px;display:flex;gap:10px;align-items:center;animation:in .18s ease-out}
.toast.err{background:#7f1d1d}
.toast button{all:unset;cursor:pointer;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:6px;font-weight:600;white-space:nowrap}
.toast button:hover{background:rgba(255,255,255,.3)}
.panel{background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.18);width:320px;overflow:hidden;animation:in .18s ease-out}
.panel h4{margin:0;padding:10px 12px;background:#4f46e5;color:#fff;font-size:13px;display:flex;justify-content:space-between;align-items:center}
.panel h4 button{all:unset;cursor:pointer;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:6px;font-size:12px}
.panel ol{margin:0;padding:8px 12px 10px 30px;max-height:240px;overflow:auto}
.panel li{padding:2px 0;color:#6b7280}
.panel li.run{color:#4f46e5;font-weight:600}
.panel li.done{color:#059669}
.panel li.fail{color:#dc2626}
.panel li.skip{color:#9ca3af;text-decoration:line-through}
.hl{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #6366f1;background:rgba(99,102,241,.12);border-radius:4px;transition:all .08s}
.hl span{position:absolute;top:-22px;left:0;background:#4f46e5;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;white-space:nowrap}
.fab{position:fixed;z-index:2147483645;width:26px;height:26px;border-radius:50%;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25);font-size:14px;user-select:none;opacity:.85}
.fab:hover{opacity:1}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;

export function ui(): ShadowRoot {
  if (shadow && host?.isConnected) return shadow;
  host = document.createElement('qth-ui-root');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;top:0;left:0;width:0;height:0';
  shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  shadow.appendChild(style);
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  shadow.appendChild(wrap);
  document.documentElement.appendChild(host);
  return shadow;
}
const wrap = () => ui().querySelector('.wrap') as HTMLElement;

export function toast(message: string, opts: { error?: boolean; action?: { label: string; run: () => void }; ms?: number } = {}) {
  const t = document.createElement('div');
  t.className = 'toast' + (opts.error ? ' err' : '');
  const span = document.createElement('span');
  span.textContent = message;
  t.appendChild(span);
  if (opts.action) {
    const b = document.createElement('button');
    b.textContent = opts.action.label;
    b.addEventListener('click', () => { opts.action!.run(); t.remove(); });
    t.appendChild(b);
  }
  wrap().appendChild(t);
  setTimeout(() => t.remove(), opts.ms ?? (opts.action ? 9000 : 3500));
}

export function copyToast(text: string, reason: string) {
  toast(reason, {
    error: true,
    action: {
      label: 'Copy text',
      run: () => {
        navigator.clipboard?.writeText(text).then(() => toast('Copied — press Ctrl+V / ⌘V to paste'), () => toast('Clipboard access was blocked by this page', { error: true }));
      },
    },
  });
}

export interface Progress {
  set(i: number, status: 'run' | 'done' | 'fail' | 'skip'): void;
  close(): void;
  stopped: () => boolean;
}
export function progressPanel(title: string, steps: string[]): Progress {
  const p = document.createElement('div');
  p.className = 'panel';
  const h = document.createElement('h4');
  const tt = document.createElement('span');
  tt.textContent = '⚡ Autopilot: ' + title;
  const stop = document.createElement('button');
  stop.textContent = 'Stop';
  let stopped = false;
  stop.addEventListener('click', () => { stopped = true; stop.textContent = 'Stopping…'; });
  h.append(tt, stop);
  const ol = document.createElement('ol');
  const items = steps.map((s) => { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); return li; });
  p.append(h, ol);
  wrap().appendChild(p);
  return {
    set(i, status) { if (items[i]) { items[i].className = status; if (status === 'run') items[i].scrollIntoView({ block: 'nearest' }); } },
    close() { stop.textContent = 'Close'; stop.onclick = () => p.remove(); setTimeout(() => p.remove(), 6000); },
    stopped: () => stopped,
  };
}

let hl: HTMLElement | null = null;
export function highlight(el: Element | null, label?: string) {
  if (!el) { hl?.remove(); hl = null; return; }
  if (!hl) { hl = document.createElement('div'); hl.className = 'hl'; ui().appendChild(hl); }
  const r = el.getBoundingClientRect();
  Object.assign(hl.style, { left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 'px', height: r.height + 'px' });
  hl.innerHTML = '';
  if (label) { const s = document.createElement('span'); s.textContent = label; hl.appendChild(s); }
}

let fab: HTMLElement | null = null;
export function showFab(rect: DOMRect, onClick: () => void) {
  if (!fab) {
    fab = document.createElement('div');
    fab.className = 'fab';
    fab.title = 'QuickText Hub snippets';
    fab.textContent = '⚡';
    ui().appendChild(fab);
  }
  fab.onmousedown = (e) => { e.preventDefault(); onClick(); };
  Object.assign(fab.style, { left: Math.min(window.innerWidth - 30, rect.right - 30) + 'px', top: Math.min(window.innerHeight - 30, rect.bottom - 30) + 'px', display: 'flex' });
}
export function hideFab() {
  if (fab) fab.style.display = 'none';
}
