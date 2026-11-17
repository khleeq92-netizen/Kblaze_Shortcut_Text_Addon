// AI-assisted automation builder.
//  - heuristicPlan(): offline matcher (no AI, no network) that maps page fields to
//    dataset columns / variables using labels, names and a synonym dictionary.
//  - aiPlan(): sends the task description + field LABELS / column NAMES (never
//    values) to the configured provider and validates the JSON it returns.
// Both return the same draft, which the user inspects, tests and approves before saving.
import type { AutofillRule, DetectedField, SitePattern, AISettings, TargetBy, AutofillAction } from '../shared/types';
import { uid } from '../shared/ids';

export interface BuilderInput {
  description: string;
  url?: string;
  fields: DetectedField[];
  columns: { key: string; name: string }[];
  variables: { name: string; label?: string }[];
}
export interface DraftRule { label: string; target: { by: TargetBy; value: string }; action: AutofillAction; value: string; confidence: number; reason: string }
export interface Draft { name: string; sites: SitePattern[]; rules: DraftRule[]; notes: string[]; source: 'heuristic' | 'ai' }

// ---------------------------------------------------------------- heuristics
const SYNONYMS: string[][] = [
  ['name', 'full name', 'student name', 'candidate name', 'applicant name', 'name of student', 'name of candidate'],
  ['first name', 'given name', 'fname'], ['middle name', 'father name', 'fathers name', "father's name", 'mname'], ['last name', 'surname', 'family name', 'lname'],
  ['mother name', 'mothers name', "mother's name"],
  ['dob', 'date of birth', 'birth date', 'birthdate', 'd o b'],
  ['gender', 'sex'], ['category', 'caste category', 'social category', 'caste'], ['religion'],
  ['mobile', 'mobile no', 'mobile number', 'phone', 'phone number', 'contact', 'contact no', 'cell', 'whatsapp'],
  ['email', 'email id', 'e mail', 'mail'],
  ['address', 'residential address', 'permanent address', 'correspondence address', 'addr'],
  ['city', 'town', 'village'], ['district'], ['taluka', 'tehsil', 'block'], ['state'], ['pincode', 'pin code', 'postal code', 'zip', 'pin'],
  ['aadhaar', 'aadhar', 'aadhaar no', 'uid', 'aadhaar number'],
  ['roll no', 'roll number', 'seat no', 'seat number'], ['gr no', 'general register', 'gr number', 'registration no', 'reg no'],
  ['udise', 'udise code', 'school udise'], ['class', 'standard', 'std', 'grade'], ['division', 'div', 'section'], ['stream', 'faculty'],
  ['marks', 'percentage', 'score'], ['admission date', 'date of admission'], ['blood group'], ['nationality'], ['mother tongue'],
  ['entry', 'entry price', 'trade entry'], ['stop loss', 'sl'], ['take profit', 'tp', 'target'], ['lot', 'lot size', 'volume'], ['symbol', 'pair', 'instrument'],
];

