'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const allowedRootFiles = new Set(['AGENTS.md', 'CONTRIBUTING.md', 'COPYRIGHT.md', 'Dockerfile', 'LICENSE', 'README.md', 'SECURITY.md', 'docker-compose.yml', 'package.json']);
const allowedDirectories = new Set(['config', 'docs', 'examples', 'public', 'server']);
const forbiddenExtensions = new Set(['.7z', '.bak', '.db', '.dump', '.gz', '.key', '.log', '.pem', '.sqlite', '.sqlite3', '.tar', '.tgz', '.zip']);
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-package-review-'));
let output;
try {
  output = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8', env: { ...process.env, NPM_CONFIG_CACHE: cache } });
} finally { fs.rmSync(cache, { recursive: true, force: true }); }
const report = JSON.parse(output)[0];
const failures = [];

for (const entry of report.files) {
  const [top] = entry.path.split('/');
  if (!allowedRootFiles.has(entry.path) && !allowedDirectories.has(top)) failures.push({ path: entry.path, reason: 'path_not_allowlisted' });
  if (forbiddenExtensions.has(path.extname(entry.path).toLowerCase())) failures.push({ path: entry.path, reason: 'artifact_type_forbidden' });
}

console.log(JSON.stringify({ status: failures.length ? 'failed' : 'passed', files: report.entryCount, unpackedBytes: report.unpackedSize, failures }, null, 2));
if (failures.length) process.exitCode = 1;
