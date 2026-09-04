'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classification, replay } = require('../../public/js/offline');

function memoryStore(initial = {}) {
  const stores = new Map(Object.entries({ 'operation-queue': [], 'dead-letters': [], 'id-remaps': [], 'operation-completions': [], ...initial }));
  return {
    async all(name) { return [...stores.get(name)]; },
    async put(name, value) {
      const values = stores.get(name); const key = name === 'id-remaps' ? 'temporaryId' : 'id';
      const index = values.findIndex((entry) => entry[key] === value[key]);
      if (index === -1) values.push(value); else values[index] = value;
    },
    async completeOperation(id, remap) {
      stores.set('operation-queue', stores.get('operation-queue').filter((entry) => entry.id !== id));
      await this.put('operation-completions', { id, completedAt: Date.now() });
      if (remap) await this.put('id-remaps', remap);
    },
    async updateOperation(id, changes) {
      if (stores.get('operation-completions').some((entry) => entry.id === id)) return;
      const values = stores.get('operation-queue');
      const index = values.findIndex((entry) => entry.id === id);
      if (index !== -1) values[index] = { ...values[index], ...changes };
    },
    async rejectOperation(operation, rejection) {
      stores.set('operation-queue', stores.get('operation-queue').filter((entry) => entry.id !== operation.id));
      await this.put('dead-letters', { ...operation, ...rejection });
      await this.put('operation-completions', { id: operation.id, completedAt: Date.now() });
    }
  };
}

