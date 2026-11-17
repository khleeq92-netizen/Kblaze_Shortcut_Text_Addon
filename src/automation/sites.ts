// URL / host matching for automation profiles, macros, scripts and allowlists.
// Pure functions (no DOM) so they run in the background worker, pages and tests.
import type { SitePattern } from '../shared/types';

function normalizeHost(h: string) {
  return h.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/:?#].*$/, '').replace(/^\*\./, '').replace(/\.$/, '');
}

export function hostMatches(host: string, pattern: string): boolean {
  const h = normalizeHost(host);
  const p = normalizeHost(pattern);
  if (!p) return false;
  return h === p || h.endsWith('.' + p);
}

function wildcardToRegex(w: string): RegExp {
  const esc = w.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + esc + '$', 'i');
}

/** Safe regex compile: invalid or catastrophic-looking patterns never throw. */
export function safeRegex(src: string, flags = 'i'): RegExp | null {
  if (!src || src.length > 500) return null;
  try { return new RegExp(src, flags); } catch { return null; }
}

export function matchSite(p: SitePattern, url: string): boolean {
  let u: URL | null = null;
  try { u = new URL(url); } catch { /* not a URL */ }
  const full = url.replace(/#.*$/, '');
  switch (p.kind) {
    case 'any':
      return true;
    case 'domain':
      return !!u && hostMatches(u.hostname, p.value);
    case 'prefix': {
      const v = p.value.trim();
      if (!v) return false;
      if (/^[a-z]+:\/\//i.test(v)) return full.toLowerCase().startsWith(v.toLowerCase());
      const noScheme = full.replace(/^[a-z]+:\/\//i, '');
      return noScheme.toLowerCase().startsWith(v.toLowerCase());
    }
    case 'wildcard': {
      const v = p.value.trim();
      if (!v) return false;
      const re = wildcardToRegex(v);
      return re.test(full) || re.test(full.replace(/^[a-z]+:\/\//i, ''));
    }
    case 'regex': {
      const re = safeRegex(p.value);
      return !!re && re.test(full);
    }
  }
  return false;
}

/** Empty list = every site. */
export function matchesAny(patterns: SitePattern[] | undefined, url: string): boolean {
  if (!patterns || !patterns.length) return true;
  return patterns.some((p) => matchSite(p, url));
}

/** Allowlist check. Empty allowlist = automation allowed everywhere. */
export function hostAllowed(allowlist: string[], host: string): boolean {
  const list = allowlist.map((x) => x.trim()).filter(Boolean);
  if (!list.length) return true;
  return list.some((p) => hostMatches(host, p));
}

export function isOfficialHost(host: string, official: string[]): boolean {
  return official.some((p) => p.trim() && hostMatches(host, p));
}

export function describeSite(p: SitePattern): string {
  switch (p.kind) {
    case 'any': return 'Any website';
    case 'domain': return p.value;
    case 'prefix': return p.value + '…';
    case 'wildcard': return p.value;
    case 'regex': return `/${p.value}/`;
  }
}

/** Builds a sensible default pattern for the page a user is on. */
export function siteFromUrl(url: string): SitePattern {
  try { return { kind: 'domain', value: new URL(url).hostname.replace(/^www\./, '') }; } catch { return { kind: 'any', value: '' }; }
}
