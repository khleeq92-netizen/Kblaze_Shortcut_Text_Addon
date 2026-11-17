# Testing

## Automated

| Suite | Command | What it covers |
|---|---|---|
| Unit (Vitest, 141 tests) | `npm test` | template parser, formulas & functions, dates/shifts, forms & validation, conditions, sections, repeats, tables, Data Hub lookups, includes, cursor, HTML escaping, plan gating; **every built-in template** renders without errors once filled; shortcut matching (instant/delimiter, word boundary, case, prefix conflicts); import validation & sanitization; CSV parsing/export |
| End-to-end (Playwright, 35 tests) | `npm run test:e2e` | builds, loads `dist/` as an unpacked extension in Chromium and drives a fixture page with real editors |

E2E cases (`tests/e2e/run-e2e.mjs`):

1. Sample data seeded on install
2. Input: immediate expansion · caret after insertion · word boundary · disabled snippet · password field untouched
3. React-style controlled input receives input events
4. Textarea: multi-line · native Ctrl+Z undo · `{{cursor}}`
5. Formulas + dates rendered by the background worker
6. contenteditable: inline text · Gmail-style div structure multi-line · rich snippet keeps `<b>`
7. **Quill** and **Lexical** (WhatsApp Web's editor) — single and multi-line
8. Same-origin iframe editor
9. Fill-in form overlay: required validation, insertion of formatted values
10. Snippet assistant hotkey → search → Enter inserts
11. Delimiter mode keeps punctuation · per-site disable list
12. Autopilot: label targeting, Tab, select, checkbox, confirmation **before** submit, approve → submitted; cancel → not submitted
13. Dashboard: create snippet via UI and use it · live preview · all views render without errors · command builder output
14. WhatsApp-style cross-origin-isolated page (COOP/COEP): form and assistant open as a popup window and insert into Lexical
15. Side panel: inline form + preview, insert path, toolbar-icon setting; Templates "Add all"
16. Popup renders

Results are written to `tests/e2e/output/results.json` (screenshot on failure).

## Manual test cases (real sites)

Use a test account; never automate real payments.

| # | Where | Steps | Expected |
|---|---|---|---|
| M1 | Gmail compose body | type `/sig` | signature inserted with line breaks; Ctrl+Z works |
| M2 | Gmail subject | type `/ty` | plain text inserted |
| M3 | WhatsApp Web message box | type `/hi`, then `/order` and fill 2 items | greeting; order with correct total; Enter still sends normally |
| M4 | Outlook.com / any CRM note field | `/payment` → toggle overdue → fill | form appears near caret; text inserted |
| M5 | LinkedIn / X post composer | `/launch` | multi-line post inserted |
| M6 | Any site | Ctrl+Shift+Space | assistant opens at caret; Esc closes and caret is restored |
| M7 | Right-click in a textarea | *Insert K-Flow snippet…* | assistant opens |
| M8 | Settings → Text expansion → delimiter mode | type `/ty.` | expands and keeps `.` |
| M9 | Popup on a site → Disable here | type `/ty` | no expansion; *Enable here* restores |
| M10 | Autopilot demo workflow on a contact form | Popup → Autopilot → Run | fields filled; confirmation before submit; Stop works |
| M11 | Data Hub → import `samples/customers.csv` | `/cust` | pick list shows customers; email/phone filled |
| M12 | Share a folder → offline code → import in another profile | | folder + snippets copied |
| M13 | Cloud: sign in on two browser profiles, edit the same snippet offline in both, go online | | newest wins (or conflict copy with keep-both); conflict logged |
| M14 | Google Docs with experimental mode on | type `/ty` | may expand; if not, assistant + Copy text works |
| M15 | Install Jot Hub alongside | use both | no shared storage/keys/DOM; both work (avoid identical shortcuts in both) |

## Loading check

`chrome://extensions` → Developer mode → Load unpacked → `dist/` (or `release/k-flow-unpacked/`).
The E2E suite performs exactly this load and fails if the manifest, service worker or content script has errors.
