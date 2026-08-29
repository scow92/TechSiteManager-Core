'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const accepted = new Set(['0BSD', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'BlueOak-1.0.0', 'ISC', 'MIT', 'Python-2.0']);
const internalExamples = new Set(['@techsitemanager/fictional-facility-plugin']);
const dependencies = [];
const failures = [];

for (const packagePath of Object.keys(lock.packages || {})) {
  if (!packagePath.startsWith('node_modules/')) continue;
  const metadataFile = path.join(root, packagePath, 'package.json');
  if (!fs.existsSync(metadataFile) && lock.packages[packagePath].optional) continue;
  if (!fs.existsSync(metadataFile)) { failures.push({ packagePath, reason: 'metadata_missing' }); continue; }
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  const license = typeof metadata.license === 'string' ? metadata.license : null;
  const internal = internalExamples.has(metadata.name);
  dependencies.push({ name: metadata.name, version: metadata.version, license, internalExample: internal });
  if (!internal && (!license || !accepted.has(license))) failures.push({ name: metadata.name, version: metadata.version, license, reason: 'license_not_allowlisted' });
}

const result = {
  status: failures.length ? 'failed' : 'passed',
  dependencies: dependencies.length,
  licenses: [...new Set(dependencies.filter((entry) => !entry.internalExample).map((entry) => entry.license))].sort(),
  projectExamples: dependencies.filter((entry) => entry.internalExample).map((entry) => `${entry.name}@${entry.version}`),
  failures
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
