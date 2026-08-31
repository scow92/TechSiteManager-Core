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
const SITE_CONTRACT_CREDENTIAL = ['fictional', 'site', 'contract', 'credential'].join('-');
let instance;
let browser;
let administrator;
let engineer;
let viewer;
let sitePublicId;

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-site-contract-'));
  const port = await availablePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATA_DIR: dataDir,
      DB_FILE: path.join(dataDir, 'contract.db'),
      PLUGIN_CONFIG_FILE: path.join(root, 'config', 'zero-plugins.json')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let diagnostics = '';
  child.stdout.on('data', (chunk) => { diagnostics += chunk.toString(); });
  child.stderr.on('data', (chunk) => { diagnostics += chunk.toString(); });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before readiness: ${diagnostics.slice(-500)}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) return { base, child, dataDir };
    } catch { /* retry while the throwaway server starts */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill('SIGTERM');
  throw new Error(`Server did not become ready: ${diagnostics.slice(-500)}`);
}

async function stopServer() {
  if (!instance) return;
  if (instance.child.exitCode === null) {
    instance.child.kill('SIGTERM');
    await new Promise((resolve) => {
      instance.child.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
  }
  fs.rmSync(instance.dataDir, { recursive: true, force: true });
}

async function login(role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(instance.base);
  await page.getByLabel('Username').fill(role);
  await page.getByLabel('Password').fill(SITE_CONTRACT_CREDENTIAL);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
  return { context, page };
}

async function beginSiteEdit(page) {
  await page.goto(`${instance.base}/#site/${sitePublicId}`);
  await page.reload();
  await page.getByRole('heading', { name: /SITE-DEMO-01/ }).waitFor();
  await page.getByRole('button', { name: 'Edit site' }).click();
}

async function openSiteSection(page, section) {
  await page.evaluate(({ publicId, selected }) => { globalThis.location.hash = `site/${publicId}/${selected}`; }, { publicId: sitePublicId, selected: section });
  await page.waitForURL(`**/#site/${sitePublicId}/${section}`);
  await page.reload();
}

test.before(async () => {
  instance = await startServer();
  browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext();
  const page = await adminContext.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(instance.base);
  await page.getByLabel('Username').fill('administrator');
  await page.getByLabel('Password').fill(SITE_CONTRACT_CREDENTIAL);
  await page.getByLabel('Display name').fill('Fictional Administrator');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

  for (const role of ['engineer', 'viewer']) {
    const status = await page.evaluate(async ({ role, password }) => {
      const response = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: role,
          password,
          displayName: `Fictional ${role}`,
          email: `${role}@example.invalid`,
          role,
          active: true
        })
      });
      return response.status;
    }, { role, password: SITE_CONTRACT_CREDENTIAL });
    assert.equal(status, 201);
  }

  await page.goto(`${instance.base}/#sites`);
  await page.getByLabel('Code').fill('SITE-DEMO-01');
  await page.getByLabel('Name').fill('Fictional Recovery Lab');
  await page.getByLabel('Description').fill('A fictional site used only by the red recovery contract.');
  await page.getByRole('button', { name: 'Add site' }).click();
  const siteLink = page.getByRole('link', { name: 'SITE-DEMO-01', exact: true });
  await siteLink.waitFor();
  sitePublicId = (await siteLink.getAttribute('href')).split('/')[1];

  administrator = { context: adminContext, page };
  engineer = await login('engineer');
  viewer = await login('viewer');
});

test.after(async () => {
  await Promise.all([administrator, engineer, viewer].filter(Boolean).map(({ context }) => context.close()));
  if (browser) await browser.close();
  await stopServer();
});

test('engineer can edit a site and the saved version survives reload', async () => {
  await beginSiteEdit(engineer.page);
  await engineer.page.getByLabel('Name').fill('Fictional Recovery Annex');
  await engineer.page.getByRole('button', { name: 'Save site' }).click();
  await engineer.page.getByText('Site saved', { exact: true }).waitFor();
  await engineer.page.reload();
  await engineer.page.getByRole('heading', { name: 'SITE-DEMO-01 — Fictional Recovery Annex', exact: true }).waitFor();
});

