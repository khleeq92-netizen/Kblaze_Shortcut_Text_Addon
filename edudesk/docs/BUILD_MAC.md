# Building the macOS version

The Mac app is the same source code as the Windows app. Only the packaging differs.

## Option A – GitHub Actions (no Mac needed)

The workflow `.github/workflows/edudesk-mac.yml` runs on a macOS runner. It starts on every push
that changes `edudesk/`, or by hand from **Actions → EduDesk – macOS build → Run workflow**. It:

1. installs the dependencies, plus LibreOffice and Poppler;
2. runs the core test suite on macOS;
3. builds a **universal** (Intel + Apple silicon) `.dmg` and `.zip`, ad-hoc signed;
4. verifies the signature and both architectures;
5. starts the packaged app and checks that it creates its database, templates and UDISE masters.

Download the result from the run page under **Artifacts → EduDesk-macOS**.

## Option B – on a Mac

Requirements: Node.js 22 and the Xcode Command Line Tools (`xcode-select --install`).

```bash
npm ci
```

```bash
npm run dist:mac
```

The output is `dist/EduDesk-1.0.0-mac-universal.dmg` and `.zip`.

## Signing and notarization (for commercial distribution)

The default build is **ad-hoc signed** (`"identity": "-"`), so users must approve it once under
*Privacy & Security* (see the README). To distribute without that step:

1. Join the Apple Developer Program and create a **Developer ID Application** certificate.
2. In `package.json` → `build.mac`, set:
   - `"identity"` to the certificate name;
   - `"hardenedRuntime": true`;
   - `"notarize": true`.
3. Build with these environment variables set: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
   `APPLE_TEAM_ID`.

## macOS specifics in the code

- `src/core/converter.js` – Microsoft Word for Mac is driven with JavaScript for Automation
  (`osascript -l JavaScript`). Because Word is sandboxed, the document is copied into Word's own
  container (`~/Library/Containers/com.microsoft.Word/Data/Documents/EduDeskConvert`), exported to
  PDF there, and the PDF is moved back into the archive. LibreOffice is found in `/Applications`.
  Printing uses `lp` (the default printer).
- `src/main/main.js` – the macOS menu bar (Quit, Hide, Edit for ⌘C/⌘V, Window).
- `package.json` → `build.mac.extendInfo` – `NSAppleEventsUsageDescription`. Without it, macOS
  silently refuses to let EduDesk control Word.
