'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db/knex');
const auth = require('../lib/auth');
const { knownKeys, string, enumeration, integer, number, uuid } = require('../lib/validation');
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
  return {
    publicId: user.public_id, username: user.username, displayName: user.display_name, email: user.email,
    role: user.role, active: Boolean(user.active), accountStatus: user.account_status || 'approved',
    requestedAt: user.requested_at || null, approvedAt: user.approved_at || null, version: user.version,
    profile: user.assignment_name ? { assignmentName: user.assignment_name, jobTitle: user.job_title || '', weeklyCapacityHours: Number(user.weekly_capacity_hours), version: user.profile_version } : null
  };
}

function usersWithProfiles(trx = db) {
  return trx('users as u').leftJoin('engineer_profiles as p', 'p.user_id', 'u.id')
    .select('u.*', 'p.assignment_name', 'p.job_title', 'p.weekly_capacity_hours', 'p.version as profile_version');
}

router.get('/status', async (req, res, next) => {
  try {
    const [{ count }] = await db('users').count({ count: '*' });
    const current = req.user ? await usersWithProfiles().where('u.id', req.user.id).first() : null;
    res.json({ setupNeeded: Number(count) === 0, user: current ? publicUser(current) : null });
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
      const [id] = await trx('users').insert({ public_id: crypto.randomUUID(), username, password_hash: await auth.hashPassword(password), role: 'admin', display_name: displayName, email, active: 1, account_status: 'approved', approved_at: new Date().toISOString() });
      const created = await trx('users').where({ id }).first();
      await audit.record(trx, created.id, 'auth.setup', 'user', created.public_id, { status: 'active' });
      return created;
    });
    await auth.createSession(user.id, res, config.secureTransport);
    res.status(201).json(publicUser(user));
  } catch (error) { next(error); }
});

