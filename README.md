# ⚡ K-Flow Automation

Smart text expansion, dynamic fill-in templates, a built-in data hub and user-approved
browser workflow automation — as a Chrome Manifest V3 extension (React + TypeScript),
local-first with optional Firebase sync.

> Independent product with its own branding, storage namespace (`k-flow-db`,
> `kf.*` keys), message channel (`kf/*`), DOM elements (`kf-*`), Firebase app name and
> configuration. It can be installed side by side with Jot Hub or any other extension.

---

## Install (no build needed)

1. Unzip `release/k-flow-chrome-1.0.0.zip` (or use the ready folder `release/k-flow-unpacked/`).
2. Open `chrome://extensions`, switch on **Developer mode**.
3. **Load unpacked** → select the unzipped folder (it contains `manifest.json`).
4. The dashboard opens with a short welcome. Type `/ty` in any text box to try it.

Works in Chrome, Edge, Brave and other Chromium browsers (109+).

## Build from source

Requires Node 18+.

```bash
npm install
```

```bash
npm run build          # → dist/  (load this folder unpacked)
```

```bash
npm run package        # → release/k-flow-chrome-<version>.zip
```

```bash
npm test               # 141 unit tests (engine, templates, matching, validation)
```

```bash
npm run test:e2e       # builds, loads the extension in Chromium, runs 35 browser tests
```

Other scripts: `npm run dev` (watch build), `npm run build:firefox` (→ `dist-firefox/`),
`npm run typecheck`, `npm run generate-key` (stable extension ID, see Firebase setup).

---

## Features

### Snippets
* Create, edit, duplicate, delete; unique shortcut per snippet with duplicate / prefix-conflict warnings.
* Folders and unlimited subfolders, colours, **drag-and-drop** (snippets onto folders, folders into folders).
* Search by name, shortcut, content or tag; Pinned, Favorites, Recently used views.
* Enable/disable per snippet; per-snippet trigger mode; tags and descriptions.
* **Bulk** select → enable, disable, favourite, move, export, share, delete.
* Import (K-Flow JSON, JSON arrays, `{ "shortcut": "text" }` maps) with copy / merge / replace; export any list.
* Plain-text editor with command highlighting, or **rich text** editor (bold, lists, links, headings…).
* Per-snippet usage count, last used, created/updated.

