# Known limitations

These are honest constraints of the platform. Where possible, K-Flow implements the best supported alternative.

## By design (security and compliance)
* **CAPTCHA, reCAPTCHA and OTP/2FA are never solved, filled or recorded.** The user completes them.
* **Official/government forms are never submitted automatically.** Every action button on official domains asks first.
* **Trading:** K-Flow prepares messages, alerts, journals and reports. It does not place, modify or close trades.
* **File uploads:** browsers do not allow extensions to choose files for `<input type=file>`. Macros insert an "attach the file, then Continue" step.

## Portals
* The starter profiles for UDISE+ S02/S03, FYJC/CAP, HSC and Shiksha Desk were built without access to the live portals
  (they need institutional logins). They match fields by their visible labels. **Verify each one** with Preview and the
  field selector on the real portal, then tick "Verified". Portal changes between academic years may need re-mapping.
* Cross-origin iframes can be scanned and filled only through the content script running inside that frame. Same-origin iframes work everywhere.
  Closed shadow roots cannot be reached.
* Some date pickers ignore programmatic values. K-Flow sets read-only inputs and reports a warning. If the widget rejects the value, use a macro that clicks the picker.

## Scripts
* User scripts run with the page's privileges, not the extension's. On pages whose CSP allows `eval`, a script can reach the page's
  global object through prototype chains. That gives no extension access, but scripts should be treated as trusted code.
* `sval` is an interpreter: heavy computation is slower than native JavaScript. Time and iteration limits apply.
* Dashboard **dry runs** use the Chrome sandbox page. The Firefox build has no manifest sandbox, so dry runs are unavailable there;
  "Run on tab" still works.

## Spreadsheets
* `.xlsx` is supported. Legacy `.xls` and `.ods` must be saved as `.xlsx` or CSV first. Formulas import their last calculated value.
  Merged cells, images and macros are ignored.
* Private Google Sheets need your own Google Cloud OAuth client ID with the Sheets API enabled. Public "anyone with the link" sheets work without one.

## Cloud and enterprise
* Cloud features need your own Firebase project (Spark free tier is enough for typical use). Without it, K-Flow is fully local.
* Local RBAC checks can be bypassed by a user who modifies their own extension. The **Firestore rules** are the enforcement boundary for shared data.
* Device revocation takes effect at the device's next sync. A device that never syncs again keeps what it already had.
* Sync runs only while a K-Flow page (dashboard) is open; there is no background sync in the MV3 service worker.

## Other
* A forgotten vault passphrase cannot be recovered.
* The AI builder needs your own API key and sends field labels and column names, never values. Results must be reviewed.
* Google Docs text expansion remains experimental (inherited limitation of the text-expansion module).
* Chromium 114+ is required for the side panel. Firefox is supported for expansion and automation but not for the side panel API or the dry-run sandbox.
