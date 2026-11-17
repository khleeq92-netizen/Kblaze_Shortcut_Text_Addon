// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { parseDelimited, detectDelimiter, sheetToTable, guessColumnType, checkQuality, findRecords, recordLabel, jsonSource, csvSource, xlsxSource } from '@/data/sources';
import { parseSheetUrl, csvExportUrl, loadPublicSheet, loadPrivateSheet, appendRows } from '@/data/gsheets';
import { writeXlsx } from '@/data/xlsx';

describe('delimited text', () => {
  it('detects delimiters and handles quotes, newlines and BOM', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(parseDelimited('﻿name,addr\n"Patil, Asha","Line 1\nLine 2"\n"He said ""hi""",x\n')).toEqual([['name', 'addr'], ['Patil, Asha', 'Line 1\nLine 2'], ['He said "hi"', 'x']]);
  });
});

describe('sheet -> dataset', () => {
  const sheet = { name: 'Students', rows: [
    ['GR No', 'Student Name', 'Aadhaar No', 'Mobile', 'DOB', 'Marks', 'Gender', 'Email'],
    ['0012', 'Asha', '1234 5678 9012', '9876543210', '2008-09-05', '87', 'Female', 'a@x.in'],
    ['0013', 'Ravi', '123456789012', '98765', '05/01/2008', '91', 'Male', 'bad-email'],
    ['0012', 'Asha dup', '', '', '', '70', 'Female', ''],
    ['', '', '', '', '', '', '', ''],
  ], source: { kind: 'csv' as const } };
  it('types columns, keeps ids as text and flags sensitive columns', () => {
    const t = sheetToTable(sheet, { workspaceId: 'ws_college' });
    const type = (k: string) => t.columns.find((c) => c.key === k)!.type;
    expect(t.rows.length).toBe(3); // blank row dropped
    expect(type('gr_no')).toBe('text');
    expect(t.rows[0].values.gr_no).toBe('0012');
    expect(type('marks')).toBe('number');
    expect(type('dob')).toBe('date');
    expect(t.keyColumn).toBe('gr_no');
    expect(t.sensitiveColumns).toEqual(expect.arrayContaining(['aadhaar_no', 'mobile', 'dob', 'email']));
    expect(t.workspaceId).toBe('ws_college');
    expect(guessColumnType('Pincode', ['431111', '431112'])).toBe('text');
  });
  it('column mapping: custom keys, skipped columns, header row', () => {
    const t = sheetToTable({ name: 'x', rows: [['title row'], ['A', 'B'], ['1', '2']] }, { headerRow: 1, keys: { 0: 'first' }, skipColumns: [1], autoSensitive: false });
    expect(t.columns.map((c) => c.key)).toEqual(['first']);
    expect(t.rows[0].values).toEqual({ first: 1 });
  });
  it('quality: duplicates, missing required fields, invalid values; record lookup', () => {
    const t = { ...sheetToTable(sheet), requiredColumns: ['student_name', 'aadhaar_no'] };
    const q = checkQuality(t);
    expect(q.duplicates).toEqual([{ key: '0012', rowIds: [t.rows[0].id, t.rows[2].id] }]);
    expect(q.missing.map((m) => m.rowIndex)).toEqual([2]);
    const problems = q.invalid.map((i) => `${i.rowIndex}:${i.column}`);
    expect(problems).toEqual(expect.arrayContaining(['1:mobile', '1:email']));
    expect(problems).not.toContain('0:aadhaar_no');
    expect(findRecords(t, '0013').map((r) => r.values.student_name)).toEqual(['Ravi']);
    expect(findRecords(t, 'asha').length).toBe(2);
    expect(recordLabel(t, t.rows[1].id)).toBe('0013 · Ravi');
  });
  it('adapters: csv, json, xlsx', async () => {
    expect((await csvSource.load({ name: 'a.csv', text: 'x;y\n1;2' }))[0].rows).toEqual([['x', 'y'], ['1', '2']]);
    const j = await jsonSource.load({ name: 'a.json', text: JSON.stringify([{ name: 'A', n: 1 }, { name: 'B', extra: { a: 1 } }]) });
    expect(j[0].rows).toEqual([['name', 'n', 'extra'], ['A', '1', ''], ['B', '', '{"a":1}']]);
    await expect(jsonSource.load({ name: 'b.json', text: '{"x":1}' })).rejects.toThrow(/array/);
    const x = await xlsxSource.load({ name: 'b.xlsx', bytes: writeXlsx([{ name: 'S', rows: [['a'], ['1']] }]) });
    expect(x[0].source.sheet).toBe('S');
  });
});

describe('Google Sheets', () => {
  it('parses links', () => {
    expect(parseSheetUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42')).toEqual({ id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', gid: '42' });
    expect(parseSheetUrl('hello')).toBeNull();
    expect(csvExportUrl('ID', '7')).toBe('https://docs.google.com/spreadsheets/d/ID/export?format=csv&gid=7');
  });
  it('reads public sheets via CSV export and reports private ones', async () => {
    const ok = vi.fn(async () => new Response('a,b\n1,2', { headers: { 'content-type': 'text/csv' } }));
    const r = await loadPublicSheet('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', ok as any);
    expect(r[0].rows).toEqual([['a', 'b'], ['1', '2']]);
    const html = vi.fn(async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }));
    await expect(loadPublicSheet('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/', html as any)).rejects.toThrow(/not public/);
  });
  it('reads private sheets with the Sheets API and appends report rows', async () => {
    const calls: string[] = [];
    const f = vi.fn(async (url: string, init?: any) => {
      calls.push(`${init?.method || 'GET'} ${url} ${init?.headers?.Authorization || ''}`);
      if (url.includes('fields=sheets')) return new Response(JSON.stringify({ sheets: [{ properties: { title: 'Roster', sheetId: 0 } }] }));
      if (url.includes(':append')) return new Response('{}');
      return new Response(JSON.stringify({ values: [['Name', 'Class'], ['Asha']] }));
    });
    const r = await loadPrivateSheet('tok', 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/', undefined, f as any);
    expect(r[0].rows).toEqual([['Name', 'Class'], ['Asha', '']]);
    expect(calls[1]).toContain("values/'Roster'");
    expect(calls.every((c) => c.endsWith('Bearer tok'))).toBe(true);
    await appendRows('tok', 'ID', 'Report', [['a', 1]], f as any);
    expect(calls.at(-1)).toMatch(/^POST .*:append\?valueInputOption=RAW/);
    const denied = vi.fn(async () => new Response('', { status: 403 }));
    await expect(loadPrivateSheet('tok', 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/', 'X', denied as any)).rejects.toThrow(/No access/);
  });
});
