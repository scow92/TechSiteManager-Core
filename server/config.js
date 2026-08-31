'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @param {string} name
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function integer(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

/**
 * @param {string} name
 * @param {boolean} fallback
 * @returns {boolean}
 */
function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid ${name}`);
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const config = Object.freeze({
  environment: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '127.0.0.1',
  port: integer('PORT', 3000, 1, 65535),
  dataDir,
  dbFile: path.resolve(process.env.DB_FILE || path.join(dataDir, 'techsitemanager.db')),
  secureTransport: boolean('SECURE_TRANSPORT', false),
  proxyMode: process.env.PROXY_MODE || 'direct',
  pluginConfigFile: process.env.PLUGIN_CONFIG_FILE ? path.resolve(process.env.PLUGIN_CONFIG_FILE) : null,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
  backupStatusFile: process.env.BACKUP_STATUS_FILE ? path.resolve(process.env.BACKUP_STATUS_FILE) : null,
  maxBackupAgeMs: integer('MAX_BACKUP_AGE_HOURS', 24, 1, 24 * 365) * 60 * 60 * 1000,
  shutdownTimeoutMs: integer('SHUTDOWN_TIMEOUT_MS', 10_000, 100, 120_000),
  draftTtlMs: integer('IMPORT_DRAFT_TTL_MS', 30 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
  pluginTimeoutMs: integer('PLUGIN_TIMEOUT_MS', 30_000, 100, 120_000),
  exportProjectionMaxRecords: integer('EXPORT_PROJECTION_MAX_RECORDS', 20_000, 1, 100_000)
});

if (!['development', 'test', 'production'].includes(config.environment)) throw new Error('Invalid NODE_ENV');
if (!['direct', 'single'].includes(config.proxyMode)) throw new Error('Invalid PROXY_MODE');
if (!/^[A-Za-z0-9.:-]+$/.test(config.host)) throw new Error('Invalid HOST');
if (config.vapidPublicKey && !/^[A-Za-z0-9_-]{40,200}$/.test(config.vapidPublicKey)) throw new Error('Invalid VAPID_PUBLIC_KEY');

module.exports = config;
