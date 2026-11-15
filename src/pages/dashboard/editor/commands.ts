// Catalog of commands for the visual command builder. Each entry declares its
// parameters; build() turns parameter values into template syntax, and parse()
// (shared) turns existing syntax back into parameter values for editing.
import { parseCommand } from '../../../engine/template';

export type ParamType = 'name' | 'text' | 'textarea' | 'number' | 'bool' | 'select' | 'formula' | 'condition' | 'options' | 'snippet' | 'table' | 'columns';
export interface Param { key: string; label: string; type: ParamType; options?: string[]; placeholder?: string; help?: string; required?: boolean; flag?: boolean; main?: boolean }
export interface CommandDef {
  id: string;
  group: 'Form fields' | 'Dates & time' | 'Formulas & logic' | 'Sections' | 'Content' | 'Data Hub';
  label: string;
  desc: string;
  params: Param[];
  block?: string;
  feature?: 'dynamicForms' | 'formulas' | 'conditionals' | 'dataHub';
  /** name of the command keyword in syntax */
  keyword?: string;
}

const common: Param[] = [
  { key: 'label', label: 'Label shown in the form', type: 'text', placeholder: 'e.g. Customer name' },
  { key: 'required', label: 'Required', type: 'bool', flag: true },
  { key: 'hidden', label: 'Don’t output here (define only, reference it elsewhere)', type: 'bool', flag: true },
];
const nameP: Param = { key: 'main', label: 'Field name (letters, numbers, _)', type: 'name', required: true, main: true, placeholder: 'customer_name' };

