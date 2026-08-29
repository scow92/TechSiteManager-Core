'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db/knex');
const auth = require('../lib/auth');
const { knownKeys, string, enumeration, integer } = require('../lib/validation');
const { httpError } = require('../lib/errors');
const config = require('../config');
const audit = require('../lib/audit');

const router = express.Router();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_FAILURE_KEY_LIMIT = 10_000;
const DUMMY_PASSWORD_HASH = `scrypt:${'00'.repeat(16)}:${'00'.repeat(64)}`;
const loginFailures = new Map();

function loginKey(req, username) {
  return `${req.ip || req.socket.remoteAddress || 'unknown'}\u0000${username.toLowerCase()}`;
}

function currentFailures(key) {
  const entry = loginFailures.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    loginFailures.delete(key);
    return null;
  }
  return entry;
}

function rejectIfThrottled(key) {
  const entry = currentFailures(key);
  if (entry && entry.count >= LOGIN_MAX_FAILURES) throw httpError(429, 'login_throttled', 'Too many login attempts; try again later');
}

function recordFailure(key) {
  const entry = currentFailures(key);
  loginFailures.set(key, { count: (entry ? entry.count : 0) + 1, expiresAt: Date.now() + LOGIN_WINDOW_MS });
  if (loginFailures.size > LOGIN_FAILURE_KEY_LIMIT) {
    for (const [candidate, value] of loginFailures) if (value.expiresAt <= Date.now()) loginFailures.delete(candidate);
    while (loginFailures.size > LOGIN_FAILURE_KEY_LIMIT) loginFailures.delete(loginFailures.keys().next().value);
  }
}

function publicUser(user) {
  return { publicId: user.public_id, username: user.username, displayName: user.display_name, email: user.email, role: user.role, active: Boolean(user.active), version: user.version };
}

router.get('/status', async (req, res, next) => {
  try {
    const [{ count }] = await db('users').count({ count: '*' });
    res.json({ setupNeeded: Number(count) === 0, user: req.user ? publicUser(req.user) : null });
  } catch (error) { next(error); }
});

router.post('/setup', async (req, res, next) => {
  try {
    knownKeys(req.body, ['username', 'password', 'displayName', 'email']);
    const username = string(req.body.username, 'username', { required: true, max: 64, pattern: /^[A-Za-z0-9._-]+$/ });
    const password = string(req.body.password, 'password', { required: true, min: 12, max: 200 });
    const displayName = string(req.body.displayName, 'displayName', { required: true, max: 120 });
    const email = string(req.body.email, 'email', { max: 255 });
    const user = await db.transaction(async (trx) => {
      const [{ count }] = await trx('users').count({ count: '*' });
      if (Number(count)) throw httpError(409, 'setup_complete', 'Initial setup is already complete');
      const [id] = await trx('users').insert({ public_id: crypto.randomUUID(), username, password_hash: await auth.hashPassword(password), role: 'admin', display_name: displayName, email, active: 1 });
      const created = await trx('users').where({ id }).first();
      await audit.record(trx, created.id, 'auth.setup', 'user', created.public_id, { status: 'active' });
      return created;
    });
    await auth.createSession(user.id, res, config.secureTransport);
    res.status(201).json(publicUser(user));
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    knownKeys(req.body, ['username', 'password']);
    const username = string(req.body.username, 'username', { required: true, max: 64 });
    const password = string(req.body.password, 'password', { required: true, max: 200 });
    const key = loginKey(req, username);
    rejectIfThrottled(key);
    const user = await db('users').whereRaw('lower(username) = lower(?)', [username]).first();
    const passwordMatches = await auth.verifyPassword(password, user && user.active ? user.password_hash : DUMMY_PASSWORD_HASH);
    if (!user || !user.active || !passwordMatches) {
      recordFailure(key);
      rejectIfThrottled(key);
      throw httpError(401, 'invalid_credentials', 'Invalid username or password');
    }
    loginFailures.delete(key);
    await auth.createSession(user.id, res, config.secureTransport);
    res.json(publicUser(user));
  } catch (error) { next(error); }
});

router.post('/logout', auth.requireSession, async (req, res, next) => {
  try { await auth.revoke(req, res); res.status(204).end(); } catch (error) { next(error); }
});

router.get('/users', auth.requireAdmin, async (_req, res, next) => {
  try { res.json((await db('users').orderBy('username')).map(publicUser)); } catch (error) { next(error); }
});

router.post('/users', auth.requireAdmin, async (req, res, next) => {
  try {
    knownKeys(req.body, ['username', 'password', 'displayName', 'email', 'role', 'active']);
    const user = {
      public_id: crypto.randomUUID(),
      username: string(req.body.username, 'username', { required: true, max: 64, pattern: /^[A-Za-z0-9._-]+$/ }),
      password_hash: await auth.hashPassword(string(req.body.password, 'password', { required: true, min: 12, max: 200 })),
      display_name: string(req.body.displayName, 'displayName', { required: true, max: 120 }),
      email: string(req.body.email, 'email', { max: 255 }),
      role: enumeration(req.body.role, 'role', ['admin', 'manager', 'engineer', 'viewer'], true),
      active: req.body.active === false ? 0 : 1
    };
    const created = await db.transaction(async (trx) => {
      const [id] = await trx('users').insert(user);
      const row = await trx('users').where({ id }).first();
      await audit.record(trx, req.user.id, 'user.create', 'user', row.public_id, { role: row.role, active: Boolean(row.active) });
      return row;
    });
    res.status(201).json(publicUser(created));
  } catch (error) { next(error); }
});

router.put('/users/:publicId', auth.requireAdmin, async (req, res, next) => {
  try {
    knownKeys(req.body, ['displayName', 'email', 'role', 'active', '_baseVersion']);
    if (!Number.isInteger(req.body._baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
    const baseVersion = integer(req.body._baseVersion, '_baseVersion', { required: true, min: 0 });
    if (typeof req.body.active !== 'boolean') throw httpError(422, 'invalid_field', 'active is invalid', 'active');
    const changes = {
      display_name: string(req.body.displayName, 'displayName', { required: true, max: 120 }),
      email: string(req.body.email, 'email', { max: 255 }),
      role: enumeration(req.body.role, 'role', ['admin', 'manager', 'engineer', 'viewer'], true),
      active: req.body.active ? 1 : 0,
      version: baseVersion + 1,
      updated_at: db.fn.now()
    };
    const user = await db.transaction(async (trx) => {
      const current = await trx('users').where({ public_id: req.params.publicId }).first();
      if (!current) throw httpError(404, 'user_not_found', 'User not found');
      if (current.role === 'admin' && current.active && (changes.role !== 'admin' || !changes.active)) {
        const [{ count }] = await trx('users').where({ role: 'admin', active: 1 }).whereNot({ id: current.id }).count({ count: '*' });
        if (!Number(count)) throw httpError(409, 'last_admin_required', 'At least one active administrator is required');
      }
      const updated = await trx('users').where({ id: current.id, version: baseVersion }).update(changes);
      if (!updated) throw httpError(409, 'version_conflict', 'The user changed since it was loaded');
      await audit.record(trx, req.user.id, 'user.update', 'user', current.public_id, { role: changes.role, active: Boolean(changes.active) });
      return trx('users').where({ id: current.id }).first();
    });
    res.json(publicUser(user));
  } catch (error) { next(error); }
});

module.exports = router;
