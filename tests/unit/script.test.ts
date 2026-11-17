import { describe, it, expect } from 'vitest';
import { instrument, hasErrors, checkScript } from '@/automation/script/instrument';
import { runScriptPayload } from '@/automation/script/host';
import { html } from './helpers';

const run = (code: string, p: any = {}) => {
  const ins = instrument(code);
  if (hasErrors(ins.problems)) throw new Error(ins.problems.map((x) => x.message).join());
  return runScriptPayload({ code: ins.code, vars: {}, timeoutMs: 3000, maxLoopIterations: 1000, ...p }, document);
};

describe('script instrumentation', () => {
  it('reports syntax errors with line and column', () => {
    const p = checkScript('let a = 1;\nlet b = ;');
    expect(p[0].severity).toBe('error');
    expect(p[0].line).toBe(2);
  });
  it('rejects extension APIs, eval and reserved names; warns about network access', () => {
    expect(hasErrors(checkScript('chrome.runtime.sendMessage({})'))).toBe(true);
    expect(hasErrors(checkScript('eval("1")'))).toBe(true);
    expect(hasErrors(checkScript('new Function("x")'))).toBe(true);
    expect(hasErrors(checkScript('__kfG = 1'))).toBe(true);
    expect(hasErrors(checkScript('import("x")'))).toBe(true);
    const w = checkScript('fetch("https://x")');
    expect(hasErrors(w)).toBe(false);
    expect(w[0].severity).toBe('warning');
    expect(checkScript('// eval() in a comment is fine\nconst s = "chrome.runtime";')).toEqual([]);
  });
  it('guards every kind of loop', () => {
    const r = instrument('for(;;) x++;\nwhile(1){}\ndo {} while(1);\nfor (const a of b) {}\nfor (const k in o) y();');
    expect(r.loops).toBe(5);
    expect((r.code.match(/__kfG\(/g) || []).length).toBe(5);
  });
});

describe('sandboxed script host', () => {
  it('fills, selects, reads page state and returns values + variables', async () => {
    html('<label for="n">Student Name</label><input id="n"><select name="g"><option>Male</option><option>Female</option></select><p id="msg">Saved</p>');
    const r = await run(`await kf.fill('Student Name', kf.vars.name);\nawait kf.select('select[name=g]', 'female');\nkf.setVar('seen', kf.text('#msg'));\nconst f = kf.fields();\nreturn { count: f.length, exists: kf.exists('#n'), v: kf.value('#n') };`, { vars: { name: 'Asha' } });
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ count: 2, exists: true, v: 'Asha' });
    expect(r.vars.seen).toBe('Saved');
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('Female');
  });
  it('stops runaway loops at the iteration limit and reports the line', async () => {
    const r = await run('let i = 0;\nwhile (true) { i++; }', { maxLoopIterations: 500 });
    expect(r.ok).toBe(false);
    expect(r.error!.message).toMatch(/exceeded 500 iterations/);
    expect(r.error!.line).toBe(2);
  });
  it('enforces the wall-clock timeout (sync and async)', async () => {
    const t0 = Date.now();
    const a = await run('let x = 0;\nfor (;;) { x = x + 1; }', { timeoutMs: 300, maxLoopIterations: 1e9 });
    expect(a.error!.message).toMatch(/timed out/);
    const b = await run('await kf.sleep(5000); return 1;', { timeoutMs: 300 });
    expect(b.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
  it('runtime errors carry the line number; logs are captured', async () => {
    const r = await run("kf.log('start', {a: 1});\nconsole.warn('careful');\nconst o = null;\no.x = 1;");
    expect(r.ok).toBe(false);
    expect(r.error!.line).toBe(4);
    expect(r.logs.map((l) => l.level)).toEqual(['log', 'warn', 'error']);
    expect(r.logs[0].text).toBe('start {"a":1}');
  });
  it('has no access to extension or host globals', async () => {
    (globalThis as any).chrome = { runtime: { id: 'secret-extension' } };
    const r = await run('return [typeof chrome, typeof window, typeof globalThis.chrome, typeof fetch, typeof localStorage];');
    expect(r.result).toEqual(['undefined', 'undefined', 'undefined', 'undefined', 'undefined']);
    delete (globalThis as any).chrome;
  });
  it('kf.click refuses submit-type buttons; library functions are available', async () => {
    html('<form><button type="submit" id="s">Submit</button><button type="button" id="t">Tab 2</button></form>');
    let clicked = '';
    document.getElementById('t')!.addEventListener('click', () => { clicked = 't'; });
    const r1 = await run("kf.click('#s')");
    expect(r1.error!.message).toMatch(/does not press submit/);
    const lib = instrument('function double(x) { return x * 2; }').code;
    const r2 = await runScriptPayload({ code: instrument("kf.click('#t'); return double(21);").code, libraries: [{ name: 'lib', code: lib }], vars: {}, timeoutMs: 2000, maxLoopIterations: 100 }, document);
    expect(r2.result).toBe(42);
    expect(clicked).toBe('t');
  });
});
