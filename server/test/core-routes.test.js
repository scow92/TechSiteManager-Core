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

function segmentEditorPayload(segment) {
  return {
    publicId: segment.publicId, _baseVersion: segment.version, segmentReference: segment.segmentReference, sequence: segment.sequence,
    fromEndpoint: segment.fromEndpoint, fromEndpointMode: segment.fromEndpointMode, fromDevicePublicId: segment.fromDevicePublicId, fromTerminationPositionPublicId: segment.fromTerminationPositionPublicId, fromPort: segment.fromPort,
    toEndpoint: segment.toEndpoint, toEndpointMode: segment.toEndpointMode, toDevicePublicId: segment.toDevicePublicId, toTerminationPositionPublicId: segment.toTerminationPositionPublicId, toPort: segment.toPort,
    fromConnector: segment.fromConnector, toConnector: segment.toConnector, lengthMetres: segment.lengthMetres, notes: segment.notes,
    fibreType: segment.fibreType, fibreMode: segment.fibreMode, fibreSimplex: segment.fibreSimplex, stockLengthMetres: segment.stockLengthMetres, itemType: segment.itemType,
    copperCategory: segment.copperCategory, copperShielding: segment.copperShielding, copperPinout: segment.copperPinout,
    dacConnector: segment.dacConnector, dacMedia: segment.dacMedia, dacDirection: segment.dacDirection
  };
}

