# Architecture

## Technology choices

| Need | Choice | Why |
|---|---|---|
| Windows desktop app, modern UI | **Electron 33** | One codebase; Chromium gives correct Marathi and Hindi text shaping and printing to PDF; easy to package as an installer or a portable .exe. |
| Local database | **SQLite via sql.js (WebAssembly)** | No native modules, so the same build runs on every Windows PC. Writes are transactional and saved atomically (temp file → fsync → rename). |
| Word documents | **docxtemplater + PizZip** | Standards-compliant DOCX. Placeholders are replaced in place, even when Word splits them across runs, without touching headers, images, tables or section settings. |
| Final PDF | **Microsoft Word** (COM through PowerShell, `ExportAsFixedFormat`) or **LibreOffice** | The PDF is made from the user's final DOCX by Word itself, so it matches what the user saw. LibreOffice is the fallback. |
| UDISE forms | **pdf-lib**, with appearances typeset by Chromium | The original AcroForm fields are filled. Each field's visible text is typeset by Chromium (HarfBuzz) and attached as that field's appearance, so Devanagari conjuncts render correctly and long values shrink to fit. |
| Excel export | **exceljs** | Pure JavaScript. |

## Process layout

```
Renderer (sandboxed, contextIsolation, CSP)  ──IPC whitelist──►  Main process
  src/renderer/*  plain ES modules                                src/main/api.js  (allowed calls only)
                                                                   src/main/hooks.js (HTML→PDF, field typesetting)
                                                                   src/core/app.js  EduDeskApp (no Electron dependency)
                                                                     ├─ db.js / schema.js     SQLite + migrations
                                                                     ├─ numbering.js          transactional numbering
                                                                     ├─ docx.js / docxBuilder.js
                                                                     ├─ converter.js          Word / LibreOffice / verification
                                                                     └─ services/*            letters, inward, templates, udise,
                                                                                              students, reports, search, backup, users …
```

## Key guarantees and where they are implemented

- **Drafts never use outward numbers.** The number is reserved when the Word document is generated
  (or at finalization, if configured). See `letters.reserveNumber`, which calls
  `numbering.allocate`.
- **No duplicate or reused numbers.**
  - Numbers are allocated inside a database transaction, and the counters only move forward.
  - Values already in the register (for example from a manual override) are skipped.
  - A UNIQUE index on `letters.outward_no` and on `(scheme, period, category, seq)` blocks
    duplicates.
- **Historical numbering is preserved.** A scheme that has been used is never edited: saving
  changes retires it and creates a new one. Every letter stores its scheme, period, sequence and a
  category-name snapshot.
- **Finalize & Archive.** `letters.finalize` then `completePdf`:
  1. Refuses if the work document is open in Word (`~$` lock file or a sharing violation), is
     missing, empty or damaged, or is stale (details changed after generation).
  2. Writes the archived DOCX with an exclusive-create flag, so nothing is ever overwritten.
  3. Converts that archived file to a temporary PDF. The PDF is verified, then moved into place.
  4. Verifies the pair:
     - both files exist and are not empty;
     - the DOCX is well-formed;
     - the PDF parses and has pages;
     - the DOCX checksum is unchanged, and `pdf_source_sha` equals `docx_sha`.
  5. Only then marks the letter `archive_status = Complete`.

  If the PDF fails, the DOCX and number are kept, the status is `Incomplete` / `Failed`, and
  `retryPdf` finishes the archive without a new number.
- **Revisions.** The archived files are never changed. A revision is finalized as `_v2`, `_v3` and
  so on, with the reason, user and time recorded in `letter_versions` and the audit log.
- **Paths are portable.** Stored paths are relative to the documents root (`doc:`) or to the data
  root (`data:`). The archive can therefore be moved, or a backup restored on another PC, without
  breaking links.
- **Audit history.** Every create, update, numbering, override, finalization, dispatch, cancel,
  restore and settings change writes to `audit_log`.
- **Permissions.** Every service method checks `app.require(permission)`. The current release runs
  as the Owner (single user). Roles and permissions are stored in the database, ready for
  multi-user login.

## Security

- The renderer is sandboxed with `contextIsolation` and no Node integration, and runs under a
  strict Content-Security-Policy. Navigation and new windows are blocked.
- The IPC surface is an explicit whitelist (`src/main/api.js`).
- Uploaded templates:
  - `.docm`, `.dotm`, `.doc` and `.rtf` are refused;
  - `vbaProject.bin` and ActiveX parts are stripped;
  - `.dotx` files are converted to documents.

  Word is always driven with `AutomationSecurity = msoAutomationSecurityForceDisable`, and
  documents are opened read-only. Macros are never run.
- UDISE master PDFs are stored read-only, and their SHA-256 checksum is verified before every use.
- Nothing is sent over the network. The app works fully offline.

## Data folders

```
Documents\EduDesk\                     (or <exe folder>\EduDeskData for the portable version)
  Data\edudesk.sqlite                  database
  Documents\                           archive root (can be moved in Settings)
     2026-27\Outward\<Category>\       final DOCX + PDF letters
     2026-27\Outward\UDISE\OUT_015\    covering letter + UDISE forms + manifest
     2026-27\Inward\<Inward No>\       scans
     2026-27\Acknowledgements\
     Templates\Letters\<id>\v1_….docx  template versions
     Templates\UDISE\                  master forms (read-only)
  Work\<letter id>\                    documents being edited in Word
  Backups\  Exports\  Logs\
```
