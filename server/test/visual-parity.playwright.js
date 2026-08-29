'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-visual-artifacts-'));

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}

async function start(configName) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `tsm-visual-${configName}-`));
  const port = await availablePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, DB_FILE: path.join(dataDir, 'visual.db'), PLUGIN_CONFIG_FILE: path.join(root, 'config', `${configName}.json`) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let diagnostics = '';
  child.stdout.on('data', (chunk) => { diagnostics += chunk.toString(); });
  child.stderr.on('data', (chunk) => { diagnostics += chunk.toString(); });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Visual server exited: ${diagnostics.slice(-500)}`);
    try { if ((await fetch(`${base}/api/health`)).ok) return { child, base, dataDir }; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Visual server did not become ready: ${diagnostics.slice(-500)}`);
}

async function stop(instance) {
  if (instance.child.exitCode === null) {
    instance.child.kill('SIGTERM');
    await new Promise((resolve) => { instance.child.once('exit', resolve); setTimeout(resolve, 3000); });
  }
  fs.rmSync(instance.dataDir, { recursive: true, force: true });
}

async function setup(page, suffix) {
  await page.getByLabel('Username').fill(`visual-admin-${suffix}`);
  await page.getByLabel('Password').fill(`fictional-visual-password-${suffix}`);
  await page.getByLabel('Display name').fill('Visual Test Administrator');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Work Packages', exact: true }).waitFor();
}

