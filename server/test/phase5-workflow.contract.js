'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const PASSWORD = ['fictional', 'phase', 'five', 'browser', 'credential'].join('-');

function availablePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }

async function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-phase5-browser-')); const port = await availablePort();
  const child = spawn(process.execPath, ['server/server.js'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, DB_FILE: path.join(dataDir, 'test.db'), PLUGIN_CONFIG_FILE: path.join(root, 'config', 'zero-plugins.json'), VAPID_PUBLIC_KEY: 'B'.repeat(65) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostics = ''; child.stdout.on('data', (chunk) => { diagnostics += chunk; }); child.stderr.on('data', (chunk) => { diagnostics += chunk; }); const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(`${base}/api/health`)).ok) return { child, dataDir, base, diagnostics: () => diagnostics }; } catch { /* retry */ } await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error(`Server not ready: ${diagnostics.slice(-1000)}`);
}

async function stop(instance) { if (instance.child.exitCode === null) { instance.child.kill('SIGTERM'); await new Promise((resolve) => instance.child.once('exit', resolve)); } fs.rmSync(instance.dataDir, { recursive: true, force: true }); }

async function login(page, username) {
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByLabel('Username', { exact: true }).fill(username); await page.getByLabel('Password', { exact: true }).fill(PASSWORD); await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForFunction(() => !globalThis.document.body.classList.contains('auth-active') || Boolean(globalThis.document.querySelector('#auth-error')?.textContent));
  const error = await page.locator('#auth-error').textContent().catch(() => ''); if (error) throw new Error(`Login failed for ${username}: ${error}`);
  await page.getByRole('button', { name: 'Sign out' }).waitFor();
}

