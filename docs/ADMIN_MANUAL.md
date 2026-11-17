# K-Flow Automation: Administrator manual

Organizations let a principal or office administrator manage staff accounts, share
automations and control who may do what. They need the Firebase backend (see FIREBASE_SETUP.md).
Without it, every user works locally and owns their own data.

## 1. Deploy for an institution
1. Create the Firebase project and deploy `firebase/firestore.rules` and `firebase/firestore.indexes.json` (FIREBASE_SETUP.md).
2. Build the extension with your Firebase config in `.env`, so staff don't paste it themselves, and a fixed `KF_EXTENSION_KEY`:
   `npm run package`. Distribute `release/k-flow-chrome-<v>.zip`, or publish privately on the Chrome Web Store.
   On managed Chrome, force-install it with the `ExtensionInstallForcelist` policy.
3. Sign in on your own device and open **Organization → Create**. You become the **Owner**.

## 2. Roles
| Role | Default permissions |
|---|---|
| Owner | Everything, including deleting the organization. Cannot be assigned by others. |
| Administrator | Everything, including members, settings and devices. Cannot change the owner or other administrators. |
| Manager | Create, edit, run, share, delete, export, view the audit log |
| Staff | Run, create, edit |
| Viewer | Run only |

**Organization → Permissions** changes the matrix per role. **Per-user exceptions** deny specific actions
to one person; a denial always wins. The rules re-check every change in the cloud, so a modified extension cannot bypass them.
Role names other than the five above grant nothing. In particular, an administrator cannot create a second "owner".

## 3. Members and invitations
**Members → Invite:** enter the staff member's Google or email address and choose a role. They sign in with that
email, open **Organization**, and **Accept**. To change a role, use the role dropdown. To remove someone, use the bin icon.
Members can leave on their own. Organization data is then removed from their devices.

## 4. Sharing automations
In any profile, macro or script editor, use **Share** to copy it into the organization. Members receive it on their next sync
(at most every 5 minutes while K-Flow is open). Editing shared items requires the Edit permission, and tombstoning (deleting) them requires Delete.
Each shared save is also written to the organization's append-only **version history**.

## 5. Policies (distributed configuration)
**Organization → Policies.** Members' extensions apply these on every sync:
* **Allowed automation domains:** automations run only on these sites, for example `udiseplus.gov.in, 11thadmission.org.in`.
* **Disable custom JavaScript** and **Disable the AI builder**.
* **Allow passphrase-encrypted sync of sensitive datasets.** This is off by default, so student Aadhaar, mobile and DOB data never leaves devices.
* **Activity monitoring:** members' execution summaries (name, result, site, counts; never field values) go to the Activity log.

## 6. Devices
Each installation registers itself on its first organization sync. **Devices** shows the user, device name and last seen time.
**Revoke** stops a device from syncing organization data and deletes the shared items cached on it at its next sync.
Members cannot un-revoke their own devices (enforced by the rules).

## 7. Audit and activity
* **Audit log:** an append-only record of who invited, joined, changed roles, changed permissions or policies, revoked devices, and shared or deleted items.
  It needs the *View audit log* permission. Nobody, not even the owner, can edit or delete entries.
* **Activity:** per-run summaries from members, when monitoring is on.
* Each device also keeps its own local audit log (**Audit log** in the sidebar), exportable as CSV.

## 8. Backup and recovery for the organization
Shared items live in Firestore and every member's device. Each member should also keep encrypted backups (BACKUP_RECOVERY.md).
To restore a deleted shared item, an editor restores it from the item's version history or a backup, then shares it again.

## 9. Cost control (Firebase free tier)
* Sync is incremental: it only queries documents changed since the last sync. It runs at most every 5 minutes, and only while a K-Flow page is open.
* Executions and audit entries stay local. Only the summaries go up, and only when activity monitoring is on.
* Backups are chunked into Firestore documents. Cloud Storage, which needs the paid Blaze plan, is not used.
* A college office with about 20 staff stays well within the Spark (free) plan's daily read and write quotas under normal use.
