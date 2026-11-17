# K-Flow Automation

A browser automation platform for Chrome-based browsers (Manifest V3, React + TypeScript).
It covers form autofill, visual field mapping, a macro recorder and player, sandboxed
JavaScript automation, variables, spreadsheet data, text expansion, cloud sync and
enterprise administration. It has three independent workspaces:

| Workspace | For | Ships with |
|---|---|---|
| **College Administration** | Dr M.A. Aziz Jr College of Science, Phulambri | Starter profiles for UDISE+ S02/S03, FYJC Part 1, CAP rounds, HSC exam forms and Shiksha Desk; a student and staff dataset schema; college variables (name, academic year, UDISE…); letters, certificates and notices; a batch macro |
| **Trading & Business** | Mr K Technical Levels | XAUUSD signal, trade-management, journal, VIP/community and payment templates (Telegram/WhatsApp); risk, lot-size and R:R variables; a trade journal and members dataset schema; a TradingView alert profile. **Reporting and communication only. It never places trades.** |
| **General Productivity** | Any website | Contact-form autofill, email, WhatsApp and support templates, global variables, a customer dataset schema |

K-Flow is local-first: everything works offline without an account. Firebase is optional and
adds sync, cloud backups and organizations. AI is optional too: the builder has an offline matcher.

---

## Install (no build needed)

1. Unzip `release/k-flow-chrome-2.0.0.zip`, or use the folder `release/k-flow-unpacked/`.
2. Open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. The dashboard opens. Pick a workspace from the switcher at the top-left.

It works in Chrome, Edge, Brave and other Chromium browsers (version 114+). A Firefox build is also available (`npm run build:firefox`); see the known limitations.

## Build from source

Requires Node 18+ (tested with Node 22).

```bash
npm install
```

```bash
npm run build
```

```bash
npm run package
```

`npm run build` writes `dist/` (load it unpacked). `npm run package` writes `release/k-flow-chrome-<v>.zip`,
`release/k-flow-unpacked/` and `release/k-flow-automation-source-<v>.zip`.

### Tests

```bash
npm run test:all
```

That runs the typecheck plus four suites, which can also be run one at a time:

| Command | What it covers |
|---|---|
| `npm test` | 250 unit tests: automation engines, selectors, setters, macros, recorder, script sandbox, variables, XLSX/CSV/JSON/Google Sheets, encryption and vault, RBAC, sync engine, backup, AI builder, presets |
| `npm run test:rules` | Firestore security rules against the Firestore emulator (needs Java) |
| `npm run test:cloud` | The real Firestore sync adapter and engine against the emulator with production rules |
| `npm run test:e2e` | 50 browser tests: the built extension in Chromium on demonstration form pages |

See [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) for the latest run.

---

## What it does

### Form autofill engine
* Detects fields (text, number, email, tel, date and date-picker, select, multi-select, radio,
  checkbox, textarea, contenteditable, ARIA comboboxes) in open shadow roots and same-origin iframes.
  Hidden fields are filled only when a rule explicitly allows it.
* Finds fields by **label** (label-for, wrapping label, aria, table-cell labels used by government portals, form groups),
  **CSS**, **XPath**, **id**, **name**, **regex**, placeholder or aria-label, with automatic fallbacks.
* Conditions per rule (`category != "OPEN"`), per-page rules for multi-page forms, wait-for-element for
  dynamic fields, date re-formatting (`DD/MM/YYYY`), "only if empty", per-field delays.
* **Preview** validates every field without changing the page (missing options, invalid email/date/number, pattern, maxlength).
* Runs manually, by in-page shortcut (`Alt+Shift+F` or a per-profile key), from the side panel or popup, or automatically on page load.
* Never fills CAPTCHA or OTP fields, never submits forms, and asks before any submit, pay or delete click.

### Visual field selector
Press `Alt+Shift+M`, use the side panel's **Map fields**, or right-click and choose **K-Flow: map this field**. Then click any field on the page.
A K-Flow panel (an extension frame the page cannot read) shows the generated CSS/XPath selector, which you can edit.
Choose a dataset column, a variable, fixed text or a template, then save to a new or existing profile and continue with the next field.

### Macro recorder and player
Records clicks, typing, dropdowns, checkboxes, radios, Enter/Escape, scrolling and page navigations using
robust selectors. Passwords, OTPs and CAPTCHAs are never recorded.

The editor offers 24 step types:
* Interaction: click, type, select, check, radio, key, hover, focus, scroll.
* Flow: open URL, wait for element, wait until gone, delay, label, go to (loops with iteration limits), ask, assert, stop.
* K-Flow: run autofill, run script, insert snippet, save text to a variable, next dataset record.

Steps also support conditions, per-step retries and on-error policies. Runs continue across page loads, and you can pause, resume or stop them.
Macros can be imported, exported and duplicated, and every run is kept in execution history.

