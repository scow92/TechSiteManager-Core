'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const ignored = new Set(['node_modules', '.git', 'data', 'sbom.cdx.json']);
const findings = [];
const patterns = [
  ['secret-material', /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}/],
  ['internal-ipv4', /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})\b/],
  ['private-path', /(?:^|["'\s])\/(?:srv|home|Users)\//]
];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else {
      const bytes = fs.readFileSync(file);
      if (bytes.includes(0)) continue;
      const text = bytes.toString('utf8');
      for (const [category, pattern] of patterns) if (pattern.test(text)) findings.push({ category, path: path.relative(root, file) });
    }
  }
}
walk(root);
if (findings.length) {
  console.error(JSON.stringify({ status: 'failed', findings }, null, 2));
  process.exitCode = 1;
} else console.log(JSON.stringify({ status: 'passed', scannedRoot: '.' }));