export const COMMANDS: CommandDef[] = [
  { id: 'text', group: 'Form fields', label: 'Text field', desc: 'Single-line input', feature: 'dynamicForms', params: [nameP, ...common, { key: 'default', label: 'Default value', type: 'text' }, { key: 'placeholder', label: 'Placeholder', type: 'text' }, { key: 'pattern', label: 'Validation', type: 'select', options: ['', 'email', 'phone', 'url', 'digits'], help: 'Or a custom regular expression' }, { key: 'maxlength', label: 'Max length', type: 'number' }, { key: 'format', label: 'Output case', type: 'select', options: ['', 'upper', 'lower', 'title'] }] },
  { id: 'textarea', group: 'Form fields', label: 'Multiline text', desc: 'Paragraph input', feature: 'dynamicForms', params: [nameP, ...common, { key: 'default', label: 'Default value', type: 'textarea' }, { key: 'rows', label: 'Rows', type: 'number' }] },
  { id: 'select', group: 'Form fields', label: 'Dropdown', desc: 'Choose from options', feature: 'dynamicForms', params: [nameP, { key: 'options', label: 'Options (comma separated)', type: 'options', required: true, placeholder: 'Basic, Pro, Enterprise' }, ...common, { key: 'default', label: 'Default option', type: 'text' }, { key: 'multiple', label: 'Allow multiple selections', type: 'bool', flag: true }] },
  { id: 'checkbox', group: 'Form fields', label: 'Checkbox', desc: 'Yes / no tick box', feature: 'dynamicForms', params: [nameP, { key: 'label', label: 'Label', type: 'text' }, { key: 'value', label: 'Text inserted when checked', type: 'text' }, { key: 'off', label: 'Text inserted when unchecked', type: 'text' }, { key: 'default', label: 'Checked by default', type: 'select', options: ['no', 'yes'] }] },
  { id: 'toggle', group: 'Form fields', label: 'Toggle switch', desc: 'On / off switch', feature: 'dynamicForms', params: [nameP, { key: 'label', label: 'Label', type: 'text' }, { key: 'value', label: 'Text when on', type: 'text' }, { key: 'off', label: 'Text when off', type: 'text' }, { key: 'default', label: 'On by default', type: 'select', options: ['no', 'yes'] }] },
  { id: 'number', group: 'Form fields', label: 'Number', desc: 'Numeric input with limits', feature: 'dynamicForms', params: [nameP, ...common, { key: 'default', label: 'Default', type: 'number' }, { key: 'min', label: 'Minimum', type: 'number' }, { key: 'max', label: 'Maximum', type: 'number' }, { key: 'step', label: 'Step', type: 'number' }, { key: 'format', label: 'Output format', type: 'select', options: ['', 'number:0', 'number:2', 'percent', 'integer'] }] },
  { id: 'currency', group: 'Form fields', label: 'Currency', desc: 'Money amount', feature: 'dynamicForms', params: [nameP, ...common, { key: 'currency', label: 'Currency code', type: 'text', placeholder: 'USD, EUR, INR…' }, { key: 'default', label: 'Default', type: 'number' }, { key: 'min', label: 'Minimum', type: 'number' }] },
  { id: 'date', group: 'Form fields', label: 'Date field', desc: 'Date picker', feature: 'dynamicForms', params: [nameP, ...common, { key: 'default', label: 'Default', type: 'text', placeholder: 'today, +7d, 2025-12-31', help: 'Shifts: +3d days, +2w weeks, +1M months, +1y years, +5bd business days' }, { key: 'format', label: 'Output format', type: 'text', placeholder: 'DD MMM YYYY' }] },
  { id: 'time', group: 'Form fields', label: 'Time field', desc: 'Time picker', feature: 'dynamicForms', params: [nameP, ...common, { key: 'default', label: 'Default', type: 'text', placeholder: 'now, 09:30' }, { key: 'format', label: 'Output format', type: 'text', placeholder: 'h:mm A' }] },
  { id: 'datetime', group: 'Form fields', label: 'Date & time', desc: 'Date and time picker', feature: 'dynamicForms', params: [nameP, ...common, { key: 'default', label: 'Default', type: 'text', placeholder: '+1d' }, { key: 'format', label: 'Output format', type: 'text', placeholder: 'DD MMM YYYY h:mm A' }] },
  { id: 'pick', group: 'Data Hub', label: 'Pick a Data Hub row', desc: 'Dropdown of table rows; use name.column', feature: 'dataHub', params: [nameP, { key: 'table', label: 'Table', type: 'table', required: true }, { key: 'display', label: 'Column to display', type: 'text', placeholder: 'name' }, ...common] },
  { id: 'lookup', group: 'Data Hub', label: 'Look up a value', desc: 'lookup(table, column, value, result)', feature: 'formulas', keyword: '=', params: [{ key: 'table', label: 'Table', type: 'table', required: true }, { key: 'col', label: 'Match column', type: 'text', required: true }, { key: 'val', label: 'Value to match (formula)', type: 'formula', required: true, placeholder: 'customer_email' }, { key: 'res', label: 'Return column', type: 'text', required: true }] },
  { id: 'table', group: 'Content', label: 'Dynamic table', desc: 'Table from a repeat or Data Hub', feature: 'formulas', params: [{ key: 'main', label: 'Source (repeat name or data.table)', type: 'formula', required: true, main: true, placeholder: 'items' }, { key: 'columns', label: 'Columns (Header:formula | …)', type: 'columns', placeholder: 'Item:name | Qty:qty | Amount:qty*price' }, { key: 'formats', label: 'Formats per column (| separated)', type: 'text', placeholder: '| | currency' }, { key: 'where', label: 'Only rows where (formula)', type: 'formula' }, { key: 'total', label: 'Total of columns', type: 'text', placeholder: 'Amount' }] },
  { id: 'today', group: 'Dates & time', label: 'Current date', desc: 'Today, optionally shifted', params: [{ key: 'format', label: 'Format', type: 'text', placeholder: 'DD MMM YYYY' }, { key: 'shift', label: 'Shift', type: 'text', placeholder: '+3d' }] },
  { id: 'now', group: 'Dates & time', label: 'Current date & time', desc: 'Timestamp', params: [{ key: 'format', label: 'Format', type: 'text', placeholder: 'DD MMM YYYY HH:mm' }, { key: 'shift', label: 'Shift', type: 'text', placeholder: '+2h' }] },
  { id: 'time-now', keyword: 'time', group: 'Dates & time', label: 'Current time', desc: 'Time only', params: [{ key: 'format', label: 'Format', type: 'text', placeholder: 'h:mm A' }] },
  { id: 'datecalc', keyword: '=', group: 'Dates & time', label: 'Date calculation', desc: 'Days between, add days…', feature: 'formulas', params: [{ key: 'main', label: 'Formula', type: 'formula', required: true, main: true, placeholder: 'datediff(today(), deadline)' }, { key: 'format', label: 'Format', type: 'text', placeholder: 'date:D MMM' }] },
  { id: 'formula', keyword: '=', group: 'Formulas & logic', label: 'Formula', desc: 'Calculations, text functions', feature: 'formulas', params: [{ key: 'main', label: 'Formula', type: 'formula', required: true, main: true, placeholder: 'qty * price * 1.18' }, { key: 'format', label: 'Format', type: 'select', options: ['', 'currency', 'number:2', 'number:0', 'percent', 'upper', 'lower', 'title'] }] },
  { id: 'set', group: 'Formulas & logic', label: 'Variable', desc: 'Store a computed value', feature: 'formulas', params: [{ key: 'var', label: 'Variable name', type: 'name', required: true }, { key: 'expr', label: 'Formula', type: 'formula', required: true }] },
  { id: 'if', group: 'Formulas & logic', label: 'If / else', desc: 'Show text conditionally', feature: 'conditionals', block: 'endif', params: [{ key: 'main', label: 'Condition', type: 'condition', required: true, main: true }, { key: 'withElse', label: 'Include an "otherwise" part', type: 'bool' }] },
  { id: 'validate', group: 'Formulas & logic', label: 'Validation rule', desc: 'Block insertion unless true', feature: 'formulas', params: [{ key: 'main', label: 'Rule (must be true)', type: 'condition', required: true, main: true }, { key: 'message', label: 'Error message', type: 'text', required: true }] },
  { id: 'upper', group: 'Formulas & logic', label: 'Change case', desc: 'UPPER / lower / Title', params: [{ key: 'mode', label: 'Case', type: 'select', options: ['upper', 'lower', 'title', 'capitalize'] }, { key: 'main', label: 'Value (field name or formula)', type: 'formula', required: true, main: true }] },
  { id: 'replace', group: 'Formulas & logic', label: 'Find & replace', desc: 'Replace text in a value', params: [{ key: 'main', label: 'Value (field or formula)', type: 'formula', required: true, main: true }, { key: 'find', label: 'Find', type: 'text', required: true }, { key: 'with', label: 'Replace with', type: 'text' }] },
  { id: 'section', group: 'Sections', label: 'Optional section', desc: 'Include a part only if ticked', feature: 'dynamicForms', block: 'endsection', params: [nameP, { key: 'label', label: 'Question shown in the form', type: 'text', placeholder: 'Include discount?' }, { key: 'default', label: 'Included by default', type: 'select', options: ['no', 'yes'] }] },
  { id: 'repeat', group: 'Sections', label: 'Repeating section', desc: 'Rows the user can add', feature: 'dynamicForms', block: 'endrepeat', params: [nameP, { key: 'label', label: 'Row label', type: 'text', placeholder: 'Item' }, { key: 'min', label: 'Minimum rows', type: 'number' }, { key: 'max', label: 'Maximum rows', type: 'number' }, { key: 'separator', label: 'Separator between rows', type: 'text' }] },
  { id: 'repeat-n', keyword: 'repeat', group: 'Sections', label: 'Repeat N times', desc: 'Static repetition with {{index}}', block: 'endrepeat', params: [{ key: 'main', label: 'Times', type: 'number', required: true, main: true }, { key: 'separator', label: 'Separator', type: 'text' }] },
  { id: 'link', group: 'Content', label: 'Dynamic link', desc: 'Link with computed URL', params: [{ key: 'main', label: 'URL or formula (start with =)', type: 'text', required: true, main: true, placeholder: '="https://pay.example.com/" & invoice' }, { key: 'text', label: 'Link text', type: 'text' }, { key: 'plain', label: 'In plain-text fields show', type: 'select', options: ['both', 'url', 'text'] }] },
  { id: 'snippet', group: 'Content', label: 'Insert another snippet', desc: 'Reuse an existing snippet', params: [{ key: 'main', label: 'Snippet', type: 'snippet', required: true, main: true }] },
  { id: 'me', keyword: 'ref', group: 'Content', label: 'My profile value', desc: 'Name, signature, phone…', params: [{ key: 'main', label: 'Value', type: 'select', options: ['me.name', 'me.email', 'me.phone', 'me.company', 'me.title', 'me.website', 'me.signature'], main: true }] },
  { id: 'page', keyword: 'ref', group: 'Content', label: 'Current page', desc: 'Page title / host / URL', params: [{ key: 'main', label: 'Value', type: 'select', options: ['page.title', 'page.host', 'page.url'], main: true }] },
  { id: 'cursor', group: 'Content', label: 'Cursor position', desc: 'Place the caret here after insert', params: [] },
  { id: 'comment', keyword: '#', group: 'Content', label: 'Comment', desc: 'Note that is never inserted', params: [{ key: 'main', label: 'Comment', type: 'text', main: true }] },
];