### Text expansion engine
* Typed shortcuts expand **instantly** or **after a delimiter** (space/punctuation, delimiter kept).
* Word-boundary and case-sensitivity options; per-site disable list; never runs in password fields.
* Correct caret handling, `{{cursor}}` placement, multi-line text, selection replacement.
* Native **undo** (Ctrl+Z) for inputs/textareas (insertion via the browser's editing commands).
* Adapters, all covered by automated browser tests:

| Target | Method | Tested |
|---|---|---|
| `<input>`, `<textarea>` (incl. React-style controlled fields) | `insertText` → `setRangeText` + input events | ✅ |
| `contenteditable` (Gmail-style compose, CRMs, help-desks) | selection + `insertText` / `insertHTML` | ✅ |
| Lexical (**WhatsApp Web**, Facebook/Meta apps) | synthetic paste over the selected shortcut | ✅ (real Lexical, incl. WhatsApp-style isolated page) |
| Cross-origin-isolated sites (WhatsApp Web) | fill-in form / assistant open as a small popup window, because such pages block embedded extension frames | ✅ |
| Quill | synthetic paste | ✅ (real Quill) |
| ProseMirror / TipTap, Draft.js, Slate, CKEditor 5 | same paste adapter (framework detection) | detection only — not separately tested |
| Same-origin iframes (TinyMCE-style) | content script in all frames | ✅ |
| Google Docs | **experimental**, opt-in (Settings → Text expansion) | ❌ not automatically testable — see limitations |

  If an editor refuses the insertion, K-Flow shows a notification with **Copy text** instead of failing silently.
* **Manual selection:** snippet assistant (default **Ctrl+Shift+Space**, configurable), right-click
  → *Insert K-Flow snippet…*, browser command (Alt+Shift+Q), popup *Insert/Copy*, optional floating ⚡ button.

### Dynamic templates & command engine
Fields (text, multiline, dropdown, multi-select, checkbox, toggle, date, time, date-time, number, currency,
Data-Hub picker), required/defaults/validation (min, max, length, patterns, custom rules), optional sections,
repeating sections, conditions (if / elseif / else), variables, 80+ formula functions (text, math, currency,
percentages, totals, dates, business days, lists, lookups), date formats & shifts, dynamic links, dynamic tables
with totals, snippet includes, profile values, page context.

* **Visual command builder** (no syntax needed): pick a command, fill a form, get correct syntax; condition builder
  and formula helper with field chips and a function picker.
* **Form builder** panel listing every field, with in-place editing.
* **Live preview** with the actual fill-in form.
* Advanced users can write commands directly — see **[docs/TEMPLATE_SYNTAX.md](docs/TEMPLATE_SYNTAX.md)**.

### Autopilot (browser workflows)
Visual step builder: type text (with `{{commands}}`), Tab / Shift+Tab, select dropdown options (native and ARIA),
tick checkboxes, click elements, press keys, wait / wait for element, insert snippet, ask for confirmation.
Targets by **field label**, CSS selector (with an on-page **element picker**) or the focused field.
Safety: runs only when you start it, visible progress panel with **Stop**, and an extension-owned confirmation
dialog (which the page cannot click) before anything that submits, sends, pays, purchases, deletes, or touches
password/payment fields.

### Data Hub
Tables with typed columns (text, number, email, phone, date, category, URL, yes/no), inline grid editing,
filtering, CSV/JSON import & export (CSV formula-injection safe). Use rows in templates with
`{{pick: customer; table=customers}}` → `{{customer.email}}`, `lookup()`, `filter()` or `{{table: data.customers}}`.

### Templates, sharing & marketplace
* **78 built-in templates** across 19 categories (gold & forex market analysis, trade signals, trade management, risk & journal, VIP channel business, emails, WhatsApp, payments, support, office, college
  administration, admissions, attendance, trading updates & recaps, social media, meetings, follow-ups,
  proposals, personal) — preview with a live form, then add to your folders. Save your own templates with custom categories.
* Share a snippet, a selection or a whole folder:
  **offline share code** (no account; data is in the code) or **cloud link** (public-by-link or restricted to emails).
  Import by pasting the code/link.
* Optional **marketplace** (Firestore): browse/search community templates by category, duplicate into your folders,
  submit your own; submissions are **moderated** (pending → approved/rejected).

### Dashboard
Sidebar (My Snippets, Pinned, Favorites, Recently used, Folders, Templates, Data Hub, Autopilot, Marketplace,
Usage statistics, Team, Settings), top bar (search, create snippet/folder, marketplace, statistics, dark mode,
account), light/dark/system theme, keyboard shortcuts (`/` search, Ctrl+S save).

### Backup & sync
Offline-first (IndexedDB). Optional Firebase: email/password and Google sign-in, automatic sync (on change + every
2 minutes while the dashboard is open), manual sync, conflict handling (newest-wins or keep-both, with a conflict
log), last-sync status, tombstoned deletions, settings sync, per-user isolation via security rules.
Full JSON backup, restore (merge or replace), and sample-data restore — all without an account.

### Commercial-ready plans
`src/shared/plans.ts` defines **Free / Pro / Business / Enterprise** limits and features (snippets, folders, tables,
workflows, library templates, team seats; forms, formulas, conditions, rich text, Data Hub, Autopilot, analytics,
teams, roles, team analytics, audit logs). Limits are enforced in the dashboard and the engine. **No payment
gateway** — the active plan is a local setting (default **Pro**, enforcement can be switched off).
Business/Enterprise: team workspaces with shared folders, member invitations, roles (owner/admin/editor/viewer,
enforced by Firestore rules), team analytics and an append-only audit log.

---

## Features that need external configuration

| Feature | Needs | Without it |
|---|---|---|
| Accounts, cloud sync, cross-device | Firebase project + config (Settings → Cloud & Account or `.env`) | Local-only; JSON backup/restore work |
| Google Sign-In | OAuth client ID + redirect URI + stable extension ID | Email/password sign-in still works |
| Cloud share links | Firebase + sign-in | Offline share codes work |
| Community marketplace & moderation | Firebase + deployed rules/indexes; `admins/{uid}` docs for moderators | Built-in collections work |
| Teams, roles, team analytics, audit log | Firebase + Business/Enterprise plan setting | Hidden |
| Stable extension ID | `npm run generate-key` → `KF_EXTENSION_KEY` | ID depends on folder path |
| Payments / subscriptions | Not implemented by design | Plans are a local setting |

Step-by-step: **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)** · schema & rules: **[docs/FIRESTORE_SCHEMA.md](docs/FIRESTORE_SCHEMA.md)**, `firebase/firestore.rules`.