async function seedSharedState(page) {
  return page.evaluate(async () => {
    const request = async (url, body) => {
      const response = await fetch(`/api${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json();
    };
    const site = await request('/sites', { code: 'LAB-VISUAL-01', name: 'Fictional Visual Lab', description: 'Publication-safe synthetic infrastructure' });
    const room = await request(`/sites/${site.publicId}/rooms`, { name: 'Demonstration Room', description: 'Synthetic room used only by visual tests' });
    const rack = await request(`/sites/${site.publicId}/racks`, { label: 'RACK-A1', suiteLine: 'A', sizeUnits: 42, roomPublicId: room.publicId });
    await request(`/sites/${site.publicId}/termination-points`, { label: 'ODF-DEMO-1', kind: 'odf', notes: 'Fictional termination', roomPublicId: room.publicId });
    await request(`/sites/${site.publicId}/devices`, { hostname: 'demo-switch-01', label: 'Demo Switch', deviceKey: 'device-demo-01', rackPublicId: rack.publicId, rackUnit: 10, sizeUnits: 2, side: 'front' });
    await request(`/sites/${site.publicId}/distances`, { endpointA: 'demo-switch-01:1', endpointB: 'ODF-DEMO-1:1', media: 'fibre', lengthMetres: 18.25 });
    const workPackage = await request('/work-packages', {
      sitePublicId: site.publicId, packageReference: 'PKG-VISUAL-001', externalReference: 'EXT-VISUAL-001', projectReference: 'PROJECT-LANTERN', title: 'Fictional rack connection', description: 'Synthetic work package for visual regression', status: 'active', leadAssignee: 'visual-admin-zero', assignees: ['visual-admin-zero'],
      workItems: [{ itemReference: 'ITEM-VISUAL-1', title: 'Install demonstration link', description: 'Synthetic child item', status: 'active' }],
      circuits: [{ circuitReference: 'CIRCUIT-VISUAL-1', description: 'Fictional connection', media: 'fibre', status: 'planned', segments: [{ segmentReference: 'SEGMENT-VISUAL-1', fromEndpoint: 'demo-switch-01:1', toEndpoint: 'ODF-DEMO-1:1', lengthMetres: 18.25 }] }],
      consumableRequirements: [{ description: 'Fictional labels', quantityRequired: 4, unit: 'each' }]
    });
    return { sitePublicId: site.publicId, packagePublicId: workPackage.publicId };
  });
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const zero = await start('zero-plugins');
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
      const page = await context.newPage();
      await page.route('**/api/auth/status', async (route) => {
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 250));
        await route.fulfill({ response });
      });
      const navigation = page.goto(zero.base, { waitUntil: 'domcontentloaded' });
      await page.locator('.loading').waitFor();
      await screenshot(page, 'zero-loading-desktop-dark');
      await navigation;
      await page.getByRole('heading', { name: /Welcome/ }).waitFor();
      await page.unroute('**/api/auth/status');
      await screenshot(page, 'zero-setup-desktop-dark');
      await setup(page, 'zero');
      await page.getByText(/No work packages have been created yet/).waitFor();
      await screenshot(page, 'zero-empty-home-desktop-dark');

      const shared = await seedSharedState(page);
      await page.reload();
      await page.getByRole('heading', { name: 'PKG-VISUAL-001' }).waitFor();
      await screenshot(page, 'zero-dashboard-desktop-dark');
      await page.getByLabel('Search records').fill('ITEM-VISUAL-1');
      await page.getByRole('heading', { name: 'PKG-VISUAL-001' }).waitFor();
      await screenshot(page, 'zero-search-desktop-dark');
      await page.goto(`${zero.base}/#site/${shared.sitePublicId}`);
      await page.getByRole('heading', { name: 'Rack previews' }).waitFor();
      await screenshot(page, 'zero-site-room-rack-desktop-dark');
      await page.goto(`${zero.base}/#package/${shared.packagePublicId}`);
      await page.getByRole('heading', { name: 'Work items' }).waitFor();
      await screenshot(page, 'zero-package-detail-desktop-dark');

      const desktop = await page.evaluate(() => {
        const sidebar = globalThis.document.querySelector('.sidebar');
        const content = globalThis.document.querySelector('.content');
        const panel = globalThis.document.querySelector('.panel');
        return { sidebar: sidebar && sidebar.getBoundingClientRect(), content: content && content.getBoundingClientRect(), bodyBackground: globalThis.getComputedStyle(globalThis.document.body).backgroundColor, panelRadius: panel && globalThis.getComputedStyle(panel).borderRadius };
      });
      assert.ok(desktop.sidebar && Math.abs(desktop.sidebar.width - 244) < 1);
      assert.ok(desktop.content && desktop.content.x >= 244);
      assert.equal(desktop.bodyBackground, 'rgb(15, 20, 25)');
      assert.equal(desktop.panelRadius, '10px');

      await page.getByRole('link', { name: 'Import' }).click();
      await page.getByText('No import providers are installed.').waitFor();
      await screenshot(page, 'zero-import-empty-desktop-dark');
      await page.getByRole('button', { name: 'Theme: system' }).click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      await screenshot(page, 'zero-import-empty-desktop-light');

      await page.setViewportSize({ width: 1024, height: 768 });
      await page.reload();
      await page.getByRole('heading', { name: 'Import', exact: true }).waitFor();
      assert.equal(await page.locator('.sidebar').isVisible(), true);
      await screenshot(page, 'zero-import-empty-tablet-light');

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.getByRole('heading', { name: 'Import', exact: true }).waitFor();
      assert.equal(await page.locator('.mobile-toolbar').isVisible(), true);
      await page.getByRole('button', { name: 'Show navigation' }).click();
      assert.equal(await page.locator('.nav-scrim').isVisible(), true);
      const mobileSidebar = await page.locator('.sidebar').boundingBox();
      assert.ok(mobileSidebar && mobileSidebar.width <= 390 * .84 + 1);
      await screenshot(page, 'zero-navigation-mobile-light');
      await page.mouse.click(380, 420);
      await page.locator('#shell.nav-collapsed').waitFor();

      await page.evaluate(() => navigator.serviceWorker.ready);
      await context.setOffline(true);
      await page.locator('.connection-status.offline').waitFor();
      await screenshot(page, 'zero-offline-shell-mobile-light');
      await context.setOffline(false);
      await context.close();

      const errorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
      const errorPage = await errorContext.newPage();
      await errorPage.route('**/api/auth/status', (route) => route.abort('failed'));
      await errorPage.goto(zero.base, { waitUntil: 'domcontentloaded' });
      await errorPage.locator('.error').waitFor();
      await screenshot(errorPage, 'zero-error-desktop-dark');
      await errorContext.close();
      console.log('PASS zero-plugin visual states');
    } finally { await stop(zero); }

    const fictional = await start('fictional-plugin');
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
      await page.goto(fictional.base);
      await setup(page, 'fictional');
      await page.getByRole('link', { name: 'Import' }).click();
      await page.getByLabel('Provider').selectOption('example.fictional-facility.json');
      await page.getByLabel('Source content').fill(fs.readFileSync(path.join(root, 'examples', 'fictional-plugin', 'example-plan.json'), 'utf8'));
      await page.getByLabel('Stable source reference').fill('FICTIONAL-VISUAL-PLAN-001');
      await page.getByRole('button', { name: 'Validate and preview' }).click();
      await page.getByRole('heading', { name: 'Normalized preview' }).waitFor();
      await screenshot(page, 'fictional-import-preview-desktop-dark');
      const previewBox = await page.locator('.preview-panel').boundingBox();
      const formBox = await page.locator('form').boundingBox();
      assert.ok(previewBox && formBox && previewBox.x > formBox.x);
      await page.close();
      console.log('PASS fictional-plugin visual states');
    } finally { await stop(fictional); }
  } finally {
    await browser.close();
    console.log(`Visual artifacts: ${artifacts}`);
  }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
