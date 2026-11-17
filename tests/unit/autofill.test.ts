import { describe, it, expect } from 'vitest';
import { planAutofill, runAutofill, renderValue, evalCondition, type RunDeps } from '@/automation/autofill';
import type { AutofillRule } from '@/shared/types';
import { html } from './helpers';

const fo = { locale: 'en-IN', currency: 'INR', dateFormat: 'DD/MM/YYYY', timeFormat: 'HH:mm' };
const rule = (p: Partial<AutofillRule>): AutofillRule => ({ id: 'r' + Math.random(), enabled: true, label: p.label || 'x', target: { by: 'label', value: p.label || 'x' }, action: 'fill', value: '', overwrite: 'always', ...p });
const values = { student_name: 'Asha Patil', gender: 'Female', student_dob: '2008-09-05', category: 'OBC', mobile: '9876543210', college_name: 'Dr M.A. Aziz Jr College of Science, Phulambri' };
const deps = (p: Partial<RunDeps> = {}): RunDeps => ({ doc: document, preview: false, waitMs: 300, fieldDelayMs: 0, highlight: () => {}, confirm: async () => true, stopped: () => false, official: false, respectExisting: false, ...p });

describe('autofill planning', () => {
  it('renders values, formulas, conditions and page filters', () => {
    const plan = planAutofill({ rules: [
      rule({ label: 'Name', value: '{{student_name}}' }),
      rule({ label: 'Caps', value: '{{= upper(student_name)}}' }),
      rule({ label: 'Girls only', value: 'yes', condition: 'gender = "Female"' }),
      rule({ label: 'Boys only', value: 'yes', condition: 'gender = "Male"' }),
      rule({ label: 'Step 2', value: 'x', page: { kind: 'prefix', value: 'https://p.in/step2' } }),
      rule({ label: 'Off', value: 'x', enabled: false }),
      rule({ label: 'Unknown', value: '{{no_such_var}}' }),
      rule({ label: 'Bad cond', value: 'x', condition: 'gender = ' }),
    ] }, { values, fo, url: 'https://p.in/step1' });
    const by = Object.fromEntries(plan.map((p) => [p.label, p]));
    expect(by.Name.value).toBe('Asha Patil');
    expect(by.Caps.value).toBe('ASHA PATIL');
    expect(by['Girls only'].skip).toBeUndefined();
    expect(by['Boys only'].skip).toBe('Condition not met');
    expect(by['Step 2'].skip).toMatch(/Different page/);
    expect(by.Off.skip).toMatch(/disabled/);
    expect(by.Unknown.error).toMatch(/Unknown variable: no_such_var/);
    expect(by['Bad cond'].error).toMatch(/Condition error/);
  });
  it('renderValue / evalCondition helpers', () => {
    expect(renderValue('Hi {{student_name}}', { values, fo, url: '' }).value).toBe('Hi Asha Patil');
    expect(evalCondition('category = "OBC" and len(mobile) = 10', { values, fo, url: '' }).ok).toBe(true);
  });
});

describe('autofill run', () => {
  const FORM = `<form id="f"><label for="n">Student Name</label><input id="n">
    <label for="g">Gender</label><select id="g"><option></option><option>Male</option><option>Female</option></select>
    <label for="d">Date of Birth</label><input id="d" type="date">
    <label for="cap">Enter Captcha</label><input id="cap" name="captcha">
    <input type="hidden" name="secret" id="h">
    <button type="submit" id="sub">Final Submit</button></form>`;
  const rules = () => planAutofill({ rules: [
    rule({ label: 'Student Name', value: '{{student_name}}' }),
    rule({ label: 'Gender', value: '{{gender}}', action: 'select' }),
    rule({ label: 'Date of Birth', value: '{{student_dob}}' }),
    rule({ label: 'Captcha', target: { by: 'id', value: 'cap' }, value: 'ABCD' }),
    rule({ label: 'Hidden', target: { by: 'name', value: 'secret' }, value: 'x' }),
    rule({ label: 'Mobile', value: '{{mobile}}' }),
  ] }, { values, fo, url: 'https://x' });

  it('fills supported fields, refuses CAPTCHA and hidden fields, reports missing ones', async () => {
    html(FORM);
    const rep = await runAutofill(rules(), deps());
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('Asha Patil');
    expect((document.getElementById('g') as HTMLSelectElement).value).toBe('Female');
    expect((document.getElementById('d') as HTMLInputElement).value).toBe('2008-09-05');
    expect((document.getElementById('cap') as HTMLInputElement).value).toBe('');
    const st = Object.fromEntries(rep.items.map((i) => [i.label, i.status]));
    expect(st).toMatchObject({ 'Student Name': 'filled', Gender: 'filled', 'Date of Birth': 'filled', Captcha: 'blocked', Hidden: 'blocked', Mobile: 'notFound' });
    expect(rep.filled).toBe(3);
    expect(rep.failed).toBe(3);
  });
  it('preview validates without changing anything', async () => {
    html(FORM);
    const badges: string[] = [];
    const plan = rules();
    plan[1].value = 'Unknown';
    const rep = await runAutofill(plan, deps({ preview: true, highlight: (_el, label, kind) => { if (label) badges.push(`${kind}:${label}`); } }));
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('');
    expect(rep.items.find((i) => i.label === 'Student Name')!.status).toBe('previewed');
    expect(rep.items.find((i) => i.label === 'Gender')!.status).toBe('invalid');
    expect(badges.some((b) => b.startsWith('err:Gender'))).toBe(true);
  });
  it('waits for dynamically generated fields', async () => {
    html('<div id="w"></div>');
    setTimeout(() => { document.getElementById('w')!.innerHTML = '<label for="late">Mobile</label><input id="late">'; }, 100);
    const plan = planAutofill({ rules: [rule({ label: 'Mobile', value: '{{mobile}}' })] }, { values, fo, url: '' });
    const rep = await runAutofill(plan, deps({ waitMs: 2000 }));
    expect(rep.filled).toBe(1);
    expect((document.getElementById('late') as HTMLInputElement).value).toBe('9876543210');
  });
  it('submit-like clicks require approval; denied clicks are skipped', async () => {
    html(FORM);
    let submitted = false;
    document.getElementById('f')!.addEventListener('submit', (e) => { e.preventDefault(); submitted = true; });
    const plan = planAutofill({ rules: [rule({ label: 'Submit', target: { by: 'id', value: 'sub' }, action: 'click' })] }, { values, fo, url: '' });
    let asked = 0;
    const rep = await runAutofill(plan, deps({ confirm: async () => { asked++; return false; } }));
    expect(asked).toBe(1);
    expect(submitted).toBe(false);
    expect(rep.items[0].status).toBe('skipped');
  });
  it('respects existing values when asked and can be stopped', async () => {
    html('<label for="n">Student Name</label><input id="n" value="Typed by user">');
    const plan = planAutofill({ rules: [rule({ label: 'Student Name', value: '{{student_name}}', overwrite: 'ifEmpty' })] }, { values, fo, url: '' });
    await runAutofill(plan, deps({ respectExisting: true }));
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('Typed by user');
    const rep = await runAutofill(plan, deps({ stopped: () => true }));
    expect(rep.items[0].message).toBe('Stopped');
  });
});
