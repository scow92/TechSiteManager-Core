'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-phase5-'));
process.env.DATA_DIR = testDataDir;
process.env.DB_FILE = path.join(testDataDir, 'phase5.db');
process.env.NODE_ENV = 'test';
process.env.VAPID_PUBLIC_KEY = 'B'.repeat(65);

const db = require('../db/knex');
const { loadPlugins } = require('../plugins/loader');
const root = path.join(__dirname, '..', '..');
const registry = loadPlugins({ configFile: path.join(root, 'config', 'zero-plugins.json'), searchRoot: root });
const app = require('../app')(registry);
const PASSWORD = ['fictional', 'phase', 'five', 'credential'].join('-');
let server; let base; let adminCookie; let engineerCookie; let requestedUser;

async function request(url, options = {}, cookie = adminCookie) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) };
  const response = await fetch(`${base}${url}`, { ...options, headers, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  const type = response.headers.get('content-type') || '';
  const data = response.status === 204 ? null : type.includes('json') ? await response.json() : await response.text();
  return { response, data };
}

test.before(async () => {
  await db.migrate.latest(); server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const setup = await request('/api/auth/setup', { method: 'POST', body: { username: 'phase5-admin', password: PASSWORD, displayName: 'Fictional Phase Five Administrator', email: 'phase5-admin@example.invalid' } }, null);
  adminCookie = setup.response.headers.get('set-cookie').split(';')[0];
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); await db.destroy(); fs.rmSync(testDataDir, { recursive: true, force: true }); });

test('account requests require approval and preserve role/concurrency controls', async () => {
  const created = await request('/api/auth/requests', { method: 'POST', body: { username: 'phase5-engineer', password: PASSWORD, displayName: 'Fictional Engineer', email: 'engineer@example.invalid' } }, null);
  assert.equal(created.response.status, 202);
  const rejectedLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'phase5-engineer', password: PASSWORD } }, null);
  assert.equal(rejectedLogin.response.status, 401);
  requestedUser = (await request('/api/auth/users')).data.find((user) => user.username === 'phase5-engineer');
  assert.equal(requestedUser.accountStatus, 'requested'); assert.equal(requestedUser.active, false);
  const approved = await request(`/api/auth/users/${requestedUser.publicId}`, { method: 'PUT', body: { displayName: requestedUser.displayName, email: requestedUser.email, role: 'engineer', active: true, accountStatus: 'approved', _baseVersion: requestedUser.version } });
  assert.equal(approved.response.status, 200); assert.equal(approved.data.accountStatus, 'approved'); assert.equal(approved.data.active, true);
  const stale = await request(`/api/auth/users/${requestedUser.publicId}`, { method: 'PUT', body: { displayName: requestedUser.displayName, email: requestedUser.email, role: 'engineer', active: true, _baseVersion: requestedUser.version } });
  assert.equal(stale.response.status, 409);
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'phase5-engineer', password: PASSWORD } }, null);
  assert.equal(login.response.status, 200); engineerCookie = login.response.headers.get('set-cookie').split(';')[0];
});

test('engineer profiles drive exact, non-substring workload matching', async () => {
  const profile = await request('/api/auth/profile', { method: 'PUT', body: { assignmentName: 'Alex', jobTitle: 'Fictional cabling engineer', weeklyCapacityHours: 36 } }, engineerCookie);
  assert.equal(profile.response.status, 200); assert.equal(profile.data.assignmentName, 'Alex');
  const [siteId] = await db('sites').insert({ public_id: crypto.randomUUID(), code: 'PHASE5-LAB', name: 'Fictional Phase Five Lab' });
  const [matchedPackageId] = await db('work_packages').insert({ public_id: crypto.randomUUID(), site_id: siteId, package_ref: 'PKG-PHASE5-MATCH', title: 'Exact assignment', status: 'active', lead_assignee: 'Alexander', assignees_json: '["Alex"]' });
  await db('work_packages').insert({ public_id: crypto.randomUUID(), site_id: siteId, package_ref: 'PKG-PHASE5-NO-SUBSTRING', title: 'Substring must not match', status: 'active', lead_assignee: 'Alexandra', assignees_json: '[]' });
  await db('work_items').insert({ public_id: crypto.randomUUID(), work_package_id: matchedPackageId, item_reference: 'ITEM-PHASE5-MATCH', title: 'Exact item assignment', status: 'active', lead_assignee: 'alex', assignees_json: '[]' });
  const own = await request('/api/auth/workload', {}, engineerCookie);
  assert.equal(own.data.length, 1); assert.equal(own.data[0].activePackageCount, 1); assert.equal(own.data[0].activeWorkItemCount, 1); assert.deepEqual(own.data[0].packages.map((entry) => entry.packageReference), ['PKG-PHASE5-MATCH']);
  const team = await request('/api/auth/workload'); assert.ok(team.data.some((entry) => entry.assignmentName === 'Alex'));
});