function operation(id, overrides = {}) {
  return { id, path: '/sites', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', createdAt: 1, attempts: 0, dependsOn: [], temporaryId: null, requiredTemporaryIds: [], ...overrides };
}

function response(status, body = {}) {
  return { status, ok: status >= 200 && status < 300, clone() { return this; }, async json() { return body; } };
}

test('offline response classification is conservative', () => {
  for (const status of [408, 425, 429, 500, 503]) assert.equal(classification(status), 'transient');
  for (const status of [400, 403, 404, 409, 422, 428]) assert.equal(classification(status), 'permanent');
  for (const status of [0, 401, 407, 418]) assert.equal(classification(status), 'unclassified');
});

test('FIFO replay durably remaps a temporary identity for dependent operations', async () => {
  const temporaryId = 'urn:offline:fictional-site';
  const first = operation('a', { temporaryId });
  const second = operation('b', { createdAt: 2, path: `/sites/${encodeURIComponent(temporaryId)}/racks`, body: JSON.stringify({ sitePublicId: temporaryId }), dependsOn: ['a'], requiredTemporaryIds: [temporaryId] });
  const store = memoryStore({ 'operation-queue': [second, first] }); const requests = [];
  const result = await replay(store, async (url, options) => {
    requests.push({ url, body: options.body });
    return requests.length === 1 ? response(201, { publicId: '11111111-1111-4111-8111-111111111111' }) : response(201, { publicId: '22222222-2222-4222-8222-222222222222' });
  }, () => 10);
  assert.equal(result.state, 'complete');
  assert.deepEqual(requests, [
    { url: '/api/sites', body: '{}' },
    { url: '/api/sites/11111111-1111-4111-8111-111111111111/racks', body: JSON.stringify({ sitePublicId: '11111111-1111-4111-8111-111111111111' }) }
  ]);
  assert.equal((await store.all('operation-queue')).length, 0);
  assert.equal((await store.all('id-remaps'))[0].temporaryId, temporaryId);
});

test('catalogue identities embedded in dirty package snapshots remap without loss', async () => {
  const temporaryId = 'urn:offline:fictional-consumable';
  const catalogue = operation('catalogue-create', { path: '/catalogue/consumables', method: 'POST', body: JSON.stringify({ catalogueReference: 'CONS-OFFLINE-FICTIONAL' }), temporaryId });
  const packageSave = operation('package-save', {
    createdAt: 2,
    path: '/work-packages/22222222-2222-4222-8222-222222222222/editor',
    method: 'PUT',
    body: JSON.stringify({ consumableRequirements: [{ cataloguePublicId: temporaryId, quantityRequired: 6 }] }),
    dependsOn: ['catalogue-create'],
    requiredTemporaryIds: [temporaryId],
    dirtyPackagePublicId: '22222222-2222-4222-8222-222222222222'
  });
  const store = memoryStore({ 'operation-queue': [packageSave, catalogue] }); const requests = [];
  const result = await replay(store, async (url, options) => {
    requests.push({ url, body: options.body });
    return requests.length === 1 ? response(201, { publicId: '33333333-3333-4333-8333-333333333333' }) : response(200, { publicId: packageSave.dirtyPackagePublicId, version: 4 });
  }, () => 15);
  assert.equal(result.state, 'complete'); assert.equal(requests.length, 2);
  assert.match(requests[1].body, /33333333-3333-4333-8333-333333333333/); assert.doesNotMatch(requests[1].body, /urn:offline:/);
  assert.equal((await store.all('operation-queue')).length, 0); assert.equal((await store.all('dead-letters')).length, 0);
});

test('transient, network, and unclassified failures retain the operation and stop FIFO replay', async () => {
  for (const failure of [response(503), response(401), new Error('offline')]) {
    const store = memoryStore({ 'operation-queue': [operation('a'), operation('b', { createdAt: 2 })] }); let calls = 0;
    const result = await replay(store, async () => { calls += 1; if (failure instanceof Error) throw failure; return failure; }, () => 20);
    assert.equal(calls, 1); assert.equal((await store.all('operation-queue')).length, 2); assert.equal((await store.all('dead-letters')).length, 0);
    assert.equal((await store.all('operation-queue'))[0].attempts, 1);
    assert.notEqual(result.state, 'complete');
  }
});

test('permanent rejection becomes recoverable dead letters and rejects dependants without sending them', async () => {
  const store = memoryStore({ 'operation-queue': [operation('a'), operation('b', { createdAt: 2, dependsOn: ['a'] })] }); let calls = 0;
  const result = await replay(store, async () => { calls += 1; return response(422); }, () => 30);
  assert.equal(result.state, 'complete'); assert.equal(calls, 1);
  assert.equal((await store.all('operation-queue')).length, 0);
  assert.deepEqual((await store.all('dead-letters')).map((entry) => [entry.id, entry.status, entry.reason]), [['a', 422, 'server_rejected'], ['b', 424, 'dependency_rejected']]);
});

test('optimistic conflicts retain scoped server details with the rejected draft', async () => {
  const draft = operation('site-edit', { path: '/sites/fictional-site', method: 'PUT', body: JSON.stringify({ name: 'Retained local draft', _baseVersion: 2 }), operationKey: 'site:update:fictional-site', entityType: 'site', entityPublicId: 'fictional-site' });
  const store = memoryStore({ 'operation-queue': [draft] });
  const result = await replay(store, async () => response(409, { code: 'version_conflict', error: 'The site changed since it was loaded', serverVersion: 3 }), () => 40);
  assert.equal(result.state, 'complete');
  assert.equal((await store.all('operation-queue')).length, 0);
  const [rejected] = await store.all('dead-letters');
  assert.equal(rejected.reason, 'version_conflict');
  assert.equal(rejected.serverCode, 'version_conflict');
  assert.equal(rejected.serverVersion, 3);
  assert.match(rejected.body, /Retained local draft/);
});

test('concurrent replay requests serialize and send each operation once', async () => {
  const store = memoryStore({ 'operation-queue': [operation('serialized')] });
  let calls = 0;
  const request = async () => { calls += 1; await new Promise((resolve) => setImmediate(resolve)); return response(200); };
  const results = await Promise.all([replay(store, request), replay(store, request)]);
  assert.deepEqual(results.map((result) => result.state), ['complete', 'complete']);
  assert.equal(calls, 1);
  assert.equal((await store.all('operation-queue')).length, 0);
});
