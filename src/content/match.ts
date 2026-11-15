// Pure shortcut-matching logic (unit tested in tests/unit/match.test.ts).
export interface ShortcutEntry { id: string; shortcut: string; trigger: 'default' | 'immediate' | 'delimiter' }
export interface MatchSettings { triggerMode: 'immediate' | 'delimiter'; delimiters: string; caseSensitive: boolean; wordBoundary: boolean }
export interface Match { entry: ShortcutEntry; /** characters to remove before the caret */ length: number; /** delimiter typed after shortcut (delimiter mode) */ delimiter: string }

const WORDCHAR = /[\p{L}\p{N}_]/u;

export function findMatch(textBefore: string, entries: ShortcutEntry[], s: MatchSettings): Match | null {
  if (!textBefore) return null;
  const cmp = s.caseSensitive ? textBefore : textBefore.toLowerCase();
  const last = textBefore[textBefore.length - 1];
  const delims = s.delimiters.includes(' ') ? s.delimiters + ' ' : s.delimiters;
  const isDelim = delims.includes(last) || (last === '\n' && s.delimiters.includes('\n'));
  let best: Match | null = null;
  for (const e of entries) {
    if (!e.shortcut) continue;
    const mode = e.trigger === 'default' || !e.trigger ? s.triggerMode : e.trigger;
    const sc = s.caseSensitive ? e.shortcut : e.shortcut.toLowerCase();
    let end: number;
    let delimiter = '';
    if (mode === 'immediate') end = cmp.length;
    else {
      if (!isDelim) continue;
      end = cmp.length - 1;
      delimiter = last;
    }
    if (end < sc.length || cmp.slice(end - sc.length, end) !== sc) continue;
    const startIdx = end - sc.length;
    // Word boundary: the shortcut must not be glued to a preceding letter/digit ("site.com/sig" never expands).
    if (s.wordBoundary && startIdx > 0 && WORDCHAR.test(textBefore[startIdx - 1])) continue;
    const len = sc.length + delimiter.length;
    if (!best || sc.length > best.entry.shortcut.length) best = { entry: e, length: len, delimiter };
  }
  return best;
}

/** Shortcut conflicts: duplicates and (for immediate mode) shortcuts that are prefixes of others. */
export function shortcutConflicts(entries: { id: string; shortcut: string }[], caseSensitive: boolean) {
  const norm = (x: string) => (caseSensitive ? x : x.toLowerCase());
  const out: Record<string, string[]> = {};
  for (const a of entries) {
    if (!a.shortcut) continue;
    for (const b of entries) {
      if (a.id === b.id || !b.shortcut) continue;
      const A = norm(a.shortcut), B = norm(b.shortcut);
      if (A === B) (out[a.id] ||= []).push(`Same shortcut as "${b.shortcut}"`);
      else if (B.startsWith(A)) (out[a.id] ||= []).push(`"${a.shortcut}" is the start of "${b.shortcut}" — in instant mode "${b.shortcut}" can never be typed`);
    }
  }
  return out;
}
