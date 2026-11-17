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
  host = document.createElement('kf-ui-root');
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
    fab.title = 'K-Flow Automation snippets';
    fab.textContent = '⚡';
    ui().appendChild(fab);
  }
  fab.onmousedown = (e) => { e.preventDefault(); onClick(); };
  Object.assign(fab.style, { left: Math.min(window.innerWidth - 30, rect.right - 30) + 'px', top: Math.min(window.innerHeight - 30, rect.bottom - 30) + 'px', display: 'flex' });
}
export function hideFab() {
  if (fab) fab.style.display = 'none';
}

// ===================================================================== K-Flow automation UI
const KF_CSS = `
.kfp{background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 18px 40px rgba(15,23,42,.22);width:340px;overflow:hidden;animation:in .18s ease-out;font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.kfp header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(135deg,#4338ca,#0891b2);color:#fff}
.kfp header b{flex:1;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kfp header button,.kfp .acts button{all:unset;cursor:pointer;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:7px;font-size:12px;font-weight:600}
.kfp header button:hover{background:rgba(255,255,255,.32)}
.kfp .sub{padding:6px 12px;background:#f1f5f9;color:#475569;font-size:12px;border-bottom:1px solid #e2e8f0}
.kfp ol{margin:0;padding:6px 12px 8px 32px;max-height:230px;overflow:auto}
.kfp li{padding:2px 0;color:#64748b}
.kfp li.run{color:#4338ca;font-weight:600}.kfp li.done,.kfp li.filled,.kfp li.previewed{color:#047857}.kfp li.fail,.kfp li.notFound,.kfp li.invalid,.kfp li.failed,.kfp li.blocked{color:#b91c1c}.kfp li.skip,.kfp li.skipped{color:#94a3b8}
.kfp li small{display:block;color:#64748b;font-weight:400}
.kfp .acts{display:flex;gap:6px;padding:8px 12px;border-top:1px solid #e2e8f0;flex-wrap:wrap}
.kfp .acts button{background:#eef2ff;color:#3730a3}.kfp .acts button.pri{background:#4338ca;color:#fff}.kfp .acts button.dan{background:#fee2e2;color:#991b1b}
.kfrec{display:flex;align-items:center;gap:8px;background:#0f172a;color:#fff;padding:8px 10px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.3);font:600 12.5px system-ui,sans-serif;animation:in .18s ease-out}
.kfrec .dot{width:10px;height:10px;border-radius:50%;background:#ef4444;animation:blink 1s infinite}
.kfrec.paused .dot{animation:none;background:#f59e0b}
.kfrec button{all:unset;cursor:pointer;background:rgba(255,255,255,.14);padding:4px 10px;border-radius:999px}
.kfrec button.pri{background:#ef4444}
.badge{position:fixed;z-index:2147483644;pointer-events:none;border:2px solid #10b981;background:rgba(16,185,129,.10);border-radius:5px}
.badge.err{border-color:#ef4444;background:rgba(239,68,68,.10)}
.badge.info{border-color:#6366f1;background:rgba(99,102,241,.10)}
.badge span{position:absolute;left:-2px;top:-21px;background:#10b981;color:#fff;font:600 11px system-ui,sans-serif;padding:2px 6px;border-radius:4px;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
.badge.err span{background:#ef4444}.badge.info span{background:#6366f1}
.mapbar{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483646;background:#0f172a;color:#fff;padding:8px 14px;border-radius:999px;font:600 12.5px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center}
.mapbar button{all:unset;cursor:pointer;background:rgba(255,255,255,.16);padding:3px 10px;border-radius:999px}
@keyframes blink{50%{opacity:.3}}
`;
let kfStyled = false;
function kfRoot(): ShadowRoot {
  const r = ui();
  if (!kfStyled || !r.querySelector('style[data-kf]')) {
    const st = document.createElement('style');
    st.dataset.kf = '1';
    st.textContent = KF_CSS;
    r.appendChild(st);
    kfStyled = true;
  }
  return r;
}

export interface RunPanel {
  set(i: number, status: string, note?: string): void;
  setSub(text: string): void;
  setPaused(p: boolean): void;
  done(summary: string, actions?: { label: string; run: () => void; kind?: 'pri' | 'dan' }[]): void;
  close(): void;
}

