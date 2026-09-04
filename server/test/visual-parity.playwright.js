'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const baselineFile = path.join(__dirname, 'visual-baselines.json');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-visual-artifacts-'));
const updateBaselines = process.env.UPDATE_VISUAL_BASELINES === '1';
const thresholds = { sampleSize: 48, channelDelta: 24, changedSampleRatio: 0.04, meanChannelDelta: 5 };
const expected = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : { version: 1, thresholds, captures: {} };
const observed = { version: 1, thresholds, captures: {} };
const viewports = {
  desktop: { width: 1440, height: 1000 },
  'tablet-portrait': { width: 820, height: 1180 },
  'tablet-landscape': { width: 1180, height: 820 },
  'iphone-portrait': { width: 390, height: 844 },
  'iphone-landscape': { width: 844, height: 390 }
};

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
  await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
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
    const point = await request(`/sites/${site.publicId}/termination-points`, { label: 'ODF-DEMO-1', kind: 'odf', notes: 'Fictional termination', roomPublicId: room.publicId });
    const position = await request(`/sites/${site.publicId}/termination-points/${point.publicId}/positions`, { tray: 1, position: 1, label: 'Fictional visual path' });
    const firstDevice = await request(`/sites/${site.publicId}/devices`, { hostname: 'demo-switch-01', label: 'Demo Switch', deviceKey: 'device-demo-01', rackPublicId: rack.publicId, rackUnit: 10, sizeUnits: 2, side: 'front' });
    const secondDevice = await request(`/sites/${site.publicId}/devices`, { hostname: 'demo-server-01', label: 'Demo Server', deviceKey: 'device-demo-02', rackPublicId: rack.publicId, rackUnit: 20, sizeUnits: 2, side: 'front' });
    await request(`/sites/${site.publicId}/distances`, { endpointA: 'demo-switch-01:1', endpointB: 'ODF-DEMO-1:1', media: 'fibre', lengthMetres: 18.25 });
    const workPackage = await request('/work-packages', {
      sitePublicId: site.publicId, packageReference: 'PKG-VISUAL-001', externalReference: 'EXT-VISUAL-001', projectReference: 'PROJECT-LANTERN', title: 'Fictional rack connection', description: 'Synthetic work package for visual regression', status: 'active', leadAssignee: 'visual-admin-zero', assignees: ['visual-admin-zero'],
      workItems: [{ itemReference: 'ITEM-VISUAL-1', title: 'Install demonstration link', description: 'Synthetic child item', status: 'active' }],
      circuits: [
        { circuitReference: 'FIBRE-VISUAL-1', description: 'Fictional optical connection', media: 'fibre', status: 'planned', segments: [{ segmentReference: 'FIBRE-VISUAL-1-A', sequence: 0, fromEndpointMode: 'device', fromDevicePublicId: firstDevice.publicId, fromPort: 'xe-0/0/1', toEndpointMode: 'odf', toTerminationPositionPublicId: position.publicId, fromConnector: 'lc', toConnector: 'lc', fibreType: 'OM4', fibreMode: 'multimode', stockLengthMetres: 20, itemType: 'patch-lead', lengthMetres: 18.25 }] },
        { circuitReference: 'COPPER-VISUAL-1', description: 'Fictional copper connection', media: 'copper', status: 'planned', segments: [{ segmentReference: 'COPPER-VISUAL-1-A', sequence: 0, fromEndpointMode: 'device', fromDevicePublicId: firstDevice.publicId, fromPort: 'ge-0/0/1', toEndpointMode: 'device', toDevicePublicId: secondDevice.publicId, toPort: 'eth0', fromConnector: 'rj45', toConnector: 'rj45', copperCategory: 'cat6a', copperShielding: 'f-utp', copperPinout: 'straight', lengthMetres: 7.5 }] },
        { circuitReference: 'DAC-VISUAL-1', description: 'Fictional direct attach connection', media: 'dac', status: 'planned', segments: [{ segmentReference: 'DAC-VISUAL-1-A', sequence: 0, fromEndpointMode: 'device', fromDevicePublicId: firstDevice.publicId, fromPort: 'et-0/0/1', toEndpointMode: 'device', toDevicePublicId: secondDevice.publicId, toPort: 'p1', fromConnector: 'qsfp28', toConnector: 'qsfp28', dacConnector: 'qsfp28', dacMedia: 'passive', dacDirection: 'a-to-b', lengthMetres: 3 }] }
      ],
      consumableRequirements: [{ description: 'Fictional labels', quantityRequired: 4, unit: 'each' }]
    });
    const pixel = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0));
    for (const [entityType, entityPublicId, name] of [['work_package', workPackage.publicId, 'Fictional package handover'], ['work_item', workPackage.workItems[0].publicId, 'Fictional work-item handover']]) {
      const response = await fetch(`/api/photos/${entityType}/${entityPublicId}`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Photo-Name': encodeURIComponent(name), 'X-Photo-Description': encodeURIComponent('Synthetic visual evidence') }, body: pixel });
      if (!response.ok) throw new Error(`handover photo: ${response.status}`);
    }
    return { sitePublicId: site.publicId, packagePublicId: workPackage.publicId };
  });
}

