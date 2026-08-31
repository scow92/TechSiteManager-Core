'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-core-routes-'));
const ADMIN_TEST_PASSWORD = ['fictional', 'admin', 'password'].join('-');
const VIEWER_TEST_PASSWORD = ['fictional', 'viewer', 'password'].join('-');
const WRITER_TEST_PASSWORD = ['fictional', 'writer', 'password'].join('-');
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
let managerCookie;
let engineerCookie;
let viewerUser;
let site;
let workPackage;
let room;
let rack;
let termination;
let device;
let catalogue;

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
  assert.equal(viewer.response.status, 201); viewerUser = viewer.data;
  for (const role of ['manager', 'engineer']) {
    assert.equal((await request('/api/auth/users', { method: 'POST', body: { username: role, password: WRITER_TEST_PASSWORD, displayName: `Demo ${role}`, role, active: true } })).response.status, 201);
    const writerLogin = await request('/api/auth/login', { method: 'POST', body: { username: role, password: WRITER_TEST_PASSWORD } }, null);
    if (role === 'manager') managerCookie = writerLogin.response.headers.get('set-cookie').split(';')[0]; else engineerCookie = writerLogin.response.headers.get('set-cookie').split(';')[0];
  }
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'viewer', password: VIEWER_TEST_PASSWORD } }, null);
  const viewerCookie = login.response.headers.get('set-cookie').split(';')[0];
  const forbidden = await request('/api/sites', { method: 'POST', body: { code: 'READ-ONLY', name: 'Rejected Site' } }, viewerCookie);
  assert.equal(forbidden.response.status, 403);
  const logout = await request('/api/auth/logout', { method: 'POST' }, viewerCookie);
  assert.equal(logout.response.status, 204);
  const afterLogout = await request('/api/sites', {}, viewerCookie);
  assert.equal(afterLogout.response.status, 401);
});

test('writer roles can mutate core records but administrator boundaries remain enforced', async () => {
  for (const [role, cookie] of [['manager', managerCookie], ['engineer', engineerCookie]]) {
    const created = await request('/api/sites', { method: 'POST', body: { code: `ROLE-${role.toUpperCase()}`, name: `Fictional ${role} site` } }, cookie);
    assert.equal(created.response.status, 201, role);
    assert.equal((await request('/api/catalogue/consumables', { method: 'POST', body: { catalogueReference: `ROLE-${role}`, description: 'Rejected privileged write', unit: 'each' } }, cookie)).response.status, 403, role);
    assert.equal((await request('/api/auth/users', {}, cookie)).response.status, 403, role);
    assert.equal((await request('/api/audit', {}, cookie)).response.status, 403, role);
  }
});

test('user administration is concurrent, audited, and preserves an active administrator', async () => {
  const missingBase = await request(`/api/auth/users/${viewerUser.publicId}`, { method: 'PUT', body: { displayName: viewerUser.displayName, email: viewerUser.email, role: viewerUser.role, active: true } });
  assert.equal(missingBase.response.status, 428);
  const updated = await request(`/api/auth/users/${viewerUser.publicId}`, { method: 'PUT', body: { displayName: 'Updated Demo Viewer', email: viewerUser.email, role: viewerUser.role, active: true, _baseVersion: viewerUser.version } });
  assert.equal(updated.response.status, 200); assert.equal(updated.data.version, viewerUser.version + 1);
  assert.equal((await request(`/api/auth/users/${viewerUser.publicId}`, { method: 'PUT', body: { displayName: viewerUser.displayName, email: viewerUser.email, role: viewerUser.role, active: true, _baseVersion: viewerUser.version } })).response.status, 409);
  const administrator = (await request('/api/auth/users')).data.find((entry) => entry.username === 'admin');
  const protectedAdmin = await request(`/api/auth/users/${administrator.publicId}`, { method: 'PUT', body: { displayName: administrator.displayName, email: administrator.email, role: 'viewer', active: true, _baseVersion: administrator.version } });
  assert.equal(protectedAdmin.response.status, 409); assert.equal(protectedAdmin.data.code, 'last_admin_required');
  assert.equal((await request(`/api/auth/users/${crypto.randomUUID()}`, { method: 'PUT', body: { displayName: 'Missing', email: null, role: 'viewer', active: true, _baseVersion: 0 } })).response.status, 404);
});

