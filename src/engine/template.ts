// Template syntax: literal text with commands in {{ ... }}.
//   {{name}}                         text field (or a reference to a defined field/variable)
//   {{command: main; key=value; flag}}
//   {{= formula; format=currency}}
//   {{if: cond}} … {{elseif: cond}} … {{else}} … {{endif}}
//   {{repeat: items; label=Item}} … {{endrepeat}}
//   {{section: extras; label=Add extras?}} … {{endsection}}
//   {{# comment}}        \{{ for a literal "{{"
import { decodeEntities } from '../shared/html';

export interface CommandArgs {
  main: string;
  opts: Record<string, string>;
  flags: Set<string>;
}

export type TNode =
  | { k: 'text'; text: string }
  | { k: 'cmd'; name: string; args: CommandArgs; raw: string; start: number; end: number }
  | { k: 'if'; branches: { cond: string; body: TNode[] }[]; elseBody: TNode[] | null; start: number }
  | { k: 'repeat'; args: CommandArgs; body: TNode[]; start: number; raw: string; end: number }
  | { k: 'section'; args: CommandArgs; body: TNode[]; start: number; raw: string; end: number };

export interface RawToken {
  type: 'text' | 'cmd';
  value: string;
  start: number;
  end: number;
}

export class TemplateError extends Error {
  constructor(message: string, public pos?: number) { super(message); }
}

/** Splits template source into literal text and command tokens (with source offsets). */
export function lex(src: string, html = false): RawToken[] {
  const out: RawToken[] = [];
  let i = 0;
  let text = '';
  let textStart = 0;
  while (i < src.length) {
    if (src[i] === '\\' && src.startsWith('{{', i + 1)) { text += '{{'; i += 3; continue; }
    if (src.startsWith('{{', i)) {
      // find closing }} not inside quotes
      let j = i + 2;
      let q: string | null = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
        if (c === '"' || c === "'") q = c;
        else if (c === '}' && src[j + 1] === '}') break;
      }
      if (j >= src.length) {
        // Unclosed: retry ignoring quotes
        const k = src.indexOf('}}', i + 2);
        if (k < 0) throw new TemplateError('A command starting with "{{" is never closed with "}}"', i);
        j = k;
      }
      if (text) out.push({ type: 'text', value: text, start: textStart, end: i });
      if (src.slice(i + 2, j).includes('{{')) throw new TemplateError('Commands cannot be nested inside other commands. Use a formula instead, e.g. {{link: ="https://site.com/" & id}}', i);
      let body = src.slice(i + 2, j);
      if (html) body = decodeEntities(body.replace(/<[^>]*>/g, '')).replace(/\u00a0/g, ' ');
      out.push({ type: 'cmd', value: body.trim(), start: i, end: j + 2 });
      i = j + 2;
      text = '';
      textStart = i;
      continue;
    }
    text += src[i++];
  }
  if (text) out.push({ type: 'text', value: text, start: textStart, end: src.length });
  return out;
}

/** Splits on a separator char, respecting quotes and parentheses. */
export function splitTop(s: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let q: string | null = null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') { cur += s[++i] ?? ''; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === sep && depth <= 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) return t.slice(1, -1).replace(/\\(["'\\])/g, '$1').replace(/\\n/g, '\n');
  return t;
}