test('a stale site edit reports a scoped conflict without overwriting either draft', async () => {
  await Promise.all([beginSiteEdit(administrator.page), beginSiteEdit(engineer.page)]);
  await administrator.page.getByLabel('Description').fill('Administrator version from a fictional concurrent edit.');
  await administrator.page.getByRole('button', { name: 'Save site' }).click();
  await administrator.page.getByText('Site saved', { exact: true }).waitFor();

  const engineerDraft = 'Engineer version retained after a fictional conflict.';
  await engineer.page.getByLabel('Description').fill(engineerDraft);
  await engineer.page.getByRole('button', { name: 'Save site' }).click();
  await engineer.page.getByRole('alert').filter({ hasText: /changed since it was loaded/i }).waitFor();
  assert.equal(await engineer.page.getByLabel('Description').inputValue(), engineerDraft);

  await administrator.page.reload();
  await administrator.page.getByRole('button', { name: 'Edit site' }).click();
  assert.equal(await administrator.page.getByLabel('Description').inputValue(), 'Administrator version from a fictional concurrent edit.');
});

test('viewer sees an explicit read-only site and no mutation control', async () => {
  await viewer.page.goto(`${instance.base}/#site/${sitePublicId}`);
  await viewer.page.getByRole('heading', { name: /SITE-DEMO-01/ }).waitFor();
  await viewer.page.getByText('Read-only access', { exact: true }).waitFor();
  assert.equal(await viewer.page.getByRole('button', { name: 'Edit site' }).count(), 0);
});

