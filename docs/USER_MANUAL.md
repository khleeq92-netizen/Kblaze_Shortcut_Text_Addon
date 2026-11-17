# K-Flow Automation: User manual

## 1. First steps
1. Install the extension (see the README) and pin the **K-Flow** icon.
2. The dashboard opens on **Dashboard**. Choose your workspace with the switcher at the top-left:
   **College Administration**, **Trading & Business** or **General Productivity**.
   Each workspace has its own profiles, macros, scripts, variables, datasets and snippets.
3. Fill in **Settings → Profile** (your name, email and signature). Snippets and contact forms use it as `{{me.name}}`.

Three places give you access to K-Flow:
* **Dashboard**: full management.
* **Side panel** (`Alt+Shift+S`): the **This page** tab shows the automations that match the open website; the **Snippets** tab lists your snippets.
* **Popup** (toolbar icon): quick autofill, field mapping, recording and snippets.

## 2. Datasets (student registers, journals, lists)
1. **Datasets → Import**. Choose an Excel (.xlsx), CSV/TSV or JSON file, or paste a Google Sheets link.
   Use **Public link** for sheets shared as "anyone with the link", or **Sign in with Google** for private sheets (needs an OAuth client ID).
2. On the mapping screen:
   * Pick the sheet and header row.
   * Rename the keys (the `{{key}}` names used in rules).
   * Untick columns you don't need.
   * Mark columns to **encrypt**. Aadhaar, mobile, DOB, address, email and caste are pre-selected.
3. The dataset view shows data quality: duplicate GR numbers, missing required fields, invalid values. Use **Columns** to set the
   key column, required columns and encrypted columns. **Show only problems** filters the rows that need attention.
4. The radio button at the start of a row makes it the **active record**. Autofill and macros use the active record.
5. **Export**: Excel, CSV, JSON, or append to a Google Sheet. Encrypted columns are exported only while "Show sensitive" is on.

To import more students later, use **Import more** in the dataset. Columns are matched by name.

## 3. Autofill
### Create a profile by clicking fields (recommended)
1. Open the form (for example the FYJC student page) and log in yourself.
2. Press **Alt+Shift+M**, or click **Map fields** in the side panel or popup. A dark bar appears at the top of the page.
3. Click a field. The K-Flow panel opens next to it:
   * **Profile:** choose the existing profile for the site or "New profile", and the dataset it uses.
   * **Value:** a dataset column, a variable, fixed text, or a template such as `{{first_name}} {{last_name}}`.
   * **Action:** fill, select, radio, check… This is chosen automatically from the field type.
   * **Selector:** generated automatically (CSS with XPath and label fallbacks). You can edit it.
   * **Condition** (optional), for example `category != "OPEN"`.
4. Click **Save & map next** and repeat for every field. Press **Esc** or **Done** when finished.

### Run
* **Alt+Shift+F** on the page runs the matching profile, as does **Fill** in the side panel or popup, the profile's own shortcut, or **Fill now** in the profile editor.
* **Preview** highlights every field green or red and checks values without changing the page. Use it on a new portal first.
* In the side panel, **◀ ▶** next to a profile moves to the previous or next record.
* The result panel on the page lists each field. **Next record →** fills the next student.

### Starter profiles (College workspace)
UDISE+ S02/S03, FYJC, CAP, HSC and Shiksha Desk profiles are **starter mappings**. They find fields by their on-screen
labels because portal markup changes every year. Open the portal and run **Preview**. Fix any red field with the field
selector or by editing its selector, then tick **Verified**. Use **Duplicate** to keep one profile per academic year.

### Safety built in
K-Flow never types into CAPTCHA or OTP fields and never submits a form. On official portals (gov.in, nic.in, UDISE+,
11thadmission, mahahsscboard, plus anything you add) **every** action button needs your approval.

## 4. Macros
* **Record:** in **Macros**, choose the tab and click **Start recording**, or click **Record macro** in the side panel or popup.
  Work normally (type, choose, tick, click "Next"). Recording continues across pages. Click **Stop & save**.