function packageEditorPayload(pack, saveId = crypto.randomUUID()) {
  return {
    saveId, _baseVersion: pack.version, packageReference: pack.packageReference, externalReference: pack.externalReference, projectReference: pack.projectReference, title: pack.title, description: pack.description, status: pack.status, leadAssignee: pack.leadAssignee, assignees: pack.assignees,
    workItems: pack.workItems.map((item) => ({ publicId: item.publicId, _baseVersion: item.version, itemReference: item.itemReference, title: item.title, description: item.description, status: item.status, sequence: item.sequence, leadAssignee: item.leadAssignee, assignees: item.assignees })),
    circuits: pack.circuits.map((circuit) => ({ publicId: circuit.publicId, _baseVersion: circuit.version, circuitReference: circuit.circuitReference, description: circuit.description, media: circuit.media, status: circuit.status, segments: circuit.segments.map(segmentEditorPayload) })),
    consumableRequirements: pack.consumableRequirements.map((entry) => ({ publicId: entry.publicId, _baseVersion: entry.version, cataloguePublicId: entry.cataloguePublicId, description: entry.description, quantityRequired: entry.quantityRequired, unit: entry.unit })),
    scheduleRackChanges: []
  };
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
  const siteBody = { code: site.code, name: 'Updated Fictional Route Lab', description: site.description, _baseVersion: site.version };
  const siteWinner = await request(`/api/sites/${site.publicId}`, { method: 'PUT', body: siteBody });
  assert.equal(siteWinner.response.status, 200); assert.equal(siteWinner.data.version, site.version + 1);
  const siteRetry = await request(`/api/sites/${site.publicId}`, { method: 'PUT', body: siteBody });
  assert.equal(siteRetry.response.status, 200); assert.equal(siteRetry.data.version, siteWinner.data.version);
  const siteStale = await request(`/api/sites/${site.publicId}`, { method: 'PUT', body: { ...siteBody, description: 'Divergent stale site edit' } });
  assert.equal(siteStale.response.status, 409); assert.equal(siteStale.data.code, 'version_conflict'); assert.equal(siteStale.data.serverVersion, siteWinner.data.version);
  site = siteWinner.data;

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

test('Phase 2 infrastructure workflows validate placement, relationships, history, and photo lifecycle', async () => {
  const phaseSite = (await request('/api/sites', { method: 'POST', body: { code: 'LAB-PHASE-02', name: 'Fictional Phase Two Lab' } })).data;
  const firstRoom = (await request(`/api/sites/${phaseSite.publicId}/rooms`, { method: 'POST', body: { name: 'Fictional Suite One', description: '' } })).data;
  const secondRoom = (await request(`/api/sites/${phaseSite.publicId}/rooms`, { method: 'POST', body: { name: 'Fictional Suite Two', description: '' } })).data;
  const firstRackResponse = await request(`/api/sites/${phaseSite.publicId}/racks`, { method: 'POST', body: { label: 'ROW-A-01', suiteLine: 'A', suiteLineConfirmed: true, roomPublicId: firstRoom.publicId } });
  assert.equal(firstRackResponse.response.status, 201); assert.equal(firstRackResponse.data.sizeUnits, 47); assert.equal(firstRackResponse.data.suiteLineConfirmed, true);
  const firstRack = firstRackResponse.data;
  const duplicate = await request(`/api/sites/${phaseSite.publicId}/racks`, { method: 'POST', body: { label: 'row-a-01', roomPublicId: firstRoom.publicId } });
  assert.equal(duplicate.response.status, 409); assert.equal(duplicate.data.code, 'duplicate_rack');
  const sameLabelOtherRoom = await request(`/api/sites/${phaseSite.publicId}/racks`, { method: 'POST', body: { label: 'ROW-A-01', roomPublicId: secondRoom.publicId } });
  assert.equal(sameLabelOtherRoom.response.status, 201);
  const secondRack = (await request(`/api/sites/${phaseSite.publicId}/racks`, { method: 'POST', body: { label: 'ROW-B-01', suiteLine: 'B', suiteLineConfirmed: true, sizeUnits: 42, roomPublicId: secondRoom.publicId } })).data;

  const firstDevice = (await request(`/api/sites/${phaseSite.publicId}/devices`, { method: 'POST', body: { hostname: 'PHASE-SWITCH-A', label: 'Switch A', rackPublicId: firstRack.publicId, rackUnit: 10, sizeUnits: 2, side: 'front' } })).data;
  assert.equal(firstDevice.hostname, 'phase-switch-a'); assert.equal(firstDevice.roomPublicId, firstRoom.publicId); assert.ok(firstDevice.deviceKey);
  const overlap = await request(`/api/sites/${phaseSite.publicId}/devices`, { method: 'POST', body: { hostname: 'phase-overlap', rackPublicId: firstRack.publicId, rackUnit: 11, sizeUnits: 1, side: 'front' } });
  assert.equal(overlap.response.status, 409); assert.equal(overlap.data.code, 'rack_position_conflict');
  const rearDevice = await request(`/api/sites/${phaseSite.publicId}/devices`, { method: 'POST', body: { hostname: 'phase-rear-a', rackPublicId: firstRack.publicId, rackUnit: 10, sizeUnits: 1, side: 'rear' } });
  assert.equal(rearDevice.response.status, 201);
  const moved = await request(`/api/sites/${phaseSite.publicId}/devices/${firstDevice.publicId}`, { method: 'PUT', body: { hostname: firstDevice.hostname, label: firstDevice.label, rackPublicId: secondRack.publicId, rackUnit: 5, sizeUnits: 2, side: 'rear', _baseVersion: firstDevice.version } });
  assert.equal(moved.response.status, 200); assert.equal(moved.data.deviceKey, firstDevice.deviceKey); assert.equal(moved.data.roomPublicId, secondRoom.publicId);
  assert.equal((await request(`/api/sites/${phaseSite.publicId}/racks/${firstRack.publicId}?baseVersion=${firstRack.version}`, { method: 'DELETE' })).response.status, 409);

  const point = (await request(`/api/sites/${phaseSite.publicId}/termination-points`, { method: 'POST', body: { label: 'ODF-PHASE-01', kind: 'odf', notes: '', trayCount: 2, positionsPerTray: 12, roomPublicId: firstRoom.publicId } })).data;
  const position = await request(`/api/sites/${phaseSite.publicId}/termination-points/${point.publicId}/positions`, { method: 'POST', body: { tray: 2, position: 4, label: 'Fictional fibre 4' } });
  assert.equal(position.response.status, 201);
  const duplicatePosition = await request(`/api/sites/${phaseSite.publicId}/termination-points/${point.publicId}/positions`, { method: 'POST', body: { tray: 2, position: 4, label: 'Duplicate' } });
  assert.equal(duplicatePosition.response.status, 409); assert.equal(duplicatePosition.data.code, 'termination_position_duplicate');
  const positionUpdate = await request(`/api/sites/${phaseSite.publicId}/termination-points/${point.publicId}/positions/${position.data.publicId}`, { method: 'PUT', body: { tray: 2, position: 5, label: 'Fictional fibre 5', _baseVersion: position.data.version } });
  assert.equal(positionUpdate.response.status, 200); assert.equal(positionUpdate.data.version, 1);
  const shrink = await request(`/api/sites/${phaseSite.publicId}/termination-points/${point.publicId}`, { method: 'PUT', body: { label: point.label, kind: point.kind, notes: point.notes, trayCount: 1, positionsPerTray: 12, roomPublicId: firstRoom.publicId, _baseVersion: point.version } });
  assert.equal(shrink.response.status, 409); assert.equal(shrink.data.code, 'termination_capacity_in_use');

  const distanceA = moved.data;
  const distanceB = (await request(`/api/sites/${phaseSite.publicId}/devices`, { method: 'POST', body: { hostname: 'PHASE-SWITCH-B', rackPublicId: firstRack.publicId, rackUnit: 20, sizeUnits: 1, side: 'front' } })).data;
  const sample = await request(`/api/sites/${phaseSite.publicId}/distances`, { method: 'POST', body: { endpointADevicePublicId: distanceA.publicId, endpointBDevicePublicId: distanceB.publicId, media: 'fibre', lengthMetres: 23.5 } });
  assert.equal(sample.response.status, 201); assert.equal(sample.data.endpointADevicePublicId, distanceA.publicId);
  const exactSuggestion = await request(`/api/sites/${phaseSite.publicId}/distances/suggestions?endpointADevicePublicId=${distanceA.publicId}&endpointBDevicePublicId=${distanceB.publicId}&media=fibre`);
  assert.equal(exactSuggestion.data.matchType, 'device'); assert.equal(exactSuggestion.data.suggestedLengthMetres, 23.5);
  const fallbackA = (await request(`/api/sites/${phaseSite.publicId}/devices`, { method: 'POST', body: { hostname: 'phase-fallback-a', rackPublicId: secondRack.publicId, rackUnit: 30, sizeUnits: 1, side: 'front' } })).data;
  const fallbackB = (await request(`/api/sites/${phaseSite.publicId}/devices`, { method: 'POST', body: { hostname: 'phase-fallback-b', rackPublicId: firstRack.publicId, rackUnit: 30, sizeUnits: 1, side: 'front' } })).data;
  const rackSuggestion = await request(`/api/sites/${phaseSite.publicId}/distances/suggestions?endpointADevicePublicId=${fallbackA.publicId}&endpointBDevicePublicId=${fallbackB.publicId}&media=fibre`);
  assert.equal(rackSuggestion.data.matchType, 'rack'); assert.equal(rackSuggestion.data.suggestedLengthMetres, 23.5);

  const firstBytes = Buffer.from([0xff, 0xd8, 0x01, 0xd9]); const secondBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const firstPhoto = await request(`/api/photos/rack/${firstRack.publicId}`, { method: 'POST', body: firstBytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Fictional rack first' } });
  const secondPhoto = await request(`/api/photos/rack/${firstRack.publicId}`, { method: 'POST', body: secondBytes, headers: { 'Content-Type': 'image/png', 'X-Photo-Name': 'Fictional rack replacement' } });
  assert.equal(firstPhoto.response.status, 201); assert.equal(secondPhoto.response.status, 201);
  const viewerLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'viewer', password: VIEWER_TEST_PASSWORD } }, null);
  const viewerCookie = viewerLogin.response.headers.get('set-cookie').split(';')[0];
  let photoHistory = await request(`/api/photos/rack/${firstRack.publicId}`, {}, viewerCookie);
  assert.equal(photoHistory.response.status, 200); assert.equal(photoHistory.data.length, 2); assert.equal(photoHistory.data.filter((entry) => entry.current).length, 1); assert.equal(photoHistory.data[0].publicId, secondPhoto.data.publicId);
  assert.equal((await request(`/api/photos/rack/${firstRack.publicId}`, { method: 'POST', body: firstBytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Viewer rejected' } }, viewerCookie)).response.status, 403);
  assert.equal((await request(`/api/photos/${secondPhoto.data.publicId}?baseVersion=${secondPhoto.data.version}`, { method: 'DELETE' }, viewerCookie)).response.status, 403);
  assert.equal((await request(`/api/photos/${secondPhoto.data.publicId}?baseVersion=${secondPhoto.data.version}`, { method: 'DELETE' })).response.status, 204);
  photoHistory = await request(`/api/photos/rack/${firstRack.publicId}`);
  assert.equal(photoHistory.data.length, 1); assert.equal(photoHistory.data[0].current, true); assert.equal(photoHistory.data[0].version, 1);
  const devicePhoto = await request(`/api/photos/device/${distanceA.publicId}`, { method: 'POST', body: firstBytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Fictional device photo' } });
  assert.equal(devicePhoto.response.status, 201);
  assert.equal((await request(`/api/photos/device/${distanceA.publicId}`, {}, viewerCookie)).data[0].name, 'Fictional device photo');
  assert.equal((await request(`/api/photos/device/${distanceA.publicId}`, { method: 'POST', body: firstBytes, headers: { 'Content-Type': 'text/plain', 'X-Photo-Name': 'Rejected type' } })).response.status, 415);
  assert.equal((await request(`/api/photos/device/${distanceA.publicId}`, { method: 'POST', body: Buffer.alloc(10 * 1024 * 1024 + 1), headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Rejected size' } })).response.status, 413);
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

test('Phase 3 transactional editor atomically preserves stable nested identities and idempotent saves', async () => {
  const loaded = (await request(`/api/work-packages/${workPackage.publicId}`)).data;
  const existingItem = loaded.workItems[0]; const existingCircuit = loaded.circuits[0]; const existingSegment = existingCircuit.segments[0];
  const addedItemId = crypto.randomUUID(); const addedCircuitId = crypto.randomUUID(); const addedSegmentId = crypto.randomUUID(); const addedRequirementId = crypto.randomUUID(); const saveId = crypto.randomUUID();
  const body = {
    saveId, _baseVersion: loaded.version, packageReference: loaded.packageReference, externalReference: loaded.externalReference, projectReference: 'PROJECT-PHASE-THREE', title: 'Transactional fictional package', description: loaded.description, status: 'active', leadAssignee: 'engineer', assignees: ['engineer', 'manager'],
    workItems: [{ publicId: existingItem.publicId, _baseVersion: existingItem.version, itemReference: existingItem.itemReference, title: existingItem.title, description: existingItem.description, status: existingItem.status, sequence: 0, leadAssignee: 'engineer', assignees: ['engineer'] }, { publicId: addedItemId, _baseVersion: 0, itemReference: 'ITEM-TXN-2', title: 'Transactional child', description: 'Fictional nested edit', status: 'planned', sequence: 1, leadAssignee: 'manager', assignees: ['manager'] }],
    circuits: [{ publicId: existingCircuit.publicId, _baseVersion: existingCircuit.version, circuitReference: existingCircuit.circuitReference, description: existingCircuit.description, media: existingCircuit.media, status: existingCircuit.status, segments: [{ publicId: existingSegment.publicId, _baseVersion: existingSegment.version, segmentReference: existingSegment.segmentReference, sequence: 0, fromEndpoint: existingSegment.fromEndpoint, toEndpoint: existingSegment.toEndpoint, lengthMetres: 9.5, notes: 'Saved in transaction' }] }, { publicId: addedCircuitId, _baseVersion: 0, circuitReference: 'CIRCUIT-TXN-2', description: 'Nested fictional circuit', media: 'fibre', status: 'planned', segments: [{ publicId: addedSegmentId, _baseVersion: 0, segmentReference: 'SEGMENT-TXN-2', sequence: 0, fromEndpoint: 'fictional-source:1', toEndpoint: 'fictional-target:1', lengthMetres: 12, notes: '' }] }],
    consumableRequirements: [{ publicId: addedRequirementId, _baseVersion: 0, cataloguePublicId: catalogue.publicId, description: 'Transactional labels', quantityRequired: 8, unit: 'each' }]
  };
  const saved = await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body });
  assert.equal(saved.response.status, 200); assert.equal(saved.data.projectReference, 'PROJECT-PHASE-THREE');
  assert.equal(saved.data.workItems.find((item) => item.publicId === addedItemId).leadAssignee, 'manager');
  assert.equal(saved.data.circuits.find((circuit) => circuit.publicId === addedCircuitId).segments[0].publicId, addedSegmentId);
  assert.equal(saved.data.consumableRequirements[0].publicId, addedRequirementId);
  const retry = await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body });
  assert.equal(retry.response.status, 200); assert.equal(retry.data.version, saved.data.version); assert.equal(retry.data.workItems.filter((item) => item.publicId === addedItemId).length, 1);
  const invalid = { ...body, saveId: crypto.randomUUID(), _baseVersion: saved.data.version, title: 'Must roll back', circuits: [{ ...body.circuits[0], _baseVersion: saved.data.circuits.find((entry) => entry.publicId === existingCircuit.publicId).version, segments: [{ ...body.circuits[0].segments[0], _baseVersion: saved.data.circuits.find((entry) => entry.publicId === existingCircuit.publicId).segments[0].version, lengthMetres: -1 }] }], workItems: saved.data.workItems.map((item) => ({ publicId: item.publicId, _baseVersion: item.version, itemReference: item.itemReference, title: item.title, description: item.description, status: item.status, sequence: item.sequence, leadAssignee: item.leadAssignee, assignees: item.assignees })), consumableRequirements: saved.data.consumableRequirements.map((entry) => ({ publicId: entry.publicId, _baseVersion: entry.version, cataloguePublicId: entry.cataloguePublicId, description: entry.description, quantityRequired: entry.quantityRequired, unit: entry.unit })) };
  const rejected = await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body: invalid });
  assert.equal(rejected.response.status, 422); assert.equal((await request(`/api/work-packages/${loaded.publicId}`)).data.title, 'Transactional fictional package');
  workPackage = saved.data;
});

test('Phase 4 cable schedules validate typed endpoints, media behavior, ODF chains, rack corrections, roles, and conflicts transactionally', async () => {
  const secondDevice = (await request(`/api/sites/${site.publicId}/devices`, { method: 'POST', body: { hostname: 'demo-switch-02', label: 'Demo Switch Two', rackPublicId: rack.publicId, rackUnit: 20, sizeUnits: 1, side: 'front' } })).data;
  const firstPosition = (await request(`/api/sites/${site.publicId}/termination-points/${termination.publicId}/positions`, { method: 'POST', body: { tray: 1, position: 1, label: 'Fictional path one' } })).data;
  const secondPosition = (await request(`/api/sites/${site.publicId}/termination-points/${termination.publicId}/positions`, { method: 'POST', body: { tray: 1, position: 2, label: 'Fictional path two' } })).data;
  const references = await request(`/api/sites/${site.publicId}/cable-reference-data`);
  assert.equal(references.response.status, 200); assert.ok(references.data.devices.some((entry) => entry.publicId === device.publicId)); assert.ok(references.data.terminationPoints[0].positions.length >= 2);

  const directlyCreated = await request('/api/work-packages', { method: 'POST', body: { sitePublicId: site.publicId, packageReference: 'PKG-CABLE-DIRECT', title: 'Direct typed cable creation', status: 'active', workItems: [], consumableRequirements: [], circuits: [{ circuitReference: 'COPPER-DIRECT', media: 'copper', status: 'planned', segments: [{ segmentReference: 'COPPER-DIRECT-A', sequence: 0, fromEndpointMode: 'device', fromDevicePublicId: device.publicId, fromPort: 'eth10', toEndpointMode: 'device', toDevicePublicId: secondDevice.publicId, toPort: 'eth20', fromConnector: 'rj45', toConnector: 'rj45', copperCategory: 'cat6a', copperShielding: 'f-utp', copperPinout: 'straight', lengthMetres: 8 }] }] } });
  assert.equal(directlyCreated.response.status, 201); assert.equal(directlyCreated.data.circuits[0].segments[0].fromDevicePublicId, device.publicId); assert.equal(directlyCreated.data.circuits[0].segments[0].copperShielding, 'f-utp');
  let direct = await request(`/api/work-packages/${directlyCreated.data.publicId}/circuits`, { method: 'POST', body: { circuitReference: 'DAC-DIRECT', media: 'dac', status: 'planned' } });
  const directCircuit = direct.data.circuits.find((entry) => entry.circuitReference === 'DAC-DIRECT');
  direct = await request(`/api/work-packages/${directlyCreated.data.publicId}/circuits/${directCircuit.publicId}/segments`, { method: 'POST', body: { segmentReference: 'DAC-DIRECT-A', fromEndpointMode: 'device', fromDevicePublicId: device.publicId, fromPort: 'et-0/0/1', toEndpointMode: 'device', toDevicePublicId: secondDevice.publicId, toPort: 'p1', fromConnector: 'qsfp28', toConnector: 'qsfp28', dacConnector: 'qsfp28', dacMedia: 'passive', dacDirection: 'a-to-b', lengthMetres: 3 } });
  assert.equal(direct.response.status, 201); const directSegment = direct.data.circuits.find((entry) => entry.publicId === directCircuit.publicId).segments[0];
  const mediaChange = await request(`/api/work-packages/${directlyCreated.data.publicId}/circuits/${directCircuit.publicId}`, { method: 'PUT', body: { circuitReference: directCircuit.circuitReference, description: directCircuit.description, media: 'fibre', status: directCircuit.status, _baseVersion: directCircuit.version } });
  assert.equal(mediaChange.response.status, 409); assert.equal(mediaChange.data.code, 'circuit_media_change_has_segments');
  const directUpdate = segmentEditorPayload(directSegment); delete directUpdate.publicId; directUpdate.dacMedia = 'active';
  direct = await request(`/api/work-packages/${directlyCreated.data.publicId}/circuits/${directCircuit.publicId}/segments/${directSegment.publicId}`, { method: 'PUT', body: directUpdate });
  assert.equal(direct.response.status, 200); assert.equal(direct.data.circuits.find((entry) => entry.publicId === directCircuit.publicId).segments[0].dacMedia, 'active');

  const loaded = (await request(`/api/work-packages/${workPackage.publicId}`)).data;
  const body = packageEditorPayload(loaded);
  const defaults = { lengthMetres: 24, notes: 'Fictional Phase 4 row', fibreType: 'OS2', fibreMode: 'singlemode', fibreSimplex: false, stockLengthMetres: 25, itemType: 'patch-lead', copperCategory: 'cat6a', copperShielding: 'u-ftp', copperPinout: 'straight', dacConnector: 'sfp28', dacMedia: 'passive', dacDirection: 'bidirectional' };
  const endpoint = (mode, record, port = '') => mode === 'device'
    ? { Endpoint: `${record.hostname}:${port}`, EndpointMode: 'device', DevicePublicId: record.publicId, TerminationPositionPublicId: null, Port: port }
    : { Endpoint: `${termination.label} · T${record.tray}/P${record.position}`, EndpointMode: 'odf', DevicePublicId: null, TerminationPositionPublicId: record.publicId, Port: '' };
  const segment = (reference, sequence, from, to, fields = {}) => ({ publicId: crypto.randomUUID(), _baseVersion: 0, segmentReference: reference, sequence, ...Object.fromEntries(Object.entries(endpoint(from[0], from[1], from[2])).map(([key, value]) => [`from${key}`, value])), ...Object.fromEntries(Object.entries(endpoint(to[0], to[1], to[2])).map(([key, value]) => [`to${key}`, value])), fromConnector: fields.fromConnector || 'lc', toConnector: fields.toConnector || 'lc', ...defaults, ...fields });
  const fibreId = crypto.randomUUID(); const fibreFirst = segment('FIBRE-01-A', 0, ['device', device, 'xe-0/0/1'], ['odf', firstPosition], { fibreSimplex: true }); const fibreSecond = segment('FIBRE-01-B', 1, ['odf', firstPosition], ['device', secondDevice, 'xe-0/0/2']);
  const copperId = crypto.randomUUID(); const copper = segment('COPPER-01-A', 0, ['device', device, 'eth1'], ['device', secondDevice, 'eth2'], { fromConnector: 'rj45', toConnector: 'rj45', copperCategory: 'cat6a', copperShielding: 's-ftp', copperPinout: 'crossover', stockLengthMetres: null });
  const dacId = crypto.randomUUID(); const dac = segment('DAC-01-A', 0, ['device', device, 'port1'], ['device', secondDevice, 'port2'], { fromConnector: 'sfp28', toConnector: 'sfp28', dacConnector: 'sfp28', dacMedia: 'active', dacDirection: 'a-to-b', stockLengthMetres: null });
  body.circuits.push(
    { publicId: fibreId, _baseVersion: 0, circuitReference: 'FIBRE-01', description: 'Chained fictional fibre', media: 'fibre', status: 'planned', segments: [fibreFirst, fibreSecond] },
    { publicId: copperId, _baseVersion: 0, circuitReference: 'COPPER-01', description: 'Fictional copper', media: 'copper', status: 'planned', segments: [copper] },
    { publicId: dacId, _baseVersion: 0, circuitReference: 'DAC-01', description: 'Fictional DAC', media: 'dac', status: 'planned', segments: [dac] }
  );
  const newRackPublicId = crypto.randomUUID();
  body.scheduleRackChanges = [{ devicePublicId: secondDevice.publicId, _baseDeviceVersion: secondDevice.version, newRack: { publicId: newRackPublicId, roomPublicId: room.publicId, label: 'RACK-SCHEDULE-01', suiteLine: 'S', suiteLineConfirmed: true, sizeUnits: 47 } }];
  const saved = await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body });
  assert.equal(saved.response.status, 200);
  const savedFibre = saved.data.circuits.find((entry) => entry.publicId === fibreId); const savedCopper = saved.data.circuits.find((entry) => entry.publicId === copperId); const savedDac = saved.data.circuits.find((entry) => entry.publicId === dacId);
  assert.equal(savedFibre.segments[0].toTerminationPositionPublicId, firstPosition.publicId); assert.equal(savedFibre.segments[1].fromTerminationPositionPublicId, firstPosition.publicId); assert.equal(savedFibre.segments[0].fibreSimplex, true); assert.equal(Number(savedFibre.segments[0].stockLengthMetres), 25);
  assert.equal(savedCopper.segments[0].copperShielding, 's-ftp'); assert.equal(savedCopper.segments[0].fromConnector, 'rj45');
  assert.equal(savedDac.segments[0].dacMedia, 'active'); assert.equal(savedDac.segments[0].dacDirection, 'a-to-b');
  assert.equal(savedDac.segments[0].toRackPublicId, newRackPublicId); assert.equal(savedDac.segments[0].toRackLabel, 'RACK-SCHEDULE-01');
  assert.equal((await request(`/api/sites/${site.publicId}/devices`)).data.find((entry) => entry.publicId === secondDevice.publicId).rackPublicId, newRackPublicId);
  assert.ok((await request('/api/audit')).data.some((entry) => entry.action === 'rack.create_from_schedule'));

  const invalid = packageEditorPayload(saved.data); invalid.title = 'Rejected disconnected ODF chain'; invalid.circuits.find((entry) => entry.publicId === fibreId).segments[1].fromTerminationPositionPublicId = secondPosition.publicId; invalid.circuits.find((entry) => entry.publicId === fibreId).segments[1].fromEndpoint = `${termination.label} · T1/P2`;
  const rejected = await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body: invalid });
  assert.equal(rejected.response.status, 422); assert.equal(rejected.data.code, 'odf_chain_disconnected'); assert.notEqual((await request(`/api/work-packages/${loaded.publicId}`)).data.title, invalid.title);
  const stale = packageEditorPayload(saved.data); stale.saveId = crypto.randomUUID(); stale.description = 'Rejected stale cable edit';
  const winner = packageEditorPayload(saved.data); winner.saveId = crypto.randomUUID(); winner.description = 'Winning cable edit'; const winning = await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body: winner }); assert.equal(winning.response.status, 200);
  assert.equal((await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body: stale })).response.status, 409);
  const viewerLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'viewer', password: VIEWER_TEST_PASSWORD } }, null); const viewerCookie = viewerLogin.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(`/api/work-packages/${loaded.publicId}/editor`, { method: 'PUT', body: packageEditorPayload(winning.data) }, viewerCookie)).response.status, 403);
  assert.equal((await request(`/api/sites/${site.publicId}/devices/${device.publicId}?baseVersion=${device.version}`, { method: 'DELETE' })).data.code, 'device_in_cable_schedule');
  assert.equal((await request(`/api/sites/${site.publicId}/termination-points/${termination.publicId}/positions/${firstPosition.publicId}?baseVersion=${firstPosition.version}`, { method: 'DELETE' })).data.code, 'termination_position_in_cable_schedule');
  workPackage = winning.data;
});

