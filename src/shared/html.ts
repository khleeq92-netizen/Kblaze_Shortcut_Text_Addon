// HTML helpers. htmlToText is pure string processing (usable in a service worker);
// sanitizeHtml needs DOMParser (extension pages / content scripts).

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const BLOCK = /^(p|div|h[1-6]|li|tr|blockquote|pre|ul|ol|table|section|article|header|footer)$/i;

/** Converts (sanitized) HTML into readable plain text, preserving line structure. */
export function htmlToText(html: string): string {
  let out = '';
  const listStack: { ordered: boolean; n: number }[] = [];
  const re = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  let pendingHref: string | null = null;
  let linkText = '';
  let inLink = false;
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) {
      const t = decodeEntities(m[3].replace(/[\r\n\t ]+/g, ' '));
      out += t;
      if (inLink) linkText += t;
      continue;
    }
    const tag = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    if (tag === 'br') { out += '\n'; continue; }
    if (tag === 'a') {
      if (!closing) { const h = /href\s*=\s*["']([^"']*)["']/i.exec(m[2]); pendingHref = h ? decodeEntities(h[1]) : null; inLink = true; linkText = ''; }
      else { if (pendingHref && linkText.trim() !== pendingHref && !/^mailto:/i.test(pendingHref)) out += ` (${pendingHref})`; inLink = false; pendingHref = null; }
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (!closing) { nl(); listStack.push({ ordered: tag === 'ol', n: 0 }); } else { listStack.pop(); nl(); }
      continue;
    }
    if (tag === 'li' && !closing) {
      nl();
      const l = listStack[listStack.length - 1];
      out += '  '.repeat(Math.max(0, listStack.length - 1)) + (l?.ordered ? `${++l.n}. ` : '• ');
      continue;
    }
    if (tag === 'td' || tag === 'th') { if (closing) out += '\t'; continue; }
    if (BLOCK.test(tag)) { if (closing) nl(); else nl(); }
  }
  return out.replace(/\t\n/g, '\n').replace(/[  ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

const ALLOWED_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'sub', 'sup', 'font', 'img']);
const ALLOWED_ATTRS = new Set(['href', 'title', 'style', 'colspan', 'rowspan', 'color', 'src', 'alt', 'width', 'height', 'target']);

/** Allow-list HTML sanitizer (requires DOMParser). Removes scripts, handlers and javascript: URLs. */
export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return escapeHtml(htmlToText(html));
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        if (['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template'].includes(tag)) { child.remove(); continue; }
        // unwrap unknown element
        walk(child);
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        const n = attr.name.toLowerCase();
        const v = attr.value.trim();
        if (!ALLOWED_ATTRS.has(n)) { child.removeAttribute(attr.name); continue; }
        if ((n === 'href' || n === 'src') && !/^(https?:|mailto:|tel:|#|\{\{)/i.test(v) && !(n === 'src' && /^data:image\/(png|jpe?g|gif|webp);/i.test(v))) child.removeAttribute(attr.name);
        if (n === 'style' && /expression|url\s*\(|javascript:/i.test(v)) child.removeAttribute(attr.name);
      }
      if (tag === 'a') child.setAttribute('rel', 'noopener noreferrer');
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
