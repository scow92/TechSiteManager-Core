'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ignored = new Set(['node_modules', '.git', 'data', 'sbom.cdx.json']);
const findings = [];
const allowedRootFiles = new Set([
  '.dockerignore', '.gitignore', '.nvmrc', 'AGENTS.md', 'CONTRIBUTING.md',
  'COPYRIGHT.md', 'Dockerfile', 'LICENSE', 'README.md', 'SECURITY.md',
  'docker-compose.yml', 'eslint.config.js', 'package-lock.json', 'package.json'
]);
const allowedRootDirectories = new Set(['.github', 'config', 'docs', 'examples', 'public', 'server']);
const forbiddenExtensions = new Set([
  '.7z', '.bak', '.db', '.doc', '.docx', '.dump', '.gz', '.jpeg', '.jpg',
  '.key', '.log', '.ods', '.pem', '.png', '.sqlite', '.sqlite3', '.tar',
  '.tgz', '.webp', '.xls', '.xlsm', '.xlsx', '.zip'
]);
const patterns = [
  ['secret-material', /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|(?:password|token|secret|api[-_]?key)\s*[:=]\s*["'][^"']{8,}["']/i],
  ['internal-ipv4', /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})\b/],
  ['private-path', /(?:^|["'\s])\/(?:srv|home|Users)\//],
  ['non-reserved-domain', /\bhttps?:\/\/(?!(?:127\.0\.0\.1|localhost)(?::(?:\d+|\$\{[^}]+\}))?(?=[/\s"'`]|$)|[^/\s]+\.(?:invalid|example|test)(?::(?:\d+|\$\{[^}]+\}))?(?=[/\s"'`]|$))[^\s"'`)]+/i]
];

function relative(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function allowedPath(file) {
  const name = relative(file);
  const [top] = name.split('/');
  return name && (allowedRootFiles.has(name) || allowedRootDirectories.has(top));
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else {
      const name = relative(file);
      if (!allowedPath(file)) findings.push({ category: 'path-not-allowlisted', path: name });
      if (forbiddenExtensions.has(path.extname(entry.name).toLowerCase())) findings.push({ category: 'forbidden-artifact-type', path: name });
      const bytes = fs.readFileSync(file);
      if (bytes.includes(0)) {
        findings.push({ category: 'binary-file', path: name });
        continue;
      }
      const text = bytes.toString('utf8');
      for (const [category, pattern] of patterns) {
        if (category === 'non-reserved-domain' && (name === 'package-lock.json' || name === 'LICENSE' || name.endsWith('/LICENSE'))) continue;
        if (pattern.test(text)) findings.push({ category, path: name });
      }
    }
  }
}
walk(root);
if (findings.length) {
  console.error(JSON.stringify({ status: 'failed', findings }, null, 2));
  process.exitCode = 1;
} else console.log(JSON.stringify({ status: 'passed', scannedRoot: '.' }));