router.post('/requests', async (req, res, next) => {
  try {
    const [{ count: administrators }] = await db('users').where({ role: 'admin', active: 1, account_status: 'approved' }).count({ count: '*' });
    if (!Number(administrators)) throw httpError(409, 'setup_required', 'Initial administrator setup must be completed first');
    knownKeys(req.body, ['username', 'password', 'displayName', 'email']);
    const username = string(req.body.username, 'username', { required: true, max: 64, pattern: /^[A-Za-z0-9._-]+$/ });
    const existing = await db('users').whereRaw('lower(username) = lower(?)', [username]).first();
    if (existing) throw httpError(409, 'account_request_exists', 'An account or request already uses that username');
    const publicId = crypto.randomUUID(); const requestedAt = new Date().toISOString();
    await db.transaction(async (trx) => {
      const [id] = await trx('users').insert({ public_id: publicId, username, password_hash: await auth.hashPassword(string(req.body.password, 'password', { required: true, min: 12, max: 200 })), role: 'engineer', display_name: string(req.body.displayName, 'displayName', { required: true, max: 120 }), email: string(req.body.email, 'email', { max: 255 }), active: 0, account_status: 'requested', requested_at: requestedAt });
      await audit.record(trx, id, 'account.request', 'user', publicId, { status: 'requested' });
    });
    res.status(202).json({ publicId, status: 'requested' });
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
  try { await db('push_subscriptions').where({ user_id: req.user.id }).delete(); await auth.revoke(req, res); res.status(204).end(); } catch (error) { next(error); }
});

router.get('/users', auth.requireAdmin, async (_req, res, next) => {
  try { res.json((await usersWithProfiles().orderBy('u.username')).map(publicUser)); } catch (error) { next(error); }
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
      active: req.body.active === false ? 0 : 1,
      account_status: 'approved',
      approved_at: new Date().toISOString(), approved_by_user_id: req.user.id
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
    knownKeys(req.body, ['displayName', 'email', 'role', 'active', 'accountStatus', '_baseVersion']);
    if (!Number.isInteger(req.body._baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
    const baseVersion = integer(req.body._baseVersion, '_baseVersion', { required: true, min: 0 });
    if (typeof req.body.active !== 'boolean') throw httpError(422, 'invalid_field', 'active is invalid', 'active');
    const requestedStatus = req.body.accountStatus === undefined ? null : enumeration(req.body.accountStatus, 'accountStatus', ['approved', 'rejected'], true);
    const changes = {
      display_name: string(req.body.displayName, 'displayName', { required: true, max: 120 }),
      email: string(req.body.email, 'email', { max: 255 }),
      role: enumeration(req.body.role, 'role', ['admin', 'manager', 'engineer', 'viewer'], true),
      active: requestedStatus === 'rejected' ? 0 : req.body.active ? 1 : 0,
      ...(requestedStatus ? { account_status: requestedStatus, approved_at: requestedStatus === 'approved' ? db.fn.now() : null, approved_by_user_id: req.user.id } : {}),
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
      if (!changes.active) await trx('sessions').where({ user_id: current.id }).delete();
      await audit.record(trx, req.user.id, 'user.update', 'user', current.public_id, { role: changes.role, active: Boolean(changes.active) });
      return trx('users').where({ id: current.id }).first();
    });
    res.json(publicUser(user));
  } catch (error) { next(error); }
});

function profileValues(body) {
  return {
    assignment_name: string(body.assignmentName, 'assignmentName', { required: true, max: 120 }).trim(),
    job_title: string(body.jobTitle, 'jobTitle', { max: 120 }) || '',
    weekly_capacity_hours: number(body.weeklyCapacityHours, 'weeklyCapacityHours', { required: true, min: 0, max: 168 })
  };
}

function profileBaseVersion(body) {
  if (!Number.isInteger(body._baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
  return integer(body._baseVersion, '_baseVersion', { required: true, min: 0 });
}

async function putProfile(actor, userPublicId, body, administrator) {
  knownKeys(body, ['assignmentName', 'jobTitle', 'weeklyCapacityHours', '_baseVersion']);
  const user = await db('users').where({ public_id: uuid(userPublicId, 'publicId') }).first();
  if (!user) throw httpError(404, 'user_not_found', 'User not found');
  if (!administrator && actor.id !== user.id) throw httpError(403, 'profile_forbidden', 'You may only edit your own engineer profile');
  if (user.role === 'viewer') throw httpError(422, 'profile_role_invalid', 'Viewer accounts cannot have engineer profiles');
  const existing = await db('engineer_profiles').where({ user_id: user.id }).first();
  const requestedVersion = existing ? profileBaseVersion(body) : 0;
  return db.transaction(async (trx) => {
    if (!existing) await trx('engineer_profiles').insert({ user_id: user.id, ...profileValues(body) });
    else {
      const count = await trx('engineer_profiles').where({ user_id: user.id, version: requestedVersion }).update({ ...profileValues(body), version: requestedVersion + 1, updated_at: trx.fn.now() });
      if (!count) throw httpError(409, 'version_conflict', 'The engineer profile changed since it was loaded');
    }
    await audit.record(trx, actor.id, existing ? 'engineer_profile.update' : 'engineer_profile.create', 'user', user.public_id);
    const row = await trx('engineer_profiles').where({ user_id: user.id }).first();
    return { assignmentName: row.assignment_name, jobTitle: row.job_title, weeklyCapacityHours: Number(row.weekly_capacity_hours), version: row.version };
  });
}

router.put('/profile', auth.requireWrite, async (req, res, next) => {
  try { res.json(await putProfile(req.user, req.user.public_id, req.body, false)); } catch (error) { next(error); }
});

router.put('/users/:publicId/profile', auth.requireAdmin, async (req, res, next) => {
  try { res.json(await putProfile(req.user, req.params.publicId, req.body, true)); } catch (error) { next(error); }
});

function normalizedAssignment(value) { return String(value || '').trim().toLocaleLowerCase('en'); }

router.get('/workload', auth.requireSession, async (req, res, next) => {
  try {
    let profiles = await usersWithProfiles().whereNotNull('p.id').where({ 'u.active': 1, 'u.account_status': 'approved' }).orderBy('p.assignment_name');
    if (!['admin', 'manager'].includes(req.user.role)) profiles = profiles.filter((profile) => profile.id === req.user.id);
    const [packages, items] = await Promise.all([
      db('work_packages').whereNotIn('status', ['complete', 'cancelled']).select('public_id', 'package_ref', 'title', 'status', 'lead_assignee', 'assignees_json'),
      db('work_items as i').join('work_packages as w', 'w.id', 'i.work_package_id').whereNotIn('i.status', ['complete', 'cancelled']).whereNotIn('w.status', ['complete', 'cancelled']).select('i.public_id', 'i.item_reference', 'i.title', 'i.status', 'i.lead_assignee', 'i.assignees_json', 'w.public_id as work_package_public_id', 'w.package_ref')
    ]);
    const assigned = (record, key) => normalizedAssignment(record.lead_assignee) === key || JSON.parse(record.assignees_json || '[]').some((value) => normalizedAssignment(value) === key);
    res.json(profiles.map((profile) => {
      const key = normalizedAssignment(profile.assignment_name); const matchedPackages = packages.filter((record) => assigned(record, key)); const matchedItems = items.filter((record) => assigned(record, key));
      return { user: publicUser(profile), assignmentName: profile.assignment_name, weeklyCapacityHours: Number(profile.weekly_capacity_hours), activePackageCount: matchedPackages.length, activeWorkItemCount: matchedItems.length, packages: matchedPackages.map((record) => ({ publicId: record.public_id, packageReference: record.package_ref, title: record.title, status: record.status })), workItems: matchedItems.map((record) => ({ publicId: record.public_id, workPackagePublicId: record.work_package_public_id, packageReference: record.package_ref, itemReference: record.item_reference, title: record.title, status: record.status })) };
    }));
  } catch (error) { next(error); }
});

router.get('/notification-config', auth.requireSession, (_req, res) => res.json({ supported: Boolean(config.vapidPublicKey), applicationServerKey: config.vapidPublicKey }));

router.get('/push-subscriptions', auth.requireSession, async (req, res, next) => {
  try { res.json((await db('push_subscriptions').where({ user_id: req.user.id }).select('public_id', 'created_at')).map((row) => ({ publicId: row.public_id, createdAt: row.created_at }))); } catch (error) { next(error); }
});

router.post('/push-subscriptions', auth.requireSession, async (req, res, next) => {
  try {
    if (!config.vapidPublicKey) throw httpError(409, 'notifications_not_configured', 'Push notifications are not configured for this installation');
    knownKeys(req.body, ['endpoint', 'keys']); knownKeys(req.body.keys, ['p256dh', 'auth'], 'keys');
    const endpoint = string(req.body.endpoint, 'endpoint', { required: true, max: 2000 });
    let parsed; try { parsed = new URL(endpoint); } catch { throw httpError(422, 'subscription_endpoint_invalid', 'Subscription endpoint is invalid'); }
    if (parsed.protocol !== 'https:') throw httpError(422, 'subscription_endpoint_invalid', 'Subscription endpoint must use HTTPS');
    const p256dh = string(req.body.keys.p256dh, 'keys.p256dh', { required: true, max: 512, pattern: /^[A-Za-z0-9_-]+$/ });
    const subscriptionAuth = string(req.body.keys.auth, 'keys.auth', { required: true, max: 512, pattern: /^[A-Za-z0-9_-]+$/ });
    const existing = await db('push_subscriptions').where({ endpoint }).first();
    if (existing && existing.user_id !== req.user.id) throw httpError(409, 'subscription_owned_by_other_user', 'Subscription is already registered to another account');
    const publicId = existing?.public_id || crypto.randomUUID();
    if (existing) await db('push_subscriptions').where({ id: existing.id }).update({ p256dh, auth: subscriptionAuth });
    else await db('push_subscriptions').insert({ public_id: publicId, user_id: req.user.id, endpoint, p256dh, auth: subscriptionAuth });
    res.status(existing ? 200 : 201).json({ publicId });
  } catch (error) { next(error); }
});

router.delete('/push-subscriptions', auth.requireSession, async (req, res, next) => {
  try { await db('push_subscriptions').where({ user_id: req.user.id }).delete(); res.status(204).end(); } catch (error) { next(error); }
});

router.delete('/push-subscriptions/:publicId', auth.requireSession, async (req, res, next) => {
  try { await db('push_subscriptions').where({ public_id: uuid(req.params.publicId, 'publicId'), user_id: req.user.id }).delete(); res.status(204).end(); } catch (error) { next(error); }
});

module.exports = router;