test('Phase 3 work-item completion, handover, package locks, reopening, and role rules are enforced', async () => {
  let pack = (await request(`/api/work-packages/${workPackage.publicId}`)).data;
  const item = pack.workItems.find((entry) => entry.itemReference === 'ITEM-TXN-2');
  assert.equal((await request(`/api/work-packages/${pack.publicId}/completion`, { method: 'POST', body: { _baseVersion: pack.version } }, engineerCookie)).response.status, 403);
  assert.equal((await request(`/api/work-packages/${pack.publicId}/completion`, { method: 'POST', body: { _baseVersion: pack.version } })).response.status, 409);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const packagePhoto = await request(`/api/photos/work_package/${pack.publicId}`, { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Fictional package handover', 'X-Photo-Description': 'Initial comment' } });
  const itemPhoto = await request(`/api/photos/work_item/${item.publicId}`, { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Fictional item handover' } });
  assert.equal(packagePhoto.response.status, 201); assert.equal(itemPhoto.response.status, 201);
  const renamed = await request(`/api/photos/${itemPhoto.data.publicId}`, { method: 'PUT', body: { name: 'Renamed fictional handover', description: 'Reviewed comment', _baseVersion: itemPhoto.data.version } });
  assert.equal(renamed.response.status, 200); assert.equal(renamed.data.description, 'Reviewed comment');
  assert.equal((await request(`/api/photos/${itemPhoto.data.publicId}?baseVersion=${renamed.data.version}`, { method: 'DELETE' }, (await request('/api/auth/login', { method: 'POST', body: { username: 'viewer', password: VIEWER_TEST_PASSWORD } }, null)).response.headers.get('set-cookie').split(';')[0])).response.status, 403);
  const completedItem = await request(`/api/work-packages/${pack.publicId}/work-items/${item.publicId}/completion`, { method: 'POST', body: { _baseVersion: item.version } }, engineerCookie);
  assert.equal(completedItem.response.status, 200); const completed = completedItem.data.workItems.find((entry) => entry.publicId === item.publicId); assert.equal(completed.status, 'complete'); assert.ok(completed.completedAt); assert.equal(completed.completedBy.displayName, 'Demo engineer');
  assert.equal((await request(`/api/work-packages/${pack.publicId}/work-items/${item.publicId}`, { method: 'PUT', body: { itemReference: item.itemReference, title: 'Rejected completed edit', description: item.description, status: 'active', sequence: item.sequence, leadAssignee: item.leadAssignee, assignees: item.assignees, _baseVersion: completed.version } })).response.status, 423);
  assert.equal((await request(`/api/photos/${itemPhoto.data.publicId}`, { method: 'PUT', body: { name: 'Rejected completed handover edit', description: '', _baseVersion: renamed.data.version } })).response.status, 423);

  pack = (await request(`/api/work-packages/${pack.publicId}`)).data;
  for (const pending of pack.workItems.filter((entry) => !['complete', 'cancelled'].includes(entry.status))) {
    pack = (await request(`/api/work-packages/${pack.publicId}/work-items/${pending.publicId}/completion`, { method: 'POST', body: { _baseVersion: pending.version } })).data;
  }
  const locked = await request(`/api/work-packages/${pack.publicId}/completion`, { method: 'POST', body: { _baseVersion: pack.version } });
  assert.equal(locked.response.status, 200); assert.equal(locked.data.status, 'complete'); assert.ok(locked.data.completedBy);
  assert.equal((await request(`/api/work-packages/${pack.publicId}/editor`, { method: 'PUT', body: { saveId: crypto.randomUUID(), _baseVersion: locked.data.version, packageReference: locked.data.packageReference, externalReference: locked.data.externalReference, projectReference: locked.data.projectReference, title: locked.data.title, description: locked.data.description, status: 'active', leadAssignee: locked.data.leadAssignee, assignees: locked.data.assignees, workItems: [], circuits: [], consumableRequirements: [] } })).response.status, 423);
  assert.equal((await request(`/api/photos/work_package/${pack.publicId}`, { method: 'POST', body: bytes, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Name': 'Rejected after completion' } })).response.status, 423);
  assert.equal((await request(`/api/photos/${packagePhoto.data.publicId}?baseVersion=${packagePhoto.data.version}`, { method: 'DELETE' })).response.status, 423);
  assert.equal((await request(`/api/work-packages/${pack.publicId}/completion`, { method: 'DELETE', body: { _baseVersion: locked.data.version, status: 'active' } }, managerCookie)).response.status, 403);
  const reopened = await request(`/api/work-packages/${pack.publicId}/completion`, { method: 'DELETE', body: { _baseVersion: locked.data.version, status: 'active' } });
  assert.equal(reopened.response.status, 200); assert.equal(reopened.data.status, 'active'); assert.equal(reopened.data.completedAt, null);
  assert.equal((await request(`/api/photos/${packagePhoto.data.publicId}?baseVersion=${packagePhoto.data.version}`, { method: 'DELETE' })).response.status, 204);
  workPackage = reopened.data;
});

test('Phase 3 search ranks package, project, and linked work-item matches and groups completion state', async () => {
  const packageMatch = (await request(`/api/search?q=${encodeURIComponent(workPackage.packageReference)}`)).data[0];
  assert.equal(packageMatch.publicId, workPackage.publicId); assert.equal(packageMatch.matchType, 'package-reference'); assert.equal(packageMatch.group, 'active');
  const projectMatch = (await request('/api/search?q=PROJECT-PHASE-THREE')).data[0]; assert.equal(projectMatch.matchType, 'project');
  const childMatch = (await request('/api/search?q=Transactional%20child')).data[0]; assert.equal(childMatch.matchType, 'content'); assert.ok(childMatch.matchedWorkItems.some((item) => item.itemReference === 'ITEM-TXN-2'));
});

test('generic JSON and CSV exports are available without plugins and neutralize formula cells', async () => {
  const json = await request(`/api/work-packages/${workPackage.publicId}/export?format=json`);
  assert.equal(json.response.status, 200); assert.match(json.response.headers.get('content-disposition'), /attachment/);
  const csv = await request(`/api/work-packages/${workPackage.publicId}/export?format=csv`);
  assert.equal(csv.response.status, 200); assert.match(csv.data, /record_type/); assert.match(csv.data, /SEGMENT-DEMO-1/); assert.match(csv.data, /Transactional labels/);
  const printable = await request(`/api/work-packages/${workPackage.publicId}/export?format=print`);
  assert.equal(printable.response.status, 200); assert.match(printable.data, /Transactional fictional package/); assert.match(printable.data, /Save work package|Work items/);
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
