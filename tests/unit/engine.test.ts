import { describe, it, expect } from 'vitest';
import { render } from '@/engine';
import { evaluate } from '@/engine/expr';
import { formatDate, shiftDate, parseDate } from '@/engine/dates';

const now = new Date(2025, 0, 15, 9, 30); // Wed 15 Jan 2025 09:30
const base = { now, fo: { locale: 'en-US', currency: 'USD', dateFormat: 'DD MMM YYYY', timeFormat: 'h:mm A' } };
const r = (src: string, values: Record<string, any> = {}, extra: any = {}) => render(src, 'text', { ...base, values, ...extra });
const scope = { lookup: (n: string) => ({ found: n === 'x', value: 5 }), fo: base.fo as any, now };

describe('plain snippets', () => {
  it('returns literal text unchanged', () => {
    const o = r('Hello world.\nSecond line');
    expect(o.text).toBe('Hello world.\nSecond line');
    expect(o.needsForm).toBe(false);
    expect(o.errors).toEqual([]);
  });
  it('supports escaped braces', () => {
    expect(r('a \\{{b}} c').text).toBe('a {{b}} c');
  });
  it('reports unclosed commands', () => {
    expect(r('Hi {{name').errors[0]).toMatch(/never closed/);
  });
});

describe('form fields', () => {
  it('bare names become text fields and repeat their value', () => {
    const o = r('Dear {{name}}, hi {{name}}!', { name: 'Ada' });
    expect(o.text).toBe('Dear Ada, hi Ada!');
    expect(o.form).toHaveLength(1);
    expect((o.form[0] as any).implicit).toBe(true);
  });
  it('payment reminder example', () => {
    const src = 'Dear {{name}},\nYour payment of {{currency: amount}} is pending. Kindly complete it before {{date: deadline; default=+7d; format=DD/MM/YYYY}}.\nRegards,\n{{me.name}}';
    const o = r(src, { name: 'Bob', amount: '1250.5' }, { profile: { name: 'Carol' } });
    expect(o.text).toBe('Dear Bob,\nYour payment of $1,250.50 is pending. Kindly complete it before 22/01/2025.\nRegards,\nCarol');
    expect(o.form.map((f: any) => f.name)).toEqual(['name', 'amount', 'deadline']);
  });
  it('required + validation rules', () => {
    const o = r('{{text: email; required; pattern=email}}{{number: qty; min=1; max=5}}', { email: 'nope', qty: 9 });
    expect(o.validation.length).toBe(2);
    expect(r('{{text: email; required}}').validation[0]).toMatch(/required/);
  });
  it('dropdown defaults to first option; multiple joins', () => {
    expect(r('{{select: plan; options=Basic,Pro}}').text).toBe('Basic');
    expect(r('{{select: tags; options=a|b|c; multiple}}', { tags: ['a', 'c'] }).text).toBe('a, c');
  });
  it('checkbox/toggle with value text', () => {
    expect(r('X{{checkbox: urgent; value=" URGENT"}}', { urgent: true }).text).toBe('X URGENT');
    expect(r('X{{toggle: urgent; value=URGENT; off=normal}}').text).toBe('Xnormal');
  });
  it('hidden fields do not output', () => {
    expect(r('{{text: a; default=1; hidden}}[{{a}}]').text).toBe('[1]');
  });
  it('rejects bad field names', () => {
    expect(r('{{text: my name}}').errors[0]).toMatch(/letters, numbers/);
  });
});

