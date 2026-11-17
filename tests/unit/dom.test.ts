import { describe, it, expect } from 'vitest';
import { cssFor, xpathFor, labelFor, detectFields, queryBy, resolveTarget, waitForTarget, targetFor, fieldKind } from '@/automation/dom';
import { html } from './helpers';

describe('selector generation', () => {
  it('produces unique CSS and XPath selectors that resolve back to the element', () => {
    html(`<form><div><input name="a"><input name="a"></div><div class="row"><input></div><div class="row"><input id="r1234567"></div><select id="g"><option>Male</option></select></form>`);
    const els = Array.from(document.querySelectorAll('input,select'));
    for (const el of els) {
      const css = cssFor(el);
      expect(document.querySelectorAll(css).length, css).toBe(1);
      expect(document.querySelector(css)).toBe(el);
      const xp = xpathFor(el);
      const r = document.evaluate(xp, document, null, 9, null).singleNodeValue;
      expect(r, xp).toBe(el);
    }
    expect(cssFor(document.getElementById('g')!)).toBe('#g');
    expect(cssFor(els[3])).not.toContain('r1234567'); // unstable ids are avoided
  });
  it('crosses open shadow roots with >>>', () => {
    html('<div id="host"></div>');
    const root = document.getElementById('host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<label for="sx">Shadow field</label><input id="sx">';
    const el = root.querySelector('input')!;
    const css = cssFor(el);
    expect(css).toContain('>>>');
    expect(queryBy(document, 'css', css)[0]).toBe(el);
    expect(queryBy(document, 'label', 'Shadow field')[0]).toBe(el);
  });
});

describe('labels and detection', () => {
  it('finds labels in for=, wrapping, aria, table cells and form groups', () => {
    html(`
      <label for="n">Student Name *</label><input id="n">
      <label>Mother's Name <input id="m"></label>
      <input id="a" aria-label="Aadhaar Number">
      <table><tr><td>Date of Birth</td><td><input id="d"></td></tr></table>
      <div class="form-group"><label class="control-label">Mobile No</label><div><input id="p"></div></div>
      <input id="z" placeholder="Pincode">`);
    const L = (id: string) => labelFor(document.getElementById(id)!);
    expect(L('n')).toBe('Student Name');
    expect(L('m')).toBe("Mother's Name");
    expect(L('a')).toBe('Aadhaar Number');
    expect(L('d')).toBe('Date of Birth');
    expect(L('p')).toBe('Mobile No');
    expect(L('z')).toBe('Pincode');
  });
  it('detects fields, groups radios, lists options and skips hidden unless asked', () => {
    html(`<form><input name="t" required><fieldset><legend>Gender</legend><label><input type="radio" name="g" value="M">Male</label><label><input type="radio" name="g" value="F">Female</label></fieldset>
      <select name="cat"><option value="">--</option><option value="OBC">OBC</option></select><input type="hidden" name="csrf" value="x"><textarea name="addr"></textarea><input type="checkbox" name="ok"><input type="password" name="pw" value="secret"></form>`);
    const f = detectFields(document);
    const radio = f.find((x) => x.kind === 'radio')!;
    expect(radio.label).toBe('Gender');
    expect(radio.options!.map((o) => o.label)).toEqual(['Male', 'Female']);
    expect(f.find((x) => x.name === 'cat')!.options!.length).toBe(2);
    expect(f.some((x) => x.name === 'csrf')).toBe(false);
    expect(detectFields(document, { includeHidden: true }).some((x) => x.name === 'csrf')).toBe(true);
    expect(f.find((x) => x.name === 'pw')!.value).toBe(''); // passwords are never read
    expect(f.find((x) => x.name === 't')!.required).toBe(true);
  });
  it('classifies controls', () => {
    html('<input type="date" id="a"><select multiple id="b"></select><div role="combobox" id="c"></div><div contenteditable="true" id="d"></div><input type="submit" id="e">');
    expect(['a', 'b', 'c', 'd', 'e'].map((i) => fieldKind(document.getElementById(i)!))).toEqual(['date', 'multiselect', 'combobox', 'contenteditable', 'button']);
  });
});

describe('target resolution', () => {
  it('supports every strategy with fallbacks and nth', () => {
    html('<label for="x">City</label><input id="x" name="city" placeholder="Your city"><input name="q"><input name="q">');
    const x = document.getElementById('x');
    expect(resolveTarget(document, { by: 'id', value: 'x' })).toBe(x);
    expect(resolveTarget(document, { by: 'name', value: 'city' })).toBe(x);
    expect(resolveTarget(document, { by: 'label', value: 'city' })).toBe(x);
    expect(resolveTarget(document, { by: 'regex', value: 'ci.y' })).toBe(x);
    expect(resolveTarget(document, { by: 'placeholder', value: 'Your city' })).toBe(x);
    expect(resolveTarget(document, { by: 'xpath', value: '//input[@name="city"]' })).toBe(x);
    expect(resolveTarget(document, { by: 'auto', value: '#x' })).toBe(x);
    expect(resolveTarget(document, { by: 'css', value: '#missing', fallbacks: [{ by: 'label', value: 'City' }] })).toBe(x);
    expect(resolveTarget(document, { by: 'name', value: 'q', nth: 1 })).toBe(document.querySelectorAll('[name=q]')[1]);
    expect(() => resolveTarget(document, { by: 'css', value: '##bad' })).toThrow(/Invalid CSS/);
  });
  it('targetFor builds a CSS primary with XPath + label fallbacks', () => {
    html('<label for="s">Surname</label><input id="s" name="surname">');
    const t = targetFor(document.getElementById('s')!);
    expect(t.by).toBe('css');
    expect(t.fallbacks!.map((f) => f.by)).toEqual(expect.arrayContaining(['xpath', 'label']));
  });
  it('waits for dynamically added elements and times out cleanly', async () => {
    html('<div id="root"></div>');
    setTimeout(() => { document.getElementById('root')!.innerHTML = '<input name="late">'; }, 120);
    const el = await waitForTarget(document, { by: 'name', value: 'late' }, 2000);
    expect(el?.getAttribute('name')).toBe('late');
    expect(await waitForTarget(document, { by: 'name', value: 'never' }, 200)).toBeNull();
  });
});
