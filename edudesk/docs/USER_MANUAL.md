# EduDesk – User Manual

This manual is written for office staff. You do not need any technical knowledge.

**Keyboard shortcuts:** Ctrl + N new letter · Ctrl + I new inward entry · Ctrl + K search ·
Ctrl + S save draft · Alt + 1…9 sidebar sections · F1 shortcut list · Esc close a dialog.

---

## 1. The screen

The **sidebar** on the left opens each part of the program. The numbers next to *Drafts*,
*Inward Register* and *Dispatch Management* show how many items are waiting for you. The
**search box** at the top finds any letter by number, subject, recipient, summary or reference.

The **Dashboard** shows totals, letters waiting for approval or dispatch, missing
acknowledgements, overdue replies and the date of the last verified backup.

## 2. College Profile and letterhead

**Settings → College Profile.** Fill in every detail. These values are used:

- in letters, through *placeholders* such as `{{college_name}}` and `{{udise_code}}`;
- on UDISE forms (UDISE code, school name, state, district, block, Head of School).

*Other details* lets you add your own values, for example `trust_name`. These become placeholders
such as `{{trust_name}}`.

**Using your own letterhead:** open **Templates → Add template from Word file** and choose an old
letter typed on your letterhead. Then choose one of these:

- **Use as letterhead** (recommended). Everything that makes up the letterhead is kept: logo,
  header, footer, watermark, border, margins and fonts. The body is replaced with the standard
  layout:
  - *Ref./Outward No.* at the left and *Date* at the top-right;
  - *To*, *Subject*, *Reference*, the letter text, *Yours faithfully*, the signatory and
    *Enclosures*.

  Choose the layout language (English, Marathi or Hindi). It decides the labels, for example
  *Subject* / *विषय* or *Date* / *दिनांक*.
- **Use exactly as it is.** Choose this when you have already typed placeholders such as
  `{{subject}}` into the Word file yourself.

**Templates → Placeholders** lists every placeholder. Click one to copy it.

To change a template, click **Open copy**, edit it in Word, save it, then click **New version**.
Old versions are kept, and letters already made keep the version they used.

## 3. Writing and sending a letter

1. **Create Letter.** Choose:
   - the *Category* (for example BEO Office) and *Subcategory*;
   - the *Letter template*.

   If the template has default text, it is filled in automatically. You can also click
   **Use template text**.
2. **Recipient.** Click **Choose from directory**, or type the details. **Save to directory**
   remembers a new office for next time.
3. **Letter.** Fill in:
   - *Subject* and *Letter date*;
   - the *Reference* number, if there is one;
   - the *Letter body*. English, Marathi and Hindi all work, and each new line becomes a new
     paragraph;
   - a *Short summary*, which appears in the registers and in search;
   - the *Enclosures*, one per line.

   **Insert saved text** and **Save text for reuse** keep paragraphs you write often.
4. **Save Draft** (Ctrl + S). Drafts appear under **Drafts** and do not use an outward number.
5. **Preview** opens a PDF preview. It is not archived.
6. **Generate Word Document.** The next outward number is reserved and printed in the document.
7. **Open in Word.** Make any corrections, then **Save** and **close Word**. The workflow panel
   shows *“Edits saved in Word – ready to finalize”*.
