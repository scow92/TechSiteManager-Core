'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const CONTRACT_PASSWORD = ['fictional', 'package', 'contract', 'credential'].join('-');
let instance; let browser; let administrator; let engineer; let viewer; let packagePublicId;

function availablePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); }); }); }

async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-package-contract-')); const port = await availablePort();
  const child = spawn(process.execPath, ['server/server.js'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, DB_FILE: path.join(dataDir, 'contract.db'), PLUGIN_CONFIG_FILE: path.join(root, 'config', 'zero-plugins.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostics = ''; child.stdout.on('data', (chunk) => { diagnostics += chunk; }); child.stderr.on('data', (chunk) => { diagnostics += chunk; }); const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) { if (child.exitCode !== null) throw new Error(`Server exited: ${diagnostics.slice(-500)}`); try { if ((await fetch(`${base}/api/health`)).ok) return { base, child, dataDir }; } catch { /* wait */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error(`Server was not ready: ${diagnostics.slice(-500)}`);
}

async function stopServer() { if (!instance) return; if (instance.child.exitCode === null) { instance.child.kill('SIGTERM'); await new Promise((resolve) => { instance.child.once('exit', resolve); setTimeout(resolve, 3000); }); } fs.rmSync(instance.dataDir, { recursive: true, force: true }); }

async function login(username) { const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(7000); await page.goto(instance.base); await page.getByLabel('Username').fill(username); await page.getByLabel('Password').fill(CONTRACT_PASSWORD); await page.getByRole('button', { name: 'Sign in' }).click(); await page.getByRole('heading', { name: 'Home', exact: true }).waitFor(); return { context, page }; }

test.before(async () => {
  instance = await startServer(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(7000); await page.goto(instance.base);
  await page.getByLabel('Username').fill('administrator'); await page.getByLabel('Password').fill(CONTRACT_PASSWORD); await page.getByLabel('Display name').fill('Fictional Package Administrator'); await page.getByRole('button', { name: 'Create account' }).click(); await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  for (const role of ['engineer', 'viewer']) assert.equal(await page.evaluate(async ({ role, password }) => (await fetch('/api/auth/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: role, password, displayName: `Fictional Package ${role}`, role, active: true }) })).status, { role, password: CONTRACT_PASSWORD }), 201);
  packagePublicId = await page.evaluate(async () => {
    const headers = { 'Content-Type': 'application/json' };
    const site = await (await fetch('/api/sites', { method: 'POST', headers, body: JSON.stringify({ code: 'PACK-DEMO-01', name: 'Fictional Package Lab' }) })).json();
    const room = await (await fetch(`/api/sites/${site.publicId}/rooms`, { method: 'POST', headers, body: JSON.stringify({ name: 'Fictional Package Suite' }) })).json();
    const rack = await (await fetch(`/api/sites/${site.publicId}/racks`, { method: 'POST', headers, body: JSON.stringify({ label: 'PACK-RACK-01', roomPublicId: room.publicId }) })).json();
    await fetch(`/api/sites/${site.publicId}/devices`, { method: 'POST', headers, body: JSON.stringify({ hostname: 'package-device-a', rackPublicId: rack.publicId, rackUnit: 10, sizeUnits: 1, side: 'front' }) });
    await fetch(`/api/sites/${site.publicId}/devices`, { method: 'POST', headers, body: JSON.stringify({ hostname: 'package-device-b', rackPublicId: rack.publicId, rackUnit: 20, sizeUnits: 1, side: 'front' }) });
    return (await (await fetch('/api/work-packages', { method: 'POST', headers, body: JSON.stringify({ sitePublicId: site.publicId, packageReference: 'PKG-PHASE-03', projectReference: 'PROJECT-AURORA', title: 'Fictional package contract', description: '', status: 'active', leadAssignee: 'engineer', assignees: ['engineer'], workItems: [], circuits: [], consumableRequirements: [] }) })).json()).publicId;
  });
  administrator = { context, page }; engineer = await login('engineer'); viewer = await login('viewer');
});

test.after(async () => { await Promise.all([administrator, engineer, viewer].filter(Boolean).map(({ context }) => context.close())); if (browser) await browser.close(); await stopServer(); });

test('transactional browser editor debounces nested changes, preserves references, and flushes before navigation', async () => {
  const page = engineer.page; await page.goto(`${instance.base}/#package/${packagePublicId}/details`); await page.getByRole('heading', { name: 'PKG-PHASE-03', exact: true }).waitFor();
  await page.getByLabel('Title').fill('Fictional transactional package'); await page.getByLabel('Assignees (comma separated)').fill('engineer, administrator');
  await page.locator('[data-package-view="work-items"]').click(); await page.getByRole('button', { name: 'Add work item' }).click();
  const itemForm = page.locator('form.child-editor'); await itemForm.getByLabel('Item reference').fill('ITEM-PHASE-03'); await itemForm.getByLabel('Title').fill('Install fictional containment'); await itemForm.getByLabel('Lead assignee').fill('engineer'); await itemForm.getByLabel('Assignees (comma separated)').fill('engineer');
  await page.locator('[data-package-view="connections"]').click(); await page.getByRole('button', { name: 'Add Fibre row' }).click();
  const cableRow = page.locator('.cable-grid tbody tr').first(); await cableRow.getByLabel('Circuit reference').fill('CIRCUIT-PHASE-03'); await cableRow.getByLabel('Segment reference').fill('SEGMENT-PHASE-03'); await cableRow.getByLabel('from port').fill('xe-0/0/1'); await cableRow.getByLabel('to port').fill('xe-0/0/2'); await cableRow.getByLabel('Length metres').fill('18.5');
  await page.locator('[data-package-view="consumables"]').click(); await page.getByRole('button', { name: 'Add consumable requirement' }).click(); await page.getByLabel('description').fill('Fictional labels'); await page.getByLabel('quantityRequired').fill('6');
  await page.evaluate(async () => { const store = await import('/js/work-package-store.js'); const state = store.packageSaveState(); globalThis.__phase3Refs = { pack: state.pack, item: state.pack.workItems[0], circuit: state.pack.circuits[0], segment: state.pack.circuits[0].segments[0], requirement: state.pack.consumableRequirements[0] }; });
  await page.locator('[data-package-view="details"]').click(); await page.getByLabel('Package reference').waitFor();
  const persisted = await page.evaluate(async (publicId) => await (await fetch(`/api/work-packages/${publicId}`)).json(), packagePublicId);
  assert.equal(persisted.title, 'Fictional transactional package'); assert.equal(persisted.workItems[0].itemReference, 'ITEM-PHASE-03'); assert.equal(persisted.circuits[0].segments[0].segmentReference, 'SEGMENT-PHASE-03'); assert.equal(persisted.consumableRequirements[0].quantityRequired, 6);
  assert.deepEqual(await page.evaluate(async () => { const store = await import('/js/work-package-store.js'); const state = store.packageSaveState(); return { pack: state.pack === globalThis.__phase3Refs.pack, item: state.pack.workItems[0] === globalThis.__phase3Refs.item, circuit: state.pack.circuits[0] === globalThis.__phase3Refs.circuit, segment: state.pack.circuits[0].segments[0] === globalThis.__phase3Refs.segment, requirement: state.pack.consumableRequirements[0] === globalThis.__phase3Refs.requirement }; }), { pack: true, item: true, circuit: true, segment: true, requirement: true });
});

test('offline package drafts coalesce, survive navigation, replay once, and clear durable dirty state', async () => {
  const page = engineer.page; await page.goto(`${instance.base}/#package/${packagePublicId}/details`); await page.evaluate(() => { globalThis.__phase3Fetch = globalThis.fetch; globalThis.fetch = (input, init) => String(input).includes('/editor') && init?.method === 'PUT' ? Promise.reject(new TypeError('Fictional offline package save')) : globalThis.__phase3Fetch(input, init); });
  try {
    await page.getByLabel('Description').fill('First fictional offline draft'); await page.waitForTimeout(700); await page.getByLabel('Description').fill('Final fictional offline package draft'); await page.waitForFunction(() => globalThis.OfflineStore.all('operation-queue').then((entries) => entries.some((entry) => entry.operationKey?.startsWith('work-package:'))));
    await page.locator('[data-route="home"]').click(); await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    const queued = await page.evaluate(() => globalThis.OfflineStore.all('operation-queue').then((entries) => entries.filter((entry) => entry.operationKey?.startsWith('work-package:')))); assert.equal(queued.length, 1); assert.equal(JSON.parse(queued[0].body).description, 'Final fictional offline package draft');
    assert.equal(await page.evaluate((publicId) => globalThis.OfflineStore.get('dirty-work-packages', publicId).then(Boolean), packagePublicId), true);
    await page.evaluate(() => { globalThis.fetch = globalThis.__phase3Fetch; delete globalThis.__phase3Fetch; }); await page.evaluate(() => globalThis.OfflineSync.replay(globalThis.OfflineStore, globalThis.fetch));
    await page.waitForFunction((publicId) => globalThis.OfflineStore.all('operation-queue').then((entries) => entries.length === 0).then(async (empty) => empty && (await (await fetch(`/api/work-packages/${publicId}`)).json()).description === 'Final fictional offline package draft'), packagePublicId);
    assert.equal(await page.evaluate((publicId) => globalThis.OfflineStore.get('dirty-work-packages', publicId), packagePublicId), undefined);
  } finally { await page.evaluate(() => { if (globalThis.__phase3Fetch) { globalThis.fetch = globalThis.__phase3Fetch; delete globalThis.__phase3Fetch; } }); }
});

test('a concurrent package edit pauses navigation and can be explicitly rebased', async () => {
  const page = engineer.page; await page.goto(`${instance.base}/#package/${packagePublicId}/details`); await page.getByLabel('Package reference').waitFor();
  await administrator.page.evaluate(async (publicId) => {
    const pack = await (await fetch(`/api/work-packages/${publicId}`)).json();
    const response = await fetch(`/api/work-packages/${publicId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _baseVersion: pack.version, packageReference: pack.packageReference, externalReference: pack.externalReference, projectReference: pack.projectReference, title: 'Fictional concurrent administrator title', description: pack.description, status: pack.status, leadAssignee: pack.leadAssignee, assignees: pack.assignees }) });
    if (!response.ok) throw new Error(`Concurrent update failed: ${response.status}`);
  }, packagePublicId);
  await page.getByLabel('Description').fill('Fictional engineer draft after concurrent change'); await page.locator('[data-route="home"]').click();
  await page.getByText('This package changed elsewhere.', { exact: true }).waitFor(); assert.match(page.url(), /#package\//);
  await page.getByRole('button', { name: 'Reapply draft' }).click(); await page.getByText('All changes saved', { exact: true }).waitFor();
  await page.locator('[data-route="home"]').click(); await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  assert.equal(await page.evaluate(async (publicId) => (await (await fetch(`/api/work-packages/${publicId}`)).json()).description, packagePublicId), 'Fictional engineer draft after concurrent change');
});

test('work-item assignment/completion, handover galleries, admin locking, viewer state, search, print, and offline lock rejection work end to end', async () => {
  const page = engineer.page; await page.goto(`${instance.base}/#package/${packagePublicId}/handover`);
  try { await page.getByRole('heading', { name: 'PKG-PHASE-03', exact: true }).waitFor(); } catch (error) { throw new Error(`Package did not render at ${page.url()}: ${await page.locator('body').innerText()}\n${error}`); }
  const packageSection = page.locator('.details-section').filter({ has: page.getByText('Package handover', { exact: true }) }); await packageSection.getByLabel('Photo').setInputFiles({ name: 'package.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }); await packageSection.getByLabel('Name').fill('Fictional package evidence'); await packageSection.getByLabel('Comment').fill('Package handover comment'); await packageSection.getByRole('button', { name: 'Upload' }).click(); await page.getByText('Fictional package evidence', { exact: true }).waitFor();
  const itemSection = page.locator('.details-section').filter({ has: page.getByText('ITEM-PHASE-03', { exact: true }) }); await itemSection.getByLabel('Photo').setInputFiles({ name: 'item.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }); await itemSection.getByLabel('Name').fill('Fictional item evidence'); await itemSection.getByRole('button', { name: 'Upload' }).click(); await page.getByText('Fictional item evidence', { exact: true }).waitFor();
  await page.locator('[data-package-view="work-items"]').click(); await page.getByRole('button', { name: 'Complete work item' }).click(); await page.getByRole('button', { name: 'Clear completion' }).waitFor();
  await viewer.page.goto(`${instance.base}/#package/${packagePublicId}/handover`); await viewer.page.getByText('Fictional package evidence', { exact: true }).waitFor(); assert.equal(await viewer.page.getByRole('button', { name: /Upload|Delete|Save comment/ }).count(), 0);
  await administrator.page.goto(`${instance.base}/#package/${packagePublicId}/details`); await administrator.page.getByRole('button', { name: 'Complete and lock package' }).click(); await administrator.page.getByText(/Completed .* by Fictional Package Administrator/).waitFor();
  await page.goto(`${instance.base}/#package/${packagePublicId}/details`); await page.getByText(/Reopen before editing/).waitFor(); assert.equal(await page.getByRole('button', { name: /Add|Remove|Upload|Complete work item/ }).count(), 0);
  const lockEvidence = await page.evaluate(async (publicId) => {
    const pack = await (await fetch(`/api/work-packages/${publicId}`)).json(); const operation = { id: crypto.randomUUID(), path: `/work-packages/${publicId}/editor`, method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saveId: crypto.randomUUID(), _baseVersion: pack.version, packageReference: pack.packageReference, externalReference: pack.externalReference, projectReference: pack.projectReference, title: 'Rejected queued edit', description: pack.description, status: 'active', leadAssignee: pack.leadAssignee, assignees: pack.assignees, workItems: [], circuits: [], consumableRequirements: [] }), createdAt: Date.now(), attempts: 0, dependsOn: [], temporaryId: null, requiredTemporaryIds: [], operationKey: `work-package:${publicId}`, entityType: 'work_package', entityPublicId: publicId, dirtyPackagePublicId: publicId };
    await globalThis.OfflineStore.put('dirty-work-packages', { publicId, snapshot: pack, updatedAt: Date.now() }); await globalThis.OfflineStore.put('operation-queue', operation); await globalThis.OfflineSync.replay(globalThis.OfflineStore, globalThis.fetch); return { dead: await globalThis.OfflineStore.all('dead-letters'), dirty: await globalThis.OfflineStore.get('dirty-work-packages', publicId) };
  }, packagePublicId);
  assert.equal(lockEvidence.dead.at(-1).serverCode, 'work_package_complete'); assert.ok(lockEvidence.dirty);
  const search = await administrator.page.evaluate(async () => await (await fetch('/api/search?q=PROJECT-AURORA')).json()); assert.equal(search[0].group, 'completed'); assert.equal(search[0].matchType, 'project');
  const printable = await administrator.page.evaluate(async (publicId) => ({ status: (await fetch(`/api/work-packages/${publicId}/export?format=print`)).status }), packagePublicId); assert.equal(printable.status, 200);
  await administrator.page.getByRole('button', { name: 'Reopen work package' }).click(); await administrator.page.getByRole('button', { name: 'Complete and lock package' }).waitFor();
});
