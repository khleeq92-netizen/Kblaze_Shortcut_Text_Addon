# Test results

Run on 2026-11-17 against a fresh production build (`dist/`), Node v22.23.4, Playwright Chromium, Firestore emulator (firebase-tools 13.29.1).

| Suite | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ no errors |
| Unit (`npm test`) | ✅ **250 / 250** passed in 21 files |
| Firestore security rules (`npm run test:rules`) | ✅ **10 / 10** |
| Cloud integration (`npm run test:cloud`) | ✅ **2 / 2** |
| End-to-end in Chromium (`npm run test:e2e`) | ✅ **50 / 50** |

## Unit test files

```
tests/unit/engine.test.ts (39 tests) 46ms
tests/unit/ai.test.ts (7 tests) 133ms
tests/unit/setters.test.ts (10 tests) 269ms
tests/unit/macro.test.ts (9 tests) 1120ms
tests/unit/variables.test.ts (8 tests) 13ms
tests/unit/autofill.test.ts (7 tests) 944ms
tests/unit/sync.test.ts (7 tests) 55ms
tests/unit/dom.test.ts (8 tests) 450ms
tests/unit/security.test.ts (8 tests) 413ms
tests/unit/script.test.ts (9 tests) 719ms
tests/unit/library.test.ts (85 tests) 135ms
tests/unit/presets.test.ts (7 tests) 26ms
tests/unit/permissions.test.ts (4 tests) 3ms
tests/unit/recorder.test.ts (3 tests) 41ms
tests/unit/validate.test.ts (10 tests) 28ms
tests/unit/match.test.ts (7 tests) 3ms
tests/unit/backup.test.ts (4 tests) 157ms
tests/unit/sources.test.ts (8 tests) 21ms
tests/unit/xlsx.test.ts (4 tests) 32ms
tests/unit/sites.test.ts (3 tests) 7ms
tests/unit/history.test.ts (3 tests) 72ms
```

## Security rules

- ✅ personal data is private to its owner
- ✅ cloud backups: owner only, vault-encrypted only
- ✅ creating an organization: creator must be the sole owner
- ✅ organization documents are visible to members and invitees only
- ✅ shared resources follow the RBAC matrix
- ✅ per-user deny overrides the role; a minted "owner" role string grants nothing
- ✅ members, roles and invitations
- ✅ audit and activity logs are append-only and readable with viewAudit only
- ✅ devices: members register their own; only admins revoke or restore
- ✅ shared-profile version history is append-only

## Cloud integration

- ✅ two devices of one user sync profiles, edits and deletions; other users see nothing
- ✅ organization sync enforces roles: staff edits succeed, viewer writes are rejected

## End-to-end (browser)

- ✅ sample data is seeded on install (/ty, /sig, /payment, /trade)
- ✅ input: shortcut expands immediately
- ✅ input: caret is placed after the inserted text
- ✅ input: word-boundary rule (no expansion inside "abc/ty")
- ✅ input: disabled snippets never expand
- ✅ password fields are never touched
- ✅ framework-controlled input receives input events (React-style state)
- ✅ textarea: multi-line snippet
- ✅ textarea: native undo (Ctrl+Z) restores the shortcut
- ✅ textarea: {{cursor}} positions the caret
- ✅ formulas + dates render in the background
- ✅ contenteditable: expansion with surrounding text
- ✅ contenteditable (Gmail-style div structure): multi-line
- ✅ contenteditable: rich snippet keeps formatting
- ✅ Quill editor (paste adapter)
- ✅ Lexical editor — WhatsApp Web’s editor framework (paste adapter)
- ✅ Lexical editor: multi-line snippet
- ✅ same-origin iframe editor
- ✅ fill-in form: overlay opens, validates required field, inserts result
- ✅ snippet assistant: hotkey opens picker, search + Enter inserts
- ✅ delimiter trigger mode keeps the typed punctuation
- ✅ per-site disable list stops expansion
- ✅ macro: fills by label, Tab to focused field, selects, ticks, asks before submitting
- ✅ macro: declining the confirmation stops the run (nothing submitted)
- ✅ dashboard: create a snippet through the UI and use it
- ✅ dashboard: live preview renders the form + output
- ✅ dashboard: every main view renders without errors
- ✅ dashboard: command builder inserts a dropdown command
- ✅ WhatsApp-style isolated page (COOP/COEP): form opens as popup window and inserts into Lexical
- ✅ WhatsApp-style isolated page: plain snippet + assistant popup window
- ✅ side panel: lists snippets, fills a gold signal form inline, live preview computes pips
- ✅ side panel insert path: rendered text is inserted into the focused field
- ✅ setting "toolbar icon opens side panel" switches the action behaviour
- ✅ templates: "Add all" creates a category folder with its snippets
- ✅ popup renders snippet list
- ✅ autofill: fills a gov-style form from a dataset record (radio, select, dynamic field, ARIA dropdown, date picker); CAPTCHA untouched
- ✅ autofill preview: validates and highlights without changing the page
- ✅ dataset record stepping: next record fills the next student; condition skips the certificate for OPEN
- ✅ in-page hotkey (Alt+Shift+F) autofills the matching profile
- ✅ multi-page macro: runs across a page navigation and finishes on part 2
- ✅ macro pause / resume / stop
- ✅ submit-type click asks for approval; approving submits
- ✅ macro recorder: records typing, a checkbox, a link click and the next page; replay reproduces it
- ✅ visual field selector: click a field, assign a value in the K-Flow panel, profile is saved and works
- ✅ vault: set up through the dashboard; {{vault.key}} fills a password field; no plaintext is stored
- ✅ scripts run on a strict-CSP page through the sandboxed interpreter (no eval, no extension privileges)
- ✅ script dry run in the dashboard executes inside the extension sandbox page
- ✅ Excel import through the dashboard: column mapping, records, sensitive columns encrypted at rest
- ✅ workspaces: switching changes the dashboard; College workspace has its starter profiles
- ✅ execution history view lists runs and exports an Excel report

## Defects found and fixed by these tests

| Found by | Defect | Fix |
|---|---|---|
| Unit (script) | The sval sandbox copied every global of the host page (on an extension page that would include `chrome.*`) and kept a hidden reference to the real global | The sandbox global is stripped to standard built-ins; dashboard dry runs moved to the MV3 sandbox page |
| Unit (script) | `kf.sleep` beyond the deadline returned successfully | Deadline re-checked after sleeping |
| Unit (dom) | A submit button inherited the label of a neighbouring CAPTCHA field, so it was treated as a CAPTCHA | Buttons and links are labelled by their own text; sibling labels for other controls are ignored |
| Unit (dom) | A neighbouring form-group was used as a field's label | Siblings that contain controls are skipped |
| Unit (presets) | `/admitwa` was a prefix clash with `/admit` (instant-mode expansion would block it) | Renamed to `/fyjcwa` |
| Unit (sources) | Invalid emails in text-typed columns were not reported | Email validation by column name |
| Rules (emulator) | Ordinary edits to shared items were denied (`deleted` field absent caused an evaluation error) | `get('deleted', false)` |
| Rules (emulator) | The generic shared-resource delete rule allowed deleting append-only audit entries | Delete restricted to resource collections |
| E2E | The `/snippet/:id` route fell through to the overview | Route added |
| E2E | Macro `type` steps without a target and Tab key steps had no effect after the Autopilot migration | Focused-element targeting and real focus movement |
| E2E | A click that navigated was not recorded in the run log | Steps that may navigate are logged before they act |
| E2E | Detached documents (sandbox dry runs) reported every field as hidden | Visibility falls back to attributes without layout |
