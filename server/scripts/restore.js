'use strict';

const { loadEncryptionKey, restoreBackup } = require('../lib/backup');

if (!process.env.RESTORE_FILE || !process.env.RESTORE_TARGET) throw new Error('RESTORE_FILE and RESTORE_TARGET are required');
try {
  const result = restoreBackup(process.env.RESTORE_FILE, process.env.RESTORE_TARGET, { encryptionKey: loadEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY_FILE) });
  console.log(JSON.stringify({ type: 'restore_complete', sha256: result.sha256 }));
} catch (error) {
  console.error(JSON.stringify({ type: 'restore_failed', code: error.message }));
  process.exitCode = 1;
}
