'use strict';
/** Chromium-powered helpers used by the core (report PDFs, UDISE field typesetting). */
const { BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

function hiddenWindow(width = 1200, height = 1600) {
  return new BrowserWindow({
    show: false, width, height,
    webPreferences: { offscreen: false, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
  });
}

async function loadHtml(w, html) {
  const tmp = path.join(os.tmpdir(), `edudesk-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  try {
    await w.loadFile(tmp);
  } finally {
    setTimeout(() => fs.rm(tmp, { force: true }, () => {}), 5000);
  }
}

async function htmlToPdf(html, outPath, { landscape = false } = {}) {
  const w = hiddenWindow();
  try {
    await loadHtml(w, html);
    const data = await w.webContents.printToPDF({ landscape, printBackground: true, preferCSSPageSize: true, pageSize: 'A4', margins: { marginType: 'default' } });
    fs.writeFileSync(outPath, data, { flag: 'wx' });
  } finally {
    w.destroy();
  }
}

/**
 * Typeset form-field values with Chromium (HarfBuzz shaping for Devanagari) on a transparent
 * page the size of the PDF page. Text shrinks to fit each field; very long text wraps.
 */
async function renderFieldOverlay({ width, height, items, fontsDir }) {
  const fontUrl = (f) => pathToFileURL(path.join(fontsDir, f)).href;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'EdDeva'; src: url('${fontUrl('NotoSansDevanagari-Regular.ttf')}'); }
    @page { size: ${width}pt ${height}pt; margin: 0; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body { width: ${width}pt; height: ${height}pt; position: relative; overflow: hidden; }
    .f { position: absolute; box-sizing: border-box; padding: 0 2pt; color: #000; font-family: Arial, Helvetica, 'EdDeva', 'Nirmala UI', 'Kohinoor Devanagari', 'Mangal', sans-serif;
         display: flex; align-items: center; overflow: hidden; }
    .f span { white-space: nowrap; display: block; }
    .f.wrap span { white-space: normal; line-height: 1.05; }
  </style></head><body>${items.map((it, i) => `<div class="f" id="f${i}" data-name="${esc(it.name)}" style="left:${it.x}pt;top:${height - it.y - it.h}pt;width:${it.w}pt;height:${it.h}pt"><span>${esc(it.text)}</span></div>`).join('')}
  <script>
    window.__fit = async () => {
      await document.fonts.ready;
      const out = [];
      for (const el of document.querySelectorAll('.f')) {
        const span = el.firstElementChild;
        const boxW = el.clientWidth - 4 * 1.333, boxH = el.clientHeight;
        let size = Math.min(10, (el.clientHeight / 1.333) * 0.72);
        span.style.fontSize = size + 'pt';
        while (span.scrollWidth > boxW && size > 6) { size -= 0.25; span.style.fontSize = size + 'pt'; }
        if (span.scrollWidth > boxW) {
          el.classList.add('wrap'); span.style.width = boxW + 'px';
          while (span.scrollHeight > boxH && size > 4.5) { size -= 0.25; span.style.fontSize = size + 'pt'; }
          out.push({ field: el.dataset.name, issue: span.scrollHeight > boxH ? 'clipped' : 'wrapped', size });
        }
      }
      return out;
    };
  </script></body></html>`;
  const w = hiddenWindow(Math.ceil(width * 1.333) + 40, Math.ceil(height * 1.333) + 40);
  try {
    await loadHtml(w, html);
    const overflow = await w.webContents.executeJavaScript('window.__fit()');
    const pdf = await w.webContents.printToPDF({ printBackground: false, preferCSSPageSize: true, margins: { marginType: 'none' } });
    return { pdf: Buffer.from(pdf), overflow };
  } finally {
    w.destroy();
  }
}

async function shellOpen(p) {
  return shell.openPath(p);
}


module.exports = { htmlToPdf, renderFieldOverlay, shellOpen, hiddenWindow };