8. **Finalize & Archive.** EduDesk:
   - takes the Word document you saved;
   - makes the PDF from that same file using Microsoft Word;
   - checks that both files exist, are not empty and can be opened, and that the PDF was made from
     this exact Word file;
   - stores both files together in `Documents\<year>\Outward\<category>\`;
   - completes the outward register entry.

   A confirmation shows the number, date, recipient, subject and archive folder, with buttons to
   open the DOCX, the PDF or the folder.

If Word is still open with the document, EduDesk asks you to save and close it first. If you
changed the letter details after generating the Word document, it asks you to regenerate first.

**If the PDF fails** (for example Word showed a dialog box), the Word document is still archived
and the outward number is kept. The letter shows *PDF pending*. Fix the cause, then click
**Retry PDF Generation**. No second number is used.

**Approval (optional).** In **Settings → Letters & Workflow** you can require approval. Drafts are
then sent for approval and approved (or sent back) before the Word document can be generated.

## 4. Finalized letters, revisions and cancellation

Finalized letters are locked so the archive stays reliable.

- **Create Revision.** Enter the reason, correct the letter in Word, then click
  **Finalize Revision**. Version 2 is archived with `_v2` in the file name. Version 1 stays in the
  archive, and the history records who revised it, when and why.
- **Cancel Letter.** Enter a reason. The number stays in the register marked *Cancelled* and is
  never used again.
- **Change Outward Number.** This is allowed only before finalizing, needs a reason, and is
  recorded in the audit history.
- **Copy as new letter** starts a new draft with the same content.
- **Record existing letter** (in the Outward Register) files a letter that was typed earlier or
  signed and scanned. It gets the next number, or the number you enter, and is archived.

## 5. Dispatch

On the letter, or under **Dispatch Management**, click **Record Dispatch**. Enter:

- the status;
- the mode (Hand Delivery, Registered Post, Speed Post, Courier, Email or Other);
- the dispatch date, tracking number and courier;
- the delivered date and the acknowledgement date.

EduDesk never marks a letter *Delivered* by itself. Use **Upload acknowledgement** to attach the
receipt; it is stored in `Documents\<year>\Acknowledgements\`.

Dispatch Management has tabs for *Ready for dispatch*, *Dispatched*, *Acknowledgement pending* and
*Delivered / closed*.

## 6. Inward Register

**Add Inward Entry** (Ctrl + I). Enter:

- the date received and the sender;
- the subject, a summary and their reference number;
- how the letter was received;
- the staff member it is assigned to and the action required;
- whether a reply is required, and by when.

**Save** assigns the inward number, for example `IN/001/2026-27`. **Attach scan** stores the PDF
or image. You can also drag a file onto the page.

**Draft reply letter** creates a letter that is linked to this inward entry. When the reply is
finalized, the inward entry becomes *Replied*. *Correspondence history* shows the incoming letter
and all its replies.

## 7. UDISE S02 and S03

**UDISE S02 / S03 → Start S02** (add a student) or **Start S03** (update a student).

1. *Submitted by.* These details are filled from the College Profile, and you can change them for
   this batch.
2. Add students:
   - **Select from student database** (see **Students**, which can import an Excel or CSV list); or
   - **Enter manually**. For S02, tick *“Also save to student database”* to keep the student.
3. **S02:** enter the name, gender, date of birth, class, admission date, parents, mobile and
   Aadhaar, choose the *reason for non-creation*, and tick the documents attached. The School
   Register is mandatory.
4. **S03:** the form has two columns, **Existing details in UDISE Plus** and
   **Details to be updated in UDISE Plus**.
   - **Copy college record into “Existing”** fills the left column from the student database.
   - Check it against the UDISE+ portal, because the college record may differ, then tick
     *“I have verified the existing details against UDISE+”*.
   - Enter only the new values in the right column.
5. **Check all forms** lists any missing or inconsistent information. **Preview form** opens the
   completed original form.
6. **Continue to covering letter.** Choose the template, the recipient (for example the BEO),
   the subject and the date. EduDesk then:
   - fills one original form per student, as a flattened submission copy plus an editable copy;
   - creates the covering-letter draft.
7. On the letter, click **Generate Word Document**, then **Open in Word**, then
   **Finalize & Archive**. Everything is stored together:

```
Documents\2026-27\Outward\UDISE\OUT_015\
   Covering_Letter.docx
   Covering_Letter.pdf
   S02_SANA_SHAIKH.pdf            (submission copy)
   Editable_Copies\S02_SANA_SHAIKH_editable.pdf
   Batch_Manifest.txt             (list of students; Aadhaar masked)
   Supporting_Documents\
```

**New official form version:** open **Templates → UDISE S02 / S03 forms → Upload new version**,
then **Preview**, check the **Field mapping**, and click **Activate**. Earlier submissions keep the
version they were made with. EduDesk keeps the master forms read-only and refuses to use a master
file that was changed outside the program.

## 8. Registers, reports and search

- **Outward Register.** Search and filter by date, academic year, category and status, and sort by
  date or number. Each row has buttons to open the DOCX, open the PDF and reprint. Export to
  **Excel**, **PDF** or **CSV**.
- **Reports.** Daily, monthly, yearly and academic-year outward registers; category-wise and
  recipient-wise correspondence; inward register; pending inward actions; pending
  acknowledgements; cancelled letters; dispatch report; and letter archive report. Each can be
  filtered and exported.
- **Archive & Search.** Searches outward letters, inward entries and drafts together, and keeps
  your recent searches. Choose *Deleted records* to recover a deleted draft or inward entry.

## 9. Settings

| Tab | What you can set |
|---|---|
| College Profile | Institution details and extra placeholders |
| Letters & Workflow | Date format, default language, signatory and template; approval; when the number is assigned |
| Numbering | Outward and inward format: prefix, digits, starting number, academic-year / calendar-year / continuous reset, category-wise series. A used format is never edited – a new one is started and old numbers stay unchanged. |
| Categories | Add, rename, reorder, disable or delete categories and subcategories (delete only when unused) |
| Archive & Files | Archive folder (and safe move to another drive), file-name pattern |
| Word & PDF | Converter (Word / LibreOffice) and status |
| Backup & Restore | Manual and automatic backups, verification, restore |
| Users & Roles | Permissions for Owner, Administrator, Principal, Clerk, Read-only User |
| Audit History | Every important action, with user and time |
