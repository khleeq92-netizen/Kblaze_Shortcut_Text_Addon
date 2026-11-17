// Element picker for the Autopilot builder: hover to highlight, click to capture
// a CSS selector + label for the element. Esc cancels.
import { highlight, toast } from './ui';
import { api } from '../shared/browser';
import { MSG } from '../shared/constants';

function cssEscape(s: string) {
  return (window as any).CSS?.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&');
}

export function selectorFor(el: Element): string {
  if (el.id && document.querySelectorAll('#' + cssEscape(el.id)).length === 1 && !/\d{4,}/.test(el.id)) return '#' + cssEscape(el.id);
  const name = el.getAttribute('name');
  if (name) {
    const s = `${el.tagName.toLowerCase()}[name="${name.replace(/"/g, '\\"')}"]`;
    if (document.querySelectorAll(s).length === 1) return s;
  }
  for (const attr of ['data-testid', 'data-test', 'aria-label', 'placeholder']) {
    const v = el.getAttribute(attr);
    if (v) {
      const s = `${el.tagName.toLowerCase()}[${attr}="${v.replace(/"/g, '\\"')}"]`;
      if (document.querySelectorAll(s).length === 1) return s;
    }
  }
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement && parts.length < 6) {
    let part = cur.tagName.toLowerCase();
    if (cur.id && !/\d{4,}/.test(cur.id)) { parts.unshift('#' + cssEscape(cur.id) + (parts.length ? '' : '')); break; }
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(' > ');
}

let active = false;
export function startPicker() {
  if (active) return;
  active = true;
  toast('Click an element to capture it for Autopilot (Esc to cancel)', { ms: 5000 });
  const move = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && !el.tagName.startsWith('KF-')) highlight(el, el.tagName.toLowerCase());
  };
  const stop = () => {
    active = false;
    highlight(null);
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', key, true);
  };
  const click = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    stop();
    if (!el) return;
    const label = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el as any).labels?.[0]?.textContent || el.textContent || '').trim().slice(0, 80);
    const element = { selector: selectorFor(el), label, tag: el.tagName.toLowerCase(), host: location.hostname };
    api.runtime.sendMessage({ type: MSG.picked, element });
    toast(`Captured ${element.selector} — it is now available in the workflow builder`);
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { stop(); toast('Picker cancelled'); } };
  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', key, true);
}