async function imageFingerprint(page, png) {
  return page.evaluate(async ({ base64, sampleSize }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await globalThis.createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new globalThis.OffscreenCanvas(sampleSize, sampleSize);
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, sampleSize, sampleSize);
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
    let rgb = '';
    for (let index = 0; index < pixels.length; index += 4) rgb += String.fromCharCode(pixels[index], pixels[index + 1], pixels[index + 2]);
    return { width: bitmap.width, height: bitmap.height, rgb: btoa(rgb) };
  }, { base64: png.toString('base64'), sampleSize: thresholds.sampleSize });
}

async function capture(page, name) {
  await page.evaluate(() => new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
  const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  fs.writeFileSync(path.join(artifacts, `${name}.png`), png);
  const fingerprint = await imageFingerprint(page, png);
  observed.captures[name] = fingerprint;
  if (updateBaselines) return;
  const baseline = expected.captures[name];
  assert.ok(baseline, `Missing visual baseline for ${name}; run UPDATE_VISUAL_BASELINES=1 npm run test:visual after review`);
  assert.equal(fingerprint.width, baseline.width, `${name} viewport width changed`);
  assert.equal(fingerprint.height, baseline.height, `${name} viewport height changed`);
  const actualRgb = Buffer.from(fingerprint.rgb, 'base64');
  const expectedRgb = Buffer.from(baseline.rgb, 'base64');
  assert.equal(actualRgb.length, expectedRgb.length, `${name} visual sample shape changed`);
  let changed = 0;
  let totalDelta = 0;
  for (let index = 0; index < actualRgb.length; index += 3) {
    const delta = Math.max(Math.abs(actualRgb[index] - expectedRgb[index]), Math.abs(actualRgb[index + 1] - expectedRgb[index + 1]), Math.abs(actualRgb[index + 2] - expectedRgb[index + 2]));
    totalDelta += delta;
    if (delta > thresholds.channelDelta) changed += 1;
  }
  const samples = actualRgb.length / 3;
  const changedRatio = changed / samples;
  const meanDelta = totalDelta / samples;
  assert.ok(changedRatio <= thresholds.changedSampleRatio, `${name} changed ${(changedRatio * 100).toFixed(2)}% of visual samples (limit ${(thresholds.changedSampleRatio * 100).toFixed(2)}%)`);
  assert.ok(meanDelta <= thresholds.meanChannelDelta, `${name} mean channel delta ${meanDelta.toFixed(2)} exceeded ${thresholds.meanChannelDelta}`);
}

async function route(page, url, heading, stableText) {
  await page.goto(url);
  // Hash navigation retains the previous DOM while asynchronous route data is
  // loading. A reload gives each deterministic capture a blank render boundary
  // so a shared heading cannot satisfy the wait from the previous subview.
  await page.reload();
  await page.getByRole('heading', { name: heading, exact: true }).first().waitFor();
  if (stableText) await page.getByText(stableText, { exact: true }).first().waitFor();
}

async function captureResponsiveMatrix(page, base, shared) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => localStorage.setItem('tsm-theme', value), theme);
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      await page.setViewportSize(viewport);
      await page.reload();
      await route(page, `${base}/#home`, 'Home');
      await capture(page, `home-${viewportName}-${theme}`);
      await route(page, `${base}/#package/${shared.packagePublicId}/details`, 'PKG-VISUAL-001', 'Work package details');
      await capture(page, `package-details-${viewportName}-${theme}`);
      await route(page, `${base}/#package/${shared.packagePublicId}/connections`, 'PKG-VISUAL-001', 'Add Fibre row');
      await capture(page, `package-fibre-${viewportName}-${theme}`);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const zero = await start('zero-plugins');
    try {
      const context = await browser.newContext({ viewport: viewports.desktop, colorScheme: 'dark', reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.route('**/api/auth/status', async (requestRoute) => {
        const response = await requestRoute.fetch();
        await new Promise((resolve) => setTimeout(resolve, 300));
        await requestRoute.fulfill({ response });
      });
      const navigation = page.goto(zero.base, { waitUntil: 'domcontentloaded' });
      await page.locator('.loading').waitFor();
      await capture(page, 'loading-desktop-dark');
      await navigation;
      await page.getByRole('heading', { name: /create your admin account/ }).waitFor();
      await page.unroute('**/api/auth/status');
      await capture(page, 'account-creation-desktop-dark');
      await setup(page, 'zero');
      await page.getByText('No active work packages yet.').waitFor();
      await capture(page, 'empty-home-desktop-dark');

      const shared = await seedSharedState(page);
      await page.reload();
      await route(page, `${zero.base}/#home`, 'Home');
      await capture(page, 'dashboard-desktop-dark');
      await page.getByLabel('Search all records').fill('ITEM-VISUAL-1');
      await page.getByRole('link', { name: 'PKG-VISUAL-001', exact: true }).waitFor();
      await capture(page, 'search-results-desktop-dark');

      const majorRoutes = [
        ['sites', 'Sites', 'sites-list', 'Add site'],
        [`site/${shared.sitePublicId}/overview`, 'LAB-VISUAL-01 — Fictional Visual Lab', 'site-overview', 'Rack previews'],
        [`site/${shared.sitePublicId}/rooms`, 'LAB-VISUAL-01 — Fictional Visual Lab', 'site-rooms', 'Rooms'],
        [`site/${shared.sitePublicId}/racks`, 'LAB-VISUAL-01 — Fictional Visual Lab', 'site-racks-elevations', 'Rack elevations'],
        [`site/${shared.sitePublicId}/termination-points`, 'LAB-VISUAL-01 — Fictional Visual Lab', 'site-termination-points', 'Termination points'],
        [`site/${shared.sitePublicId}/devices`, 'LAB-VISUAL-01 — Fictional Visual Lab', 'site-devices', 'Devices'],
        [`site/${shared.sitePublicId}/distances`, 'LAB-VISUAL-01 — Fictional Visual Lab', 'site-distances', 'Distance samples'],
        [`package/${shared.packagePublicId}/details`, 'PKG-VISUAL-001', 'package-details', 'Work package details'],
        [`package/${shared.packagePublicId}/work-items`, 'PKG-VISUAL-001', 'package-work-items', 'Add work item'],
        [`package/${shared.packagePublicId}/connections`, 'PKG-VISUAL-001', 'package-connections', 'Add Fibre row'],
        [`package/${shared.packagePublicId}/copper`, 'PKG-VISUAL-001', 'package-copper', 'Add Copper row'],
        [`package/${shared.packagePublicId}/dac`, 'PKG-VISUAL-001', 'package-dac', 'Add DAC row'],
        [`package/${shared.packagePublicId}/consumables`, 'PKG-VISUAL-001', 'package-consumables', 'Add consumable requirement'],
        [`package/${shared.packagePublicId}/handover`, 'PKG-VISUAL-001', 'package-handover', 'Package handover'],
        ['import', 'Import', 'import-no-provider', 'No import providers are installed.'],
        ['settings', 'Settings', 'settings', 'Appearance']
      ];
      for (const [hash, heading, name, stableText] of majorRoutes) {
        await route(page, `${zero.base}/#${hash}`, heading, stableText);
        await capture(page, `${name}-desktop-dark`);
      }

      await page.evaluate(async (publicId) => {
        let pack = await (await fetch(`/api/work-packages/${publicId}`)).json();
        for (const item of pack.workItems) {
          if (!['complete', 'cancelled'].includes(item.status)) await fetch(`/api/work-packages/${publicId}/work-items/${item.publicId}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _baseVersion: item.version }) });
        }
        pack = await (await fetch(`/api/work-packages/${publicId}`)).json();
        const response = await fetch(`/api/work-packages/${publicId}/completion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _baseVersion: pack.version }) });
        if (!response.ok) throw new Error(`package completion: ${response.status}`);
      }, shared.packagePublicId);
      await route(page, `${zero.base}/#package/${shared.packagePublicId}/details`, 'PKG-VISUAL-001', 'Reopen work package');
      await capture(page, 'package-completed-desktop-dark');
      await route(page, `${zero.base}/#package/${shared.packagePublicId}/dac`, 'PKG-VISUAL-001', 'This completed schedule is locked. Reopen the package before editing.');
      await capture(page, 'package-dac-completed-desktop-dark');
      await page.goto(`${zero.base}/api/work-packages/${shared.packagePublicId}/export?format=print`);
      await page.getByRole('heading', { name: 'PKG-VISUAL-001', exact: true }).waitFor();
      await page.emulateMedia({ media: 'print' });
      await capture(page, 'package-print-desktop-light');
      await page.emulateMedia({ media: 'screen' });

      await route(page, `${zero.base}/#package/00000000-0000-4000-8000-000000000000`, 'Work package unavailable');
      await capture(page, 'missing-record-error-desktop-dark');

      await page.setViewportSize(viewports['iphone-portrait']);
      await page.reload();
      await route(page, `${zero.base}/#home`, 'Home');
      await page.getByRole('button', { name: 'Show navigation' }).click();
      await capture(page, 'navigation-drawer-iphone-portrait-dark');
      await page.mouse.click(382, 430);
      await route(page, `${zero.base}/#package/${shared.packagePublicId}/connections`, 'PKG-VISUAL-001', 'This completed schedule is locked. Reopen the package before editing.');
      await page.evaluate(() => navigator.serviceWorker.ready);
      await context.setOffline(true);
      await page.locator('.mobile-status').filter({ hasText: 'Offline' }).waitFor();
      await capture(page, 'package-fibre-offline-iphone-portrait-dark');
      await context.setOffline(false);

      await page.setViewportSize(viewports.desktop);
      await page.reload();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
      await capture(page, 'sign-in-desktop-dark');
      await page.getByLabel('Username').fill('visual-admin-zero');
      await page.getByLabel('Password').fill('incorrect-fictional-password');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByRole('alert').filter({ hasText: /Invalid username or password/ }).waitFor();
      await capture(page, 'validation-error-desktop-dark');
      await page.getByLabel('Password').fill('fictional-visual-password-zero');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByRole('heading', { name: 'PKG-VISUAL-001', exact: true }).waitFor();

      await captureResponsiveMatrix(page, zero.base, shared);
      await context.close();
      console.log('PASS zero-plugin visual states and responsive matrix');
    } finally { await stop(zero); }

    const fictional = await start('fictional-plugin');
    try {
      const context = await browser.newContext({ viewport: viewports.desktop, colorScheme: 'dark', reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto(fictional.base);
      await setup(page, 'fictional');
      await route(page, `${fictional.base}/#import`, 'Import');
      await capture(page, 'import-provider-selection-desktop-dark');
      await page.getByLabel('Provider').selectOption('example.fictional-facility.json');
      await page.getByLabel('Source content').fill(fs.readFileSync(path.join(root, 'examples', 'fictional-plugin', 'example-plan.json'), 'utf8'));
      await page.getByRole('button', { name: 'Validate and preview' }).click();
      await page.getByRole('heading', { name: 'Normalized preview', exact: true }).waitFor();
      await capture(page, 'import-preview-reconciliation-desktop-dark');
      await page.getByRole('button', { name: 'Approve import' }).click();
      await page.getByRole('heading', { name: 'Import applied', exact: true }).waitFor();
      await capture(page, 'import-result-desktop-dark');
      await context.close();
      console.log('PASS fictional-plugin import visual states');
    } finally { await stop(fictional); }
    if (!updateBaselines) assert.deepEqual(Object.keys(observed.captures).sort(), Object.keys(expected.captures).sort(), 'Visual baseline set differs from the exercised capture matrix');
  } finally {
    await browser.close();
    if (updateBaselines) {
      fs.writeFileSync(baselineFile, `${JSON.stringify(observed, null, 2)}\n`);
      console.log(`Updated visual baselines: ${baselineFile}`);
    }
    console.log(`Visual artifacts: ${artifacts}`);
  }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
