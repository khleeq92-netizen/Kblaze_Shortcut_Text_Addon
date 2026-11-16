# Building the Windows installer

## On Windows (recommended for releases)

Requirements: Node.js 20 or 22 (LTS) and Git.

```bash
npm ci
```

```bash
npm test
```

```bash
npm run dist:win
```

The output is in `dist\`:

- `EduDesk-Setup-1.0.0.exe` – the NSIS installer. It lets the user choose the folder, creates
  shortcuts, and keeps the data on uninstall.
- `EduDesk-Portable-1.0.0.exe` – the portable version. Data is kept in `EduDeskData` next to the
  .exe.
- `win-unpacked\` – the unpacked app, useful for quick tests.

`npm test` needs LibreOffice and `pdftotext` (Poppler) for the PDF checks. On Windows with Word,
set `conversion.engine` to `word` or run the end-to-end test instead.

Code signing (recommended for commercial distribution):

```bash
set CSC_LINK=C:\path\certificate.pfx
```

```bash
set CSC_KEY_PASSWORD=********
```

Then remove `"signAndEditExecutable": false` from `package.json` → `build.win`, and run
`npm run dist:win`. Signing also embeds the icon and version information into the .exe.

## On Linux (how the 1.0.0 build was produced)

Requirements: Node.js 22, Wine (64-bit and 32-bit; NSIS needs 32-bit Wine), and network access to
github.com for the Electron and NSIS downloads.

```bash
sudo dpkg --add-architecture i386
```

```bash
sudo apt-get update && sudo apt-get install -y wine64 wine32:i386
```

```bash
npm ci && npm run dist:win
```

Because `signAndEditExecutable` is `false`, this build skips code signing and resource editing.
The app's window and shortcuts show the EduDesk icon, but the .exe file icon in Explorer stays the
default Electron icon until the build is signed on Windows.

## Regenerating bundled assets

```bash
npm run build:assets
```

This regenerates the sample letter templates in `assets/templates`. If the original UDISE PDFs are
placed in `private/udise-originals/`, it also regenerates the UDISE masters in `assets/udise`. The
`private/` folder is excluded from Git because it may contain college-specific data.

## Versions used

Electron 33.2.1 · electron-builder 25.1.8 · sql.js 1.x (SQLite in WebAssembly – no native
modules) · docxtemplater 3 · pdf-lib 1.17 · exceljs 4.
