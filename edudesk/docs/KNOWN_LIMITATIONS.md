# Known limitations and dependencies

## External dependencies

- **Microsoft Word (recommended) or LibreOffice** is required to create PDFs.
  - Without either one, letters can still be prepared and their Word documents archived, but they
    stay *PDF pending* until a converter is installed and **Retry PDF Generation** is used.
  - When Word is missing, *Open in Word* opens the document in the default .docx program.
- **Fonts:** Marathi and Hindi text in letters uses the fonts on the computer. Windows 10 and 11
  include *Nirmala UI* and *Mangal*. If a template uses a font that is not installed, Word
  substitutes another one.

## Not tested on real Windows with Microsoft Word in this build environment

- The 1.0.0 build was produced and tested on Linux. All letter, PDF, UDISE, register, report and
  backup tests ran there, with LibreOffice as the PDF converter.
- The Windows build was started under Wine. It created its database, installed the templates and
  UDISE masters, and completed an automatic backup.
- The **Microsoft Word COM path** has not been run, because no Windows PC with Word was available
  here. This covers PowerShell `ExportAsFixedFormat`, opening documents in `WINWORD.EXE`, and
  Word's `~$` lock-file detection. Before rolling the app out to staff, do one manual pass on the
  office PC: create a letter → Open in Word → edit, save and close → Finalize & Archive → check
  the PDF.
- Printing uses Windows' "Print" verb for the default PDF viewer, so it depends on the installed
  viewer.

## macOS version

- The Mac app is built and smoke-tested on a GitHub macOS runner. The core tests also run there,
  with LibreOffice. **Microsoft Word for Mac automation has not been tested** (Word is not
  available on CI). Before relying on it, do the same manual check as on Windows on one Mac:
  create a letter → Open in Word → edit, save and close → Finalize & Archive → check the PDF.
- The build is ad-hoc signed and not notarized, so macOS asks for approval on first start (see
  the README). The first PDF also triggers the *“control Microsoft Word”* permission prompt.
- Word for Mac's PDF export can look slightly different from Word for Windows (font
  substitution). Letter templates that use *Nirmala UI* for Marathi fall back to *Kohinoor
  Devanagari* on a Mac.
- There is no portable version for Mac. The app keeps its data in `~/Documents/EduDesk`.

## Functional limitations

- **Single user per installation.** Roles and permissions are enforced, but there is no login
  screen yet. Running EduDesk on two PCs against one shared network folder is not supported (the
  database is single-writer).
- **Simple editor.** The in-app editor is plain text; each new line becomes a paragraph. Bold,
  tables and other final formatting are done in Word, as intended.
- **Shared form fields.** In the editable UDISE copy, fields use EduDesk's typeset appearance. If
  someone later edits a field in Acrobat, Acrobat redraws that field with its own font; a font
  without Devanagari cannot show Marathi text there. The flattened submission copy is not
  affected.
- **Very long UDISE values.** Very long values are shrunk to fit, down to about 4.5 pt. If a value
  still does not fit, EduDesk shows a warning to check the preview.
- **New UDISE form versions.** A newer official form with different field names needs the field
  mapping to be completed once (**Templates → UDISE forms → Field mapping**) before it can be
  activated.
- **Sample templates.** The bundled sample templates are editable examples. They are **not**
  verified official government formats.
- **Unsigned installers.** The installers are not code-signed, so Windows SmartScreen shows a
  warning. The .exe file icon stays the default until the build is signed on Windows (see
  `BUILD_WINDOWS.md`).
