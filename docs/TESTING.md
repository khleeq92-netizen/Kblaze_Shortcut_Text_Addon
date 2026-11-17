# Testing

| Suite | Command | Environment | Scope |
|---|---|---|---|
| Typecheck | `npm run typecheck` | tsc | whole project, including tests |
| Unit | `npm test` | Vitest (jsdom / node, fake-indexeddb, `tests/unit/setup.ts` chrome stub) | 21 files, 250 tests |
| Security rules | `npm run test:rules` | Firestore emulator (firebase-tools 13, Java 11+) | 10 scenario tests over `firebase/firestore.rules` |
| Cloud integration | `npm run test:cloud` | Firestore emulator + Vitest | real Firestore adapter + sync engine under the production rules |
| End-to-end | `npm run test:e2e` | Playwright + Chromium, the built extension | 50 browser tests |
| Everything | `npm run test:all` | | all of the above |

## Unit suites (`tests/unit`)
`sites`, `dom` (selectors, labels, detection, shadow DOM, waits), `setters` (every control type, React tracker, ARIA dropdowns),
`autofill` (planning, conditions, preview, CAPTCHA, dynamic fields, approval), `macro` (steps, loops, retries, pause/stop,
navigation), `recorder`, `script` (instrumentation, sandbox isolation, limits, line numbers), `variables` (all kinds, scopes,
cycles, preset formulas), `presets` (workspaces, shortcut conflicts, rule references, migration), `xlsx`, `sources`
(CSV/JSON/XLSX adapters, typing, quality checks, Google Sheets with mocked API), `security` (device key, vault, rekey,
auto-lock, dataset protection), `permissions` (RBAC), `sync` (two-device engine with conflicts, tombstones, RBAC filter),
`backup` (encrypted/plain, restore modes), `ai` (offline matcher, prompt privacy, output validation, Anthropic/OpenAI/Gemini
requests with mocked fetch), `history` (pruning, CSV/XLSX reports, version history), plus the template-engine suites.

## End-to-end (`tests/e2e`)
`run-e2e.mjs` starts a static server for `fixtures/` (including a cross-origin-isolated page and a strict-CSP page), launches
Chromium with `dist/` loaded and seeds data through the dashboard origin.
* **Text expansion (35 tests):** inputs, textareas, contenteditable, Quill, Lexical, iframes, forms, assistant, side panel, popup, and every dashboard route.
* **Automation (`automation.mjs`):** autofill from a dataset on a government-style admission page (radio, select, dynamically generated
  field, ARIA dropdown, date picker, CAPTCHA untouched), preview, record stepping, the in-page hotkey, a multi-page macro across a navigation,
  pause/resume/stop, submit approval, the recorder and replay, the visual field selector, the vault with a password field,
  scripts on a strict-CSP page with the loop limit, the sandbox dry-run privilege probe, Excel import with encryption at rest,
  workspace switching and the history Excel export.

Set `ONLY=<regex>` to run matching E2E tests and `DEBUG=1` to print page logs. Results are written to `tests/e2e/output/results.json`.