/** Parses "name: main; k=v; flag" into a command name + args. */
export function parseCommand(body: string): { name: string; args: CommandArgs } {
  const b = body.trim();
  if (b.startsWith('=')) {
    const parts = splitTop(b.slice(1), ';');
    return { name: '=', args: { main: parts[0].trim(), ...parseOpts(parts.slice(1)) } };
  }
  if (b.startsWith('#')) return { name: '#', args: { main: b.slice(1), opts: {}, flags: new Set() } };
  const parts = splitTop(b, ';');
  const head = parts[0].trim();
  const m = /^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/.exec(head);
  let name: string;
  let main = '';
  if (m) { name = m[1].toLowerCase(); main = m[2].trim(); }
  else if (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(head)) {
    const lower = head.toLowerCase();
    const KEYWORDS = ['else', 'endif', 'endrepeat', 'endsection', 'cursor', 'today', 'now', 'time', 'date', 'index'];
    if (KEYWORDS.includes(lower) && !head.includes('.')) name = lower;
    else { name = 'ref'; main = head; }
  } else {
    const sp = /^([A-Za-z][\w-]*)\s+([\s\S]*)$/.exec(head);
    if (sp && ['if', 'elseif', 'repeat', 'section'].includes(sp[1].toLowerCase())) { name = sp[1].toLowerCase(); main = sp[2].trim(); }
    else throw new TemplateError(`Cannot understand command "{{${body}}}"`);
  }
  return { name, args: { main: name === 'if' || name === 'elseif' || name === 'set' ? main : unquote(main), ...parseOpts(parts.slice(1)) } };
}

function parseOpts(parts: string[]): { opts: Record<string, string>; flags: Set<string> } {
  const opts: Record<string, string> = {};
  const flags = new Set<string>();
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    if (eq > 0 && /^[\w-]+$/.test(t.slice(0, eq).trim())) opts[t.slice(0, eq).trim().toLowerCase()] = unquote(t.slice(eq + 1));
    else flags.add(t.toLowerCase());
  }
  return { opts, flags };
}

/** Parses template source into a block-structured AST. */
export function parseTemplate(src: string, html = false): TNode[] {
  const toks = lex(src, html);
  let p = 0;
  function block(terminators: string[]): { nodes: TNode[]; term: { name: string; args: CommandArgs; end: number } | null } {
    const nodes: TNode[] = [];
    while (p < toks.length) {
      const t = toks[p++];
      if (t.type === 'text') { nodes.push({ k: 'text', text: t.value }); continue; }
      if (!t.value) { nodes.push({ k: 'text', text: '' }); continue; }
      const { name, args } = parseCommand(t.value);
      if (terminators.includes(name)) return { nodes, term: { name, args, end: t.end } };
      if (name === 'if') {
        const branches: { cond: string; body: TNode[] }[] = [];
        let cond = args.main;
        let elseBody: TNode[] | null = null;
        for (;;) {
          const r = block(['elseif', 'else', 'endif']);
          if (!r.term) throw new TemplateError(`{{if: ${args.main}}} is missing {{endif}}`, t.start);
          branches.push({ cond, body: r.nodes });
          if (r.term.name === 'endif') break;
          if (r.term.name === 'elseif') { cond = r.term.args.main; continue; }
          const r2 = block(['endif']);
          if (!r2.term) throw new TemplateError(`{{if: ${args.main}}} is missing {{endif}}`, t.start);
          elseBody = r2.nodes;
          break;
        }
        if (branches.some((b) => !b.cond.trim())) throw new TemplateError('{{if}} / {{elseif}} needs a condition, e.g. {{if: amount > 100}}', t.start);
        nodes.push({ k: 'if', branches, elseBody, start: t.start });
        continue;
      }
      if (name === 'repeat' || name === 'section') {
        const end = name === 'repeat' ? 'endrepeat' : 'endsection';
        const r = block([end]);
        if (!r.term) throw new TemplateError(`{{${name}: ${args.main}}} is missing {{${end}}}`, t.start);
        nodes.push({ k: name, args, body: r.nodes, start: t.start, end: t.end, raw: t.value } as TNode);
        continue;
      }
      if (['else', 'elseif', 'endif', 'endrepeat', 'endsection'].includes(name)) throw new TemplateError(`{{${name}}} without a matching opening command`, t.start);
      nodes.push({ k: 'cmd', name, args, raw: t.value, start: t.start, end: t.end });
    }
    return { nodes, term: null };
  }
  const r = block([]);
  return r.nodes;
}
