'use strict';
/**
 * DOCX template handling.
 *
 * Placeholders use the {{name}} syntax and are replaced with docxtemplater, which
 * merges placeholders even when Word has split them across several XML runs and
 * keeps the run formatting (font, size, bold, colour) of the placeholder. Nothing
 * else in the package (headers, footers, images, tables, page borders, section
 * settings) is touched, so the letterhead is preserved byte-for-byte.
 *
 * Uploaded templates are sanitised: macro-enabled formats are refused and any
 * vbaProject / ActiveX parts are removed before the file is stored.
 */
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { UserError } = require('./util');

const STANDARD_PLACEHOLDERS = [
  'college_name', 'college_address', 'college_code', 'udise_code', 'index_no', 'affiliation',
  'college_phone', 'college_email', 'principal_name', 'principal_designation',
  'outward_number', 'letter_date', 'academic_year',
  'recipient_name', 'recipient_designation', 'recipient_office', 'recipient_department', 'recipient_address',
  'recipient_block',
  'subject', 'reference', 'letter_body', 'summary', 'enclosures', 'enclosure_count',
  'signatory_name', 'signatory_designation', 'remarks', 'inward_reference', 'student_count',
];

function openZip(buffer) {
  try {
    return new PizZip(buffer);
  } catch (e) {
    throw new UserError('This file is not a valid Word (.docx) document.');
  }
}

/** Check a DOCX buffer can be opened and contains a main document part. */
function verifyDocx(buffer) {
  const zip = openZip(buffer);
  const doc = zip.file('word/document.xml');
  if (!doc) throw new UserError('The Word document is damaged: word/document.xml is missing.');
  const xml = doc.asText();
  if (!xml.includes('<w:body')) throw new UserError('The Word document is damaged: no document body.');
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))) {
    const problem = xmlProblem(zip.file(name).asText());
    if (problem) throw new UserError(`The Word document is damaged (${name}: ${problem}).`);
  }
  return true;
}

/** Minimal XML well-formedness check (tag nesting). Returns an error string or null. */
function xmlProblem(xml) {
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const clean = xml.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  let m;
  while ((m = re.exec(clean))) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (!close) stack.push(name);
    else {
      const top = stack.pop();
      if (top !== name) return `mismatched </${name}> (expected </${top || '?'}>)`;
    }
  }
  return stack.length ? `unclosed <${stack[stack.length - 1]}>` : null;
}

/**
 * Validate and clean an uploaded template. Returns { buffer, removedParts, placeholders }.
 */
function sanitizeTemplate(buffer, originalName = '') {
  if (/\.(docm|dotm|doc|dot|rtf)$/i.test(originalName)) {
    throw new UserError('Only .docx (or .dotx) files can be used as templates. Macro-enabled or old .doc files are not accepted. Open the file in Word and use "Save As → Word Document (*.docx)".');
  }
  const zip = openZip(buffer);
  const ct = zip.file('[Content_Types].xml');
  if (!ct || !zip.file('word/document.xml')) throw new UserError('This file is not a Word document.');
  const removed = [];
  for (const name of Object.keys(zip.files)) {
    if (/vbaProject\.bin$|vbaData\.xml$|\/activeX\//i.test(name)) {
      zip.remove(name);
      removed.push(name);
    }
  }
  let ctXml = ct.asText();
  // .dotx templates must become documents, otherwise Word opens them as templates.
  ctXml = ctXml.replace('application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
  if (removed.length) {
    ctXml = ctXml.replace(/<Override[^>]*vbaProject[^>]*\/>/gi, '').replace(/<Override[^>]*activeX[^>]*\/>/gi, '').replace(/<Default[^>]*Extension="bin"[^>]*\/>/gi, '');
    for (const relName of Object.keys(zip.files).filter((n) => n.endsWith('.rels'))) {
      const xml = zip.file(relName).asText();
      const cleaned = xml.replace(/<Relationship[^>]*(vbaProject|activeX)[^>]*\/>/gi, '');
      if (cleaned !== xml) zip.file(relName, cleaned);
    }
  }
  zip.file('[Content_Types].xml', ctXml);
  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  verifyDocx(out);
  return { buffer: out, removedParts: removed, placeholders: findPlaceholders(out) };
}

/** List {{placeholders}} present in a template (document, headers, footers). */
function findPlaceholders(buffer) {
  const zip = openZip(buffer);
  const found = new Set();
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) continue;
    const text = zip.file(name).asText().replace(/<[^>]+>/g, '');
    for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) found.add(m[1]);
  }
  return [...found];
}

