'use strict';
/**
 * DOCX -> PDF conversion and Microsoft Word integration.
 *
 * Strategy (setting conversion.engine):
 *   auto        : Microsoft Word (Windows, via COM) first, LibreOffice second
 *   word        : Microsoft Word only
 *   libreoffice : LibreOffice only
 *
 * Word is driven through a short PowerShell script that opens the document
 * READ-ONLY with macros force-disabled, exports it with Word's own PDF engine
 * (ExportAsFixedFormat) and closes without saving. Because the export is done
 * by Word itself the PDF matches what the user saw and saved in Word.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const { UserError, ensureDir, fileSize } = require('./util');

const isWin = process.platform === 'win32';

function run(cmd, args, { timeoutMs = 180000, cwd } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? err.code : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err });
    });
  });
}

function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

async function powershell(script, timeoutMs) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { timeoutMs });
}

let wordCache;
/** Locate WINWORD.EXE through the App Paths registry key. */
async function findWord() {
  if (!isWin) return null;
  if (wordCache !== undefined) return wordCache;
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Winword.exe',
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Winword.exe',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Winword.exe',
  ];
  for (const k of keys) {
    const r = await run('reg.exe', ['query', k, '/ve'], { timeoutMs: 10000 });
    const m = r.ok && /REG_SZ\s+(.+)$/m.exec(r.stdout);
    if (m) {
      const p = m[1].trim().replace(/^"|"$/g, '');
      if (fs.existsSync(p)) return (wordCache = p);
    }
  }
  const guesses = ['Microsoft Office\\root\\Office16\\WINWORD.EXE', 'Microsoft Office\\Office16\\WINWORD.EXE', 'Microsoft Office\\Office15\\WINWORD.EXE'];
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)) {
    for (const g of guesses) {
      const p = path.join(base, g);
      if (fs.existsSync(p)) return (wordCache = p);
    }
  }
  return (wordCache = null);
}

function findLibreOffice(configured) {
  const cands = [];
  if (configured) cands.push(configured);
  if (isWin) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean)) {
      cands.push(path.join(base, 'LibreOffice', 'program', 'soffice.exe'));
    }
  } else {
    cands.push('/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice', '/opt/libreoffice/program/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice');
  }
  return cands.find((c) => c && fs.existsSync(c)) || null;
}

async function convertWithWord(docxPath, pdfPath, timeoutMs) {
  const script = `
$ErrorActionPreference = 'Stop'
$word = $null; $doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  try { $word.AutomationSecurity = 3 } catch {}
  $doc = $word.Documents.Open(${psQuote(docxPath)}, $false, $true, $false)
  $doc.ExportAsFixedFormat(${psQuote(pdfPath)}, 17, $false, 0, 0, 1, 1, 0, $true, $true, 0, $true, $true, $false)
  $doc.Close(0)
  $doc = $null
  Write-Output 'EDUDESK_OK'
} catch {
  Write-Output ('EDUDESK_ERR ' + $_.Exception.Message)
  exit 2
} finally {
  if ($doc -ne $null) { try { $doc.Close(0) } catch {} }
  if ($word -ne $null) {
    # Word may attach to an instance the user is working in: only quit when no documents are open.
    try { if ($word.Documents.Count -eq 0) { $word.Quit(0) } } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}`;
  const r = await powershell(script, timeoutMs);
  if (r.stdout.includes('EDUDESK_OK') && fileSize(pdfPath) > 0) return { ok: true, engine: 'Microsoft Word' };
  const msg = (/EDUDESK_ERR (.*)/.exec(r.stdout) || [])[1] || r.stderr || (r.error && r.error.message) || 'Unknown error';
  return { ok: false, engine: 'Microsoft Word', error: msg.trim() };
}