export function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/[_\-./()*:]+/g, ' ').replace(/\b(the|of|your|enter|please|select|choose)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(s: string) { return new Set(normalizeLabel(s).split(' ').filter((t) => t.length > 1)); }
function group(s: string): number {
  const n = normalizeLabel(s);
  let best = -1, bestLen = 0;
  SYNONYMS.forEach((g, i) => g.forEach((w) => { const nw = normalizeLabel(w); if ((n === nw || n.includes(nw)) && nw.length > bestLen) { best = i; bestLen = nw.length; } }));
  return best;
}

export function similarity(a: string, b: string): number {
  const na = normalizeLabel(a), nb = normalizeLabel(b);
  if (!na || !nb) return 0;
  if (na === nb || na.replace(/ /g, '') === nb.replace(/ /g, '')) return 1;
  const ga = group(a), gb = group(b);
  if (ga >= 0 && ga === gb) return 0.9;
  const ta = tokens(a), tb = tokens(b);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const j = inter / Math.max(1, new Set([...ta, ...tb]).size);
  return na.includes(nb) || nb.includes(na) ? Math.max(0.7, j) : j;
}

function fieldText(f: DetectedField) { return [f.label, f.name, f.id, f.placeholder].filter(Boolean).join(' '); }
function actionFor(f: DetectedField): AutofillAction {
  if (f.kind === 'select' || f.kind === 'multiselect' || f.kind === 'combobox') return 'select';
  if (f.kind === 'radio') return 'radio';
  if (f.kind === 'checkbox') return 'check';
  return 'fill';
}
export function targetForField(f: DetectedField): { by: TargetBy; value: string } {
  if (f.kind === 'radio' && f.name) return { by: 'name', value: f.name };
  if (f.id && !/\d{4,}/.test(f.id)) return { by: 'id', value: f.id };
  if (f.name) return { by: 'name', value: f.name };
  return { by: 'css', value: f.css };
}

const SKIP_KINDS = new Set(['button', 'file', 'hidden', 'password']);

export function heuristicPlan(input: BuilderInput): Draft {
  const sources = [...input.columns.map((c) => ({ ref: c.key, text: c.name, kind: 'column' })), ...input.variables.map((v) => ({ ref: v.name, text: v.label || v.name, kind: 'variable' }))];
  const desc = normalizeLabel(input.description);
  const wanted = desc ? SYNONYMS.map((g, i) => (g.some((w) => desc.includes(normalizeLabel(w))) ? i : -1)).filter((i) => i >= 0) : [];
  const rules: DraftRule[] = [];
  const used = new Set<string>();
  const notes: string[] = [];
  for (const f of input.fields) {
    if (SKIP_KINDS.has(f.kind)) continue;
    if (/captcha|otp/i.test(fieldText(f))) { notes.push(`Skipped "${f.label}" — CAPTCHA/OTP fields are always left for you.`); continue; }
    let best: { ref: string; score: number; text: string } | null = null;
    for (const s of sources) {
      const sc = Math.max(similarity(f.label, s.text), similarity(f.name || '', s.text) * 0.95, similarity(f.placeholder || '', s.text) * 0.9);
      if (sc > (best?.score || 0)) best = { ref: s.ref, score: sc, text: s.text };
    }
    const g = group(f.label || f.name);
    const mentioned = wanted.includes(g);
    if (!best || best.score < 0.5) {
      if (mentioned) notes.push(`"${f.label}" was mentioned in your description but no matching column/variable was found — map it manually.`);
      continue;
    }
    if (wanted.length && !mentioned && best.score < 0.9) continue;
    if (used.has(best.ref) && best.score < 0.95) continue;
    used.add(best.ref);
    rules.push({ label: f.label || f.name, target: targetForField(f), action: actionFor(f), value: `{{${best.ref}}}`, confidence: Math.round(best.score * 100) / 100, reason: `"${f.label || f.name}" ≈ "${best.text}"` });
  }
  let host = '';
  try { host = input.url ? new URL(input.url).hostname.replace(/^www\./, '') : ''; } catch { /* ignore */ }
  return { name: input.description.slice(0, 60) || `Autofill ${host}`, sites: host ? [{ kind: 'domain', value: host }] : [], rules, notes, source: 'heuristic' };
}

// ---------------------------------------------------------------- AI providers
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
  'openai-compatible': '',
};

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'rules', 'notes'],
  properties: {
    name: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'by', 'target', 'action', 'value', 'confidence', 'reason'],
        properties: {
          label: { type: 'string' },
          by: { type: 'string', enum: ['id', 'name', 'css', 'label', 'xpath'] },
          target: { type: 'string' },
          action: { type: 'string', enum: ['fill', 'select', 'radio', 'check', 'uncheck'] },
          value: { type: 'string' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

export function buildPrompt(input: BuilderInput): { system: string; user: string } {
  const fields = input.fields.filter((f) => !SKIP_KINDS.has(f.kind)).slice(0, 200).map((f) => ({ label: f.label, name: f.name, id: f.id, kind: f.kind, required: f.required, options: f.options?.slice(0, 30).map((o) => o.label) }));
  const system = [
    'You design browser form-autofill rules for the K-Flow Automation extension.',
    'Map each relevant page field to a data source. Values are templates: use {{column_key}} for dataset columns or {{variable_name}} for variables; static text is allowed.',
    'Use only the column keys and variable names provided. Prefer targets by "id", then "name", then "css". For radio groups target by "name".',
    'For select/radio fields with fixed options, the value must be a template that yields one of the options; if the data may differ (e.g. "M" vs "Male") add a note.',
    'Never map CAPTCHA, OTP, password or file-upload fields, and never include clicks on submit/save buttons — the user submits forms manually.',
    'Return only the JSON object described by the schema. confidence is 0..1.',
  ].join('\n');
  const user = JSON.stringify({ task: input.description, page: input.url || null, fields, dataset_columns: input.columns, variables: input.variables });
  return { system, user };
}

export function parseDraft(json: unknown, input: BuilderInput): Draft {
  const o = typeof json === 'string' ? JSON.parse(json.replace(/^```(?:json)?\s*|\s*```$/g, '')) : json;
  if (!o || typeof o !== 'object' || !Array.isArray((o as any).rules)) throw new Error('The AI response did not contain rules');
  const known = new Set([...input.columns.map((c) => c.key), ...input.variables.map((v) => v.name), 'row', 'record', 'today', 'now']);
  const notes: string[] = Array.isArray((o as any).notes) ? (o as any).notes.filter((n: any) => typeof n === 'string').slice(0, 30) : [];
  const rules: DraftRule[] = [];
  for (const r of (o as any).rules.slice(0, 300)) {
    if (!r || typeof r.target !== 'string' || !r.target.trim()) continue;
    const by = ['id', 'name', 'css', 'label', 'xpath'].includes(r.by) ? r.by : 'auto';
    const action = ['fill', 'select', 'radio', 'check', 'uncheck'].includes(r.action) ? r.action : 'fill';
    const value = String(r.value ?? '').slice(0, 2000);
    const refs = [...value.matchAll(/\{\{\s*([A-Za-z_]\w*)/g)].map((m) => m[1]);
    const unknown = refs.filter((x) => !known.has(x));
    if (unknown.length) notes.push(`Rule "${r.label}": unknown name(s) ${unknown.join(', ')} — check the value.`);
    if (/captcha|otp|password/i.test(`${r.label} ${r.target}`)) { notes.push(`Dropped "${r.label}" (CAPTCHA/OTP/password fields are never automated).`); continue; }
    rules.push({ label: String(r.label || r.target).slice(0, 120), target: { by, value: r.target.slice(0, 500) }, action, value, confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)), reason: String(r.reason || '').slice(0, 300) });
  }
  let host = '';
  try { host = input.url ? new URL(input.url).hostname.replace(/^www\./, '') : ''; } catch { /* ignore */ }
  return { name: String((o as any).name || 'AI autofill profile').slice(0, 120), sites: host ? [{ kind: 'domain', value: host }] : [], rules, notes, source: 'ai' };
}

type Fetch = typeof fetch;

async function callAnthropic(apiKey: string, model: string, p: { system: string; user: string }, f?: Fetch): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // The key is the user's own (stored encrypted on this device) and requests go straight to Anthropic.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, ...(f ? { fetch: f as any } : {}) });
  const res: any = await client.beta.messages.create({
    model: model || DEFAULT_MODELS.anthropic,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    system: p.system,
    messages: [{ role: 'user', content: p.user }],
  } as any);
  if (res.stop_reason === 'refusal') throw new Error('The AI model declined this request. Try rephrasing the task, or use the offline matcher.');
  if (res.stop_reason === 'max_tokens') throw new Error('The AI response was cut off — try a page with fewer fields.');
  const text = (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  if (!text) throw new Error('The AI returned no text');
  return text;
}

async function callOpenAI(apiKey: string, model: string, baseUrl: string, p: { system: string; user: string }, f: Fetch): Promise<string> {
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '') + '/chat/completions';
  const res = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }], response_format: { type: 'json_schema', json_schema: { name: 'kflow_draft', strict: true, schema: DRAFT_SCHEMA } } }),
  });
  if (!res.ok) throw new Error(`AI provider error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

async function callGemini(apiKey: string, model: string, p: { system: string; user: string }, f: Fetch): Promise<string> {
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: p.system }] }, contents: [{ role: 'user', parts: [{ text: p.user }] }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join('') || '';
}

export async function aiPlan(input: BuilderInput, ai: AISettings, apiKey: string, f: Fetch = (...a) => fetch(...a)): Promise<Draft> {
  if (ai.provider === 'none') throw new Error('Choose an AI provider in Settings → AI, or use the offline matcher');
  if (!apiKey) throw new Error('Add your API key in Settings → AI');
  const p = buildPrompt(ai.allowPageContext ? input : { ...input, fields: input.fields.map((f2) => ({ ...f2, options: undefined })) });
  const model = ai.model || DEFAULT_MODELS[ai.provider] || '';
  if (!model) throw new Error('Enter a model name for your provider');
  const text = ai.provider === 'anthropic' ? await callAnthropic(apiKey, model, p, f) : ai.provider === 'gemini' ? await callGemini(apiKey, model, p, f) : await callOpenAI(apiKey, model, ai.provider === 'openai' ? '' : ai.baseUrl, p, f);
  return parseDraft(text, input);
}

export function draftToRules(d: Draft): AutofillRule[] {
  return d.rules.map((r) => ({ id: uid('rul'), enabled: true, label: r.label, target: { by: r.target.by, value: r.target.value }, action: r.action, value: r.value, overwrite: 'always', fieldKind: 'auto' }));
}
