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
  await page.getByRole('heading', { name: /SITE-DEMO-01/ }).waitFor();
  await page.getByRole('button', { name: 'Edit site' }).click();
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
