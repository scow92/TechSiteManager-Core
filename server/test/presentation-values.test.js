'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-presentation-values-'));
process.env.DATA_DIR = dataDir;
process.env.DB_FILE = path.join(dataDir, 'test.db');
process.env.NODE_ENV = 'test';

const db = require('../db/knex');
const { loadPlugins } = require('../plugins/loader');
const root = path.join(__dirname, '..', '..');
const registry = loadPlugins({ configFile: path.join(root, 'config', 'fictional-plugin.json'), searchRoot: root });
const app = require('../app')(registry);
let server; let base; let adminCookie; let viewerCookie; let packageId;

async function request(url, options = {}, cookie = adminCookie) {
  const response = await fetch(`${base}${url}`, { method: options.method || 'GET', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined });
  return { response, data: response.status === 204 ? null : await response.json() };
}

test.before(async () => {
  await db.migrate.latest();
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`;
  const administratorPassphrase = 'fictional-profile-admin-password';
  const viewerPassphrase = 'fictional-profile-viewer-password';
  const setup = await request('/api/auth/setup', { method: 'POST', body: { username: 'profile-admin', password: administratorPassphrase, displayName: 'Profile Admin' } }, null);
  adminCookie = setup.response.headers.get('set-cookie').split(';')[0];
  await request('/api/auth/users', { method: 'POST', body: { username: 'profile-viewer', password: viewerPassphrase, displayName: 'Profile Viewer', role: 'viewer', active: true } });
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'profile-viewer', password: viewerPassphrase } }, null); viewerCookie = login.response.headers.get('set-cookie').split(';')[0];
  const site = await request('/api/sites', { method: 'POST', body: { code: 'PROFILE-01', name: 'Fictional Profile Lab' } });
  const pack = await request('/api/work-packages', { method: 'POST', body: { sitePublicId: site.data.publicId, packageReference: 'PLAN-PROFILE-1', title: 'Fictional presentation plan', status: 'planned', assignees: [], workItems: [], circuits: [], consumableRequirements: [] } }); packageId = pack.data.publicId;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); await db.destroy(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('authenticated clients receive only the validated active presentation descriptor', async () => {
  const result = await request('/api/presentation-profiles/work-package', {}, viewerCookie);
  assert.equal(result.response.status, 200); assert.equal(result.data.terms.singular, 'Facility plan');
  assert.equal(result.data.views[0].component, 'record-form'); assert.equal(JSON.stringify(result.data).includes('function'), false);
});

test('core persists typed plugin-scoped values with authorization and optimistic concurrency', async () => {
  const pathName = `/api/extension-values/work-package/${packageId}/zone-code`;
  const rejected = await request(pathName, { method: 'PUT', body: { presentationId: 'example.fictional-facility.presentation-v1', value: 'ZONE-A', _baseVersion: 0 } }, viewerCookie);
  assert.equal(rejected.response.status, 403);
  const created = await request(pathName, { method: 'PUT', body: { presentationId: 'example.fictional-facility.presentation-v1', value: 'ZONE-A', _baseVersion: 0 } });
  assert.equal(created.response.status, 200); assert.equal(created.data.version, 1);
  const stale = await request(pathName, { method: 'PUT', body: { presentationId: 'example.fictional-facility.presentation-v1', value: 'ZONE-B', _baseVersion: 0 } });
  assert.equal(stale.response.status, 409);
  const pack = await request(`/api/work-packages/${packageId}`);
  assert.deepEqual(pack.data.extensions['extension.example.fictional-facility.zone-code'], { value: 'ZONE-A', version: 1 });
});

test('extension writes reject undeclared and cross-namespace fields', async () => {
  const missing = await request(`/api/extension-values/work-package/${packageId}/unknown`, { method: 'PUT', body: { presentationId: 'example.fictional-facility.presentation-v1', value: 'x', _baseVersion: 0 } });
  assert.equal(missing.response.status, 404);
});
