'use strict';

const config = require('../config');
const { createBackup } = require('../lib/backup');

const backupDirectory = process.env.BACKUP_DIR;
if (!backupDirectory) throw new Error('BACKUP_DIR is required');
createBackup(config.dbFile, backupDirectory)
  .then(({ destination }) => console.log(JSON.stringify({ type: 'backup_complete', file: require('path').basename(destination) })))
  .catch((error) => { console.error(JSON.stringify({ type: 'backup_failed', code: error.message })); process.exitCode = 1; });