function q(v: string) {
  return /[;}]|^\s|\s$|^"/.test(v) ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : v;
}

export function buildCommand(def: CommandDef, p: Record<string, any>): { open: string; close?: string; middle?: string } {
  switch (def.id) {
    case 'lookup':
      return { open: `{{= lookup(data.${p.table}, "${p.col}", ${p.val}, "${p.res}")}}` };
    case 'set':
      return { open: `{{set: ${p.var} = ${p.expr}}}` };
    case 'upper':
      return { open: `{{${p.mode || 'upper'}: ${p.main}}}` };
    case 'me': case 'page':
      return { open: `{{${p.main || (def.id === 'me' ? 'me.name' : 'page.title')}}}` };
    case 'cursor':
      return { open: '{{cursor}}' };
    case 'comment':
      return { open: `{{# ${p.main || ''}}}` };
    case 'if':
      return { open: `{{if: ${p.main}}}`, middle: p.withElse ? '{{else}}' : undefined, close: '{{endif}}' };
  }
  const kw = def.keyword || def.id;
  const parts: string[] = [];
  for (const prm of def.params) {
    if (prm.main) continue;
    const v = p[prm.key];
    if (prm.flag) { if (v) parts.push(prm.key); continue; }
    if (prm.type === 'bool') continue;
    if (v === undefined || v === null || String(v).trim() === '') continue;
    parts.push(`${prm.key}=${q(String(v))}`);
  }
  const main = p.main !== undefined && String(p.main).trim() !== '' ? String(p.main).trim() : '';
  const head = kw === '=' ? `= ${main}` : main ? `${kw}: ${main}` : kw;
  return { open: `{{${[head, ...parts].join('; ')}}}`, close: def.block ? `{{${def.block}}}` : undefined };
}

/** Parses existing command text (without braces) back into a definition + values. */
export function parseForEdit(body: string): { def: CommandDef; values: Record<string, any> } | null {
  try {
    const { name, args } = parseCommand(body);
    const def = name === '=' ? COMMANDS.find((c) => c.id === 'formula')! : name === 'repeat' && /^\d+$/.test(args.main) ? COMMANDS.find((c) => c.id === 'repeat-n')! : COMMANDS.find((c) => (c.keyword || c.id) === name && !['=', 'ref', '#'].includes(c.keyword || ''));
    if (!def) return null;
    const values: Record<string, any> = { main: args.main, ...args.opts };
    for (const f of args.flags) values[f] = true;
    return { def, values };
  } catch {
    return null;
  }
}