async function convertWithLibreOffice(docxPath, pdfPath, soffice, timeoutMs) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edudesk-lo-out-'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'edudesk-lo-profile-'));
  const profileUrl = 'file:///' + profile.replace(/\\/g, '/').replace(/^\//, '');
  try {
    const r = await run(soffice, [`-env:UserInstallation=${profileUrl}`, '--headless', '--norestore', '--nologo', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', outDir, docxPath], { timeoutMs });
    const produced = path.join(outDir, path.basename(docxPath).replace(/\.docx$/i, '.pdf'));
    if (fs.existsSync(produced) && fileSize(produced) > 0) {
      fs.copyFileSync(produced, pdfPath);
      return { ok: true, engine: 'LibreOffice' };
    }
    return { ok: false, engine: 'LibreOffice', error: (r.stderr || r.stdout || (r.error && r.error.message) || 'No PDF produced').trim() };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

/** Confirm a PDF can be parsed and has at least one page. */
async function verifyPdf(pdfPath) {
  if (fileSize(pdfPath) <= 0) return { ok: false, error: 'PDF file is missing or empty.' };
  try {
    const doc = await PDFDocument.load(fs.readFileSync(pdfPath), { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPageCount();
    if (pages < 1) return { ok: false, error: 'PDF has no pages.' };
    return { ok: true, pages };
  } catch (e) {
    return { ok: false, error: `PDF cannot be read: ${e.message}` };
  }
}

class Converter {
  constructor(app) {
    this.app = app;
  }

  async status() {
    const cfg = this.app.settings.get('conversion');
    const word = await findWord();
    const lo = findLibreOffice(cfg.libreOfficePath);
    return { platform: process.platform, wordPath: word, wordAvailable: !!word, libreOfficePath: lo, libreOfficeAvailable: !!lo, engine: cfg.engine };
  }

  /**
   * Convert docxPath to pdfPath. Writes to a temp file first and moves it in place
   * only after verification, so a failed attempt never leaves a broken PDF behind.
   */
  async toPdf(docxPath, pdfPath) {
    const cfg = this.app.settings.get('conversion');
    const timeoutMs = Math.max(30, Number(cfg.timeoutSeconds) || 180) * 1000;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edudesk-pdf-'));
    const tmpPdf = path.join(tmpDir, 'out.pdf');
    const attempts = [];
    const engines = cfg.engine === 'word' ? ['word'] : cfg.engine === 'libreoffice' ? ['libreoffice'] : ['word', 'libreoffice'];
    try {
      for (const e of engines) {
        let r;
        if (e === 'word') {
          if (!isWin || !(await findWord())) { attempts.push({ engine: 'Microsoft Word', ok: false, error: 'Microsoft Word is not installed on this computer.' }); continue; }
          r = await convertWithWord(path.resolve(docxPath), tmpPdf, timeoutMs);
        } else {
          const so = findLibreOffice(cfg.libreOfficePath);
          if (!so) { attempts.push({ engine: 'LibreOffice', ok: false, error: 'LibreOffice is not installed.' }); continue; }
          r = await convertWithLibreOffice(path.resolve(docxPath), tmpPdf, so, timeoutMs);
        }
        attempts.push(r);
        if (r.ok) {
          const v = await verifyPdf(tmpPdf);
          if (!v.ok) { r.ok = false; r.error = v.error; continue; }
          ensureDir(path.dirname(pdfPath));
          if (fs.existsSync(pdfPath)) throw new Error(`Refusing to overwrite existing PDF ${pdfPath}`);
          fs.copyFileSync(tmpPdf, pdfPath, fs.constants.COPYFILE_EXCL);
          return { ok: true, engine: r.engine, pages: v.pages, attempts };
        }
      }
      const detail = attempts.map((a) => `${a.engine}: ${a.error}`).join(' | ');
      return { ok: false, error: `PDF could not be created. ${detail}`, attempts };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /** Open a document in Microsoft Word when available, otherwise the default app. */
  async openInWord(docxPath, shellOpen) {
    const word = await findWord();
    if (word) {
      const child = spawn(word, [path.resolve(docxPath)], { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      return { ok: true, app: 'Microsoft Word' };
    }
    if (shellOpen) {
      const err = await shellOpen(path.resolve(docxPath));
      if (err) return { ok: false, error: err };
      return { ok: true, app: 'default', warning: 'Microsoft Word was not found. The document was opened with the default program for .docx files (for example LibreOffice Writer or WordPad).' };
    }
    return { ok: false, error: 'Microsoft Word was not found on this computer.' };
  }

  /** Send a file to the default printer through its associated application. */
  async print(filePath) {
    if (!isWin) return { ok: false, error: 'Direct printing is available on Windows. Open the PDF and print from your PDF viewer.' };
    const r = await powershell(`Start-Process -FilePath ${psQuote(path.resolve(filePath))} -Verb Print`, 60000);
    return r.ok ? { ok: true } : { ok: false, error: r.stderr || 'Printing failed. Open the file and print it manually.' };
  }
}

/** True when Word (or another editor) is holding the document open. */
function isLockedByEditor(docxPath) {
  const dir = path.dirname(docxPath);
  const base = path.basename(docxPath);
  // Word creates "~$" + name (first two chars replaced for long names)
  const candidates = [`~$${base}`, `~$${base.slice(2)}`, `.~lock.${base}#`];
  if (candidates.some((c) => fs.existsSync(path.join(dir, c)))) return true;
  if (isWin) {
    try {
      const fd = fs.openSync(docxPath, 'r+');
      fs.closeSync(fd);
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES') return true;
    }
  }
  return false;
}

module.exports = { Converter, verifyPdf, isLockedByEditor, findLibreOffice, findWord };
