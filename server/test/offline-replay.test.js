'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classification, replay } = require('../../public/js/offline');

function memoryStore(initial = {}) {
  const stores = new Map(Object.entries({ 'operation-queue': [], 'dead-letters': [], 'id-remaps': [], ...initial }));
  return {
    async all(name) { return [...stores.get(name)]; },
    async put(name, value) {
      const values = stores.get(name); const key = name === 'id-remaps' ? 'temporaryId' : 'id';
      const index = values.findIndex((entry) => entry[key] === value[key]);
      if (index === -1) values.push(value); else values[index] = value;
    },
    async completeOperation(id, remap) {
      stores.set('operation-queue', stores.get('operation-queue').filter((entry) => entry.id !== id));
      if (remap) await this.put('id-remaps', remap);
    },
    async rejectOperation(operation, rejection) {
      stores.set('operation-queue', stores.get('operation-queue').filter((entry) => entry.id !== operation.id));
      await this.put('dead-letters', { ...operation, ...rejection });
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
  const second = operation('b', { createdAt: 2, path: `/sites/${temporaryId}/racks`, body: JSON.stringify({ sitePublicId: temporaryId }), dependsOn: ['a'], requiredTemporaryIds: [temporaryId] });
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
