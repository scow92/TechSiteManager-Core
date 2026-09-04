'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { verify } = require('../lib/backup');

const root = path.join(__dirname, '..', '..');
function availablePort() { return new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }

test('checked-in container runs non-root with a read-only, capability-free compose contract', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'); const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  assert.match(dockerfile, /distroless\/nodejs24-debian13:nonroot@sha256:/); assert.match(dockerfile, /USER nonroot/);
  assert.match(compose, /read_only: true/); assert.match(compose, /cap_drop: \[ALL\]/); assert.match(compose, /no-new-privileges:true/); assert.match(compose, /\/tmp:mode=700,uid=65532,gid=65532/); assert.match(compose, /\/api\/health/);
});

test('health reports database and backup age without paths, then SIGTERM drains cleanly', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-operations-')); const port = await availablePort(); const statusFile = path.join(dataDir, 'backup-status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ schemaVersion: 'techsitemanager.io/backup-manifest/v1', createdAt: '2020-01-01T00:00:00.000Z', encrypted: true }), { mode: 0o600 });
  const child = spawn(process.execPath, ['server/server.js'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, DB_FILE: path.join(dataDir, 'operations.db'), PLUGIN_CONFIG_FILE: path.join(root, 'config', 'zero-plugins.json'), BACKUP_STATUS_FILE: statusFile, MAX_BACKUP_AGE_HOURS: '1', SHUTDOWN_TIMEOUT_MS: '1000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { output += chunk; }); const base = `http://127.0.0.1:${port}`; let health;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) { try { const response = await fetch(`${base}/api/health`); if (response.ok) { health = await response.json(); break; } } catch { /* retry */ } await new Promise((resolve) => setTimeout(resolve, 50)); }
    assert.ok(health, output); assert.equal(health.status, 'degraded'); assert.equal(health.database, 'ready'); assert.equal(health.backup.status, 'stale'); assert.equal(health.backup.encrypted, true); assert.doesNotMatch(JSON.stringify(health), /backup-status|operations\.db|tsm-operations/);
    child.kill('SIGTERM'); const exit = await new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
    assert.deepEqual(exit, { code: 0, signal: null }); verify(path.join(dataDir, 'operations.db'));
  } finally { if (child.exitCode === null) child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