describe('formulas', () => {
  it('arithmetic and precedence', () => {
    expect(evaluate('2 + 3 * 4 ^ 2', scope)).toBe(50);
    expect(evaluate('(2 + 3) * x', scope)).toBe(25);
    expect(evaluate('10 / 4', scope)).toBe(2.5);
    expect(evaluate('-x + 1', scope)).toBe(-4);
  });
  it('strings, concat and functions', () => {
    expect(evaluate('upper("ab") & "-" & lower("CD")', scope)).toBe('AB-cd');
    expect(evaluate('replace("a-b-c", "-", "+")', scope)).toBe('a+b+c');
    expect(evaluate('title("hello wORLD")', scope)).toBe('Hello World');
    expect(evaluate('if(x > 3, "big", "small")', scope)).toBe('big');
    expect(evaluate('x > 3 ? "y" : "n"', scope)).toBe('y');
  });
  it('currency/percent helpers', () => {
    const o = r('{{= addpercent(price, 18); format=currency:INR}} | {{= percent(25, 200); format=number:1}}%', { price: '100' }, { values: { price: '100' } });
    expect(o.errors).toEqual([]);
  });
  it('totals over repeats', () => {
    const src = '{{repeat: items}}{{text: item}} x{{number: qty; default=1}} @ {{currency: price}}\n{{endrepeat}}Total: {{= sum(items.qty * items.price); format=currency}}';
    const o = r(src, { items: [{ item: 'Pen', qty: 2, price: '1.5' }, { item: 'Book', qty: 1, price: '10' }] });
    expect(o.text).toBe('Pen x2 @ $1.50\nBook x1 @ $10.00\nTotal: $13.00');
    const rep = o.form[0] as any;
    expect(rep.type).toBe('repeat');
    expect(rep.rows).toHaveLength(2);
    expect(rep.rows[0].map((f: any) => f.name)).toEqual(['item', 'qty', 'price']);
  });
  it('set variables', () => {
    expect(r('{{set: total = 3 * 4}}{{= total + 1}}').text).toBe('13');
  });
  it('unknown names produce errors not crashes', () => {
    expect(r('{{= nothere(2)}}').errors[0]).toMatch(/Unknown function/);
    expect(r('{{= qty * 2}}', { qty: 4 }).text).toBe('8');
  });
  it('division by zero error', () => {
    expect(r('{{= 1/0}}').errors[0]).toMatch(/zero/);
  });
  it('plan gating disables formulas', () => {
    expect(r('{{= 1+1}}', {}, { features: { formulas: false } }).errors[0]).toMatch(/Pro/);
  });
});

describe('conditionals', () => {
  const src = '{{number: amount}}{{if: amount > 1000}} big{{elseif: amount > 100}} medium{{else}} small{{endif}}';
  it('branches', () => {
    expect(r(src, { amount: 5000 }).text).toBe('5000 big');
    expect(r(src, { amount: 500 }).text).toBe('500 medium');
    expect(r(src, { amount: 5 }).text).toBe('5 small');
  });
  it('nested ifs and and/or', () => {
    const s = '{{if: a = "x" and b}}{{if: c}}1{{else}}2{{endif}}{{else}}3{{endif}}';
    expect(r(s, { a: 'X', b: true, c: false }).text).toBe('2');
  });
  it('fields only appear when their branch is active', () => {
    const s = '{{checkbox: discount}}{{if: discount}}{{number: pct}}% off{{endif}}';
    expect(r(s).form).toHaveLength(1);
    expect(r(s, { discount: true }).form).toHaveLength(2);
  });
  it('missing endif', () => {
    expect(r('{{if: 1}}a').errors[0]).toMatch(/endif/);
  });
});

describe('sections, repeats and tables', () => {
  it('optional section', () => {
    const s = 'A{{section: extra; label=Add P.S.?}}\nP.S. {{ps}}{{endsection}}';
    expect(r(s).text).toBe('A');
    expect(r(s, { extra: true, ps: 'hi' }).text).toBe('A\nP.S. hi');
  });
  it('static repeat with index', () => {
    expect(r('{{repeat: 3; separator=", "}}#{{index}}{{endrepeat}}').text).toBe('#1, #2, #3');
  });
  it('table from data hub with where and totals', () => {
    const data = { orders: { rows: [{ __id: '1', item: 'A', amount: 10 }, { __id: '2', item: 'B', amount: 5 }, { __id: '3', item: 'C', amount: 1 }] } };
    const o = r('{{table: data.orders; columns=Item:item|Amount:amount; where=amount > 2; total=Amount}}', {}, { data });
    expect(o.errors).toEqual([]);
    expect(o.text.split('\n')).toEqual(['| Item  | Amount |', '|-------|--------|', '| A     | 10     |', '| B     | 5      |', '| Total | 15     |']);
  });
  it('data hub pick + lookup', () => {
    const data = { customers: { columns: ['name', 'email'], rows: [{ __id: 'r1', name: 'Ann', email: 'ann@x.io' }, { __id: 'r2', name: 'Ben', email: 'ben@x.io' }] } };
    const o = r('{{pick: c; table=customers; display=name}} <{{c.email}}> {{= lookup(data.customers, "name", "Ben", "email")}}', { c: 'r1' }, { data });
    expect(o.text).toBe('Ann <ann@x.io> ben@x.io');
  });
});