* **Edit:** open the macro and expand a step to change its target, value, condition, retries or on-error behaviour.
  **Add step** offers 24 step types, including *Run autofill profile*, *Run script*, *Save text to variable* and *Next dataset record*.
* **Loops and batch:** use a *Label* step, then *Next dataset record*, then *Go to label* (with a maximum loop count) to repeat for every student.
  The preset *Batch: fill student form for every record* does this. It asks you to review and submit each form yourself.
* **Run** from the editor, the side panel, the popup, the dashboard's Quick run, or the macro's shortcut.
  The page shows a progress panel with **Pause**, **Resume** and **Stop**.
* **Import/Export/Duplicate** are on the list and editor toolbars. Each macro shows its recent runs.

## 5. Scripts (JavaScript)
For logic that rules can't express, such as calculations, page checks or loops.
```js
const name = kf.vars.student_name;
await kf.fill('Name of Candidate', name);        // label, CSS, XPath or name
if (kf.exists('#cert')) await kf.fill('#cert', kf.vars.cert_no);
kf.setVar('checked', true);                     // available to the macro afterwards
return kf.fields().length;
```
* The editor checks syntax and safety as you type, with line numbers.
* **Dry run (sandbox)** runs the script against sample HTML inside an isolated page.
* **Run on tab** runs it on the real page. The log, return value and errors (with line numbers) appear below the editor.
* Loops stop at **Max loop iterations**, and every run stops at **Timeout**.
* Scripts run without extension privileges and never receive vault secrets. `kf.click` refuses submit buttons; use a macro *Click* step, which asks you.

## 6. Variables
**Variables → New variable.** Choose a type: static, calculated formula, date, random, dataset column, conditional, list, counter or vault secret.
Choose the scope: global, this workspace, or one profile or macro. The dialog shows the current value live.

Examples shipped:
* College: `{{college_name}}`, `{{academic_year}}`, `{{udise_code}}`, `{{gender_code}}`, `{{full_name_caps}}`.
* Trading: `{{risk_amount}}`, `{{sl_pips}}`, `{{lot_size}}`, `{{risk_reward}}`, `{{session_name}}`.

## 7. Text expansion and templates
Type a shortcut, for example `/welcome` (Trading), `/bonafide` (College) or `/ty`, in any text box.
Snippets can include fill-in forms, formulas, `{{variables}}` and dataset values. The **Template library** adds more.
Turn expansion off for a whole workspace in **Workspaces → edit → Text expansion active**.
The syntax is described in [TEMPLATE_SYNTAX.md](TEMPLATE_SYNTAX.md).

## 8. Vault (passwords)
1. **Vault → choose a passphrase.** It is never stored. If you forget it, the secrets are lost.
2. **Add secret:** a name, a key (for example `udise_password`), the secret, and optionally the username and the allowed domains.
3. Use `{{vault.udise_password}}` in a rule and mark the rule **Sensitive**.
4. The vault locks after the auto-lock time (Settings → Security) and when the browser closes. Locked secrets are not filled.

## 9. AI builder
1. **AI builder:** describe the task, open the form in a tab, click **Scan fields**, and choose the dataset.
2. Click **Match offline** (no AI) or **Generate with AI**. AI needs a provider and key in Settings → AI.
3. Check every row. Rows below 75% confidence are highlighted. Edit them, then click **Test (preview)** to see the result on the page.
4. **Approve & save** creates the profile.

## 10. History, audit and reports
* **Execution history:** every run with per-field and per-step results. Filter it, view details, and export as **CSV** or an **Excel report**.
* **Audit log:** who created, edited, shared, ran or deleted what.

## 11. Keyboard shortcuts
| Keys | Action |
|---|---|
| Alt+Shift+F | Autofill this page |
| Alt+Shift+M | Field selector |
| Alt+Shift+S | Side panel |
| Alt+Shift+Q / Ctrl+Shift+Space | Snippet assistant |
| Esc | Leave the field selector or close panels |

Change the browser shortcuts at `chrome://extensions/shortcuts`.
