# Development log: K-Flow Automation 2.0

## Starting point
The repository contained **QuickText Hub 1.0**, a working MV3 text-expansion extension: a template engine with forms and formulas,
a Data Hub, "Autopilot" workflows, Firebase sync, teams and a marketplace, with 141 unit and 35 E2E tests passing.
It was preserved and extended rather than rewritten. The template engine, insertion adapters (Lexical, Quill, iframes,
cross-origin-isolated pages), overlay infrastructure and sharing were reused.

## Decisions
| Area | Decision | Why |
|---|---|---|
| Identity | Rebranded every namespace (`kf/*` messages, `kf-*` DOM, `kf.*` storage, `k-flow-db`) | An independent product that can coexist with other extensions |
| Automation model | Autofill profiles, macros and scripts as separate record types sharing variables and datasets; legacy Autopilot workflows migrated to macros | One mental model, no duplicate engines |
| Selectors | Generated CSS (shadow `>>>`) primary with XPath and label fallbacks; label matching understands table layouts | Government portals use table layouts and unstable ids |
| Planning split | Values are resolved in the background; the page receives only the planned values for one run | Datasets, vault and variables never become page-readable |
| Navigation | Run and recording state live in `chrome.storage.session`; steps that may navigate checkpoint first | Multi-page forms; survives service-worker restarts |
| JavaScript | sval interpreter injected into the MAIN world, acorn instrumentation, sandbox global stripped, dry runs in the MV3 sandbox page | Works under strict CSP, no extension privileges, enforceable loop and time limits |
| Spreadsheets | Own XLSX reader/writer on `fflate` instead of SheetJS | The npm SheetJS build is outdated with known advisories; small, auditable code |
| Encryption | Non-extractable WebCrypto device key for data at rest; PBKDF2 passphrase vault for secrets and anything leaving the device | Transparent everyday use, strong protection for credentials and cloud copies |
| Cloud | Sync engine abstracted behind `RemoteStore` (Firestore adapter plus an in-memory store for tests); organizations replace teams | Testable merge logic; RBAC enforced by rules |
| AI | Optional; offline matcher first; providers through the user's key; Anthropic via the official SDK (`claude-opus-5-5`, structured JSON output, server-side refusal fallback) | Basic features never depend on a paid API |
| Data honesty | Presets ship dataset **schemas** without fabricated student or member records; portal profiles are marked "starter" until verified | No mock data presented as real; live portals were not accessible |

## Build sequence
1. Inspected the repository, ran the baseline (141 unit, 35/35 E2E) and rebranded.
2. Extended the data model, IndexedDB v2 stores and automatic version history.
3. Automation core: sites, DOM/selectors, setters, safety, variables, autofill, macro player, recorder, script instrumentation and host.
4. Data: XLSX, CSV/TSV/JSON adapters, Google Sheets, quality checks, sensitive-column protection.
5. Security: crypto, vault, RBAC, audit and execution history.
6. Background orchestration, content controller, page UI (run panel, recorder bar, preview badges, field-selector bar), the overlay field-mapping panel.
7. Cloud: sync engine and Firestore adapter, organizations (members, invitations, permissions, policies, devices, audit, activity, versions), backups. Rewrote the Firestore rules.
8. AI builder (offline matcher plus Anthropic, OpenAI, Gemini and OpenAI-compatible providers).
9. Workspace presets and seeding.
10. Dashboard: overview, workspaces, autofill, macros, scripts, variables, datasets, vault, AI builder, history and audit, organization, backup and settings tabs. Side panel "This page", popup.
11. Tests: 109 new unit tests, rules tests on the emulator, cloud integration, 15 new E2E automation tests on demonstration pages.
    The tests found 12 defects, all fixed (see TEST_RESULTS.md), including a script-sandbox isolation gap and two Firestore rule holes.
12. Visual review of screenshots (light and dark), polish, documentation and packaging.

## Outcome
* `release/k-flow-chrome-2.0.0.zip`: installable extension.
* `release/k-flow-unpacked/`: load-unpacked folder.
* `release/k-flow-automation-source-2.0.0.zip`: source archive.
* Final test run: typecheck clean, 250/250 unit, 10/10 rules, 2/2 cloud integration, 50/50 E2E.