test('engineer completes the Phase 2 infrastructure workflow and viewer remains read-only', async () => {
  const page = engineer.page;
  await openSiteSection(page, 'rooms');
  const addRoom = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add room' }) });
  await addRoom.getByLabel('Name').fill('Fictional Suite Alpha');
  await addRoom.getByLabel('Description').fill('Phase two contract room.');
  await addRoom.getByRole('button', { name: 'Add room' }).click();
  await page.getByRole('heading', { name: 'Fictional Suite Alpha', exact: true }).waitFor();
  const refreshedAddRoom = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add room' }) });
  await refreshedAddRoom.getByLabel('Name').fill('Fictional Suite Beta');
  await refreshedAddRoom.getByRole('button', { name: 'Add room' }).click();

  await openSiteSection(page, 'racks');
  let addRack = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add rack' }) });
  await addRack.getByLabel('Rack label').fill('ROW-A-01');
  assert.equal(await addRack.getByLabel('Suite line', { exact: true }).inputValue(), 'A');
  await addRack.getByLabel('Room').selectOption({ label: 'Fictional Suite Alpha' });
  await addRack.getByLabel('I confirm the suite line').check();
  await addRack.getByRole('button', { name: 'Add rack' }).click();
  await page.locator('.rack-workflow').waitFor();
  const racksAfterFirst = await page.evaluate(async (publicId) => (await (await fetch(`/api/sites/${publicId}/racks`)).json()), sitePublicId);
  assert.equal(racksAfterFirst[0].sizeUnits, 47);

  addRack = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add rack' }) });
  await addRack.getByLabel('Rack label').fill('row-a-01');
  await addRack.getByLabel('Room').selectOption({ label: 'Fictional Suite Alpha' });
  await addRack.getByLabel('I confirm the suite line').check();
  await addRack.getByRole('button', { name: 'Add rack' }).click();
  await addRack.getByRole('alert').filter({ hasText: /already exists/i }).waitFor();
  await addRack.getByLabel('Rack label').fill('ROW-B-01');
  await addRack.getByLabel('Suite line', { exact: true }).fill('B');
  await addRack.getByLabel('Room').selectOption({ label: 'Fictional Suite Beta' });
  await addRack.getByRole('button', { name: 'Add rack' }).click();
  await page.locator('.rack-workflow').nth(1).waitFor();

  let firstRack = page.locator('.rack-workflow').first();
  const addDevice = firstRack.locator('form').filter({ has: page.getByRole('heading', { name: 'Add rack device' }) });
  await addDevice.getByLabel('Hostname').fill('PHASE-UI-SWITCH-A');
  await addDevice.getByLabel('Label').fill('Fictional UI Switch');
  await addDevice.getByLabel('Rack unit').fill('10');
  await addDevice.getByLabel('Height (U)').fill('2');
  await addDevice.getByLabel('Face').selectOption('front');
  await addDevice.getByRole('button', { name: 'Add device' }).click();
  await page.locator('.rack-device').filter({ hasText: 'Fictional UI Switch' }).waitFor();
  const canonical = await page.evaluate(async (publicId) => (await (await fetch(`/api/sites/${publicId}/devices`)).json()).find((entry) => entry.hostname === 'phase-ui-switch-a'), sitePublicId);
  assert.ok(canonical.deviceKey); assert.equal(canonical.hostname, 'phase-ui-switch-a');

  await openSiteSection(page, 'devices');
  const deviceHeading = page.getByRole('heading', { name: 'phase-ui-switch-a', exact: true });
  await deviceHeading.waitFor();
  const deviceForm = deviceHeading.locator('..');
  await deviceForm.locator('select[name="rackPublicId"]').selectOption({ label: 'ROW-B-01' });
  await deviceForm.locator('input[name="rackUnit"]').fill('5');
  await deviceForm.locator('select[name="side"]').selectOption('rear');
  await deviceForm.getByRole('button', { name: 'Save device' }).click();
  await page.waitForFunction(async ({ siteId, deviceId }) => (await (await fetch(`/api/sites/${siteId}/devices`)).json()).find((entry) => entry.publicId === deviceId)?.side === 'rear', { siteId: sitePublicId, deviceId: canonical.publicId });
  const moved = await page.evaluate(async ({ siteId, deviceId }) => (await (await fetch(`/api/sites/${siteId}/devices`)).json()).find((entry) => entry.publicId === deviceId), { siteId: sitePublicId, deviceId: canonical.publicId });
  assert.equal(moved.deviceKey, canonical.deviceKey); assert.equal(moved.side, 'rear'); assert.equal(moved.rackUnit, 5);

  await openSiteSection(page, 'racks');
  firstRack = page.locator('.rack-workflow').first();
  const rackPhotos = firstRack.locator('details.photo-panel').first();
  await rackPhotos.locator('summary').click();
  await rackPhotos.getByLabel('Photo name').fill('Fictional rack current');
  await rackPhotos.getByLabel('JPEG, PNG, or WebP').setInputFiles({ name: 'rack.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await rackPhotos.getByRole('button', { name: 'Upload photo' }).click();
  await page.getByText('Photo uploaded', { exact: true }).waitFor();
  firstRack = page.locator('.rack-workflow').first();
  const replacement = firstRack.locator('details.photo-panel').first();
  await replacement.locator('summary').click();
  await replacement.getByLabel('Photo name').fill('Fictional rack replacement');
  await replacement.getByLabel('JPEG, PNG, or WebP').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  await replacement.getByRole('button', { name: 'Upload replacement' }).click();
  await page.getByText('Fictional rack current', { exact: true }).waitFor();

  await openSiteSection(page, 'termination-points');
  const addPointHeading = page.getByRole('heading', { name: 'Add termination point', exact: true });
  await page.waitForTimeout(300);
  assert.equal(await addPointHeading.count(), 1, await page.locator('main').innerText());
  const addPoint = addPointHeading.locator('..');
  await addPoint.getByLabel('Label').fill('ODF-PHASE-UI');
  await addPoint.getByLabel('Trays').fill('2');
  await addPoint.getByLabel('Positions per tray').fill('12');
  await addPoint.getByLabel('Room').selectOption({ label: 'Fictional Suite Alpha' });
  await addPoint.getByRole('button', { name: 'Add termination point' }).click();
  const pointCard = page.locator('article.panel').filter({ has: page.getByRole('heading', { name: 'ODF-PHASE-UI' }) });
  const addPosition = pointCard.locator('form.inline-record').last();
  await addPosition.getByLabel('Tray').fill('2');
  await addPosition.getByLabel('Position').fill('4');
  await addPosition.getByLabel('Label').fill('Fictional fibre four');
  await addPosition.getByRole('button', { name: 'Add position' }).click();
  await page.locator('input[name="label"][value="Fictional fibre four"]').waitFor();

  await openSiteSection(page, 'devices');
  const addDirectoryDevice = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add device' }) });
  await addDirectoryDevice.getByLabel('Hostname').fill('PHASE-UI-SWITCH-B');
  await addDirectoryDevice.getByLabel('Room').selectOption({ label: 'Fictional Suite Alpha' });
  await addDirectoryDevice.getByRole('button', { name: 'Add device' }).click();
  await page.getByRole('heading', { name: 'phase-ui-switch-b' }).waitFor();

  await openSiteSection(page, 'distances');
  const calculator = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Distance calculator' }) });
  await calculator.getByLabel('Endpoint A').selectOption({ label: 'phase-ui-switch-a' });
  await calculator.getByLabel('Endpoint B').selectOption({ label: 'phase-ui-switch-b' });
  await calculator.getByLabel('Measured length (m)').fill('17.25');
  await calculator.getByRole('button', { name: 'Record measurement' }).click();
  await page.getByRole('cell', { name: '17.25 m' }).waitFor();
  await page.locator('form').filter({ has: page.getByRole('heading', { name: 'Distance calculator' }) }).getByRole('button', { name: 'Suggest from history' }).click();
  await page.getByText(/Exact device-pair suggestion: 17.25 m/).waitFor();

  await viewer.page.goto(`${instance.base}/#site/${sitePublicId}/racks`);
  await viewer.page.getByRole('heading', { name: 'Rack elevations' }).waitFor();
  assert.equal(await viewer.page.getByRole('button', { name: /Add|Save|Delete|Upload/ }).count(), 0);
  await viewer.page.locator('.rack-workflow').first().locator('details.photo-panel summary').click();
  await viewer.page.getByText('Fictional rack replacement', { exact: true }).waitFor();
});

test('offline rack creation is durable and replays without a self-dependency', async () => {
  const page = engineer.page;
  await openSiteSection(page, 'racks');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.evaluate(() => {
    globalThis.__phase2Fetch = globalThis.fetch;
    globalThis.fetch = (input, init) => String(input).includes('/api/sites/') && String(input).endsWith('/racks') && init?.method === 'POST'
      ? Promise.reject(new TypeError('Fictional offline rack write')) : globalThis.__phase2Fetch(input, init);
  });
  try {
    const addRack = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add rack' }) });
    await addRack.getByLabel('Rack label').fill('ROW-C-01');
    await addRack.getByLabel('Room').selectOption({ label: 'Fictional Suite Alpha' });
    await addRack.getByLabel('I confirm the suite line').check();
    await addRack.getByRole('button', { name: 'Add rack' }).click();
    await page.waitForFunction(() => globalThis.OfflineStore.all('operation-queue').then((items) => items.some((item) => item.entityType === 'racks' && item.label === 'ROW-C-01')));
    const queuedState = await page.evaluate(() => globalThis.OfflineStore.all('operation-queue'));
    const queued = queuedState.find((item) => item.entityType === 'racks' && item.label === 'ROW-C-01');
    assert.ok(queued, JSON.stringify(queuedState)); assert.deepEqual(queued.requiredTemporaryIds, []);
    await page.evaluate(() => { globalThis.fetch = globalThis.__phase2Fetch; delete globalThis.__phase2Fetch; });
    await page.evaluate(() => globalThis.OfflineSync.replay(globalThis.OfflineStore, globalThis.fetch));
    await page.waitForFunction(async (publicId) => (await (await fetch(`/api/sites/${publicId}/racks`)).json()).some((entry) => entry.label === 'ROW-C-01'), sitePublicId);
  } finally { await page.evaluate(() => { if (globalThis.__phase2Fetch) { globalThis.fetch = globalThis.__phase2Fetch; delete globalThis.__phase2Fetch; } }); }
});

test('offline site edits are durable, coalesced, and replay after reconnection', async () => {
  await beginSiteEdit(engineer.page);
  await engineer.page.evaluate(() => navigator.serviceWorker.ready);
  await engineer.context.setOffline(true);
  try {
    await engineer.page.getByLabel('Description').fill('First fictional offline site draft.');
    await engineer.page.getByRole('button', { name: 'Save site' }).click();
    await engineer.page.getByText('Site update queued for sync', { exact: true }).waitFor();
    await engineer.page.getByRole('heading', { name: 'Site update pending', exact: true }).waitFor();

    await engineer.page.getByRole('button', { name: 'Edit site' }).click();
    const finalDraft = 'Final fictional offline site draft retained across reload.';
    await engineer.page.getByLabel('Description').fill(finalDraft);
    const secondSave = engineer.page.getByRole('button', { name: 'Save site' });
    await secondSave.click();
    await engineer.page.waitForFunction((expected) => globalThis.OfflineStore.all('operation-queue').then((items) => items.some((item) => item.operationKey?.startsWith('site:update:') && JSON.parse(item.body).description === expected)), finalDraft);
    await secondSave.waitFor({ state: 'detached' });
    const queued = await engineer.page.evaluate(() => globalThis.OfflineStore.all('operation-queue').then((items) => items.filter((item) => item.operationKey?.startsWith('site:update:'))));
    assert.equal(queued.length, 1);
    assert.equal(JSON.parse(queued[0].body).description, finalDraft);

    await engineer.page.reload();
    await engineer.page.getByRole('heading', { name: 'Site update pending', exact: true }).waitFor();
    const reloadedQueue = await engineer.page.evaluate(() => globalThis.OfflineStore.all('operation-queue'));
    assert.equal(reloadedQueue.length, 1);
    assert.equal(reloadedQueue[0].operationKey, `site:update:${sitePublicId}`);
    await engineer.page.getByRole('button', { name: 'Edit site' }).click();
    assert.equal(await engineer.page.getByLabel('Description').inputValue(), finalDraft);

    await engineer.context.setOffline(false);
    await engineer.page.evaluate(() => globalThis.OfflineSync.replay(globalThis.OfflineStore, globalThis.fetch));
    await engineer.page.waitForFunction(async ({ publicId, expected }) => {
      const sites = await (await fetch('/api/sites')).json();
      return sites.find((entry) => entry.publicId === publicId)?.description === expected;
    }, { publicId: sitePublicId, expected: finalDraft });
    const remaining = await engineer.page.evaluate(() => globalThis.OfflineStore.all('operation-queue'));
    assert.deepEqual(remaining, []);
    const rejected = await engineer.page.evaluate(() => globalThis.OfflineStore.all('dead-letters'));
    assert.deepEqual(rejected, []);
    const saved = await engineer.page.evaluate(async (publicId) => (await (await fetch('/api/sites')).json()).find((entry) => entry.publicId === publicId), sitePublicId);
    assert.equal(saved.description, finalDraft);
    await engineer.page.reload();
    await engineer.page.getByRole('button', { name: 'Edit site' }).click();
    assert.equal(await engineer.page.getByLabel('Description').inputValue(), finalDraft);
  } finally {
    await engineer.context.setOffline(false);
  }
});

test('an offline stale edit is scoped to the site and can be reviewed before reapplying', async () => {
  await beginSiteEdit(engineer.page);
  await engineer.context.setOffline(true);
  const retainedDraft = 'Fictional offline conflict draft chosen after review.';
  try {
    await engineer.page.getByLabel('Description').fill(retainedDraft);
    await engineer.page.getByRole('button', { name: 'Save site' }).click();
    await engineer.page.getByText('Site update queued for sync', { exact: true }).waitFor();

    await beginSiteEdit(administrator.page);
    await administrator.page.getByLabel('Description').fill('Fictional server edit made before offline replay.');
    await administrator.page.getByRole('button', { name: 'Save site' }).click();
    await administrator.page.getByText('Site saved', { exact: true }).waitFor();

    await engineer.context.setOffline(false);
    await engineer.page.getByRole('heading', { name: 'Site update needs review', exact: true }).waitFor();
    assert.equal(await engineer.page.evaluate(() => globalThis.OfflineStore.all('dead-letters').then((items) => items.filter((item) => item.entityType === 'site').length)), 1);
    await engineer.page.getByRole('button', { name: 'Review offline draft' }).click();
    assert.equal(await engineer.page.getByLabel('Description').inputValue(), retainedDraft);
    await engineer.page.getByRole('button', { name: 'Save site' }).click();
    await engineer.page.getByText('Site saved', { exact: true }).waitFor();
    assert.equal(await engineer.page.evaluate(() => globalThis.OfflineStore.all('dead-letters').then((items) => items.filter((item) => item.entityType === 'site').length)), 0);

    await administrator.page.reload();
    await administrator.page.getByRole('button', { name: 'Edit site' }).click();
    assert.equal(await administrator.page.getByLabel('Description').inputValue(), retainedDraft);
  } finally {
    await engineer.context.setOffline(false);
  }
});
