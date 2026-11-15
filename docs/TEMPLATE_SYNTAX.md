# QuickText Hub template syntax

Snippets are plain text (or rich HTML) with **commands** inside `{{ … }}`.
You never have to type these by hand — the editor's **Insert field / command** button
builds them visually — but this is the complete reference.

```
{{command: main value; option=value; flag}}
```

* Options are separated by `;`, written as `key=value` or as a bare flag (`required`).
* Quote values that contain `;`, `}` or leading/trailing spaces: `value=" URGENT"`.
* An option value that starts with `=` is a **formula**: `text==upper(name)`.
* Write `\{{` for a literal `{{`.
* Commands cannot be nested inside other commands — use a formula instead.

## Form fields

When a snippet contains fields, typing its shortcut opens a small form; the text is
inserted when you press **Insert** (or Ctrl+Enter).

| Command | Example |
|---|---|
| Text (implicit) | `Dear {{name}},` — any unknown name becomes a text field |
| Text | `{{text: customer; label=Customer name; required; default=Sir/Madam; placeholder=…}}` |
| Multiline | `{{textarea: notes; rows=4}}` (aliases: `paragraph`, `multiline`) |
| Dropdown | `{{select: plan; options=Basic,Pro,Enterprise; default=Pro}}` — use `|` between options containing commas; add `multiple` for multi-select |
| Checkbox | `{{checkbox: urgent; label=Urgent?; value=⚠ URGENT; off=}}` |
| Toggle | `{{toggle: vip; value=VIP customer}}` |
| Date | `{{date: due; default=+7d; format=dddd, D MMM YYYY}}` |
| Time | `{{time: at; default=09:30; format=h:mm A}}` |
| Date & time | `{{datetime: when; default=+1d}}` |
| Number | `{{number: qty; default=1; min=1; max=99; step=1}}` |
| Currency | `{{currency: amount; currency=INR; min=0}}` |
| Data Hub row | `{{pick: c; table=customers; display=name}}` then `{{c.email}}`, `{{c.phone}}` |

Common field options: `label=`, `default=`, `placeholder=`, `required`, `hidden`
(define the field but output nothing here), `format=`, `hint=`, `message=` (custom
error), `min=`, `max=`, `minlength=`, `maxlength=`, `pattern=email|phone|url|digits|<regex>`.

A field is defined once and can be referenced any number of times with `{{name}}`.

## Dates and time

| | |
|---|---|
| `{{today}}` | today in the default date format |
| `{{today; format=DD/MM/YYYY}}` | custom format |
| `{{today; shift=+3bd}}` | 3 business days from today |
| `{{now; format=HH:mm}}` | current date/time |
| `{{time}}` | current time |

Shifts: `+3d` days, `-2w` weeks, `+1M` months (clamped to month end), `+1y` years,
`+5bd` business days, `+2h` hours, `+30m` minutes. Combine: `+1M +2d`.

Format tokens: `YYYY YY MMMM MMM MM M Do DD D dddd ddd HH H hh h mm m ss s A a Q`,
text in `[brackets]` is literal: `dddd [the] Do`.

## Formulas

```
{{= qty * price * (1 + tax / 100); format=currency}}
{{set: total = sum(items.qty * items.price)}}
```

Operators (high → low): `( )` · `^` · `* / %` · `+ -` · `&` (join text) ·
`= != <> < <= > >=` · `not` · `and` · `or` · `cond ? a : b`.

* Text compares case-insensitively; numbers in text (“$1,250.50”, “15%”) are understood.
* `date + 3` adds days; `date2 - date1` gives days.
* `items.qty * items.price` works element-by-element on repeat sections and tables.

### Formats (`format=`)

`currency`, `currency:EUR`, `number`, `number:2`, `integer`, `percent`, `percent:1`,
`upper`, `lower`, `title`, `date:DD/MM/YYYY`, `time:HH:mm`, `datetime`, or any date pattern.

### Functions