describe('dates', () => {
  it('formats tokens', () => {
    expect(formatDate(now, 'dddd, Do MMMM YYYY [at] h:mm a')).toBe('Wednesday, 15th January 2025 at 9:30 am');
  });
  it('shifts', () => {
    expect(formatDate(shiftDate(now, '+1M'), 'YYYY-MM-DD')).toBe('2025-02-15');
    expect(formatDate(shiftDate(new Date(2025, 0, 31), '+1M'), 'YYYY-MM-DD')).toBe('2025-02-28');
    expect(formatDate(shiftDate(now, '+3bd'), 'YYYY-MM-DD')).toBe('2025-01-20');
  });
  it('commands', () => {
    expect(r('{{today; format=DD/MM/YYYY}} {{today; shift=-1d; format=D}} {{time}}').text).toBe('15/01/2025 14 9:30 AM');
    expect(r('{{= datediff("2025-01-01", "2025-03-01")}} {{= formatdate(adddays(today(), 10), "MMM D")}}').text).toBe('59 Jan 25');
  });
  it('parses common inputs', () => {
    expect(parseDate('2025-02-03')!.getMonth()).toBe(1);
    expect(parseDate('03/02/2025')!.getDate()).toBe(3);
  });
});

describe('misc commands', () => {
  it('cursor offset', () => {
    const o = r('Hi {{cursor}}there');
    expect(o.text).toBe('Hi there');
    expect(o.cursor).toBe(3);
  });
  it('links in text and html', () => {
    expect(r('{{link: https://pay.me/{{x}}}}').errors.length).toBeGreaterThan(0); // nested braces not allowed
    expect(r('{{link: ="https://pay.me/" & id; text=Pay now}}', { id: 7 }, { values: { id: 7 } }).errors).toEqual([]);
    const h = render('<p>{{link: https://a.io; text=Go}}</p>', 'html', base);
    expect(h.html).toBe('<p><a href="https://a.io">Go</a></p>');
    expect(h.text).toBe('Go (https://a.io)');
  });
  it('includes other snippets with recursion guard', () => {
    const resolveSnippet = (s: string) => (s === '/sig' ? { content: 'Thanks,\n{{me.name}}', contentType: 'text' as const } : s === '/loop' ? { content: '{{snippet: /loop}}', contentType: 'text' as const } : null);
    expect(r('Hi\n{{snippet: /sig}}', {}, { resolveSnippet, profile: { name: 'Z' } }).text).toBe('Hi\nThanks,\nZ');
    expect(r('{{snippet: /loop}}', {}, { resolveSnippet }).errors.join()).toMatch(/nested too deeply/);
  });
  it('html snippets escape values', () => {
    const h = render('<b>{{name}}</b>', 'html', { ...base, values: { name: '<script>' } });
    expect(h.html).toBe('<b>&lt;script&gt;</b>');
    expect(h.text).toBe('<script>');
  });
  it('html command bodies tolerate entities/tags from the rich editor', () => {
    const h = render('<p>{{if: a &gt; 1}}yes{{endif}}</p>', 'html', { ...base, values: { a: 2 } });
    expect(h.errors).toEqual([]);
    expect(h.text).toBe('yes');
  });
  it('validate command', () => {
    expect(r('{{number: a}}{{validate: a > 0; message=Must be positive}}', { a: -1 }).validation).toContain('Must be positive');
  });
  it('page context', () => {
    expect(r('{{page.host}}', {}, { page: { host: 'mail.google.com', url: '', title: '' } }).text).toBe('mail.google.com');
  });
});
