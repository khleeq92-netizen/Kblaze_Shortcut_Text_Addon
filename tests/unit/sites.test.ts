import { describe, it, expect } from 'vitest';
import { matchSite, matchesAny, hostAllowed, isOfficialHost, hostMatches, siteFromUrl, safeRegex } from '@/automation/sites';

describe('site matching', () => {
  it('domain matches host and subdomains only', () => {
    expect(matchSite({ kind: 'domain', value: 'udiseplus.gov.in' }, 'https://udiseplus.gov.in/sdms')).toBe(true);
    expect(matchSite({ kind: 'domain', value: 'udiseplus.gov.in' }, 'https://sdms.udiseplus.gov.in/x')).toBe(true);
    expect(matchSite({ kind: 'domain', value: 'gov.in' }, 'https://evilgov.in/')).toBe(false);
    expect(matchSite({ kind: 'domain', value: 'https://www.example.com/path' }, 'https://www.example.com/')).toBe(true);
  });
  it('prefix, wildcard and regex', () => {
    expect(matchSite({ kind: 'prefix', value: 'https://a.com/forms/' }, 'https://a.com/forms/step2?x=1')).toBe(true);
    expect(matchSite({ kind: 'prefix', value: 'a.com/forms/' }, 'https://a.com/forms/1')).toBe(true);
    expect(matchSite({ kind: 'prefix', value: 'https://a.com/forms/' }, 'https://a.com/other')).toBe(false);
    expect(matchSite({ kind: 'wildcard', value: '*.example.com/apply/*' }, 'https://portal.example.com/apply/3')).toBe(true);
    expect(matchSite({ kind: 'wildcard', value: '*.example.com/apply/*' }, 'https://portal.example.com/home')).toBe(false);
    expect(matchSite({ kind: 'regex', value: '^https://.*\\.gov\\.in/' }, 'https://x.gov.in/a')).toBe(true);
    expect(matchSite({ kind: 'regex', value: '([' }, 'https://x.gov.in/a')).toBe(false); // invalid regex never throws
    expect(safeRegex('a'.repeat(600))).toBeNull();
  });
  it('empty pattern lists match every site; allowlist semantics', () => {
    expect(matchesAny([], 'https://anything.org')).toBe(true);
    expect(hostAllowed([], 'x.com')).toBe(true);
    expect(hostAllowed(['udiseplus.gov.in'], 'udiseplus.gov.in')).toBe(true);
    expect(hostAllowed(['udiseplus.gov.in'], 'google.com')).toBe(false);
    expect(isOfficialHost('mahahsscboard.in', ['gov.in', 'mahahsscboard.in'])).toBe(true);
    expect(isOfficialHost('example.com', ['gov.in'])).toBe(false);
    expect(hostMatches('A.B.Example.COM', '*.example.com')).toBe(true);
    expect(siteFromUrl('https://www.11thadmission.org.in/x')).toEqual({ kind: 'domain', value: '11thadmission.org.in' });
  });
});
