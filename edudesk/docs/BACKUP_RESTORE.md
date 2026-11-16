# Backup and restore

## What a backup contains

Every backup is a normal folder named like `EduDesk_Backup_2026-11-15_101500`. It contains:

| Item | Contents |
|---|---|
| `database.sqlite` | All registers, letters, students, categories, numbering settings and audit history (consistent snapshot) |
| `settings.json` | Readable copy of all settings |
| `Documents\` | Letter templates (all versions), UDISE master forms, every archived DOCX and PDF, revisions, UDISE completed forms, inward scans, acknowledgements, supporting documents |
| `Work\` | Letters currently being edited in Word |
| `manifest.json` | List of every file with its size and SHA-256 checksum |

After writing the backup, EduDesk reads **every file again** and compares it with the manifest. It
also checks that the database copy opens and passes SQLite's integrity check. Only then does it
report *“Backup created and verified”*. If any check fails, the backup is marked *Not verified*
and an error is shown.

## Creating backups

- **Manual backup:** go to **Settings → Backup & Restore**, choose the destination (an external
  drive or pen drive is best), then click **Back up now**.
- **Automatic backup:** choose **Daily** or **Weekly**. The backup runs in the background while
  EduDesk is open: one minute after start-up, then it checks every hour whether one is due.
  **Keep the last … backups** removes older *automatic* backups. Manual backups are never removed.
- **Safety copies:** before importing students, restoring or upgrading the database, EduDesk also
  saves a quick copy of the database in `Backups\Safety` (the last 20 are kept). Before a restore
  or an archive move, it makes a full verified backup.

**Recommendation:** keep the automatic daily backup on the computer's own drive, and copy a manual
backup to an external drive every week.

## Verifying a backup

In **Backup history**, click **Verify** to re-check every file of any backup at any time.

## Restoring

1. Go to **Settings → Backup & Restore**. Click **Restore** on a backup in the history, or click
   **Restore from a folder…** and choose an `EduDesk_Backup_…` folder (for example from a pen
   drive).
2. EduDesk verifies the backup and refuses to restore one that fails verification.
3. Confirm the restore. EduDesk then:
   1. makes a full backup of the **current** data;
   2. copies the documents back. A file that would be replaced is **moved** to
      `Backups\replaced_before_restore_<time>\`, never deleted;
   3. replaces the database.
4. Click **Restart now**. All registers and links to DOCX and PDF files work again.

Because links are stored relative to the archive folder, a backup can be restored on another
computer, or with a different archive location.

## Moving the archive to another drive

**Settings → Archive & Files → Move archive to another folder…** works like this:

1. You choose an **empty** folder.
2. EduDesk makes a backup.
3. It copies every document and checks each copy.
4. Only then does it switch to the new folder.

The old folder is left untouched for you to delete later.

## Restoring by hand (emergency)

If EduDesk cannot start:

1. Install EduDesk on a working computer.
2. Copy `database.sqlite` from the backup to `Documents\EduDesk\Data\edudesk.sqlite`.
3. Copy the backup's `Documents` folder to `Documents\EduDesk\Documents`.
