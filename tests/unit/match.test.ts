import { describe, it, expect } from 'vitest';
import { findMatch, shortcutConflicts } from '@/content/match';

const E = (id: string, shortcut: string, trigger: any = 'default') => ({ id, shortcut, trigger });
const base = { triggerMode: 'immediate' as const, delimiters: ' .,!?\n', caseSensitive: true, wordBoundary: true };

describe('shortcut matching', () => {
  it('immediate mode matches at end of text', () => {
    expect(findMatch('hello /sig', [E('a', '/sig')], base)?.entry.id).toBe('a');
    expect(findMatch('/si', [E('a', '/sig')], base)).toBeNull();
  });
  it('prefers the longest matching shortcut', () => {
    expect(findMatch('x ;;addr', [E('a', ';addr'), E('b', ';;addr')], base)?.entry.id).toBe('b');
  });
  it('word boundary blocks glued shortcuts', () => {
    expect(findMatch('site.com/sig', [E('a', '/sig')], base)).toBeNull();
    expect(findMatch('(/sig', [E('a', '/sig')], base)?.entry.id).toBe('a');
    expect(findMatch('site.com/sig', [E('a', '/sig')], { ...base, wordBoundary: false })?.entry.id).toBe('a');
  });
  it('delimiter mode needs a delimiter and reports its length', () => {
    const s = { ...base, triggerMode: 'delimiter' as const };
    expect(findMatch('/pay', [E('a', '/pay'), E('b', '/payment')], s)).toBeNull();
    const m = findMatch('/payment,', [E('a', '/pay'), E('b', '/payment')], s)!;
    expect(m.entry.id).toBe('b');
    expect(m.length).toBe(9);
    expect(m.delimiter).toBe(',');
    expect(findMatch('/pay ', [E('a', '/pay')], s)?.entry.id).toBe('a');
  });
  it('per-snippet trigger overrides the global mode', () => {
    expect(findMatch('/x', [E('a', '/x', 'delimiter')], base)).toBeNull();
    expect(findMatch('/x', [E('a', '/x', 'immediate')], { ...base, triggerMode: 'delimiter' })?.entry.id).toBe('a');
  });
  it('case sensitivity', () => {
    expect(findMatch('/SIG', [E('a', '/sig')], base)).toBeNull();
    expect(findMatch('/SIG', [E('a', '/sig')], { ...base, caseSensitive: false })?.entry.id).toBe('a');
  });
  it('detects duplicate and prefix conflicts', () => {
    const c = shortcutConflicts([{ id: '1', shortcut: '/pay' }, { id: '2', shortcut: '/payment' }, { id: '3', shortcut: '/pay' }], true);
    expect(c['1'].some((m) => m.startsWith('Same shortcut'))).toBe(true);
    expect(c['1'].some((m) => m.includes('/payment'))).toBe(true);
    expect(c['2']).toBeUndefined();
  });
});