(async () => {
  const instance = await start(); const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(instance.base); await page.getByLabel('Username').fill('phase5-admin'); await page.getByLabel('Password').fill(PASSWORD); await page.getByLabel('Display name').fill('Fictional Browser Administrator'); await page.getByRole('button', { name: 'Create account' }).click(); await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();

    await page.goto(`${instance.base}/#settings`); await page.getByRole('heading', { name: 'Settings' }).waitFor();
    const consumables = page.getByRole('heading', { name: 'Shared consumables catalogue' }).locator('..').locator('..');
    const addConsumable = consumables.locator('form').last(); await addConsumable.getByLabel('Reference').fill('CONS-BROWSER-01'); await addConsumable.getByLabel('Description').fill('Fictional browser labels'); await addConsumable.getByLabel('Estimated unit price').fill('2'); await addConsumable.getByRole('button', { name: 'Add consumable' }).click(); await page.waitForFunction(async () => (await (await fetch('/api/catalogue/consumables')).json()).some((entry) => entry.catalogueReference === 'CONS-BROWSER-01'));
    await page.reload(); await page.getByRole('heading', { name: 'Settings' }).waitFor();
    const fibre = page.getByRole('heading', { name: 'Fibre SKU catalogue' }).locator('..').locator('..');
    const addSku = fibre.locator('form').last(); await addSku.getByLabel('SKU').fill('SKU-BROWSER-10'); await addSku.getByLabel('Description').fill('Fictional ten metre duplex lead'); await addSku.getByLabel('Length (m)').fill('10'); await addSku.getByLabel('Unit price').fill('12'); await addSku.getByRole('button', { name: 'Add SKU' }).click(); await page.waitForFunction(async () => (await (await fetch('/api/catalogue/fibre-skus')).json()).some((entry) => entry.sku === 'SKU-BROWSER-10'));
    await page.reload(); await page.getByRole('heading', { name: 'Settings' }).waitFor();
    const savedScroll = await page.evaluate(() => { globalThis.scrollTo(0, globalThis.document.documentElement.scrollHeight); return globalThis.scrollY; }); assert.ok(savedScroll > 0); await page.waitForTimeout(250);
    await page.reload(); await page.getByRole('heading', { name: 'Settings' }).waitFor(); await page.waitForFunction((minimum) => globalThis.scrollY >= minimum, Math.max(1, savedScroll - 2));

    const ids = await page.evaluate(async () => {
      const call = async (path, body) => { const response = await fetch(`/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(await response.text()); return response.json(); };
      const site = await call('/sites', { code: 'PHASE5-BROWSER', name: 'Fictional Phase Five Browser Site' });
      const catalogue = (await (await fetch('/api/catalogue/consumables')).json()).find((entry) => entry.catalogueReference === 'CONS-BROWSER-01');
      const pack = await call('/work-packages', { sitePublicId: site.publicId, packageReference: 'PKG-PHASE5-BROWSER', title: 'Fictional Phase Five Browser Package', status: 'active', leadAssignee: 'Browser Engineer', assignees: ['Browser Engineer'], workItems: [], circuits: [{ circuitReference: 'FIBRE-BROWSER-01', description: '', media: 'fibre', status: 'planned', segments: [{ segmentReference: 'SEG-BROWSER-01', fromEndpoint: 'fictional-a:1', toEndpoint: 'fictional-b:1', lengthMetres: 8 }] }], consumableRequirements: [{ cataloguePublicId: catalogue.publicId, description: catalogue.description, quantityRequired: 4, unit: catalogue.unit }] });
      return { site: site.publicId, pack: pack.publicId };
    });
    const calculated = await page.evaluate(async (packId) => ({ bom: await (await fetch(`/api/work-packages/${packId}/bom`)).json(), skus: await (await fetch('/api/catalogue/fibre-skus')).json() }), ids.pack); assert.equal(calculated.bom.matches[0]?.matchType, 'next-up', JSON.stringify(calculated));
    await page.goto(`${instance.base}/#package/${ids.pack}/consumables`); await page.getByRole('heading', { name: 'PKG-PHASE5-BROWSER' }).waitFor(); assert.equal(await page.getByLabel('Catalogue item').inputValue() !== '', true); assert.equal(await page.getByLabel('quantityRequired').inputValue(), '4');
    await page.locator('[data-package-view="bom"]').click(); await page.getByRole('heading', { name: 'Bill of materials' }).waitFor(); await page.getByText('next-up', { exact: true }).waitFor(); await page.getByText('20.00', { exact: true }).waitFor();

    await page.locator('[data-route="settings"]').click(); const profile = page.getByRole('heading', { name: 'Engineer profile' }).locator('..'); await profile.getByLabel('Exact assignment name').fill('Browser Engineer'); await profile.getByLabel('Job title').fill('Fictional browser engineer'); await profile.getByRole('button', { name: 'Create profile' }).click(); await page.getByText('Engineer profile saved').waitFor();
    await page.locator('[data-route="home"]').click(); await page.getByRole('heading', { name: 'Team workload' }).waitFor(); await page.getByText('1 active package').waitFor();

    await page.getByRole('button', { name: 'Sign out' }).click(); await page.getByText('Request an account').click(); const request = page.getByRole('form', { name: 'Account request' }); await request.getByLabel('Requested account name').fill('browser-engineer'); await request.getByLabel('Requested passphrase').fill(PASSWORD); await request.getByLabel('Your name').fill('Fictional Requested Engineer'); await request.getByRole('button', { name: 'Send account request' }).click(); await page.getByText('Request sent. An administrator must approve it before you can sign in.').waitFor();
    await login(page, 'phase5-admin'); await page.locator('[data-route="settings"]').click(); const requested = page.getByRole('heading', { name: 'Fictional Requested Engineer' }).locator('../..'); await requested.getByRole('button', { name: 'Approve request' }).click(); await page.getByText('Account approved').waitFor(); await page.waitForFunction(async () => (await (await fetch('/api/auth/users')).json()).some((entry) => entry.username === 'browser-engineer' && entry.active && entry.accountStatus === 'approved'));

    await page.goto(`${instance.base}/#package/${ids.pack}/bom`); await page.getByRole('heading', { name: 'Bill of materials' }).waitFor(); await page.getByRole('button', { name: 'Sign out' }).click(); await login(page, 'browser-engineer'); assert.equal(new URL(page.url()).hash, '#home', 'another user must not inherit the administrator route');
    await page.getByRole('button', { name: 'Sign out' }).click(); await login(page, 'phase5-admin'); await page.getByRole('heading', { name: 'Bill of materials' }).waitFor(); assert.equal(new URL(page.url()).hash, `#package/${ids.pack}/bom`, 'same user resumes the saved route');

    await page.locator('[data-route="settings"]').click(); await page.getByRole('heading', { name: 'Settings' }).waitFor(); await page.context().setOffline(true);
    const offlineConsumables = page.getByRole('heading', { name: 'Shared consumables catalogue' }).locator('..').locator('..'); const offlineAdd = offlineConsumables.locator('form').last(); await offlineAdd.getByLabel('Reference').fill('CONS-OFFLINE-01'); await offlineAdd.getByLabel('Description').fill('Fictional queued ties'); await offlineAdd.getByRole('button', { name: 'Add consumable' }).click(); await page.getByText('Catalogue change queued for synchronization').waitFor(); assert.equal(await page.evaluate(() => globalThis.OfflineStore.all('operation-queue').then((rows) => rows.length)), 1);
    await page.context().setOffline(false); await page.evaluate(() => import('/js/offline-ui.js').then((module) => module.replayQueue())); await page.waitForFunction(() => globalThis.OfflineStore.all('operation-queue').then((rows) => rows.length === 0));
    const catalogueReplay = await page.evaluate(async () => ({ records: await (await fetch('/api/catalogue/consumables')).json(), rejected: await globalThis.OfflineStore.all('dead-letters'), remaps: await globalThis.OfflineStore.all('id-remaps'), completions: await globalThis.OfflineStore.all('operation-completions') })); const replayed = catalogueReplay.records.find((entry) => entry.catalogueReference === 'CONS-OFFLINE-01');
    assert.ok(replayed?.publicId, `${JSON.stringify(catalogueReplay)}\n${instance.diagnostics().slice(-4000)}`); await page.reload(); await page.waitForFunction(() => [...globalThis.document.querySelectorAll('input[name="catalogueReference"]')].some((node) => node instanceof globalThis.HTMLInputElement && node.value === 'CONS-OFFLINE-01'));
    const pointId = await page.evaluate(async (sitePublicId) => { const response = await fetch(`/api/sites/${sitePublicId}/termination-points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'ODF-PHASE5-OFFLINE', kind: 'ODF', notes: '', trayCount: 1, positionsPerTray: 12, roomPublicId: null }) }); if (!response.ok) throw new Error(await response.text()); return (await response.json()).publicId; }, ids.site);
    await page.goto(`${instance.base}/#site/${ids.site}/termination-points`); await page.getByRole('heading', { name: 'ODF-PHASE5-OFFLINE' }).waitFor(); await page.context().setOffline(true); const addPosition = page.getByRole('button', { name: 'Add position' }).locator('..'); await addPosition.getByLabel('Label').fill('Fictional queued fibre'); await addPosition.getByRole('button', { name: 'Add position' }).click(); await page.getByText('Position change queued for sync').waitFor(); const queuedPosition = await page.evaluate(() => globalThis.OfflineStore.all('operation-queue').then((rows) => rows[0])); assert.ok(queuedPosition);
    await page.context().setOffline(false); await page.evaluate(() => import('/js/offline-ui.js').then((module) => module.replayQueue())); await page.waitForFunction(() => globalThis.OfflineStore.all('operation-queue').then((rows) => rows.length === 0)); const replayResult = await page.evaluate(async ({ siteId, pointId: targetPointId, queuedPath }) => ({ positions: await (await fetch(`/api/sites/${siteId}/termination-points/${targetPointId}/positions`)).json(), replayedPathPositions: await (await fetch(`/api${queuedPath}`)).json(), rejected: await globalThis.OfflineStore.all('dead-letters') }), { siteId: ids.site, pointId, queuedPath: queuedPosition.path }); assert.ok(replayResult.positions.some((position) => position.label === 'Fictional queued fibre'), JSON.stringify({ queuedPosition, replayResult })); await page.reload(); await page.getByRole('heading', { name: 'ODF-PHASE5-OFFLINE' }).waitFor();
    console.log('PASS Phase 5 materials, users, workload, resumption and offline catalogue browser contract');
    await page.close();
  } finally { await browser.close(); await stop(instance); }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
