'use strict';

const config = require('../config');
const { createBackup, loadEncryptionKey } = require('../lib/backup');

const backupDirectory = process.env.BACKUP_DIR;
if (!backupDirectory) throw new Error('BACKUP_DIR is required');

async function main() {
  const encryptionKey = loadEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY_FILE);
  if (config.environment === 'production' && !encryptionKey) throw new Error('backup_encryption_key_required');
  const { destination } = await createBackup(config.dbFile, backupDirectory, { encryptionKey, statusFile: config.backupStatusFile });
  console.log(JSON.stringify({ type: 'backup_complete', file: require('path').basename(destination) }));
}
main().catch((error) => { console.error(JSON.stringify({ type: 'backup_failed', code: error.message })); process.exitCode = 1; });
