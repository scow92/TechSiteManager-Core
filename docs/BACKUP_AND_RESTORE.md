# Backup and restore

The SQLite database is the recovery unit for core records, photo bytes,
sessions, audit, import provenance, field ownership, and normalized active
drafts.

Create an online SQLite-safe backup into storage outside the live data
directory:

```bash
BACKUP_DIR=/path/to/backup-storage npm run backup
```

The command uses SQLite's backup API, verifies integrity and foreign keys, and
writes a SHA-256 manifest. Copy backups to independently protected off-host
storage with organization-appropriate encryption, access control, retention,
monitoring, and restore drills.

Restore only while the application is stopped, to a new explicit target:

```bash
RESTORE_FILE=/path/to/backup.db \
RESTORE_TARGET=/path/to/new-data/techsitemanager.db \
npm run restore
```

Restore refuses to overwrite an existing target. Verify authentication,
search, representative reads/writes, import provenance, and a new backup before
promotion.
