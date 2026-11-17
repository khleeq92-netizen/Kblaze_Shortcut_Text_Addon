import { describe, it, expect, vi } from 'vitest';
import { heuristicPlan, parseDraft, aiPlan, buildPrompt, similarity, draftToRules } from '@/ai/builder';
import type { DetectedField } from '@/shared/types';

const F = (label: string, name: string, kind: any = 'text', options?: string[]): DetectedField => ({ kind, label, name, id: name, placeholder: '', required: false, css: '#' + name, xpath: '', hidden: false, options: options?.map((o) => ({ value: o, label: o })) });
const fields = [F('Name of Candidate', 'cand_name'), F('Date of Birth', 'dob', 'date'), F('Gender', 'gender', 'select', ['Male', 'Female']), F('Caste Category', 'cat', 'select', ['OPEN', 'OBC']), F('Mobile No.', 'mob', 'tel'), F('Residential Address', 'addr', 'textarea'), F('Enter Captcha', 'captcha'), F('Password', 'pw', 'password'), F("Father's Name", 'fname')];
const columns = [{ key: 'student_name', name: 'Student Name' }, { key: 'student_dob', name: 'DOB' }, { key: 'gender', name: 'Gender' }, { key: 'category', name: 'Category' }, { key: 'mobile', name: 'Mobile' }, { key: 'address', name: 'Address' }, { key: 'father_name', name: "Father's Name" }];
const input = { description: 'Fill student name, date of birth, gender, category, mobile number and address', url: 'https://11thadmission.org.in/form', fields, columns, variables: [] };

describe('offline matcher (no AI)', () => {
  it('maps FYJC-style fields to spreadsheet columns using synonyms', () => {
    const d = heuristicPlan(input);
    const map = Object.fromEntries(d.rules.map((r) => [r.target.value, r.value]));
    expect(map).toMatchObject({ cand_name: '{{student_name}}', dob: '{{student_dob}}', gender: '{{gender}}', cat: '{{category}}', mob: '{{mobile}}', addr: '{{address}}' });
    expect(map.captcha).toBeUndefined();
    expect(map.pw).toBeUndefined();
    expect(d.rules.find((r) => r.target.value === 'gender')!.action).toBe('select');
    expect(d.notes.join()).toMatch(/CAPTCHA/);
    expect(d.sites).toEqual([{ kind: 'domain', value: '11thadmission.org.in' }]);
    expect(draftToRules(d).every((r) => r.enabled)).toBe(true);
  });
  it('similarity', () => {
    expect(similarity('D.O.B', 'Date of Birth')).toBeGreaterThanOrEqual(0.9);
    expect(similarity('Mobile No', 'Contact Number')).toBeGreaterThanOrEqual(0.9);
    expect(similarity('Pincode', 'Gender')).toBeLessThan(0.5);
  });
});

describe('AI providers', () => {
  const reply = { name: 'FYJC', notes: [], rules: [
    { label: 'Name', by: 'id', target: 'cand_name', action: 'fill', value: '{{student_name}}', confidence: 0.95, reason: 'match' },
    { label: 'Captcha', by: 'id', target: 'captcha', action: 'fill', value: 'x', confidence: 0.3, reason: '' },
    { label: 'Odd', by: 'weird', target: 'x', action: 'explode', value: '{{nope}}', confidence: 7, reason: '' },
  ] };
  it('the prompt contains labels and column names but never values', () => {
    const p = buildPrompt({ ...input, fields: [{ ...F('Name', 'n'), value: 'TYPED-SECRET' }] });
    expect(p.user).toContain('Student Name');
    expect(p.user).not.toContain('TYPED-SECRET');
    expect(p.system).toMatch(/Never map CAPTCHA/);
  });
  it('validates model output: drops CAPTCHA, normalises invalid fields, flags unknown names', () => {
    const d = parseDraft(JSON.stringify(reply), input);
    expect(d.rules.map((r) => r.label)).toEqual(['Name', 'Odd']);
    expect(d.rules[1]).toMatchObject({ action: 'fill', confidence: 1, target: { by: 'auto' } });
    expect(d.notes.join()).toMatch(/unknown name\(s\) nope/);
    expect(() => parseDraft('{"x":1}', input)).toThrow(/rules/);
  });
  it('OpenAI-compatible and Gemini requests', async () => {
    const f = vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (url.includes('generativelanguage')) { expect(init.headers['x-goog-api-key']).toBe('k'); return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] })); }
      expect(body.response_format.type).toBe('json_schema');
      expect(init.headers.Authorization).toBe('Bearer k');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
    });
    const a = await aiPlan(input, { provider: 'openai-compatible', model: 'm', baseUrl: 'https://llm.local/v1/', allowPageContext: true }, 'k', f as any);
    expect(f.mock.calls[0][0]).toBe('https://llm.local/v1/chat/completions');
    expect(a.source).toBe('ai');
    const g = await aiPlan(input, { provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: '', allowPageContext: false }, 'k', f as any);
    expect(g.rules.length).toBe(2);
  });
  it('Anthropic request uses the SDK with structured output, default model and refusal fallback', async () => {
    let req: any; let headers: any;
    const f = vi.fn(async (_url: any, init: any) => {
      req = JSON.parse(init.body); headers = init.headers;
      return new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
    });
    const d = await aiPlan(input, { provider: 'anthropic', model: '', baseUrl: '', allowPageContext: true }, 'sk-test', f as any);
    expect(d.rules.length).toBe(2);
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.output_config.effort).toBe('medium');
    expect(req.fallbacks).toBe('default');
    const get = (k: string) => (typeof headers?.get === 'function' ? headers.get(k) : headers[k]);
    expect(String(get('anthropic-beta'))).toContain('server-side-fallback-2026-07-01');
    // current SDK sends the API key as a bearer credential; it must be exactly the user's key
    expect(get('x-api-key') || get('authorization')).toMatch(/^(Bearer )?sk-test$/);
    expect(get('anthropic-dangerous-direct-browser-access')).toBe('true');
  });
  it('reports refusals and missing configuration', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 0 } }), { headers: { 'content-type': 'application/json' } }));
    await expect(aiPlan(input, { provider: 'anthropic', model: '', baseUrl: '', allowPageContext: true }, 'k', f as any)).rejects.toThrow(/declined/);
    await expect(aiPlan(input, { provider: 'none', model: '', baseUrl: '', allowPageContext: true }, 'k')).rejects.toThrow(/offline matcher/);
    await expect(aiPlan(input, { provider: 'openai', model: '', baseUrl: '', allowPageContext: true }, '')).rejects.toThrow(/API key/);
  });
});
