'use strict';
// Run with: xvfb-run electron test/e2e/udise-check.js  (fills S02 + S03 with the Chromium renderer)
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { EduDeskApp } = require('../../src/core/app');
const hooks = require('../../src/main/hooks');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const root = path.join(__dirname, '..', '..', '.test-data', 'udise-check');
  fs.rmSync(root, { recursive: true, force: true });
  const core = await new EduDeskApp({ dataRoot: root, htmlToPdf: hooks.htmlToPdf, renderFieldOverlay: hooks.renderFieldOverlay }).open();
  core.settings.set('college', { name: 'Sample Junior College of Science', udise_code: '27000000001', district: 'Sample District', block: 'Sample Taluka', principal_name: 'Dr Sample Principal', principal_designation: 'Principal', phone: '9000000001' });
  const U = core.services.udise;
  const s02 = { ...U.profileDefaults('S02'), name: 'MOHAMMED ABDUL RAHMAN KHAN SIDDIQUI QURESHI', gender: 'Male', dob: '12/03/2009', is_cwsn: 'No', class_name: '11', section: 'A', admission_date: '15/06/2026', father_name: 'मोहम्मद ज़हीरोद्दीन क़ाज़ी', mother_name: 'शबाना परवीन', mobile: '9876543210', aadhaar: '123412341234', aadhaar_name: 'MOHAMMED ABDUL', reason: '3 - Profile not created by current school in previous year', doc_birth_cert: true, hos_date: '15/11/2026' };
  const s03 = { ...U.profileDefaults('S03'), pen: '22483047376', student_name: 'क्षितिज श्रीकृष्ण पाटील', mobile: '9876543210', existing_name: 'KSHITIJ PATIL', updated_name: 'KSHITIJ SHRIKRISHNA PATIL', existing_dob: '01/01/2009', updated_dob: '10/01/2009', existing_verified: true, doc_birth_cert: true };
  const r = await U.prepareSubmission({ formType: 'S02', entries: [{ data: s02 }, { data: { ...s02, name: 'SANA SHAIKH', aadhaar_name: 'SANA SHAIKH', father_name: 'Shaikh Ahmed', mother_name: 'Shaikh Rukhsar' } }] });
  const r3 = await U.prepareSubmission({ formType: 'S03', entries: [{ data: s03 }] });
  console.log(JSON.stringify({ s02: r.items.map((i) => ({ flat: i.flat, overflow: i.overflow })), s03: r3.items.map((i) => ({ flat: i.flat, editable: i.editable, overflow: i.overflow })) }, null, 1));
  core.close();
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
