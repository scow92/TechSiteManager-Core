'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const MAGIC = Buffer.from('TSMBK1');

/** @param {string} file */
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** @param {string} file */
function verify(file) {
  const database = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = database.pragma('integrity_check', { simple: true });
    const foreignKeys = /** @type {unknown[]} */ (database.pragma('foreign_key_check'));
    if (integrity !== 'ok' || foreignKeys.length) throw new Error('backup_integrity_failed');
    return { integrity, foreignKeyViolations: foreignKeys.length };
  } finally { database.close(); }
}

/** @param {string | undefined} keyFile @returns {Buffer | null} */
function loadEncryptionKey(keyFile) {
  if (!keyFile) return null;
  const stat = fs.statSync(keyFile);
  if (stat.mode & 0o077) throw new Error('backup_key_permissions_too_open');
  const value = fs.readFileSync(keyFile);
  if (value.length === 32) return value;
  const text = value.toString('utf8').trim();
  const key = /^[0-9a-f]{64}$/i.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64');
  if (key.length !== 32) throw new Error('backup_key_invalid');
  return key;
}

/** @param {Buffer} plain @param {Buffer} key */
function encrypt(plain, key) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

/** @param {Buffer} value @param {Buffer | null} key */
function decrypt(value, key) {
  if (!value.subarray(0, MAGIC.length).equals(MAGIC)) return value;
  if (!key) throw new Error('backup_encryption_key_required');
  const iv = value.subarray(MAGIC.length, MAGIC.length + 12); const tag = value.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(value.subarray(MAGIC.length + 28)), decipher.final()]); } catch { throw new Error('backup_decryption_failed'); }
}

/** @param {string | undefined} statusFile @param {Record<string, unknown>} manifest */
function writeStatus(statusFile, manifest) {
  if (!statusFile) return;
  const target = path.resolve(statusFile); fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 }); fs.renameSync(temporary, target);
}

/** @param {string | null} statusFile @param {number} maxAgeMs @param {number} [now] */
function backupAge(statusFile, maxAgeMs, now = Date.now()) {
  if (!statusFile) return { status: 'not-configured' };
  try {
    const manifest = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    const created = Date.parse(manifest.createdAt); if (!Number.isFinite(created) || manifest.schemaVersion !== 'techsitemanager.io/backup-manifest/v1') throw new Error('invalid');
    const ageMs = Math.max(0, now - created);
    return { status: ageMs <= maxAgeMs ? 'current' : 'stale', ageSeconds: Math.floor(ageMs / 1000), encrypted: Boolean(manifest.encrypted) };
  } catch { return { status: 'invalid' }; }
}

/** @param {string} sourceFile @param {string} backupDirectory @param {{encryptionKey?: Buffer | null, statusFile?: string}} [options] */
async function createBackup(sourceFile, backupDirectory, options = {}) {
  const source = path.resolve(sourceFile);
  const destinationDirectory = path.resolve(backupDirectory);
  if (destinationDirectory === path.dirname(source) || destinationDirectory.startsWith(path.dirname(source) + path.sep)) throw new Error('backup_directory_must_be_separate');
  fs.mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const temporary = path.join(destinationDirectory, `.techsitemanager-${process.pid}-${crypto.randomUUID()}.tmp.db`);
  const destination = path.join(destinationDirectory, `techsitemanager-${stamp}.db${options.encryptionKey ? '.enc' : ''}`);
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    try { await database.backup(temporary); } finally { database.close(); }
    const check = verify(temporary); const databaseSha256 = sha256(temporary);
    if (options.encryptionKey) fs.writeFileSync(destination, encrypt(fs.readFileSync(temporary), options.encryptionKey), { mode: 0o600, flag: 'wx' });
    else { fs.copyFileSync(temporary, destination, fs.constants.COPYFILE_EXCL); fs.unlinkSync(temporary); }
    const manifest = { schemaVersion: 'techsitemanager.io/backup-manifest/v1', file: path.basename(destination), sha256: sha256(destination), databaseSha256, encrypted: Boolean(options.encryptionKey), encryption: options.encryptionKey ? 'aes-256-gcm' : null, createdAt: new Date().toISOString(), ...check };
    fs.writeFileSync(`${destination}.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    writeStatus(options.statusFile, manifest);
    return { destination, manifest };
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

/** @param {string} sourceFile @param {string} targetFile @param {{encryptionKey?: Buffer | null}} [options] */
function restoreBackup(sourceFile, targetFile, options = {}) {
  const source = path.resolve(sourceFile);
  const target = path.resolve(targetFile);
  if (source === target) throw new Error('restore_source_equals_target');
  if (fs.existsSync(target)) throw new Error('restore_target_exists');
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const sourceBytes = fs.readFileSync(source); const plain = decrypt(sourceBytes, options.encryptionKey || null);
  fs.writeFileSync(target, plain, { flag: 'wx', mode: 0o600 });
  try { verify(target); } catch (error) { fs.unlinkSync(target); throw error; }
  return { target, sha256: sha256(target) };
}

module.exports = { backupAge, createBackup, loadEncryptionKey, restoreBackup, verify, sha256 };
