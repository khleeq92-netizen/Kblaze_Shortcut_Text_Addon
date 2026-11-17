// Static analysis + instrumentation of user scripts before execution.
//  - syntax errors with line/column (debugging)
//  - every loop body gets a guard: iteration limit + wall-clock deadline
//  - every statement records its line, so runtime errors point to a line
//  - names reserved for the runtime (__kf*) and dangerous APIs are rejected
import { parse, type Node } from 'acorn';

export interface ScriptProblem { message: string; line?: number; column?: number; severity: 'error' | 'warning' }
export interface Instrumented { code: string; problems: ScriptProblem[]; loops: number }

const FORBIDDEN: { re: RegExp; msg: string; severity: 'error' | 'warning' }[] = [
  { re: /\b__kf[A-Za-z]*\b/, msg: 'Names starting with __kf are reserved for the K-Flow runtime', severity: 'error' },
  { re: /\bchrome\s*\.\s*(runtime|storage|tabs|scripting)\b/, msg: 'Extension APIs are not available to user scripts (they run without extension privileges)', severity: 'error' },
  { re: /\bimport\s*\(/, msg: 'Dynamic import() is not allowed', severity: 'error' },
  { re: /\b(eval|Function)\s*\(/, msg: 'eval()/Function() are not available in the K-Flow sandbox', severity: 'error' },
  { re: /\b(XMLHttpRequest|fetch|WebSocket|sendBeacon)\b/, msg: 'Network requests from scripts run with the page\'s permissions — make sure you trust the destination', severity: 'warning' },
  { re: /\b(localStorage|document\.cookie|indexedDB)\b/, msg: 'Script touches page storage/cookies', severity: 'warning' },
];

type AnyNode = Node & Record<string, any>;

function walk(node: AnyNode, visit: (n: AnyNode, parent: AnyNode | null) => void, parent: AnyNode | null = null) {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, visit, node));
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

const LOOPS = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForInStatement', 'ForOfStatement']);

export function checkScript(code: string): ScriptProblem[] {
  return instrument(code).problems;
}

export function instrument(code: string): Instrumented {
  const problems: ScriptProblem[] = [];
  if (code.length > 200_000) return { code: '', problems: [{ message: 'Script is too large (200 KB max)', severity: 'error' }], loops: 0 };
  const lines = code.split('\n');
  for (const f of FORBIDDEN) {
    lines.forEach((l, i) => {
      const stripped = l.replace(/\/\/.*$/, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
      const m = f.re.exec(stripped);
      if (m) problems.push({ message: f.msg, line: i + 1, column: m.index + 1, severity: f.severity });
    });
  }
  let ast: AnyNode;
  try {
    ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, locations: true }) as AnyNode;
  } catch (e: any) {
    const loc = e?.loc || {};
    problems.push({ message: `Syntax error: ${String(e?.message || e).replace(/\s*\(\d+:\d+\)$/, '')}`, line: loc.line, column: (loc.column ?? 0) + 1, severity: 'error' });
    return { code: '', problems, loops: 0 };
  }
  const inserts: { pos: number; text: string; order: number }[] = [];
  let loopId = 0;
  let order = 0;
  const lineOf = (n: AnyNode) => n.loc?.start?.line ?? 0;
  const tagBody = (body: AnyNode[]) => {
    for (const st of body) {
      if (st.type === 'FunctionDeclaration' || st.type === 'EmptyStatement' || (st.type === 'ExpressionStatement' && st.directive)) continue;
      inserts.push({ pos: st.start, text: `__kfL(${lineOf(st)});`, order: order++ });
    }
  };
  walk(ast, (n) => {
    if (n.type === 'Program' || n.type === 'BlockStatement' || n.type === 'StaticBlock') tagBody(n.body);
    else if (n.type === 'SwitchCase') tagBody(n.consequent);
    if (LOOPS.has(n.type)) {
      const id = ++loopId;
      const body = n.body as AnyNode;
      if (body.type === 'BlockStatement') inserts.push({ pos: body.start + 1, text: `__kfG(${id},${lineOf(n)});`, order: -1 });
      else {
        inserts.push({ pos: body.start, text: `{__kfG(${id},${lineOf(n)});`, order: -1 });
        inserts.push({ pos: body.end, text: '}', order: 1e9 });
      }
    }
  });
  // apply from the end so earlier offsets stay valid; at equal positions keep guard before line marker
  inserts.sort((a, b) => b.pos - a.pos || b.order - a.order);
  let out = code;
  for (const ins of inserts) out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  return { code: out, problems, loops: loopId };
}

export function hasErrors(p: ScriptProblem[]) {
  return p.some((x) => x.severity === 'error');
}