### JavaScript automation (sandboxed)
Scripts run in the bundled **sval interpreter**, injected into the page's main world. They have **no extension privileges**,
work on pages with strict CSP (no `eval`), and enforce **loop-iteration and time limits**. The sandbox global is
stripped to standard JavaScript built-ins. Scripts get a small `kf` API:
* `fill`, `select`, `check` and `click`. Submit-type buttons are refused by `click`.
* `waitFor`, `exists`, `text` and `fields` for reading the page.
* `vars` and `setVar` for variables.
* `log` and `inspect` for debugging.

The editor provides syntax/safety analysis with line numbers, dry runs inside the extension's **sandboxed page**,
runs on a tab with captured logs, and library scripts shared by every script.

### Variables and dynamic data
Variable types: static, formula/calculated, date (`today+7d`), random (`int:1000-9999`, `uuid`…), dataset column,
conditional, list, counter and vault secret. They can be global, per workspace, or limited to one profile or macro.
Dataset columns are available directly as `{{column_key}}`. Variables work in autofill rules, macros, scripts and snippets.

### Text expansion and templates
Shortcuts such as `/welcome` expand while you type, in inputs, textareas, Gmail-style editors, Lexical (WhatsApp Web), Quill and iframes.
Fill-in forms, 80+ formula functions, rich text, a template library of 78 templates across 19 categories, an optional marketplace,
share codes, an assistant (`Ctrl+Shift+Space`), a side panel and the popup are included.
Expansion can be switched on or off per workspace.

### Spreadsheets and data
Import **Excel (.xlsx)**, **CSV/TSV**, **JSON** and **Google Sheets** (public link, or signed in with OAuth).
Import includes a column-mapping step and header-row choice. Data-quality checks flag duplicates (by key column), missing required fields and invalid emails, phones, dates or Aadhaar numbers.
You can search for a record, set the active record, step record by record, and run batch macros. Exports go to Excel, CSV, JSON or Google Sheets.
**Sensitive columns are encrypted at rest** (Aadhaar, mobile, DOB, address… are detected automatically).

### AI-assisted automation builder
Describe the task, scan the open form, and choose a dataset. You then get proposed rules from either the
**offline matcher** (labels, names, synonyms; no network) or an AI provider (Anthropic Claude, OpenAI, Gemini,
or any OpenAI-compatible endpoint, using your own key). Review and edit the rules, **test with preview** on the page, then approve and save.
Only field labels and column names are sent to the AI, never values.

### Security and privacy
* AES-256-GCM encryption with a **non-extractable device key** for sensitive dataset columns and API keys.
* A **passphrase vault** (PBKDF2 310k iterations) for passwords. It auto-locks, and secrets are usable as `{{vault.key}}`.
* Domain allowlist, a list of official/government portals (every action button needs approval), and per-site disable.
* Message passing is restricted by sender. Scripts run without extension privileges. Imports are validated.
* Local audit log and execution history. Field values are never logged.
* Details are in [docs/SECURITY.md](docs/SECURITY.md).

### Cloud sync, backup and organizations (optional, Firebase)
* **Sync:** incremental, offline-first, multi-device sync with conflict detection (newest wins or keep both), version history, and manual or automatic sync.
* **Backups:** encrypted file backups and encrypted cloud backups with restore.
* **Organizations:**
  * Owner, administrator, manager, staff and viewer roles.
  * A permission matrix for create, edit, run, share, delete and export, with per-user exceptions.
  * Invitations, shared profiles, macros and templates, distributed policies, device registry and revocation.
  * Append-only audit and activity logs.
  * All of this is **enforced by Firestore security rules** (tested on the emulator).

---

## Documentation

| Document | Contents |
|---|---|
| [User manual](docs/USER_MANUAL.md) | Daily use: workspaces, autofill, field selector, macros, scripts, variables, datasets, vault, AI builder |
| [Administrator manual](docs/ADMIN_MANUAL.md) | Organizations, roles, permissions, policies, devices, audit, deployment |
| [Developer guide](docs/DEVELOPER.md) | Architecture, components, message protocol, extending data sources |
| [Database schema](docs/DATABASE_SCHEMA.md) | IndexedDB stores and the Firestore data model |
| [Security](docs/SECURITY.md) | Threat model, encryption, sandbox, rules |
| [Firebase setup](docs/FIREBASE_SETUP.md) | Project, auth, rules and indexes deployment, free-tier notes |
| [Backup & recovery](docs/BACKUP_RECOVERY.md) | File and cloud backups, restore, version history |
| [Known limitations](docs/KNOWN_LIMITATIONS.md) | What K-Flow cannot or will not do |
| [Template syntax](docs/TEMPLATE_SYNTAX.md) | `{{commands}}` and formulas |
| [Testing](docs/TESTING.md) and [test results](docs/TEST_RESULTS.md) | How to run the suites, latest results |
| [Development log](docs/DEVELOPMENT_LOG.md) | What was built and the decisions taken |

`.env.example` documents the optional build-time configuration.
