'use strict';
/**
 * Generates the bundled sample letter templates (assets/templates) and prepares the UDISE
 * master forms (assets/udise) from the originals placed in private/udise-originals.
 *
 *   node scripts/build-assets.js
 *
 * The sample templates are EDITABLE EXAMPLES only – they are not verified government formats.
 */
const fs = require('fs');
const path = require('path');
require('regenerator-runtime/runtime');
const { buildSampleDocx } = require('../src/core/docxBuilder');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'assets', 'templates');
fs.mkdirSync(outDir, { recursive: true });

const S = (o) => o;
const templates = [
  S({ file: '00_Standard_Letterhead_English.docx', name: 'Standard Letter (English)', lang: 'en', letterhead: true, category: null,
    description: 'General-purpose letter on a text letterhead built from the College Profile. Replace it with your own letterhead under Templates → "Use as letterhead".',
    subject: '', body: '' }),
  S({ file: '00_Standard_Letterhead_Marathi.docx', name: 'Standard Letter (Marathi)', lang: 'mr', category: null,
    description: 'सर्वसाधारण पत्र – मराठी मांडणी (जा. क्र., दिनांक, प्रति, विषय, संदर्भ).', subject: '', body: '' }),
  S({ file: '00_Standard_Letterhead_Hindi.docx', name: 'Standard Letter (Hindi)', lang: 'hi', category: null, description: 'सामान्य पत्र – हिंदी प्रारूप।', subject: '', body: '' }),
  S({ file: '01_BEO_Student_Information.docx', name: 'BEO – Student information submission', lang: 'en', category: 'BEO', subcategory: 'Student Information',
    subject: 'Submission of student information for the academic year',
    body: 'With reference to the above subject, we are submitting herewith the information of the students of our institution for the current academic year as required by your office.\nThe details have been verified with the school records. Kindly accept the same and acknowledge receipt.' }),
  S({ file: '02_UDISE_S02_New_Student.docx', name: 'UDISE – S02 new student record request (covering letter)', lang: 'en', category: 'UDISE', subcategory: 'S02 – New Student Record',
    subject: 'Request to create UDISE+ student profile (Form S02)',
    body: 'The profiles of the following student(s) of our institution have not yet been created in the UDISE+ Student Module (SDMS). The students were searched in the Global Search module and no existing profile was found.\nThe duly filled Form S02 for {{student_count}} student(s), along with an attested copy of the School / Admission Register and other supporting documents, is enclosed herewith.\nKindly approve the creation of the student profile(s) at the earliest.' }),
  S({ file: '02_UDISE_S02_New_Student_Marathi.docx', name: 'UDISE – S02 नवीन विद्यार्थी नोंद (मराठी)', lang: 'mr', category: 'UDISE', subcategory: 'S02 – New Student Record',
    subject: 'UDISE+ प्रणालीमध्ये विद्यार्थ्यांची नवीन नोंद (फॉर्म S02) करण्याबाबत.',
    body: 'सविनय अर्ज आहे की, आमच्या महाविद्यालयातील खालील विद्यार्थ्यांची नावे UDISE+ प्रणालीमध्ये अद्याप प्रविष्ट झालेली नाहीत. Global Search मध्ये शोध घेतला असता त्यांची कोणतीही नोंद आढळली नाही.\nविद्यार्थ्यांचे भरलेले फॉर्म S02 व जनरल रजिस्टरचा साक्षांकित उतारा सोबत जोडला आहे. तरी कृपया विद्यार्थ्यांची नोंद करण्यास मान्यता द्यावी, ही विनंती.' }),
  S({ file: '03_UDISE_S03_Correction.docx', name: 'UDISE – S03 correction request (covering letter)', lang: 'en', category: 'UDISE', subcategory: 'S03 – Student Information Correction',
    subject: 'Request to update details of active student(s) in UDISE+ (Form S03)',
    body: 'Some details of the following active student(s) recorded in UDISE+ do not match the school records. The existing and corrected details are shown in the enclosed Form S03 for {{student_count}} student(s).\nCopies of the School Register and Birth Certificate are attached for verification. Kindly approve the correction in UDISE+.' }),
  S({ file: '04_Student_Name_Correction.docx', name: 'Student name correction (as per Aadhaar)', lang: 'en', category: 'BEO', subcategory: 'Student Name Correction',
    subject: 'Request for correction of student name as per Aadhaar card',
    body: 'The name of the student mentioned below has been recorded incorrectly. As per the Aadhaar card and the General Register of our institution, the correct name is given below.\nStudent name (as recorded): ______\nCorrect name (as per Aadhaar / G.R.): ______\nThe necessary documents are enclosed. Kindly do the needful.' }),
  S({ file: '04_Student_Name_Correction_Marathi.docx', name: 'विद्यार्थी नाव दुरुस्ती – आधार प्रमाणे (मराठी)', lang: 'mr', category: 'BEO', subcategory: 'Student Name Correction',
    subject: 'विद्यार्थ्याचे नाव आधार कार्डप्रमाणे दुरुस्त करण्याबाबत.',
    body: 'सविनय अर्ज आहे की, खालील विद्यार्थ्याचे नाव चुकीचे नोंदविले गेले आहे. आधार कार्ड व जनरल रजिस्टरप्रमाणे योग्य नाव खाली दिले आहे.\nनोंदलेले नाव: ______\nयोग्य नाव (आधारप्रमाणे): ______\nआवश्यक कागदपत्रे सोबत जोडली आहेत. तरी योग्य ती कार्यवाही करावी, ही विनंती.' }),
  S({ file: '05_Student_DOB_Correction.docx', name: 'Student date of birth correction', lang: 'en', category: 'BEO', subcategory: 'Student DOB Correction',
    subject: 'Request for correction of date of birth of student',
    body: 'The date of birth of the student mentioned below has been recorded incorrectly. As per the birth certificate and the General Register of our institution, the correct date of birth is given below.\nStudent name: ______\nDate of birth recorded: ______\nCorrect date of birth: ______\nAttested copies of the birth certificate and General Register extract are enclosed.' }),
  S({ file: '06_HSC_Mark_Memo_Collection.docx', name: 'HSC Board – mark memo collection', lang: 'en', category: 'HSC', subcategory: '12th Mark Memo Collection',
    subject: 'Request for issue of HSC mark memos (statement of marks)',
    body: 'We request you to kindly issue the mark memos (statements of marks) of the H.S.C. examination for the candidates of our junior college. Our authorised representative will collect the documents from the Divisional Board office.\nCollege details: {{college_name}}, Index No. {{index_no}}, UDISE {{udise_code}}.' }),
  S({ file: '07_HSC_Passing_Certificate_Collection.docx', name: 'HSC Board – passing certificate collection', lang: 'en', category: 'HSC', subcategory: 'Passing Certificate Collection',
    subject: 'Request for issue of HSC passing certificates',
    body: 'We request you to kindly issue the H.S.C. passing certificates of the successful candidates of our junior college. Our authorised representative will collect the certificates from your office. The authority letter of the representative is enclosed.' }),
  S({ file: '08_HSC_Prelist_Submission.docx', name: '12th examination – preliminary form list submission', lang: 'en', category: 'HSC', subcategory: 'Preliminary Examination Form List',
    subject: 'Submission of pre-list of candidates appearing for the H.S.C. examination',
    body: 'We are submitting herewith the pre-list of the candidates of our junior college who will appear for the forthcoming H.S.C. examination. The list has been checked with the college records and the candidates\' details have been verified.' }),
  S({ file: '09_Examination_Fee_Submission.docx', name: 'Examination fee submission', lang: 'en', category: 'HSC', subcategory: 'Examination Fee Submission',
    subject: 'Submission of H.S.C. examination fees',
    body: 'We are submitting herewith the examination fees of the candidates of our junior college for the forthcoming H.S.C. examination. The challan / payment details and the list of candidates are enclosed.' }),
  S({ file: '10_Teacher_Invigilator_Details.docx', name: 'Teacher and invigilator details submission', lang: 'en', category: 'HSC', subcategory: 'Teacher and Invigilator Details',
    subject: 'Submission of details of teachers for invigilation / moderation work',
    body: 'As required, we are submitting the details of the teachers of our junior college available for invigilation, paper assessment and moderation work for the forthcoming H.S.C. examination. The teachers will be relieved for the assigned duty as per the schedule.' }),
  S({ file: '11_Practical_Marks_Submission.docx', name: 'Practical examination marks submission', lang: 'en', category: 'HSC', subcategory: 'Practical Examination Marks',
    subject: 'Submission of practical / oral examination marks',
    body: 'We are submitting herewith the marks of the practical / oral examinations of the H.S.C. candidates of our junior college. The mark lists have been checked and are signed by the internal and external examiners.' }),
  S({ file: '12_Practical_Papers_Submission.docx', name: 'Practical examination papers submission', lang: 'en', category: 'HSC', subcategory: 'Practical Examination Papers Submission',
    subject: 'Submission of practical examination answer books / journals',
    body: 'We are submitting the sealed packets of the practical examination answer books and related records of the candidates of our junior college as per the instructions of the Board.' }),
  S({ file: '13_General_Information_Submission.docx', name: 'General administrative information submission', lang: 'en', category: 'GEN', subcategory: 'Government Departments',
    subject: 'Submission of information',
    body: 'With reference to the above subject, the information requested by your office is submitted herewith in the prescribed format. Kindly accept the same.' }),
];

