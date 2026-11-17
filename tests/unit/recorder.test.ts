import { describe, it, expect } from 'vitest';
import { startRecorder, tidyRecording } from '@/automation/recorder';
import type { MacroStep } from '@/shared/types';
import { html } from './helpers';

describe('macro recorder', () => {
  it('records clicks, typing, selects, checkboxes and Enter; never records passwords or CAPTCHA', () => {
    html(`<form><label for="n">Name</label><input id="n"><label for="pw">Password</label><input type="password" id="pw">
      <label for="cap">Captcha</label><input id="cap" name="captcha"><select id="s"><option>A</option><option>B</option></select>
      <input type="checkbox" id="c"><button type="button" id="b">Next page</button></form>`);
    const steps: MacroStep[] = [];
    const rec = startRecorder({ doc: document, trustedOnly: false, onStep: (s, replace) => { const i = steps.findIndex((x) => x.id === s.id); if (replace && i >= 0) steps[i] = s; else steps.push(s); } });
    const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
    $('n').value = 'Asha'; $('n').dispatchEvent(new Event('change', { bubbles: true }));
    $('n').value = 'Asha P'; $('n').dispatchEvent(new Event('change', { bubbles: true })); // coalesced
    $('pw').value = 'hunter2'; $('pw').dispatchEvent(new Event('change', { bubbles: true }));
    $('cap').value = 'XYZ'; $('cap').dispatchEvent(new Event('change', { bubbles: true }));
    (document.getElementById('s') as HTMLSelectElement).value = 'B'; document.getElementById('s')!.dispatchEvent(new Event('change', { bubbles: true }));
    $('c').checked = true; $('c').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('b')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    $('n').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    rec.stop();
    const types = steps.map((s) => s.type);
    expect(types).toEqual(['type', 'type', 'select', 'check', 'click', 'type', 'key']);
    expect(steps[0].value).toBe('Asha P');
    expect(steps[1].sensitive).toBe(true);
    expect(steps[1].value).toBe('');
    expect(JSON.stringify(steps)).not.toContain('hunter2');
    expect(JSON.stringify(steps)).not.toContain('XYZ');
    expect(steps[2].value).toBe('B');
    expect(steps[4].note).toMatch(/Next page/);
    expect(steps[0].target!.by).toBe('css');
  });
  it('pause stops recording; untrusted events are ignored by default', () => {
    html('<input id="n">');
    const steps: MacroStep[] = [];
    const rec = startRecorder({ doc: document, onStep: (s) => steps.push(s) });
    document.getElementById('n')!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(steps.length).toBe(0); // synthetic page events are not user actions
    rec.stop();
    const rec2 = startRecorder({ doc: document, trustedOnly: false, onStep: (s) => steps.push(s) });
    rec2.pause(true);
    document.getElementById('n')!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(steps.length).toBe(0);
    rec2.stop();
  });
  it('tidyRecording merges consecutive duplicates', () => {
    const t = { by: 'css' as const, value: '#a' };
    const out = tidyRecording([{ id: '1', type: 'type', target: t, value: 'a' }, { id: '2', type: 'type', target: t, value: 'ab' }, { id: '3', type: 'scroll', y: 1 }, { id: '4', type: 'scroll', y: 2 }]);
    expect(out.map((s) => s.value ?? s.y)).toEqual(['ab', 2]);
  });
});
