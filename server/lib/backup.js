'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function verify(file) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = database.pragma('integrity_check', { simple: true });
    const foreignKeys = database.pragma('foreign_key_check');
    if (integrity !== 'ok' || foreignKeys.length) throw new Error('backup_integrity_failed');
    return { integrity, foreignKeyViolations: foreignKeys.length };
  } finally { database.close(); }
}

async function createBackup(sourceFile, backupDirectory) {
  const source = path.resolve(sourceFile);
  const destinationDirectory = path.resolve(backupDirectory);
  if (destinationDirectory === path.dirname(source) || destinationDirectory.startsWith(path.dirname(source) + path.sep)) throw new Error('backup_directory_must_be_separate');
  fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(destinationDirectory, `techsitemanager-${stamp}.db`);
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try { await database.backup(destination); } finally { database.close(); }
  const check = verify(destination);
  const manifest = { schemaVersion: 'techsitemanager.io/backup-manifest/v1', file: path.basename(destination), sha256: sha256(destination), createdAt: new Date().toISOString(), ...check };
  fs.writeFileSync(`${destination}.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { destination, manifest };
}

function restoreBackup(sourceFile, targetFile) {
  const source = path.resolve(sourceFile);
  const target = path.resolve(targetFile);
  if (source === target) throw new Error('restore_source_equals_target');
  verify(source);
  if (fs.existsSync(target)) throw new Error('restore_target_exists');
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  try { verify(target); } catch (error) { fs.unlinkSync(target); throw error; }
  return { target, sha256: sha256(target) };
}

module.exports = { createBackup, restoreBackup, verify, sha256 };
