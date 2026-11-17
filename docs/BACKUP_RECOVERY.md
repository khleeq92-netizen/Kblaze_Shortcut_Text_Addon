# Backup and recovery

## What is backed up
Workspaces, snippet folders and snippets, templates, datasets, autofill profiles, macros, scripts, variables,
vault entries (ciphertext) with the vault configuration, and settings. Execution history and the audit log are optional.
Organization-shared items are not part of personal backups; they live in the organization.

## File backup
**Backup & recovery → Download backup.**
* **With a passphrase (recommended):** the file is AES-256-GCM encrypted (PBKDF2, 310,000 iterations) and includes
  sensitive dataset values. Keep the passphrase separately. It cannot be recovered.
* **Without a passphrase:** sensitive columns (Aadhaar, mobile…) are written empty. The file is plain JSON.

## Cloud backup (Firebase)
Needs sign-in and an unlocked vault. Click **Back up now**. The backup is encrypted with your vault passphrase,
split into documents of under 800 KB and stored under `users/{uid}/backups`. The last 5 are kept.
An **automatic weekly** backup runs during sync while the vault is unlocked.

## Restore
**Restore from file…** (enter the passphrase if asked), or **Restore** next to a cloud backup.
* **Merge** adds missing items and keeps newer local versions.
* **Replace everything** deletes current personal data first. Organization data is untouched.

Restored datasets are re-encrypted with this device's key. Sync cursors are reset, so the restored state syncs to your other devices.

## Version history
Every save keeps a version: the last 25 per profile, macro, script, variable, snippet or workspace.
Open an item, click **Versions**, choose **Restore**, then **Save**. Shared organization items also keep cloud versions
(`orgs/{id}/versions`).

## Disaster scenarios
| Situation | Recovery |
|---|---|
| Computer lost or reinstalled | Install K-Flow, sign in and sync. Unlock the vault with the same passphrase to read sensitive synced data, or restore a backup. |
| Item deleted by mistake | Versions (if still present), then cloud sync tombstones (other devices keep it until they sync), then a backup |
| Forgotten vault passphrase | Secrets and passphrase-encrypted data cannot be recovered. Delete the vault (clear K-Flow data) and re-enter the secrets. Device-encrypted datasets on the same device remain readable. |
| Browser profile reset | Device-key-encrypted columns are lost with the profile's IndexedDB. Restore from an encrypted backup. |
| Corrupted cloud data | Restore a cloud backup or a file backup with **Replace everything**. |