test('origin checks, security headers, and public errors do not leak internals', async () => {
  const health = await request('/api/health', {}, null);
  assert.match(health.response.headers.get('content-security-policy'), /default-src 'self'/); assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(health.response.headers.get('cache-control'), 'no-store');
  const crossed = await request('/api/sites', { method: 'POST', headers: { Origin: 'https://different.example.invalid' }, body: { code: 'CROSS-ORIGIN', name: 'Rejected' } });
  assert.equal(crossed.response.status, 403); assert.equal(crossed.data.code, 'cross_origin_rejected');
  const duplicate = await request('/api/sites', { method: 'POST', body: { code: 'ROLE-MANAGER', name: 'Duplicate' } });
  assert.equal(duplicate.response.status, 409); assert.equal(duplicate.data.code, 'constraint_conflict'); assert.doesNotMatch(JSON.stringify(duplicate.data), /SQLITE|stack|insert into/i);
  const malformedResponse = await fetch(`${base}/api/sites`, { method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: '{' });
  const malformed = await malformedResponse.json(); assert.equal(malformedResponse.status, 400); assert.equal(malformed.code, 'invalid_json'); assert.doesNotMatch(JSON.stringify(malformed), /SyntaxError|stack/i);
});

test('login failures are throttled without disclosing whether an account exists', async () => {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const rejected = await request('/api/auth/login', { method: 'POST', body: { username: 'fictional-missing-user', password: VIEWER_TEST_PASSWORD } }, null);
    assert.equal(rejected.response.status, 401);
    assert.equal(rejected.data.code, 'invalid_credentials');
  }
  const throttled = await request('/api/auth/login', { method: 'POST', body: { username: 'fictional-missing-user', password: VIEWER_TEST_PASSWORD } }, null);
  assert.equal(throttled.response.status, 429);
  assert.equal(throttled.data.code, 'login_throttled');
});

test('generic site, room, rack, termination point, device, distance, and catalogue APIs work', async () => {
  const created = await request('/api/sites', { method: 'POST', body: { code: 'LAB-ROUTE-01', name: 'Fictional Route Lab', description: 'Public test data' } });
  assert.equal(created.response.status, 201); site = created.data;
  const roomResponse = await request(`/api/sites/${site.publicId}/rooms`, { method: 'POST', body: { name: 'Suite A', description: 'Demonstration room' } });
  room = roomResponse.data;
  const rackResponse = await request(`/api/sites/${site.publicId}/racks`, { method: 'POST', body: { label: 'RACK-A1', suiteLine: 'A', sizeUnits: 42, roomPublicId: room.publicId } });
  rack = rackResponse.data;
  const terminationResponse = await request(`/api/sites/${site.publicId}/termination-points`, { method: 'POST', body: { label: 'ODF-DEMO-1', kind: 'odf', notes: 'Fictional termination', roomPublicId: room.publicId } });
  termination = terminationResponse.data;
  const deviceResponse = await request(`/api/sites/${site.publicId}/devices`, { method: 'POST', body: { hostname: 'DEMO-SWITCH-01', label: 'Demo Switch', deviceKey: 'device-demo-01', rackPublicId: rack.publicId, rackUnit: 10, sizeUnits: 1, side: 'front' } });
  device = deviceResponse.data;
  const distance = await request(`/api/sites/${site.publicId}/distances`, { method: 'POST', body: { endpointA: 'demo-switch-01:1', endpointB: 'ODF-DEMO-1:1', media: 'fibre', lengthMetres: 18.25 } });
  assert.equal(rackResponse.response.status, 201); assert.equal(terminationResponse.response.status, 201); assert.equal(deviceResponse.response.status, 201); assert.equal(distance.response.status, 201);
  assert.equal(rack.roomPublicId, room.publicId); assert.equal(device.rackPublicId, rack.publicId);
  assert.equal('id' in rack, false); assert.equal('public_id' in rack, false);
  const catalogueResponse = await request('/api/catalogue/consumables', { method: 'POST', body: { catalogueReference: 'CAT-DEMO-001', description: 'Fictional hook-and-loop tie', estimatedUnitPrice: 0.42, unit: 'each' } });
  assert.equal(catalogueResponse.response.status, 201); catalogue = catalogueResponse.data;
});

