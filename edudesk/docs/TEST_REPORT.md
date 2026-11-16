# Test report – EduDesk Correspondence Manager 1.0.0

Test date: 16 November 2026. Environment: Linux x64, Node 22, Electron 33.2.1, LibreOffice
(PDF converter), Poppler `pdftotext` for checking PDF contents. The real college letters
(39 .docx files) and the two supplied UDISE fillable PDFs were used as test inputs.

## Summary

| Suite | Command | Result |
|---|---|---|
| Core tests (database, numbering, DOCX, PDF, registers, UDISE, backup) | `npm test` | **25 / 25 passed** |
| End-to-end UI test (real Electron app, driven through the screens) | `xvfb-run -a npm run test:e2e` | **12 / 12 steps passed**, 0 renderer errors |
| Screen check (all 23 screens open without errors) | `node test/e2e/screens.js` | **passed**, 0 console errors |
| UDISE fill with Chromium typesetting (Marathi, long names) | `electron test/e2e/udise-check.js` | **passed** – visually checked |
| Windows build | `npm run dist:win` | Installer + portable .exe built |
| Windows build smoke run (Wine, win32) | – | Started, created DB, installed 18 templates + 2 UDISE masters, completed an automatic backup |
| DOCX validator against the 39 real college letters | – | 0 false alarms |

## Core tests (`npm test`)

| Result | Test |
|---|---|
| PASS | backup is complete and verified; tampering is detected; restore brings back data and links |
| PASS | UDISE masters: installed, protected and their fields mapped |
| PASS | UDISE S02 / S03 fill the original fields; existing and updated columns never mix; validation |
| PASS | new UDISE template version: inactive until activated, history kept, old submissions untouched |
| PASS | student import from CSV with validation |
| PASS | database is created, seeded, persisted and passes integrity check |
| PASS | transactions roll back completely on error |
| PASS | record insertion, editing, search, filtering and sorting |
| PASS | numbering patterns format correctly |
| PASS | numbering: sequential, no duplicates, academic-year reset, category-wise, scheme history |
| PASS | outward numbers are unique across letters, cancelled numbers are kept and never reused, overrides are audited |
| PASS | historical letters keep category name when the category is renamed or disabled |
| PASS | inward numbering, linking a reply and correspondence history |
| PASS | placeholders are replaced and Marathi / Hindi / English text is preserved |
| PASS | multi-paragraph bodies (3+ lines) produce valid Word XML and separate paragraphs |
| PASS | placeholders split across Word runs are still replaced, formatting kept |
| PASS | letterhead conversion keeps header images, watermark, borders and page setup |
| PASS | uploaded templates: macros removed, .docm refused, placeholders detected |
| PASS | full letter workflow: generate -> edit in Word -> finalize -> DOCX + PDF verified |
| PASS | finalization refuses locked, stale and missing work documents; never overwrites edits |
| PASS | PDF failure keeps DOCX and number, retry completes the archive without a new number |
| PASS | revisions create new versions and keep the original files |
| PASS | letters in Marathi on the college letterhead finalize with Devanagari intact |
| PASS | externally prepared letters are numbered and archived; dispatch rules enforced |
| PASS | reports export to CSV and Excel; search across registers |

## End-to-end UI test (`test/e2e/run-e2e.js`)

| Result | Step |
|---|---|
| PASS | First run opens the College Profile; details saved through the form |
| PASS | Real college letter imported as letterhead template ("Use as letterhead") |
| PASS | Letter created through the UI and saved as a draft (no outward number used) |
| PASS | Generate Word Document – outward number OUT/001/2026-27 reserved, .docx created |
| PASS | Document edited (simulated Word save) → Finalize & Archive → confirmation dialog; PDF text contains the Word edit |
| PASS | Dispatch recorded through the UI (Speed Post, tracking number) |
| PASS | Inward entry created through the UI (IN/001/2026-27); "Draft reply letter" links the reply |
| PASS | UDISE S02 through the UI: manual student with Marathi father's name → check → covering letter → finalize; archive folder contains Covering_Letter.docx/.pdf, S02 form, editable copy, manifest |
| PASS | Outward register shows both letters; register exported to PDF and contents checked |
| PASS | Global search finds outward and inward records |
| PASS | Backup created through the UI and verified |
| PASS | Dashboard counts match the records |

Screenshots of each step are produced in `test/e2e/output/e2e/`.

## Requirement coverage

| Area | Verified by |
|---|---|
| Database creation, insert, edit, search, filter, sort, transactions | database.test.js |
| Duplicate prevention, numbering transactions, cancellation, academic-year change, historical numbering, manual override audit | database.test.js |
| Upload DOCX templates, macro removal, placeholders (incl. split runs), Marathi/Hindi/English, logos/headers/borders preserved, page breaks via multi-paragraph bodies | documents.test.js |
| Generate → edit → finalize; PDF made from the edited DOCX; DOCX + PDF stored together; locked/stale/missing documents refused; no silent overwrite | documents.test.js, E2E |
| PDF failure and retry without a duplicate number | documents.test.js |
| Revisions keep earlier versions | documents.test.js |
| Dispatch rules, acknowledgement upload, external letters | documents.test.js, E2E |
| Reports (CSV, Excel, PDF), search across registers, inward ↔ outward links | documents.test.js, database.test.js, E2E |
| Backup, verification, tamper detection, restore with working document links | backup-udise.test.js, E2E |
| UDISE: every mapped field, checkboxes, college profile and academic year, S03 existing/updated separation, validation, original master unchanged, one form per student, flattened + editable copies, linked to the outward entry, included in backups, template version management | backup-udise.test.js, udise-check.js, E2E |

## Defects found during testing and fixed

1. Subject shortener cut "Sub" from words such as *Submission* in file names – fixed.
2. Bodies with three or more lines produced invalid Word XML in justified paragraphs (found by the E2E UDISE test; LibreOffice refused the file). The splitter was rewritten, a unit test was added, and every generated DOCX is now checked for well-formed XML before it is saved. The fail-safe worked correctly when this happened: the DOCX and outward number were kept and the letter was marked *PDF pending*.
3. Marathi text disappeared from the *editable* UDISE copy in some viewers (NeedAppearances flag caused viewers to redraw with fonts lacking Devanagari) – fixed; original field background/border colours are now also preserved.
4. Default PDF library mis-shaped Devanagari and clipped long names – replaced with Chromium typesetting and shrink-to-fit.
5. Justified lines with manual breaks stretched words – bodies are now split into real paragraphs.
6. UI: oversized card icons, grid card offsets, wrapped keyboard hint, cramped PDF register columns, US date pickers – fixed.

## Not tested here

Microsoft Word itself (COM PDF export, opening in WINWORD.EXE, `~$` lock files created by Word),
and printing to a physical printer. See `KNOWN_LIMITATIONS.md` for the recommended manual check.
