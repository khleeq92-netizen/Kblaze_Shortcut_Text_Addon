import { describe, it, expect } from 'vitest';
import { setValue, validateValue, findOption, parseBool, formatDateFor } from '@/automation/setters';
import { html } from './helpers';

const $ = (s: string) => document.querySelector(s)! as any;

describe('value setters', () => {
  it('fills text inputs and fires input/change events (framework-compatible)', async () => {
    html('<input id="a">');
    const seen: string[] = [];
    for (const t of ['input', 'change', 'blur']) $('#a').addEventListener(t, () => seen.push(t));
    expect((await setValue($('#a'), 'Asha Patil')).ok).toBe(true);
    expect($('#a').value).toBe('Asha Patil');
    expect(seen).toEqual(expect.arrayContaining(['input', 'change']));
  });
  it('React-style controlled inputs see the value through the prototype setter', async () => {
    html('<input id="r">');
    const el = $('#r');
    let tracked = '';
    // emulate React's value tracker: instance-level setter that records the last value
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    Object.defineProperty(el, 'value', { configurable: true, get() { return proto.get!.call(this); }, set(v) { tracked = v; proto.set!.call(this, v); } });
    let fired = '';
    el.addEventListener('input', () => { fired = proto.get!.call(el); });
    await setValue(el, 'X1');
    expect(fired).toBe('X1');
    expect(tracked).not.toBe('X1'); // went through the prototype setter, so React's tracker detects a change
  });
  it('converts dates for date inputs and text date pickers', async () => {
    html('<input type="date" id="d"><input id="t" readonly>');
    expect((await setValue($('#d'), '05/09/2008')).ok).toBe(true);
    expect($('#d').value).toBe('2008-09-05');
    const r = await setValue($('#t'), '2008-09-05', { dateFormat: 'DD/MM/YYYY' });
    expect($('#t').value).toBe('05/09/2008');
    expect(r.warning).toMatch(/read-only/);
    expect((await setValue($('#d'), 'not a date')).ok).toBe(false);
    expect(formatDateFor('month', '2025-03-10')).toBe('2025-03');
  });
  it('numbers, maxlength and readonly', async () => {
    html('<input type="number" id="n"><input id="m" maxlength="4">');
    expect((await setValue($('#n'), '1,250')).ok).toBe(true);
    expect($('#n').value).toBe('1250');
    expect((await setValue($('#n'), 'abc')).ok).toBe(false);
    const r = await setValue($('#m'), '123456');
    expect($('#m').value).toBe('1234');
    expect(r.warning).toMatch(/truncated/);
  });
  it('selects options by value, text, case and fuzzy match', async () => {
    html('<select id="s"><option value="">Select</option><option value="1">OPEN</option><option value="2">OBC</option><option value="3">VJ/DT(A)</option><option value="4">Female</option></select>');
    const s = $('#s');
    await setValue(s, 'obc'); expect(s.value).toBe('2');
    await setValue(s, '3'); expect(s.value).toBe('3');
    await setValue(s, 'vjdt(a)'); expect(s.value).toBe('3');
    await setValue(s, 'fem'); expect(s.value).toBe('4');
    const bad = await setValue(s, 'SC');
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/not found/);
    expect(findOption(s, '')?.value).toBe('');
  });
  it('multi-select with partial misses', async () => {
    html('<select id="m" multiple><option>Physics</option><option>Chemistry</option><option>Biology</option></select>');
    const r = await setValue($('#m'), 'Physics, Biology; Maths');
    expect(Array.from(($('#m') as HTMLSelectElement).selectedOptions).map((o) => o.text)).toEqual(['Physics', 'Biology']);
    expect(r.warning).toMatch(/Maths/);
  });
  it('radio groups by value or label, checkboxes by truthy values', async () => {
    html('<label><input type="radio" name="g" value="M">Male</label><label><input type="radio" name="g" value="F">Female</label><input type="checkbox" id="c">');
    await setValue($('input[value=F]'), 'Female', { action: 'radio' });
    expect($('input[value=F]').checked).toBe(true);
    await setValue($('input[value=F]'), 'm', { action: 'radio' });
    expect($('input[value=M]').checked).toBe(true);
    expect((await setValue($('input[value=M]'), 'Other', { action: 'radio' })).ok).toBe(false);
    await setValue($('#c'), 'yes'); expect($('#c').checked).toBe(true);
    await setValue($('#c'), 'no'); expect($('#c').checked).toBe(false);
    await setValue($('#c'), '', { action: 'check' }); expect($('#c').checked).toBe(true);
    expect(parseBool('Haan')).toBe(true);
    expect(parseBool('maybe')).toBeNull();
  });
  it('contenteditable, file inputs and disabled fields', async () => {
    html('<div contenteditable="true" id="e"></div><input type="file" id="f"><input id="x" disabled>');
    expect((await setValue($('#e'), 'Hello')).ok).toBe(true);
    expect($('#e').textContent).toBe('Hello');
    expect((await setValue($('#f'), 'x')).message).toMatch(/do not allow/);
    expect((await setValue($('#x'), 'x')).ok).toBe(false);
  });
  it('custom ARIA dropdowns are opened and the option is clicked', async () => {
    html('<div role="combobox" id="cb" aria-controls="lb" tabindex="0">Choose</div><ul id="lb" role="listbox"><li role="option" data-value="mh">Maharashtra</li><li role="option" data-value="ka">Karnataka</li></ul>');
    let picked = '';
    document.querySelectorAll('[role=option]').forEach((o) => o.addEventListener('click', () => { picked = (o as HTMLElement).dataset.value!; }));
    const r = await setValue($('#cb'), 'Karnataka');
    expect(r.ok).toBe(true);
    expect(picked).toBe('ka');
  });
  it('validateValue reports problems without changing the page', () => {
    html('<input type="email" id="e" required><select id="s"><option>A</option></select><input pattern="[0-9]{6}" id="p"><input type="tel" id="t">');
    expect(validateValue($('#e'), 'nope')).toMatch(/email/);
    expect(validateValue($('#e'), '')).toMatch(/Required/);
    expect(validateValue($('#s'), 'B')).toMatch(/not found/);
    expect(validateValue($('#p'), '43113')).toMatch(/pattern/);
    expect(validateValue($('#p'), '431131')).toBeNull();
    expect(validateValue($('#t'), 'abc')).toMatch(/phone/);
    expect($('#e').value).toBe('');
  });
});
