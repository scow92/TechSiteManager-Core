'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');

test('service worker shell exactly covers HTML static dependencies and excludes APIs', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((match) => match[1]).filter((url) => !url.startsWith('/api/'));
  for (const url of urls) assert.match(worker, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const moduleFiles = fs.readdirSync(path.join(root, 'public', 'js'), { recursive: true })
    .filter((file) => String(file).endsWith('.js') && !['idb.js', 'offline.js'].includes(String(file)))
    .map((file) => `/js/${String(file).replaceAll(path.sep, '/')}`);
  for (const url of moduleFiles) assert.match(worker, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(worker, /techsitemanager-shell-v15/);
  assert.doesNotMatch(worker, /\/js\/app\.js/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(worker, /\/api\/[A-Za-z]/);
});

test('service worker uses network-first shell reads and never handles cross-origin requests', async () => {
  const listeners = {};
  const cacheWrites = [];
  const context = {
    URL,
    Promise,
    fetch: async () => ({ ok: true, clone() { return this; } }),
    caches: { open: async () => ({ addAll: async () => {}, put: async (request) => cacheWrites.push(request.url) }), keys: async () => [], match: async () => null, delete: async () => true },
    self: { location: { origin: 'https://example.invalid' }, clients: { claim: async () => {} }, addEventListener(type, handler) { listeners[type] = handler; } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'), context);
  let responsePromise = null;
  listeners.fetch({ request: { url: 'https://example.invalid/api/sites', method: 'GET' }, respondWith(value) { responsePromise = value; } });
  assert.equal(responsePromise, null);
  listeners.fetch({ request: { url: 'https://different.invalid/main.js', method: 'GET' }, respondWith(value) { responsePromise = value; } });
  assert.equal(responsePromise, null);
  listeners.fetch({ request: { url: 'https://example.invalid/js/main.js', method: 'GET' }, respondWith(value) { responsePromise = value; } });
  await responsePromise; await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(cacheWrites, ['https://example.invalid/js/main.js']);
});

test('IndexedDB schema separates disposable caches from durable queues', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'js', 'idb.js'), 'utf8');
  for (const store of ['reference-cache', 'dirty-work-packages', 'operation-queue', 'dead-letters', 'pending-logout', 'id-remaps', 'operation-completions', 'navigation-state']) assert.match(source, new RegExp(store));
  assert.match(source, /const VERSION = 4/);
  assert.match(source, /tx\.oncomplete/);
  assert.match(source, /retryDeadLetter/);
  assert.doesNotMatch(source, /localStorage/);
});

test('PWA state is user-scoped and notification payloads are bounded', () => {
  const pwa = fs.readFileSync(path.join(root, 'public', 'js', 'pwa.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
  assert.match(pwa, /userPublicId/); assert.match(pwa, /Notification\.requestPermission/); assert.match(pwa, /pushManager\.subscribe/); assert.match(pwa, /unsubscribe/);
  assert.match(worker, /addEventListener\('push'/); assert.match(worker, /title\.length <= 120/); assert.match(worker, /body\.length <= 240/); assert.match(worker, /notificationclick/);
});

test('offline boot retries durable logout before restoring an authenticated view', () => {
  const source = ['main.js', 'offline-ui.js'].map((file) => fs.readFileSync(path.join(root, 'public', 'js', file), 'utf8')).join('\n');
  assert.match(source, /recoverPendingLogout\(\)\.then/);
  assert.match(source, /response\.status === 204 \|\| response\.status === 401/);
  assert.match(source, /Keep the durable marker until the server session is revoked/);
});

test('browser loads no provider scripts and renders dynamic values with DOM APIs', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const source = fs.readdirSync(path.join(root, 'public', 'js'), { recursive: true })
    .filter((file) => String(file).endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(root, 'public', 'js', file), 'utf8')).join('\n');
  assert.doesNotMatch(html, /plugin|provider/i);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|eval\s*\(/);
  assert.match(source, /document\.createElement/);
  assert.doesNotMatch(source, /import\s*\(.*plugin/i);
});