**Text** upper, lower, title, capitalize, trim, len, replace(text, find, with), left, right,
mid, contains, startswith, endswith, split, join, concat, repeat, pad, truncate,
initials, firstname, lastname, urlencode, text, format(value, "currency:EUR")

**Logic** if(cond, a, b), and, or, not, isempty, coalesce, choose(value, "a", "A", …, default),
matches(text, regex), isemail, isnumber

**Math** round(n, d), floor, ceil, abs, sqrt, min, max, sum, avg, count, number,
percent(part, whole), percentof(pct, amount), addpercent(amount, pct), discount(amount, pct),
currency(amount, "USD"), random(min, max)

**Date** today(), now(), date("2025-01-31" | "+3d"), adddays, addweeks, addmonths, addyears,
addbusinessdays, addhours, addminutes, shift(date, "+1M"), datediff(a, b, "days|weeks|months|years|hours|minutes"),
formatdate(date, "D MMM"), weekday, year, month, day, endofmonth, greeting()

**Lists / Data Hub** list, first, last, item(list, n), unique, sort, filter(table, "col", value),
lookup(table, "matchCol", value, "resultCol"), pluck(table, "col"), countif(list, ">", 0), sumif(list, ">", 0)

The settings page (**Settings → Syntax guide**) lists every function with its description.

## Conditions

```
{{if: amount > 1000}}Thank you for your large order!
{{elseif: amount > 100}}Thanks for your order.
{{else}}Thanks!{{endif}}
```

Fields inside a branch appear in the form only while that branch is active.

## Sections

```
{{section: ps; label=Add a P.S.?; default=no}}
P.S. {{text: note}}{{endsection}}

{{repeat: items; label=Item; min=1; max=20; separator=""}}
- {{text: item}} × {{number: qty; default=1}} @ {{currency: price}}
{{endrepeat}}
Total: {{= sum(items.qty * items.price); format=currency}}

{{repeat: 3; separator=", "}}#{{index}}{{endrepeat}}      → #1, #2, #3
```

## Tables

```
{{table: items; columns=Item:item | Qty:qty | Amount:qty*price; formats=||currency; total=Amount}}
{{table: data.customers; columns=Name:name|Email:email; where=plan = "Pro"; limit=10}}
```

Rich snippets get an HTML table; plain-text fields get an aligned text table.

## Text helpers

`{{upper: name}}`, `{{lower: x}}`, `{{title: x}}`, `{{capitalize: x}}`, `{{trim: x}}`,
`{{replace: phone; find=-; with=" "}}`.

## Content

| | |
|---|---|
| `{{me.name}}` `{{me.signature}}` … | Profile values (Settings → Profile): name, email, phone, company, title, website, signature |
| `{{page.title}}` `{{page.host}}` `{{page.url}}` | The page where the snippet is inserted |
| `{{link: https://example.com; text=Open}}` | Link (HTML in rich editors, “Open (https://…)” in plain fields; `plain=url|text|both`) |
| `{{link: ="https://pay.example.com/" & invoice; text=Pay now}}` | Dynamic link |
| `{{snippet: /sig}}` | Include another snippet (up to 5 levels) |
| `{{cursor}}` | Where the caret is placed after inserting |
| `{{validate: amount > 0; message=Amount must be positive}}` | Blocks insertion until true |
| `{{# a comment}}` | Never inserted |

## Worked examples

**Payment reminder**

```
Dear {{name}},
Your payment of {{currency: amount; required}} is pending. Kindly complete it before {{date: deadline; default=+7d}}.
Regards,
{{me.signature}}
```

**Trade update with risk/reward**

```
📈 {{select: side; options=BUY,SELL}} {{text: symbol; required}}
Entry {{number: entry}} · SL {{number: sl}} · Target {{number: target}}
R:R 1 : {{= round(abs(target - entry) / abs(entry - sl), 2)}}
```

**Attendance shortfall**

```
{{number: attended}} of {{number: total}} classes = {{= percent(attended, total); format=number:1}}%
{{if: percent(attended, total) < 75}}Below the required 75%.{{endif}}
```

All 31 built-in templates (Templates page) are further examples and are covered by unit tests.
