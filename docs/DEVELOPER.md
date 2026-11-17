# K-Flow Automation: Developer guide

## Stack
Chrome Manifest V3 · TypeScript · React 18 · Vite 6 · IndexedDB · Firebase 11 (Auth + Firestore, optional) ·
`sval` (JavaScript interpreter for user scripts) · `acorn` (script instrumentation) · `fflate` (XLSX zip) ·
`@anthropic-ai/sdk` (optional AI builder). Tests use Vitest + jsdom/fake-indexeddb, the Firebase emulator, and Playwright/Chromium.

## Layout
```
src/
  automation/          engines (pure / DOM, no extension APIs)
    sites.ts           URL patterns, allowlists, official domains
    dom.ts             selector generation (CSS/XPath, shadow >>>), label detection, field detection, target resolution, waits
    setters.ts         value setters for every control type (React-compatible) + preview validation
    safety.ts          submit/CAPTCHA/OTP/sensitive detection, masking
    autofill.ts        planAutofill (extension side) + runAutofill (page side)
    macro.ts           macro player: conditions, loops, retries, pause/stop, navigation checkpoints
    recorder.ts        macro recorder
    variables.ts       variable resolution (formulas use the template engine's safe evaluator)
    script/instrument.ts  acorn: syntax/safety checks, loop guards, line tracking
    script/host.ts     sval runtime + kf API (sandbox global stripped to built-ins)
  background/          service worker: index.ts (snippets, overlay, commands, menus) + automation.ts (orchestration)
  content/             content script: expansion engine, overlay host, page UI, automation controller
  script-host/         MAIN-world bundle injected only when a script runs
  sandbox/             MV3 sandbox page bundle for dashboard dry runs
  pages/               dashboard, side panel, popup, overlay (extension pages, React)
  data/                xlsx reader/writer, data-source adapters, Google Sheets, sensitive-column protection
  security/            crypto (device key, PBKDF2), vault, RBAC permissions
  cloud/               firebase bootstrap, sync engine + Firestore adapter, org admin, backups, sharing, marketplace
  ai/                  builder (offline matcher + providers), encrypted API keys
  engine/              template engine (snippets, formulas, dates)
  library/             template library, workspace presets, first-run seed + legacy migration
  shared/              types, IndexedDB layer (+version history), settings, history/audit, org state
firebase/              firestore.rules, indexes, emulator config
tests/unit             Vitest (jsdom / node)
tests/integration      Firestore emulator integration
tests/rules            security-rules tests (node:test + @firebase/rules-unit-testing)
tests/e2e              Playwright: run-e2e.mjs (expansion/UI) + automation.mjs (automation features), fixtures/
```

## Component boundaries
| Component | Trust | May access |
|---|---|---|
| Background worker | trusted | everything: IndexedDB, vault session, tabs, scripting |
| Dashboard / side panel / popup / overlay | trusted extension pages | IndexedDB, chrome APIs, Firebase (dashboard only) |
| Content script (isolated world) | semi-trusted (runs in web pages) | page DOM; asks the background for one run's data |
| Script host (page main world) | untrusted user code | page DOM only; no extension APIs; values passed in |
| Sandbox page | untrusted user code | nothing (opaque origin) |

## Message protocol (`chrome.runtime.sendMessage`, prefix `kf/`)
The background accepts only messages from this extension (`sender.id`). Messages from a **content script** may act
only on their own tab. Messages from **extension pages** may name a `tabId`.

| Message | From | Purpose |
|---|---|---|
| `kf/automation/forPage` | page, panel | matching profiles/macros/scripts, run & recording state |
| `kf/autofill/plan` | content | resolved rules for this URL (variables, dataset record, vault) |
| `kf/autofill/run` | panel/dashboard | start autofill or preview in a tab |
| `kf/autofill/report` | content | log the execution + audit |
| `kf/dataset/move` | any | next/previous/set active record |
| `kf/macro/start` · `pending` · `checkpoint` · `finish` · `control` · `render` · `formula` · `nextRecord` | mixed | macro lifecycle (state in `chrome.storage.session`) |
| `kf/rec/start` · `status` · `step` · `pause` · `stop` | mixed | recorder lifecycle |
| `kf/script/run` | any | instrument + inject script host (MAIN world) + run |
| `kf/mapper/start` | panel | start the field selector in a tab |
| `kf/scan` | extension pages | detected fields of a tab (AI builder) |

Overlay frames (picker, fill-in form, confirmation, **mapField**) use one-time nonces issued by the background.

## Data flow of an autofill run
1. The content script sends `kf/autofill/plan` with the URL.
2. The background checks the allowlist, org policy and RBAC, then loads the profile. It decrypts the dataset with the device key
   (and the vault master key, if unlocked), resolves variables and plans the rules. Only the planned values go back.
3. The content script runs each rule: wait for the element, apply safety checks, set the value or validate it in preview, then report.
4. The background writes the execution (with field values excluded) and the audit entry.

## Adding a data source
Implement `DataSourceAdapter` in `src/data/sources.ts`:
```ts
export const mySource: DataSourceAdapter<{ url: string }> = {
  kind: 'json', label: 'My API',
  async load({ url }) { const rows = /* string[][] incl. header */; return [{ name: 'Sheet', rows, source: { kind: 'json', ref: url } }]; },
};
```
`sheetToTable()` handles typing, keys, sensitive-column detection and the key column. Add the option to `ImportWizard` in `DataHubView.tsx`.

## Adding a macro step type
1. Add it to `MacroStepType` (`shared/types.ts`).
2. Implement it in `runStep()` in `automation/macro.ts`. Use `handoff()` before anything that may navigate.
3. Add it to `STEP_TYPES` in `MacrosView.tsx` and to `describeStep()`.

## Storage
IndexedDB `k-flow-db` v2 (see DATABASE_SCHEMA.md). `saveRecords()` bumps `version`, writes a version snapshot
(25 kept) and notifies other contexts through `chrome.storage.local['kf.revision']`.

## Build
`scripts/build.mjs` runs Vite for the extension pages, then builds IIFE bundles for `content.js`, `script-host.js` and `sandbox.js`, and an ES module `background.js`.
`scripts/manifest.mjs` generates the manifest for each target.

## Conventions
* No `eval`/`new Function` anywhere in extension code (the CSP is `script-src 'self'`).
* Never log field values. Use `mask()` for anything sensitive.
* Every write path goes through `saveRecords()` (versioning and change notification), or `saveRec()` in the dashboard, which adds RBAC checks and audit entries.
