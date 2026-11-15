import { describe, it, expect } from 'vitest';
import { parseImport, parseCSV, toCSV, normalizeWorkflow, ImportError } from '@/shared/validate';
import { sanitizeHtml, htmlToText } from '@/shared/html';

describe('import validation', () => {
  it('accepts our bundle format', () => {
    const b = parseImport(JSON.stringify({ format: 'quicktext-hub', version: 1, snippets: [{ name: 'A', shortcut: '/a', content: 'x' }], folders: [{ name: 'F' }] }));
    expect(b.snippets[0].shortcut).toBe('/a');
    expect(b.folders[0].name).toBe('F');
  });
  it('accepts arrays and shortcut maps', () => {
    expect(parseImport('[{"abbreviation":"/x","text":"y"}]').snippets[0].content).toBe('y');
    expect(parseImport('{"/hi":"Hello"}').snippets[0].shortcut).toBe('/hi');
  });
  it('rejects garbage', () => {
    expect(() => parseImport('not json')).toThrow(ImportError);
    expect(() => parseImport('{"snippets": 5}')).toThrow(/Unrecognised|No snippets/);
  });
  it('sanitizes rich content and strips whitespace from shortcuts', () => {
    const b = parseImport(JSON.stringify([{ shortcut: '/ a', contentType: 'html', content: '<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">l</a><img src=x onerror=alert(1)></p>' }]));
    const s = b.snippets[0];
    expect(s.shortcut).toBe('/a');
    expect(s.content).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(s.content).toContain('Hi');
  });
  it('clamps and filters workflow steps', () => {
    const w = normalizeWorkflow({ name: 'w', steps: [{ type: 'type', value: 'a' }, { type: 'evil' }, { type: 'wait', ms: 999999 }] });
    expect(w.steps.map((s) => s.type)).toEqual(['type', 'wait']);
    expect(w.steps[1].ms).toBe(60000);
  });
});

describe('csv', () => {
  it('parses quotes, commas and newlines', () => {
    expect(parseCSV('a,b\n"x, y","he said ""hi"""\r\n1,2')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']]);
  });
  it('round-trips and neutralises formula injection', () => {
    const out = toCSV([['name', 'note'], ['Ann', '=HYPERLINK("x")'], ['Bob', '-5']]);
    expect(out).toContain("'=HYPERLINK");
    expect(out).toContain('-5');
    expect(parseCSV(out)[1][0]).toBe('Ann');
  });
});

describe('html helpers', () => {
  it('htmlToText keeps structure', () => {
    expect(htmlToText('<p>Hi <b>there</b></p><ul><li>one</li><li>two</li></ul><p>Bye<br>now</p>')).toBe('Hi there\n• one\n• two\nBye\nnow');
    expect(htmlToText('<a href="https://x.io">link</a> &amp; more')).toBe('link (https://x.io) & more');
  });
  it('sanitizeHtml keeps allowed formatting', () => {
    expect(sanitizeHtml('<b>a</b><i>b</i><custom>c</custom>')).toBe('<b>a</b><i>b</i>c');
  });
});

import fs from 'node:fs';
describe('sample files', () => {
  it('samples/*.json import cleanly', () => {
    for (const f of ['samples/sample-snippets.json', 'samples/template-library.json']) {
      const b = parseImport(fs.readFileSync(f, 'utf8'));
      expect(b.snippets.length).toBeGreaterThan(5);
    }
  });
});
