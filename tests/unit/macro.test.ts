import { describe, it, expect } from 'vitest';
import { playMacro, newRunState, validateMacro, describeStep, type MacroDeps } from '@/automation/macro';
import type { Macro, MacroStep } from '@/shared/types';
import { html } from './helpers';

const settings: Macro['settings'] = { stepDelayMs: 0, retries: 0, retryDelayMs: 10, timeoutMs: 400, onError: 'stop', speed: 1 };
const M = (steps: Partial<MacroStep>[], s: Partial<typeof settings> = {}): Pick<Macro, 'id' | 'name' | 'steps' | 'settings'> => ({ id: 'm', name: 'Test macro', steps: steps.map((x, i) => ({ id: 's' + i, type: 'delay', ...x }) as MacroStep), settings: { ...settings, ...s } });
function deps(p: Partial<MacroDeps> = {}): MacroDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls, doc: document,
    renderText: async (t: string, vars: Record<string, string>) => t.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] ?? ({ name: 'Asha' } as any)[k] ?? ''),
    evalFormula: async (src: string) => src === 'true',
    runAutofill: async (id: string) => { calls.push('autofill:' + id); return true; },
    runScript: async (id: string) => { calls.push('script:' + id); return { ok: true, vars: { fromScript: 'yes' } }; },
    insertSnippet: async () => true,
    nextRecord: async () => { calls.push('next'); return calls.filter((c) => c === 'next').length < 3; },
    confirm: async () => true,
    navigate: (u: string) => calls.push('nav:' + u),
    checkpoint: async () => { calls.push('cp'); },
    isStopped: () => false,
    waitWhilePaused: async () => {},
    highlight: () => {},
    onStep: () => {},
    official: false,
    url: () => 'https://test.local/form',
    ...p,
  } as any;
}