test('generic infrastructure and catalogue updates use optimistic concurrency', async () => {
  const body = { label: rack.label, suiteLine: 'B', sizeUnits: rack.sizeUnits, roomPublicId: room.publicId, _baseVersion: rack.version };
  const winner = await request(`/api/sites/${site.publicId}/racks/${rack.publicId}`, { method: 'PUT', body });
  assert.equal(winner.response.status, 200); assert.equal(winner.data.suiteLine, 'B');
  const stale = await request(`/api/sites/${site.publicId}/racks/${rack.publicId}`, { method: 'PUT', body });
  assert.equal(stale.response.status, 409);

  const catalogueBody = { catalogueReference: catalogue.catalogueReference, description: catalogue.description, estimatedUnitPrice: 0.5, unit: catalogue.unit, active: true, _baseVersion: catalogue.version };
  const catalogueWinner = await request(`/api/catalogue/consumables/${catalogue.publicId}`, { method: 'PUT', body: catalogueBody });
  assert.equal(catalogueWinner.response.status, 200); assert.equal(Number(catalogueWinner.data.estimatedUnitPrice), 0.5);
  assert.equal((await request(`/api/catalogue/consumables/${catalogue.publicId}`, { method: 'PUT', body: catalogueBody })).response.status, 409);
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
  const summary = (await request('/api/work-packages')).data.find((entry) => entry.publicId === workPackage.publicId);
  assert.equal(summary.sitePublicId, site.publicId);
  for (const term of ['PKG-ROUTE-200', 'EXT-SEARCH-200', 'ITEM-SEARCH-1', 'PROJECT-COMET', 'LAB-ROUTE-01', 'Searchable generic']) {
    const search = await request(`/api/search?q=${encodeURIComponent(term)}`);
    assert.equal(search.response.status, 200, term); assert.equal(search.data[0].publicId, workPackage.publicId, term); assert.equal(search.data[0].sitePublicId, site.publicId, term);
  }
  for (const term of ['CIRCUIT-DEMO-1', 'SEGMENT-DEMO-1', 'demo-a:1']) {
    const search = await request(`/api/search?q=${encodeURIComponent(term)}`);
    assert.equal(search.response.status, 200, term); assert.equal(search.data[0].publicId, workPackage.publicId, term);
  }
});

test('zero-plugin all-record search finds generic infrastructure', async () => {
  for (const [term, entityType, publicId] of [['RACK-A1', 'rack', rack.publicId], ['ODF-DEMO-1', 'termination_point', termination.publicId], ['demo-switch-01', 'device', device.publicId]]) {
    const search = await request(`/api/search?scope=all&q=${encodeURIComponent(term)}`);
    const result = search.data.find((entry) => entry.entityType === entityType);
    assert.equal(result.publicId, publicId, term);
    assert.equal(result.sitePublicId, site.publicId, term);
  }
});