/**
 * Render a template with values. Unknown placeholders become empty strings
 * rather than breaking generation. Multi-line values become line breaks.
 */
function renderTemplate(buffer, values) {
  const zip = openZip(buffer);
  let doc;
  try {
    doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    doc.render(values);
  } catch (e) {
    const details = (e.properties && e.properties.errors || []).map((x) => x.properties && x.properties.explanation).filter(Boolean);
    throw new UserError(`The template could not be filled: ${details.join('; ') || e.message}. Check that every placeholder is written as {{name}}.`);
  }
  const z = doc.getZip();
  const main = z.file('word/document.xml');
  if (main) z.file('word/document.xml', splitJustifiedBreaks(main.asText()));
  const out = z.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  verifyDocx(out);
  return out;
}

/**
 * Word stretches the words of a justified line that ends in a manual line break. Multi-line
 * values (e.g. the letter body) inside justified paragraphs are therefore split into real
 * paragraphs that keep the paragraph and run formatting.
 */
function splitJustifiedBreaks(xml) {
  return xml.replace(/<w:p(?: [^>]*?)?(?<!\/)>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, (p) => {
    if (!p.includes('<w:br/>') || !/<w:jc w:val="(both|distribute)"\/>/.test(p)) return p;
    // leave complex paragraphs (text boxes, nested content, fields) untouched
    if (/<w:p[ >]/.test(p.slice(4)) || /txbxContent|<w:fldChar|<mc:AlternateContent/.test(p)) return p;
    const m = /^(<w:p(?: [^>]*)?>)(<w:pPr>[\s\S]*?<\/w:pPr>)?([\s\S]*)<\/w:p>$/.exec(p);
    if (!m) return p;
    const [, open, pPr = '', content] = m;
    const parts = content.split('<w:br/>');
    const paras = [];
    let carry = '';
    for (let i = 0; i < parts.length; i++) {
      // each new paragraph = the re-opened run (if the break was inside a run) + the next part
      let seg = carry + parts[i];
      carry = '';
      if (i < parts.length - 1) {
        const opens = (seg.match(/<w:r(?: [^>]*)?>/g) || []).length;
        const closes = (seg.match(/<\/w:r>/g) || []).length;
        if (opens > closes) {
          const runs = seg.match(/<w:r(?: [^>]*)?>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?/g) || [];
          const lastRun = runs[runs.length - 1] || '<w:r>';
          const rPr = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(lastRun) || [''])[0];
          seg += '</w:r>';
          carry = `<w:r>${rPr}`;
        }
      }
      // drop runs left empty by the split
      seg = seg.replace(/<w:r(?: [^>]*)?>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<\/w:r>/g, '');
      paras.push(`${open}${pPr}${seg}</w:p>`);
    }
    const out = paras.join('');
    // safety net: if the result is not balanced, keep the original paragraph
    const bal = (s, a, b) => (s.match(a) || []).length === (s.match(b) || []).length;
    if (!bal(out, /<w:r(?: [^>]*)?>/g, /<\/w:r>/g) || !bal(out, /<w:t(?: [^>]*)?>/g, /<\/w:t>/g)) return p;
    return out;
  });
}

/**
 * Fill only the given placeholders in an already edited document (used when the
 * outward number is assigned at finalisation). Other {{tags}} are left as typed.
 */
function fillSelected(buffer, values) {
  const zip = openZip(buffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    parser: (tag) => ({ get: (scope) => (Object.prototype.hasOwnProperty.call(values, tag.trim()) ? values[tag.trim()] : `{{${tag}}}`) }),
  });
  doc.render({});
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Plain text of a DOCX (used for search / previews / verification). */
function extractText(buffer) {
  const zip = openZip(buffer);
  const xml = (zip.file('word/document.xml') || { asText: () => '' }).asText();
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readFile(p) {
  return fs.readFileSync(p);
}

module.exports = { STANDARD_PLACEHOLDERS, sanitizeTemplate, findPlaceholders, renderTemplate, fillSelected, verifyDocx, extractText, readFile };
