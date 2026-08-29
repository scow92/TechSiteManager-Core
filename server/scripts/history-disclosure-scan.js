'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const allowedRootFiles = new Set([
  '.dockerignore', '.gitignore', '.nvmrc', 'AGENTS.md', 'CONTRIBUTING.md',
  'COPYRIGHT.md', 'Dockerfile', 'LICENSE', 'README.md', 'SECURITY.md',
  'docker-compose.yml', 'eslint.config.js', 'package-lock.json', 'package.json'
]);
const allowedRootDirectories = new Set(['.github', 'config', 'docs', 'examples', 'public', 'server']);
const forbiddenExtensions = new Set(['.7z', '.bak', '.db', '.doc', '.docx', '.dump', '.gz', '.jpeg', '.jpg', '.key', '.log', '.ods', '.pem', '.png', '.sqlite', '.sqlite3', '.tar', '.tgz', '.webp', '.xls', '.xlsm', '.xlsx', '.zip']);
const patterns = [
  ['secret-material', /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:password|token|secret|api[-_]?key)\s*[:=]\s*["'][^"']{8,}["']/i],
  ['internal-ipv4', /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})\b/],
  ['private-path', /(?:^|["'\s])\/(?:srv|home|Users)\//],
  ['non-reserved-domain', /\bhttps?:\/\/(?!(?:127\.0\.0\.1|localhost)(?::(?:\d+|\$\{[^}]+\}))?(?=[/\s"'`]|$)|[^/\s]+\.(?:invalid|example|test)(?::(?:\d+|\$\{[^}]+\}))?(?=[/\s"'`]|$))[^\s"'`)]+/i]
];
const findings = [];
const commits = execFileSync('git', ['rev-list', '--all'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
let blobs = 0;

for (const commit of commits) {
  const tree = execFileSync('git', ['ls-tree', '-rz', '--full-tree', '-r', commit], { cwd: root });
  for (const record of tree.toString('utf8').split('\0').filter(Boolean)) {
    const match = record.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/s);
    if (!match) continue;
    const [, objectId, file] = match; const [top] = file.split('/'); blobs += 1;
    if (!allowedRootFiles.has(file) && !allowedRootDirectories.has(top)) findings.push({ category: 'path-not-allowlisted', commit, path: file });
    if (forbiddenExtensions.has(path.extname(file).toLowerCase())) findings.push({ category: 'forbidden-artifact-type', commit, path: file });
    const bytes = execFileSync('git', ['cat-file', 'blob', objectId], { cwd: root, maxBuffer: 20 * 1024 * 1024 });
    if (bytes.includes(0)) { findings.push({ category: 'binary-file', commit, path: file }); continue; }
    const text = bytes.toString('utf8');
    for (const [category, pattern] of patterns) {
      if (category === 'non-reserved-domain' && (file === 'package-lock.json' || file === 'LICENSE' || file.endsWith('/LICENSE'))) continue;
      if (pattern.test(text)) findings.push({ category, commit, path: file });
    }
  }
}

console.log(JSON.stringify({ status: findings.length ? 'failed' : 'passed', commits: commits.length, blobs, findings }, null, 2));
if (findings.length) process.exitCode = 1;
