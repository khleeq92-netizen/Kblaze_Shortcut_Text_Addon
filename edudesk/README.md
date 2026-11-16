# EduDesk Correspondence Manager

Offline desktop application for Windows and macOS for school and college offices: official letters from
reusable Word templates, a numbered **Outward Register**, an **Inward Register**, dispatch
tracking, automatic **DOCX + PDF archiving**, UDISE **S02 / S03** forms filled on the
original fillable PDFs, reports, search, and verified backups.

Everything runs locally. No internet connection or cloud service is needed, and no document
or student data leaves the computer.

---

## 1. Install (Windows 10 / 11, 64-bit)

| File | Use |
|---|---|
| `EduDesk-Setup-1.0.0.exe` | Normal installation (Start-menu and desktop shortcuts). Data is kept in `Documents\EduDesk`. |
| `EduDesk-Portable-1.0.0.exe` | No installation. Run from any folder or pen drive. Data is kept in an `EduDeskData` folder next to the .exe. |

1. Double-click the installer and follow the steps. No administrator rights are needed.
2. **Microsoft Word** (2013 or newer) is recommended. EduDesk uses Word to create the final PDFs.
   Without Word, install the free **LibreOffice**, which EduDesk detects automatically.
3. Start **EduDesk**. On first run it opens **Settings → College Profile**.

The installers are not code-signed, so Windows SmartScreen may show *“Windows protected your PC”*.
Click **More info → Run anyway**. For commercial distribution, sign the installers (see
`docs/BUILD_WINDOWS.md`).

## 1a. Install on a Mac (macOS 12 Monterey or newer, Intel or Apple silicon)

1. Open `EduDesk-1.0.0-mac-universal.dmg` and drag **EduDesk Correspondence Manager** onto
   **Applications**.
2. The app is not notarized by Apple, so the first start needs one extra step:
   - **macOS 15 Sequoia and newer:** double-click the app and click **Done** when it is blocked.
     Then open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** and
     confirm.
   - **macOS 12 to 14:** right-click (or Control-click) the app, choose **Open**, then **Open**.
   - If macOS says the app *“is damaged”*, run this once in **Terminal**, then open the app again:
     ```bash
     xattr -cr "/Applications/EduDesk Correspondence Manager.app"
     ```
3. Install **Microsoft Word for Mac** (recommended) or **LibreOffice**.
4. The first time you click **Finalize & Archive**, macOS asks:
   *“EduDesk wants to control Microsoft Word”*. Click **OK**. If you clicked *Don't Allow*, turn
   it on later in **System Settings → Privacy & Security → Automation → EduDesk → Microsoft Word**.

Data is kept in `~/Documents/EduDesk`. Keyboard shortcuts use **⌘** instead of Ctrl (⌘N new
letter, ⌘I inward entry, ⌘K search, ⌘S save draft, ⌃1…9 sidebar sections).

## 2. First-time set-up (10 minutes)

1. **Settings → College Profile**: enter the name, address, UDISE code, index number, principal,
   district and block.
2. **Templates → Add template from Word file**: choose any letter your office already typed in
   Word, then choose **“Use as letterhead”**. EduDesk keeps your logo, header, watermark, border and
   margins, and fills in the outward number, the date at the top-right, the recipient, subject,
   body, signature and enclosures. Tick *“Make this the default letterhead”*.
3. **Settings → Numbering**: pick your outward number format (for example `OUT/001/2026-27`,
   `001/2026-27`, `BEO/001/2026-27` or `COLLEGE/2026-2027/029`).
4. **Settings → Backup & Restore**: choose a backup folder, ideally on an external drive, and click
   **Back up now**.

## 3. Daily work

**Sending a letter**

1. Open **Create Letter** (or press Ctrl + N). Choose the category, template and recipient, then
   type the subject and body.
2. Click **Generate Word Document**. The outward number is reserved at this point; drafts never use
   numbers.
3. Click **Open in Word**, correct the letter, **save and close** Word.
4. Click **Finalize & Archive**. EduDesk takes the saved document, creates the PDF from that exact
   file with Word, checks both files, and files them as
   `Documents\2026-27\Outward\BEO\OUT_001_2026-27_14-11-2026_Student_Information.docx` / `.pdf`.
5. Click **Record Dispatch** to enter the mode, date and tracking number. You can upload the
   acknowledgement receipt later.

**Received letters:** use **Inward Register → Add Inward Entry** (Ctrl + I) and attach the scan.
**Draft reply letter** links the reply to the original letter.

**UDISE:** use **UDISE S02 / S03**. Add students from the student database or type them in, check
the forms, then continue to the covering letter. Every student gets a completed form on the
original PDF. After the covering letter is finalized, the forms, the editable copies and a batch
manifest are archived in `Outward\UDISE\OUT_015\` under the same outward number.

Full instructions: [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md).

## 4. Documentation

| Document | Contents |
|---|---|
| [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) | Step-by-step guide for office staff |
| [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md) | Backups, verification, restore, moving the archive |
| [`docs/BUILD_WINDOWS.md`](docs/BUILD_WINDOWS.md) | Reproducible build of the installer and portable version |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Technology choices, modules, data model, security |
| [`docs/schema.sql`](docs/schema.sql) | SQLite database schema |
| [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) | What was tested and the results |
| [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) | Limitations and external dependencies |

## 5. For developers

```bash
npm install
```

```bash
npm start
```

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run dist:win
```

```bash
npm run dist:mac
```

- `npm start` runs the app from source.
- `npm test` runs the core tests (needs LibreOffice and `pdftotext` on Linux).
- `npm run test:e2e` runs the end-to-end UI test (Playwright; use `xvfb-run -a` on Linux).
- `npm run dist:win` builds `dist/EduDesk-Setup-*.exe` and `dist/EduDesk-Portable-*.exe`.
- `npm run dist:mac` builds the universal `.dmg` and `.zip`. It must run on a Mac; the GitHub
  Actions workflow `.github/workflows/edudesk-mac.yml` does this automatically.

Source layout:

```
src/core/        application core (no Electron dependency – fully testable in Node)
  services/      letters, inward, templates, udise, reports, search, backup, ...
src/main/        Electron main process, whitelisted IPC API, Chromium PDF helpers
src/renderer/    user interface (plain ES modules, no framework)
assets/          sample templates, UDISE master forms, fonts, icon
scripts/         asset generation
test/            node:test suites and the Playwright end-to-end test
```
