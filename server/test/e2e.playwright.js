'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}

async function start(configName) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), `tsm-e2e-${configName}-`));
  const port = await availablePort();
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, DB_FILE: path.join(dataDir, 'test.db'), PLUGIN_CONFIG_FILE: path.join(root, 'config', `${configName}.json`) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let diagnostics = '';
  child.stdout.on('data', (chunk) => { diagnostics += chunk.toString(); });
  child.stderr.on('data', (chunk) => { diagnostics += chunk.toString(); });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited before readiness: ${diagnostics.slice(-500)}`);
    try { if ((await fetch(`${base}/api/health`)).ok) return { child, base, dataDir }; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill('SIGTERM');
  throw new Error(`Server did not become ready: ${diagnostics.slice(-500)}`);
}

async function stop(instance) {
  if (instance.child.exitCode === null) {
    instance.child.kill('SIGTERM');
    await new Promise((resolve) => { instance.child.once('exit', resolve); setTimeout(resolve, 3000); });
  }
  fs.rmSync(instance.dataDir, { recursive: true, force: true });
}

async function setup(page, base, suffix) {
  await page.goto(base);
  await page.getByLabel('Username').fill(`admin-${suffix}`);
  await page.getByLabel('Password').fill(`fictional-browser-password-${suffix}`);
  await page.getByLabel('Display name').fill('Browser Administrator');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'Import' }).waitFor();
  await page.getByText(/No work packages have been created yet/).waitFor();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const zero = await start('zero-plugins');
    try {
      const page = await browser.newPage();
      await setup(page, zero.base, 'zero');
      await page.getByRole('link', { name: 'Import' }).click();
      await page.waitForTimeout(500);
      assert.match(await page.locator('body').innerText(), /No import providers are installed\./);
      assert.equal(await page.getByRole('combobox').count(), 0);
      await page.getByRole('link', { name: 'Sites' }).click();
      await page.getByLabel('Code').fill('OFFLINE-DEMO-01');
      await page.getByLabel('Name').fill('Offline Demo Site');
      await page.getByRole('button', { name: 'Add site' }).click();
      await page.getByText('Offline Demo Site').waitFor();
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.getByText('Offline Demo Site').waitFor();
      await page.context().setOffline(true);
      await page.reload();
      await page.getByText('Offline Demo Site').waitFor();
      await page.getByLabel('Code').fill('OFFLINE-QUEUED-02');
      await page.getByLabel('Name').fill('Queued Demo Site');
      await page.getByRole('button', { name: 'Add site' }).click();
      await page.getByText('Site queued for sync').waitFor();
      assert.equal(await page.evaluate(() => globalThis.OfflineStore.all('operation-queue').then((items) => items.length)), 1);
      await page.context().setOffline(false);
      await page.waitForFunction(() => globalThis.OfflineStore.all('operation-queue').then((items) => items.length === 0));
      await page.reload();
      await page.getByText('Queued Demo Site').waitFor();
      await page.getByRole('link', { name: 'Work Packages' }).click();
      await page.getByLabel('Site').selectOption({ label: 'OFFLINE-DEMO-01 — Offline Demo Site' });
      await page.getByLabel('Package reference').fill('PKG-ZERO-PLUGIN-01');
      await page.getByLabel('Title').fill('Zero-plugin demonstration package');
      await page.getByRole('button', { name: 'Add work package' }).click();
      await page.getByRole('heading', { name: 'PKG-ZERO-PLUGIN-01' }).waitFor();
      await page.getByLabel('Title').fill('Updated zero-plugin package');
      await page.getByRole('button', { name: 'Save work package' }).click();
      await page.getByText('Work package saved').waitFor();
      await page.reload();
      assert.equal(await page.getByLabel('Title').inputValue(), 'Updated zero-plugin package');
      await page.getByRole('link', { name: 'Sites' }).click();
      await page.getByRole('link', { name: 'OFFLINE-DEMO-01' }).click();
      await page.getByRole('heading', { name: 'Racks' }).waitFor();
      await page.getByRole('heading', { name: 'Distance samples' }).waitFor();
      await page.close();
      console.log('PASS zero-plugin browser flow');
    } finally { await stop(zero); }

    const fictional = await start('fictional-plugin');
    try {
      const page = await browser.newPage();
      await setup(page, fictional.base, 'fictional');
      await page.getByRole('link', { name: 'Import' }).click();
      await page.getByLabel('Provider').selectOption('example.fictional-facility.json');
      const plan = fs.readFileSync(path.join(root, 'examples', 'fictional-plugin', 'example-plan.json'), 'utf8');
      await page.getByLabel('Source content').fill(plan);
      await page.getByLabel('Stable source reference').fill('demo-facility-plan-001');
      await page.getByRole('button', { name: 'Validate and preview' }).click();
      await page.getByText('Normalized preview').waitFor();
      await page.getByRole('button', { name: 'Approve import' }).click();
      await page.getByText('Import applied').waitFor();
      await page.getByRole('link', { name: 'Work Packages' }).click();
      await page.getByText('PKG-DEMO-100').waitFor();
      const exported = await page.evaluate(async () => {
        const link = [...globalThis.document.querySelectorAll('a')].find((entry) => entry.textContent === 'Fictional facility summary');
        const response = await fetch(link.href);
        return { status: response.status, disposition: response.headers.get('content-disposition'), body: await response.json() };
      });
      assert.equal(exported.status, 200); assert.match(exported.disposition, /PKG-DEMO-100\.facility\.json/); assert.equal(exported.body.segmentCount, 1);
      await page.close();
      console.log('PASS fictional-plugin browser import flow');
    } finally { await stop(fictional); }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
