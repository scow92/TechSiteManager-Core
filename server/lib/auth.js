'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const db = require('../db/knex');
const { httpError } = require('./errors');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'tsm_session';
const SESSION_MS = 12 * 60 * 60 * 1000;

/** @param {string} password @returns {Promise<string>} */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = /** @type {Buffer} */ (await scrypt(password, salt, 64));
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

/** @param {string} password @param {string} stored @returns {Promise<boolean>} */
async function verifyPassword(password, stored) {
  const [algorithm, saltHex, hashHex] = String(stored).split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const derived = /** @type {Buffer} */ (await scrypt(password, Buffer.from(saltHex, 'hex'), 64));
  return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'));
}

/** @param {string} token */
function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** @param {unknown} header @returns {Record<string, string>} */
function cookies(header) {
  return Object.fromEntries(String(header || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter((pair) => pair.length === 2));
}

/** @param {number} userId @param {import('express').Response} res @param {boolean} secureTransport */
async function createSession(userId, res, secureTransport) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  await db('sessions').insert({ token_hash: tokenHash(token), user_id: userId, expires_at: expiresAt });
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secureTransport ? '; Secure' : ''}`);
}

/** @type {import('express').RequestHandler} */
async function session(req, _res, next) {
  try {
    const token = cookies(req.headers.cookie)[COOKIE];
    if (!token) return next();
    const row = await db('sessions as s').join('users as u', 'u.id', 's.user_id')
      .where('s.token_hash', tokenHash(token)).where('s.expires_at', '>', new Date().toISOString())
      .where('u.active', 1).select('u.*', 's.token_hash').first();
    if (row) req.user = row;
    next();
  } catch (error) { next(error); }
}

/** @type {import('express').RequestHandler} */
function requireSession(req, _res, next) {
  if (!req.user) return next(httpError(401, 'authentication_required', 'Authentication required'));
  next();
}

/** @type {import('express').RequestHandler} */
function requireWrite(req, _res, next) {
  if (!req.user) return next(httpError(401, 'authentication_required', 'Authentication required'));
  if (req.user.role === 'viewer') return next(httpError(403, 'write_forbidden', 'Write access is required'));
  next();
}

/** @type {import('express').RequestHandler} */
function requireAdmin(req, _res, next) {
  if (!req.user) return next(httpError(401, 'authentication_required', 'Authentication required'));
  if (req.user.role !== 'admin') return next(httpError(403, 'admin_required', 'Administrator access is required'));
  next();
}

/** @param {import('express').Request} req @param {import('express').Response} res */
async function revoke(req, res) {
  const token = cookies(req.headers.cookie)[COOKIE];
  if (token) await db('sessions').where({ token_hash: tokenHash(token) }).delete();
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function sweepExpiredSessions() {
  return db('sessions').where('expires_at', '<=', new Date().toISOString()).delete();
}

module.exports = { hashPassword, verifyPassword, createSession, session, requireSession, requireWrite, requireAdmin, revoke, sweepExpiredSessions };
