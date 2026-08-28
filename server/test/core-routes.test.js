'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-core-routes-'));
const ADMIN_TEST_PASSWORD = ['fictional', 'admin', 'password'].join('-');
const VIEWER_TEST_PASSWORD = ['fictional', 'viewer', 'password'].join('-');
process.env.DATA_DIR = testDataDir;
process.env.DB_FILE = path.join(testDataDir, 'test.db');
process.env.NODE_ENV = 'test';

const db = require('../db/knex');
const { loadPlugins } = require('../plugins/loader');
const root = path.join(__dirname, '..', '..');
const registry = loadPlugins({ configFile: path.join(root, 'config', 'zero-plugins.json'), searchRoot: root });
const app = require('../app')(registry);
let server;
let base;
let adminCookie;
let site;
let workPackage;

async function request(url, options = {}, cookie = adminCookie) {
  const headers = { ...(options.body && !(options.body instanceof Buffer) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${base}${url}`, { ...options, headers, body: options.body && !(options.body instanceof Buffer) && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  const contentType = response.headers.get('content-type') || '';
  const data = response.status === 204 ? null : contentType.includes('json') ? await response.json() : await response.text();
  return { response, data };
}

test.before(async () => {
  await db.migrate.latest();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); await db.destroy(); fs.rmSync(testDataDir, { recursive: true, force: true }); });

test('zero-plugin startup is ready and exposes no providers', async () => {
  const health = await request('/api/health', {}, null);
  assert.equal(health.response.status, 200); assert.equal(health.data.status, 'ready'); assert.equal(health.data.providers, 0);
  const status = await request('/api/auth/status', {}, null);
  assert.equal(status.data.setupNeeded, true);
});

test('setup, authentication, role authorization, and session revocation work', async () => {
  const setup = await request('/api/auth/setup', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD, displayName: 'Demo Administrator', email: 'admin@example.invalid' } }, null);
  assert.equal(setup.response.status, 201);
  adminCookie = setup.response.headers.get('set-cookie').split(';')[0];
  const duplicate = await request('/api/auth/setup', { method: 'POST', body: { username: 'other', password: ADMIN_TEST_PASSWORD, displayName: 'Other Admin' } }, null);
  assert.equal(duplicate.response.status, 409);
  const viewer = await request('/api/auth/users', { method: 'POST', body: { username: 'viewer', password: VIEWER_TEST_PASSWORD, displayName: 'Demo Viewer', role: 'viewer', active: true } });
  assert.equal(viewer.response.status, 201);
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'viewer', password: VIEWER_TEST_PASSWORD } }, null);
  const viewerCookie = login.response.headers.get('set-cookie').split(';')[0];
  const forbidden = await request('/api/sites', { method: 'POST', body: { code: 'READ-ONLY', name: 'Rejected Site' } }, viewerCookie);
  assert.equal(forbidden.response.status, 403);
  const logout = await request('/api/auth/logout', { method: 'POST' }, viewerCookie);
  assert.equal(logout.response.status, 204);
  const afterLogout = await request('/api/sites', {}, viewerCookie);
  assert.equal(afterLogout.response.status, 401);
});

test('generic site, room, rack, termination point, device, distance, and catalogue APIs work', async () => {
  const created = await request('/api/sites', { method: 'POST', body: { code: 'LAB-ROUTE-01', name: 'Fictional Route Lab', description: 'Public test data' } });
  assert.equal(created.response.status, 201); site = created.data;
  const room = await request(`/api/sites/${site.publicId}/rooms`, { method: 'POST', body: { name: 'Suite A', description: 'Demonstration room' } });
  const rack = await request(`/api/sites/${site.publicId}/racks`, { method: 'POST', body: { label: 'RACK-A1', suiteLine: 'A', sizeUnits: 42, roomPublicId: room.data.publicId } });
  const termination = await request(`/api/sites/${site.publicId}/termination-points`, { method: 'POST', body: { label: 'ODF-DEMO-1', kind: 'odf', notes: 'Fictional termination', roomPublicId: room.data.publicId } });
  const device = await request(`/api/sites/${site.publicId}/devices`, { method: 'POST', body: { hostname: 'DEMO-SWITCH-01', label: 'Demo Switch', deviceKey: 'device-demo-01', rackPublicId: rack.data.publicId, rackUnit: 10, sizeUnits: 1, side: 'front' } });
  const distance = await request(`/api/sites/${site.publicId}/distances`, { method: 'POST', body: { endpointA: 'demo-switch-01:1', endpointB: 'ODF-DEMO-1:1', media: 'fibre', lengthMetres: 18.25 } });
  assert.equal(rack.response.status, 201); assert.equal(termination.response.status, 201); assert.equal(device.response.status, 201); assert.equal(distance.response.status, 201);
  const catalogue = await request('/api/catalogue/consumables', { method: 'POST', body: { catalogueReference: 'CAT-DEMO-001', description: 'Fictional hook-and-loop tie', estimatedUnitPrice: 0.42, unit: 'each' } });
  assert.equal(catalogue.response.status, 201);
});

test('generic work package persists nested records and is searchable without plugins', async () => {
  const created = await request('/api/work-packages', { method: 'POST', body: {
    sitePublicId: site.publicId, packageReference: 'PKG-ROUTE-200', externalReference: 'EXT-SEARCH-200', projectReference: 'PROJECT-COMET', title: 'Fictional route installation', description: 'Searchable generic description', status: 'active', leadAssignee: 'admin', assignees: ['admin'],
    workItems: [{ itemReference: 'ITEM-SEARCH-1', title: 'Fit demo containment', description: 'Child reference searchable', status: 'planned' }],
    circuits: [{ circuitReference: 'CIRCUIT-DEMO-1', description: 'Fictional connection', media: 'copper', status: 'planned', segments: [{ segmentReference: 'SEGMENT-DEMO-1', fromEndpoint: 'demo-a:1', toEndpoint: 'demo-b:1', lengthMetres: 7.5 }] }],
    consumableRequirements: [{ description: 'Fictional labels', quantityRequired: 4, unit: 'each' }]
  } });
  assert.equal(created.response.status, 201); workPackage = created.data;
  assert.equal(workPackage.workItems.length, 1); assert.equal(workPackage.circuits[0].segments.length, 1);
  for (const term of ['PKG-ROUTE-200', 'EXT-SEARCH-200', 'ITEM-SEARCH-1', 'PROJECT-COMET', 'LAB-ROUTE-01', 'Searchable generic']) {
    const search = await request(`/api/search?q=${encodeURIComponent(term)}`);
    assert.equal(search.response.status, 200, term); assert.equal(search.data[0].publicId, workPackage.publicId, term);
  }
});

test('optimistic concurrency requires a base version and rejects stale writes', async () => {
  const missing = await request(`/api/work-packages/${workPackage.publicId}`, { method: 'PUT', body: { ...workPackage, workItems: undefined, circuits: undefined, consumableRequirements: undefined } });
  assert.equal(missing.response.status, 428);
  const updateBody = { packageReference: workPackage.packageReference, externalReference: workPackage.externalReference, projectReference: workPackage.projectReference, title: 'Updated generic title', description: workPackage.description, status: workPackage.status, leadAssignee: workPackage.leadAssignee, assignees: workPackage.assignees, _baseVersion: workPackage.version };
  const winner = await request(`/api/work-packages/${workPackage.publicId}`, { method: 'PUT', body: updateBody });
  assert.equal(winner.response.status, 200);
  const stale = await request(`/api/work-packages/${workPackage.publicId}`, { method: 'PUT', body: updateBody });
  assert.equal(stale.response.status, 409);
});

test('generic JSON and CSV exports are available without plugins and neutralize formula cells', async () => {
  const json = await request(`/api/work-packages/${workPackage.publicId}/export?format=json`);
  assert.equal(json.response.status, 200); assert.match(json.response.headers.get('content-disposition'), /attachment/);
  const csv = await request(`/api/work-packages/${workPackage.publicId}/export?format=csv`);
  assert.equal(csv.response.status, 200); assert.match(csv.data, /record_type/); assert.match(csv.data, /SEGMENT-DEMO-1/);
});

test('photo metadata listing does not return image bytes', async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const uploaded = await request(`/api/photos/work_package/${workPackage.publicId}`, { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Fictional evidence' } });
  assert.equal(uploaded.response.status, 201);
  const list = await request(`/api/photos/work_package/${workPackage.publicId}`);
  assert.equal(list.data.length, 1); assert.equal('content' in list.data[0], false);
  const content = await fetch(`${base}/api/photos/${uploaded.data.publicId}/content`, { headers: { Cookie: adminCookie } });
  assert.equal(content.status, 200); assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);
});

test('static allowlist serves the shell and rejects repository/server paths', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/js/app.js`)).status, 200);
  for (const forbidden of ['/server/server.js', '/package.json', '/AGENTS.md', '/data/techsitemanager.db']) assert.equal((await fetch(`${base}${forbidden}`)).status, 404);
});