test('invalid nested package input is rejected atomically', async () => {
  const rejected = await request('/api/work-packages', { method: 'POST', body: { sitePublicId: site.publicId, packageReference: 'PKG-REJECTED-201', title: 'Rejected package', workItems: {}, circuits: [], consumableRequirements: [] } });
  assert.equal(rejected.response.status, 422);
  assert.equal((await request('/api/work-packages')).data.some((entry) => entry.packageReference === 'PKG-REJECTED-201'), false);
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

test('generic work-item, circuit, segment, and requirement mutations preserve stable IDs and concurrency', async () => {
  const item = workPackage.workItems[0]; const circuit = workPackage.circuits[0]; const segment = circuit.segments[0]; const requirement = workPackage.consumableRequirements[0];
  let result = await request(`/api/work-packages/${workPackage.publicId}/work-items/${item.publicId}`, { method: 'PUT', body: { itemReference: item.itemReference, title: 'Updated child work item', description: item.description, status: 'active', sequence: item.sequence, _baseVersion: item.version } });
  assert.equal(result.response.status, 200); assert.equal(result.data.workItems[0].publicId, item.publicId); assert.equal(result.data.workItems[0].version, 1);
  assert.equal((await request(`/api/work-packages/${workPackage.publicId}/work-items/${item.publicId}`, { method: 'PUT', body: { itemReference: item.itemReference, title: item.title, description: item.description, status: item.status, sequence: item.sequence, _baseVersion: item.version } })).response.status, 409);

  result = await request(`/api/work-packages/${workPackage.publicId}/circuits/${circuit.publicId}`, { method: 'PUT', body: { circuitReference: circuit.circuitReference, description: 'Updated circuit', media: circuit.media, status: 'active', _baseVersion: circuit.version } });
  assert.equal(result.response.status, 200); assert.equal(result.data.circuits[0].publicId, circuit.publicId);
  result = await request(`/api/work-packages/${workPackage.publicId}/circuits/${circuit.publicId}/segments/${segment.publicId}`, { method: 'PUT', body: { segmentReference: segment.segmentReference, sequence: segment.sequence, fromEndpoint: segment.fromEndpoint, toEndpoint: segment.toEndpoint, lengthMetres: 8.5, notes: 'Reviewed', _baseVersion: segment.version } });
  assert.equal(result.response.status, 200); assert.equal(result.data.circuits[0].segments[0].publicId, segment.publicId); assert.equal(Number(result.data.circuits[0].segments[0].lengthMetres), 8.5);
  result = await request(`/api/work-packages/${workPackage.publicId}/consumable-requirements/${requirement.publicId}`, { method: 'PUT', body: { cataloguePublicId: catalogue.publicId, description: requirement.description, quantityRequired: 6, unit: requirement.unit, _baseVersion: requirement.version } });
  assert.equal(result.response.status, 200); assert.equal(result.data.consumableRequirements[0].publicId, requirement.publicId); assert.equal(result.data.consumableRequirements[0].cataloguePublicId, catalogue.publicId);

  result = await request(`/api/work-packages/${workPackage.publicId}/work-items`, { method: 'POST', body: { itemReference: 'ITEM-ADDED-2', title: 'Added generic item', status: 'planned', sequence: 2 } });
  assert.equal(result.response.status, 201); assert.ok(result.data.workItems.some((entry) => entry.itemReference === 'ITEM-ADDED-2'));
  result = await request(`/api/work-packages/${workPackage.publicId}/circuits`, { method: 'POST', body: { circuitReference: 'CIRCUIT-ADDED-2', description: 'Added connection', media: 'fibre', status: 'planned' } });
  const addedCircuit = result.data.circuits.find((entry) => entry.circuitReference === 'CIRCUIT-ADDED-2'); assert.equal(result.response.status, 201); assert.ok(addedCircuit);
  result = await request(`/api/work-packages/${workPackage.publicId}/circuits/${addedCircuit.publicId}/segments`, { method: 'POST', body: { segmentReference: 'SEGMENT-ADDED-2', sequence: 0, fromEndpoint: 'fictional-a:1', toEndpoint: 'fictional-b:1', lengthMetres: 10 } });
  assert.equal(result.response.status, 201); assert.ok(result.data.circuits.find((entry) => entry.publicId === addedCircuit.publicId).segments.some((entry) => entry.segmentReference === 'SEGMENT-ADDED-2'));
  result = await request(`/api/work-packages/${workPackage.publicId}/consumable-requirements`, { method: 'POST', body: { cataloguePublicId: catalogue.publicId, description: 'Added generic requirement', quantityRequired: 2, unit: 'each' } });
  assert.equal(result.response.status, 201); assert.ok(result.data.consumableRequirements.some((entry) => entry.description === 'Added generic requirement'));
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
  const orphan = await request(`/api/photos/rack/${crypto.randomUUID()}`, { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Rejected evidence' } });
  assert.equal(orphan.response.status, 404);
});

test('generic mutations create sanitized audit events', async () => {
  const events = await request('/api/audit');
  for (const action of ['user.create', 'user.update', 'racks.create', 'racks.update', 'consumable.create', 'consumable.update', 'work_package.create', 'work_package.update', 'work_item.create', 'work_item.update', 'circuit.create', 'circuit.update', 'segment.create', 'segment.update', 'consumable_requirement.create', 'consumable_requirement.update', 'photo.create']) {
    assert.ok(events.data.some((entry) => entry.action === action), action);
  }
});

test('static allowlist serves the shell and rejects repository/server paths', async () => {
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/js/main.js`)).status, 200);
  for (const forbidden of ['/server/server.js', '/package.json', '/AGENTS.md', '/data/techsitemanager.db']) assert.equal((await fetch(`${base}${forbidden}`)).status, 404);
});