const manifest = { note: 'Sample editable templates generated by scripts/build-assets.js. Not verified official government formats.', templates: [] };
for (const t of templates) {
  fs.writeFileSync(path.join(outDir, t.file), buildSampleDocx(t.lang));
  manifest.templates.push({ file: t.file, name: t.name, language: t.lang, letterhead: !!t.letterhead, category: t.category, subcategory: t.subcategory || null, description: t.description || 'Sample editable template', subject: t.subject, body: t.body });
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`templates: ${templates.length}`);

// ---- UDISE masters -------------------------------------------------------
(async () => {
  const { PDFDocument, PDFTextField, PDFCheckBox, StandardFonts } = require('pdf-lib');
  const udiseOut = path.join(root, 'assets', 'udise');
  fs.mkdirSync(udiseOut, { recursive: true });
  const orig = path.join(root, 'private', 'udise-originals');
  const s03 = path.join(orig, 'Form_S03_UDISE_Fillable.pdf');
  const s02 = path.join(orig, 'Form_S02_UDISE_Fillable.pdf');
  if (fs.existsSync(s03)) fs.copyFileSync(s03, path.join(udiseOut, 'Form_S03_UDISE_v02.pdf')); // already blank – byte-identical copy
  if (fs.existsSync(s02)) {
    // The supplied S02 carries the college's pre-filled HoS details; ship a cleared copy so the
    // values come from the College Profile instead. Structure, fields and layout are unchanged.
    // clean_pdf.py clears the values, keeps the original /DA font settings and drops every
    // unreferenced object, so none of the earlier values remain anywhere in the file.
    const out = path.join(udiseOut, 'Form_S02_UDISE_v04.pdf');
    if (fs.existsSync(out)) { fs.chmodSync(out, 0o644); fs.unlinkSync(out); }
    require('child_process').execFileSync('python3', [path.join(__dirname, 'clean_pdf.py'), s02, out], { stdio: 'inherit' });
    const doc = await PDFDocument.load(fs.readFileSync(out));
    const n = doc.getForm().getFields().filter((f) => f instanceof PDFTextField || f instanceof PDFCheckBox).length;
    if (n !== 39) throw new Error(`cleaned S02 has ${n} fields, expected 39`);
  }
  console.log('udise masters:', fs.readdirSync(udiseOut));
})();
