'use strict';
/**
 * Builds standards-compliant DOCX files:
 *  - the standard letter layout (Ref/Outward No. at left and Date at the top-right corner,
 *    To, Subject, Reference, body, signature block, enclosures) in English, Marathi or Hindi;
 *  - a generic text letterhead for the bundled samples;
 *  - "letterhead conversion": keeps the headers, footers, logo, watermark, page borders and
 *    page set-up of an existing college letter and replaces only its body with the layout.
 */
const PizZip = require('pizzip');
const { UserError } = require('./util');

const LABELS = {
  en: { ref: 'Ref. No.: ', date: 'Date: ', to: 'To,', subject: 'Subject: ', reference: 'Reference: ', salutation: 'Respected Sir/Madam,', thanks: 'Thanking you,', closing: 'Yours faithfully,', encl: 'Enclosures:' },
  mr: { ref: 'जा. क्र.: ', date: 'दिनांक: ', to: 'प्रति,', subject: 'विषय: ', reference: 'संदर्भ: ', salutation: 'महोदय,', thanks: 'धन्यवाद,', closing: 'आपला विश्वासू,', encl: 'सोबत जोडलेली कागदपत्रे:' },
  hi: { ref: 'पत्रांक: ', date: 'दिनांक: ', to: 'सेवा में,', subject: 'विषय: ', reference: 'संदर्भ: ', salutation: 'महोदय/महोदया,', thanks: 'धन्यवाद,', closing: 'भवदीय,', encl: 'संलग्न:' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function rPr({ bold, size, font = 'Times New Roman', cs = 'Nirmala UI', underline } = {}) {
  return `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${cs}"/>${bold ? '<w:b/><w:bCs/>' : ''}${underline ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${size || 24}"/><w:szCs w:val="${size || 24}"/></w:rPr>`;
}
function run(text, opts) { return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`; }
function tabRun(opts) { return `<w:r>${rPr(opts)}<w:tab/></w:r>`; }
function para(runs, { align, after = 0, before = 0, tabs, indentLeft, keepNext, line } = {}) {
  const ppr = [
    tabs ? `<w:tabs>${tabs.map((t) => `<w:tab w:val="${t.val}" w:pos="${t.pos}"/>`).join('')}</w:tabs>` : '',
    `<w:spacing w:before="${before}" w:after="${after}" w:line="${line || 276}" w:lineRule="auto"/>`,
    indentLeft ? `<w:ind w:left="${indentLeft}"/>` : '',
    align ? `<w:jc w:val="${align}"/>` : '',
    keepNext ? '<w:keepNext/>' : '',
  ].join('');
  return `<w:p><w:pPr>${ppr}</w:pPr>${runs}</w:p>`;
}
/** A paragraph that disappears when the tag is empty (docxtemplater paragraphLoop). */
function optional(tag, inner) {
  return para(run(`{{#${tag}}}`)) + inner + para(run(`{{/${tag}}}`));
}

/** The standard letter body. textWidth is in twips (1/20 pt). */
function bodyXml(lang = 'en', { textWidth = 9360, size = 24 } = {}) {
  const L = LABELS[lang] || LABELS.en;
  const o = { size };
  const b = { size, bold: true };
  const right = Math.max(3000, textWidth - 10);
  return [
    para(run(L.ref, b) + run('{{outward_number}}', o) + tabRun(o) + run(L.date, b) + run('{{letter_date}}', o), { tabs: [{ val: 'right', pos: right }], after: 240 }),
    para(run(L.to, o)),
    optional('recipient_name', para(run('{{recipient_name}}', b))),
    optional('recipient_designation', para(run('{{recipient_designation}}', b))),
    optional('recipient_office', para(run('{{recipient_office}}', o))),
    optional('recipient_address', para(run('{{recipient_address}}', o))),
    para('', { after: 120 }),
    para(run(L.subject, b) + run('{{subject}}', b), { indentLeft: 720, after: 120 }),
    optional('reference', para(run(L.reference, b) + run('{{reference}}', o), { indentLeft: 720, after: 120 })),
    optional('inward_reference', para(run(L.reference, b) + run('{{inward_reference}}', o), { indentLeft: 720, after: 120 })),
    para(run(L.salutation, o), { after: 120 }),
    para(run('{{letter_body}}', o), { align: 'both', after: 200, line: 300 }),
    para(run(L.thanks, o), { after: 360 }),
    para(run(L.closing, o), { align: 'right', after: 720, keepNext: true }),
    para(run('{{signatory_name}}', b), { align: 'right', keepNext: true }),
    para(run('{{signatory_designation}}', o), { align: 'right', keepNext: true }),
    para(run('{{college_name}}', o), { align: 'right', after: 240 }),
    optional('enclosures', para(run(L.encl, b)) + para(run('{{enclosures}}', o), { after: 120 })),
  ].join('');
}

function headerXml() {
  const p = (inner, extra = '') => `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/>${extra}</w:pPr>${inner}</w:p>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${p(run('{{college_name}}', { bold: true, size: 32 }))}
${p(run('{{college_address}}', { size: 20 }))}
${p(run('{{#udise_code}}UDISE: {{udise_code}}   {{/udise_code}}{{#index_no}}Index No.: {{index_no}}   {{/index_no}}{{#college_phone}}Phone: {{college_phone}}   {{/college_phone}}{{college_email}}', { size: 18 }), '<w:pBdr><w:bottom w:val="double" w:sz="6" w:space="4" w:color="1F4E79"/></w:pBdr>')}
</w:hdr>`;
}

const SECT = (withHeader) => `<w:sectPr>${withHeader ? '<w:headerReference w:type="default" r:id="rIdHdr1"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>`;

function documentXml(body, sect) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}${sect}</w:body></w:document>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Nirmala UI"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-IN" w:bidi="mr-IN"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/></w:style>
</w:styles>`;

/** Build a complete standalone sample letter template. */
function buildSampleDocx(lang = 'en') {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdHdr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`);
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>EduDesk letter template</dc:title><dc:creator>EduDesk Correspondence Manager</dc:creator></cp:coreProperties>`);
  zip.file('word/styles.xml', STYLES);
  zip.file('word/header1.xml', headerXml());
  const textWidth = 11906 - 1134 - 1418;
  zip.file('word/document.xml', documentXml(bodyXml(lang, { textWidth }), SECT(true)));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Keep everything of an existing letter (header/footer images, watermark, page borders,
 * margins, styles) and replace only the body text with the standard placeholder layout.
 */
function convertToLetterhead(buffer, lang = 'en') {
  let zip;
  try { zip = new PizZip(buffer); } catch (e) { throw new UserError('This file is not a valid .docx document.'); }
  const f = zip.file('word/document.xml');
  if (!f) throw new UserError('This file is not a Word document.');
  const xml = f.asText();
  const bodyStart = xml.indexOf('<w:body>');
  const bodyEnd = xml.lastIndexOf('</w:body>');
  if (bodyStart < 0 || bodyEnd < 0) throw new UserError('The document body could not be read.');
  const inner = xml.slice(bodyStart + 8, bodyEnd);
  const sectIdx = inner.lastIndexOf('<w:sectPr');
  const sect = sectIdx >= 0 ? inner.slice(sectIdx) : SECT(false);
  // text width from page size and margins
  const num = (re, d) => { const m = re.exec(sect); return m ? parseInt(m[1], 10) : d; };
  const pageW = num(/<w:pgSz[^>]*w:w="(\d+)"/, 11906);
  const left = num(/<w:pgMar[^>]*w:left="(\d+)"/, 1440);
  const right = num(/<w:pgMar[^>]*w:right="(\d+)"/, 1440);
  // keep the font the college already uses in the letter body, if any
  const fontMatch = /<w:rFonts[^>]*w:ascii="([^"]+)"/.exec(inner);
  let body = bodyXml(lang, { textWidth: pageW - left - right });
  if (fontMatch && !/Times New Roman/.test(fontMatch[1])) body = body.replace(/w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/g, `w:ascii="${fontMatch[1]}" w:hAnsi="${fontMatch[1]}" w:eastAsia="${fontMatch[1]}"`);
  zip.file('word/document.xml', xml.slice(0, bodyStart + 8) + body + sect + xml.slice(bodyEnd));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { buildSampleDocx, convertToLetterhead, bodyXml, LABELS };