export function runPanel(title: string, steps: string[], ctl: { onPause?: () => void; onResume?: () => void; onStop?: () => void } = {}): RunPanel {
  kfRoot();
  const p = document.createElement('div');
  p.className = 'kfp';
  const h = document.createElement('header');
  const b = document.createElement('b');
  b.textContent = '⚡ ' + title;
  h.appendChild(b);
  let paused = false;
  const pause = document.createElement('button');
  pause.textContent = 'Pause';
  if (ctl.onPause) { pause.onclick = () => { paused ? ctl.onResume?.() : ctl.onPause?.(); }; h.appendChild(pause); }
  const stop = document.createElement('button');
  stop.textContent = 'Stop';
  stop.onclick = () => { stop.textContent = 'Stopping…'; ctl.onStop?.(); };
  if (ctl.onStop) h.appendChild(stop);
  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.style.display = 'none';
  const ol = document.createElement('ol');
  const items = steps.map((s) => { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); return li; });
  const acts = document.createElement('div');
  acts.className = 'acts';
  acts.style.display = 'none';
  p.append(h, sub, ol, acts);
  wrap().appendChild(p);
  let closed = false;
  const api = {
    set(i: number, status: string, note?: string) {
      const li = items[i];
      if (!li) return;
      li.className = status;
      li.querySelector('small')?.remove();
      if (note) { const sm = document.createElement('small'); sm.textContent = note; li.appendChild(sm); }
      if (status === 'run') li.scrollIntoView({ block: 'nearest' });
    },
    setSub(text: string) { sub.textContent = text; sub.style.display = text ? 'block' : 'none'; },
    setPaused(v: boolean) { paused = v; pause.textContent = v ? 'Resume' : 'Pause'; b.textContent = (v ? '⏸ ' : '⚡ ') + title; },
    done(summary: string, actions: { label: string; run: () => void; kind?: 'pri' | 'dan' }[] = []) {
      pause.remove();
      stop.textContent = 'Close';
      stop.onclick = () => api.close();
      api.setSub(summary);
      acts.innerHTML = '';
      for (const a of actions) { const bt = document.createElement('button'); bt.textContent = a.label; if (a.kind) bt.className = a.kind; bt.onclick = () => a.run(); acts.appendChild(bt); }
      acts.style.display = actions.length ? 'flex' : 'none';
    },
    close() { if (closed) return; closed = true; p.remove(); },
  };
  return api;
}

export function recorderBar(ctl: { onPause: (p: boolean) => void; onStop: () => void; onCancel: () => void }) {
  kfRoot();
  const bar = document.createElement('div');
  bar.className = 'kfrec';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const label = document.createElement('span');
  label.textContent = 'Recording · 0 steps';
  let paused = false;
  const pause = document.createElement('button');
  pause.textContent = 'Pause';
  pause.onclick = () => { paused = !paused; ctl.onPause(paused); };
  const stop = document.createElement('button');
  stop.className = 'pri';
  stop.textContent = 'Stop & save';
  stop.onclick = () => ctl.onStop();
  const cancel = document.createElement('button');
  cancel.textContent = 'Discard';
  cancel.onclick = () => ctl.onCancel();
  bar.append(dot, label, pause, stop, cancel);
  wrap().appendChild(bar);
  return {
    count(n: number) { label.textContent = `${paused ? 'Paused' : 'Recording'} · ${n} step${n === 1 ? '' : 's'}`; },
    setPaused(p: boolean) { paused = p; bar.classList.toggle('paused', p); pause.textContent = p ? 'Resume' : 'Pause'; label.textContent = label.textContent!.replace(/^(Paused|Recording)/, p ? 'Paused' : 'Recording'); },
    close() { bar.remove(); },
  };
}

const badges: { el: Element; node: HTMLElement }[] = [];
let badgeRaf = 0;
function placeBadges() {
  for (const b of badges) {
    const r = b.el.getBoundingClientRect();
    Object.assign(b.node.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 2 + 'px', height: r.height + 2 + 'px', display: r.width || r.height ? 'block' : 'none' });
  }
}
export function badge(el: Element, text: string, kind: 'ok' | 'err' | 'info' = 'ok') {
  const root = kfRoot();
  const node = document.createElement('div');
  node.className = 'badge' + (kind === 'ok' ? '' : ' ' + kind);
  const s = document.createElement('span');
  s.textContent = text;
  node.appendChild(s);
  root.appendChild(node);
  badges.push({ el, node });
  placeBadges();
  if (!badgeRaf) {
    const loop = () => { placeBadges(); badgeRaf = badges.length ? requestAnimationFrame(loop) : 0; };
    badgeRaf = requestAnimationFrame(loop);
  }
}
export function clearBadges() {
  for (const b of badges.splice(0)) b.node.remove();
}

export function mapBar(onDone: () => void) {
  const root = kfRoot();
  const bar = document.createElement('div');
  bar.className = 'mapbar';
  const t = document.createElement('span');
  t.textContent = '🎯 K-Flow field selector — click a form field to map it · Esc to finish';
  const b = document.createElement('button');
  b.textContent = 'Done';
  b.onclick = onDone;
  bar.append(t, b);
  root.appendChild(bar);
  return { text: (s: string) => { t.textContent = s; }, close: () => bar.remove() };
}