test('shared consumables stay separate from package quantities and enforce safe delete', async () => {
  const catalogue = await request('/api/catalogue/consumables', { method: 'POST', body: { catalogueReference: 'CONS-PHASE5-LABEL', description: 'Fictional equipment label', estimatedUnitPrice: 1.25, unit: 'sheet' } });
  assert.equal(catalogue.response.status, 201);
  const pack = await db('work_packages').where({ package_ref: 'PKG-PHASE5-MATCH' }).first();
  await db('consumable_requirements').insert({ public_id: crypto.randomUUID(), work_package_id: pack.id, catalogue_id: (await db('consumable_catalogue').where({ public_id: catalogue.data.publicId }).first()).id, description: catalogue.data.description, quantity_required: 3, unit: catalogue.data.unit });
  const inUse = await request(`/api/catalogue/consumables/${catalogue.data.publicId}?baseVersion=${catalogue.data.version}`, { method: 'DELETE' });
  assert.equal(inUse.response.status, 409); assert.equal(inUse.data.code, 'catalogue_record_in_use');
  const stored = await db('consumable_catalogue').where({ public_id: catalogue.data.publicId }).first(); assert.equal(stored.description, 'Fictional equipment label');
});

test('fibre BOM uses exact and next-up matching, simplex counts, totals, reasons and safe CSV', async () => {
  const pack = await db('work_packages').where({ package_ref: 'PKG-PHASE5-MATCH' }).first();
  const [circuitId] = await db('circuits').insert({ public_id: crypto.randomUUID(), work_package_id: pack.id, circuit_reference: 'FIBRE-PHASE5', media: 'fibre' });
  const segment = (reference, length, simplex, itemType = 'patch-lead') => ({ public_id: crypto.randomUUID(), circuit_id: circuitId, segment_reference: reference, from_endpoint: `${reference}-a`, to_endpoint: `${reference}-b`, length_metres: length, from_connector: 'lc', to_connector: 'lc', fibre_type: 'OS2', fibre_mode: 'singlemode', fibre_simplex: simplex, item_type: itemType });
  await db('segments').insert([segment('SEG-EXACT', 7, 1), segment('SEG-NEXT', 8, 0), segment('SEG-UNMATCHED', 4, 0, 'trunk')]);
  const createSku = (sku, length, simplex, price, description) => request('/api/catalogue/fibre-skus', { method: 'POST', body: { sku, description, itemType: 'patch-lead', fibreType: 'OS2', fibreMode: 'singlemode', fromConnector: 'lc', toConnector: 'lc', simplex, lengthMetres: length, unitPrice: price } });
  assert.equal((await createSku('SKU-PHASE5-7-SX', 7, true, 10, '=fictional formula-safe lead')).response.status, 201);
  assert.equal((await createSku('SKU-PHASE5-10-DX', 10, false, 15, 'Fictional duplex lead')).response.status, 201);
  const result = await request(`/api/work-packages/${pack.public_id}/bom`);
  assert.equal(result.response.status, 200); assert.deepEqual(result.data.matches.map((entry) => [entry.segmentReference, entry.matchType, entry.quantity]), [['SEG-EXACT', 'exact', 2], ['SEG-NEXT', 'next-up', 1]]);
  assert.deepEqual(result.data.unmatched.map((entry) => entry.reason), ['no-compatible-sku']);
  assert.equal(result.data.totals.fibre, 35); assert.equal(result.data.totals.consumables, 3.75); assert.equal(result.data.totals.combined, 38.75);
  const csv = await request(`/api/work-packages/${pack.public_id}/bom.csv`); assert.equal(csv.response.status, 200); assert.match(csv.data, /SKU-PHASE5-7-SX/); assert.match(csv.data, /"'=fictional formula-safe lead"/); assert.match(csv.data, /no-compatible-sku/);
});

test('notification subscriptions are user-owned and removed during sign-out', async () => {
  const config = await request('/api/auth/notification-config', {}, engineerCookie); assert.equal(config.data.supported, true);
  const body = { endpoint: 'https://push.example.invalid/subscriptions/fictional-engineer', keys: { p256dh: 'fictionalP256dh_key', auth: 'fictionalAuth_key' } };
  const subscription = await request('/api/auth/push-subscriptions', { method: 'POST', body }, engineerCookie);
  assert.equal(subscription.response.status, 201); assert.equal(await db('push_subscriptions').where({ user_id: (await db('users').where({ public_id: requestedUser.publicId }).first()).id }).count({ count: '*' }).first().then((row) => Number(row.count)), 1);
  assert.equal((await request('/api/auth/push-subscriptions', { method: 'DELETE' }, engineerCookie)).response.status, 204); assert.equal(Number((await db('push_subscriptions').count({ count: '*' }).first()).count), 0);
  assert.equal((await request('/api/auth/push-subscriptions', { method: 'POST', body }, engineerCookie)).response.status, 201);
  assert.equal((await request('/api/auth/logout', { method: 'POST' }, engineerCookie)).response.status, 204);
  assert.equal(Number((await db('push_subscriptions').count({ count: '*' }).first()).count), 0);
});
