# Backup and restore

The SQLite database is the recovery unit for core records, photo bytes,
sessions, audit, import provenance, field ownership, and normalized active
drafts.

Create a 32-byte encryption key once, store it outside the repository and live
data directory, and make it readable only by the backup/restore identity. The
following fictional path is illustrative; use the deployment's secret
provisioning mechanism in production:

```bash
install -m 0600 /dev/null /run/secrets/techsitemanager-backup-key
openssl rand -out /run/secrets/techsitemanager-backup-key 32
```

Create an online SQLite-safe, AES-256-GCM encrypted backup into storage outside
the live data directory. `BACKUP_STATUS_FILE` is an atomic, non-secret status
manifest read by `/api/health`; keep it on writable durable storage and alert
when `backup.status` is `stale` or `invalid`.

```bash
NODE_ENV=production \
BACKUP_DIR=/path/to/backup-storage \
BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/techsitemanager-backup-key \
BACKUP_STATUS_FILE=/path/to/app-data/backup-status.json \
npm run backup
```

Production backup refuses to run without the protected key. The command uses
SQLite's backup API, verifies integrity and foreign keys before encryption,
leaves no plaintext backup in the destination, and writes ciphertext and
database SHA-256 values to the adjacent manifest. Copy the encrypted backup,
its adjacent manifest and the separately protected key material according to
the deployment's access, retention and off-host recovery policy.

Restore only while the application is stopped, to a new explicit target:

```bash
RESTORE_FILE=/path/to/backup.db \
RESTORE_TARGET=/path/to/new-data/techsitemanager.db \
BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/techsitemanager-backup-key \
npm run restore
```

Restore refuses a missing/wrong key, an existing target, a corrupt database or
a target equal to the backup source. It deletes a failed restore target. Keep
the application stopped, restore to a new isolated path, then verify
authentication, search, representative reads/writes, import provenance and a
new encrypted backup before promotion. Rollback is restore-based: retain the
previous database and do not overwrite it in place.