## Security & privacy

* Permissions: `storage`, `contextMenus`, `scripting` (activate in already-open tabs), `identity` + page access for expansion. No `tabs`, history, cookies, webRequest or remote code.
* The content script reads only up to ~50 characters before the caret in the focused field; it receives just shortcut
  metadata — snippet content stays in the extension and only the final text is inserted.
* Fill-in forms, the assistant and Autopilot confirmations run in an extension-origin iframe guarded by a one-time
  nonce from the background worker (`use_dynamic_url` for web-accessible resources).
* Imports and share codes are validated, size-limited; rich HTML is sanitized (allow-list) on save, import and insertion.
* Messages are accepted only from the extension's own contexts. Firestore rules isolate user data and enforce team roles.

## Known limitations (honest list)

* **Google Docs** renders text on a canvas; the experimental adapter (simulated Backspace + paste) is opt-in and not
  verified by automated tests. Reliable path there: assistant → *Copy text* → Ctrl+V.
* Editors inside **cross-origin iframes** and closed shadow roots can't be reached by any extension content script.
* In **instant** mode a shortcut that is the prefix of another (`/pay` vs `/payment`) wins; the editor warns, or use delimiter mode.
* Synthetic key events can't trigger browser default actions, so Autopilot moves focus programmatically for Tab and
  submits forms explicitly (after confirmation) for Enter.
* Automatic sync runs while the dashboard or popup are open (Firebase is not loaded into the background worker to keep it light).
* Chrome Web Store, Firefox AMO and Safari distribution are not set up (Firefox build target exists; Safari needs Xcode conversion).

## Project layout

```
src/
  engine/        template parser, formula language, dates, renderer (pure TS, unit tested)
  content/       content script: detection, caret/text access, insertion adapters, overlay, Autopilot, picker
  background/    MV3 service worker: data access, rendering, sessions, menus, commands
  pages/         dashboard/ (React app), popup/, overlay/ (assistant, fill-in form, confirmations)
  cloud/         Firebase auth, sync engine, sharing, marketplace, teams (lazy-loaded)
  shared/        types, IndexedDB layer, settings, plans, validation, sanitizer
  library/       built-in templates + first-run sample data
  ui/            shared styles and the form renderer
firebase/        firestore.rules, firestore.indexes.json, firebase.json
tests/unit/      Vitest suites       tests/e2e/   Playwright extension tests + fixture page (real Quill/Lexical)
samples/         importable sample snippets, the template library as JSON, sample CSV
docs/            syntax guide, Firebase setup, schema, testing
```

See **[docs/TESTING.md](docs/TESTING.md)** for the test plan and manual test cases.