describe('macro player', () => {
  it('runs interaction steps on the page', async () => {
    html('<input id="n"><select id="s"><option>A</option><option>B</option></select><input type="checkbox" id="c"><label><input type="radio" name="r" value="x">X</label><button id="b">Go</button><span id="out">Total: 42</span>');
    let clicked = false;
    document.getElementById('b')!.addEventListener('click', () => { clicked = true; });
    const d = deps();
    const out = await playMacro(M([
      { type: 'type', target: { by: 'id', value: 'n' }, value: 'Hi {{name}}' },
      { type: 'select', target: { by: 'id', value: 's' }, value: 'B' },
      { type: 'check', target: { by: 'id', value: 'c' } },
      { type: 'radio', target: { by: 'name', value: 'r' }, value: 'X' },
      { type: 'click', target: { by: 'id', value: 'b' } },
      { type: 'extract', target: { by: 'id', value: 'out' }, value: 'total' },
      { type: 'autofill', refId: 'p1' },
      { type: 'script', refId: 's1' },
    ]), newRunState('m', 'run1'), d);
    expect(out.error).toBeUndefined();
    expect(out.status).toBe('success');
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('Hi Asha');
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('B');
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('[name=r]') as HTMLInputElement).checked).toBe(true);
    expect(clicked).toBe(true);
    expect(out.state.vars.total).toBe('Total: 42');
    expect(out.state.vars.fromScript).toBe('yes');
    expect(d.calls).toContain('autofill:p1');
  });
  it('conditions skip steps; goto loops honour the iteration limit', async () => {
    html('<input id="n">');
    const out = await playMacro(M([
      { type: 'label', value: 'top' },
      { type: 'type', target: { by: 'id', value: 'n' }, value: 'x', clear: false },
      { type: 'goto', value: 'top', maxIterations: 4 },
      { type: 'type', target: { by: 'id', value: 'n' }, value: 'never', condition: { kind: 'exists', target: { by: 'id', value: 'missing' } } },
    ]), newRunState('m', 'r'), deps());
    expect(out.status).toBe('success');
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('xxxxx'); // 1 + 4 loops
    expect(out.state.logs.join()).toMatch(/Loop limit of 4/);
    expect(out.state.stepLog.find((s) => s.i === 3)!.status).toBe('skip');
  });
  it('dataset batch loop with nextRecord ends after the last record', async () => {
    const d = deps();
    const out = await playMacro(M([{ type: 'label', value: 'L' }, { type: 'autofill', refId: 'p' }, { type: 'nextRecord' }, { type: 'goto', value: 'L', maxIterations: 50 }]), newRunState('m', 'r'), d);
    expect(out.status).toBe('success');
    expect(d.calls.filter((c) => c.startsWith('autofill')).length).toBe(3);
  });
  it('waits for elements that appear later and fails with a clear error when they never do', async () => {
    html('<div id="w"></div>');
    setTimeout(() => { document.getElementById('w')!.innerHTML = '<button id="late">Next</button>'; }, 100);
    const ok = await playMacro(M([{ type: 'waitFor', target: { by: 'id', value: 'late' }, ms: 2000 }, { type: 'click', target: { by: 'id', value: 'late' } }]), newRunState('m', 'r'), deps());
    expect(ok.error).toBeUndefined();
    const bad = await playMacro(M([{ type: 'click', target: { by: 'id', value: 'nothere' } }]), newRunState('m', 'r'), deps());
    expect(bad.status).toBe('failed');
    expect(bad.error).toMatch(/not found within/);
  });
  it('retries failing steps and can continue on error', async () => {
    html('<div id="w"></div>');
    let n = 0;
    const d = deps({ runScript: async () => { n++; return n < 3 ? { ok: false, error: 'flaky' } : { ok: true }; } });
    const out = await playMacro(M([{ type: 'script', refId: 'x', onError: 'retry', retries: 3 }]), newRunState('m', 'r'), d);
    expect(out.status).toBe('success');
    expect(n).toBe(3);
    const cont = await playMacro(M([{ type: 'click', target: { by: 'id', value: 'nope' } }, { type: 'delay', ms: 1 }], { onError: 'continue', timeoutMs: 100 }), newRunState('m', 'r'), deps());
    expect(cont.status).toBe('success');
    expect(cont.state.stepLog.map((s) => s.status)).toEqual(['fail', 'done']);
  });
  it('asks before submit-like clicks and stops when not approved', async () => {
    html('<form><button type="submit" id="s">Final Submit</button></form>');
    let asked = 0;
    const out = await playMacro(M([{ type: 'click', target: { by: 'id', value: 's' } }]), newRunState('m', 'r'), deps({ confirm: async () => { asked++; return false; } }));
    expect(asked).toBe(1);
    expect(out.status).toBe('failed');
    expect(out.error).toMatch(/not approved/);
  });
  it('navigation checkpoints the next step and returns "navigating"', async () => {
    const d = deps();
    const st = newRunState('m', 'r');
    const out = await playMacro(M([{ type: 'navigate', value: 'https://test.local/page2' }, { type: 'delay', ms: 1 }]), st, d);
    expect(out.status).toBe('navigating');
    expect(out.state.stepIndex).toBe(1);
    expect(d.calls).toContain('nav:https://test.local/page2');
    const bad = await playMacro(M([{ type: 'navigate', value: 'javascript:alert(1)' }]), newRunState('m', 'r'), deps());
    expect(bad.error).toMatch(/only http/);
  });
  it('stop and pause controls', async () => {
    let stopped = false;
    let paused = true;
    setTimeout(() => { paused = false; }, 80);
    const t0 = Date.now();
    const out = await playMacro(M([{ type: 'delay', ms: 1 }, { type: 'delay', ms: 5000 }]), newRunState('m', 'r'), deps({
      waitWhilePaused: async () => { while (paused) await new Promise((r) => setTimeout(r, 10)); },
      isStopped: () => stopped,
      onStep: (i, s) => { if (i === 1 && s === 'run') setTimeout(() => { stopped = true; }, 50); },
    }));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(70);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(['stopped', 'success']).toContain(out.status);
  });
  it('validation and descriptions', () => {
    const p = validateMacro({ steps: [{ id: '1', type: 'click' }, { id: '2', type: 'goto', value: 'nowhere' }, { id: '3', type: 'navigate', value: 'ftp://x' }, { id: '4', type: 'extract', target: { by: 'id', value: 'a' } }] as any });
    expect(p.length).toBe(4);
    expect(describeStep({ id: 'x', type: 'type', value: 'secret', sensitive: true, target: { by: 'label', value: 'Password' } })).toBe('Type •••• into "Password"');
  });
});
