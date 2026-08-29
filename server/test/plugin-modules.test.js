'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolvePackage } = require('../plugins/package-resolver');
const { validateManifest } = require('../plugins/manifest-validator');
const { validateInput } = require('../plugins/contribution-validator');
const { emptyState, merge, frozenRegistry } = require('../plugins/registry');

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-plugin-modules-'));
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function packageFixture(root, name = 'fixture-package') {
  const packageRoot = path.join(root, 'node_modules', name);
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.cjs' }));
  fs.writeFileSync(path.join(packageRoot, 'index.cjs'), 'module.exports = {};');
  return packageRoot;
}

test('package resolver accepts exact packages and rejects path-like input', () => {
  const root = temporaryRoot();
  const packageRoot = packageFixture(root);
  const resolved = resolvePackage('fixture-package', root);
  assert.equal(resolved.packageRoot, packageRoot);
  assert.throws(() => resolvePackage('./fixture-package', root), { code: 'plugin_package_name_invalid' });
});

test('manifest validator accepts V1/V2, version pinning, and instance schema', () => {
  const requiredExport = {
    manifest: { apiVersion: 1, id: 'fixture.valid', version: '1.0.0', coreCompatibility: '>=1.0.0-rc.1 <2.0.0' },
    configSchema: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'], additionalProperties: false }
  };
  assert.equal(validateManifest(requiredExport, { version: '1.0.0' }, { enabled: true }).manifest.id, 'fixture.valid');
  assert.equal(validateManifest({ ...requiredExport, manifest: { ...requiredExport.manifest, apiVersion: 2 } }, { version: '1.0.0' }, { enabled: true }).manifest.apiVersion, 2);
  assert.throws(() => validateManifest(requiredExport, { version: '2.0.0' }, { enabled: true }), { code: 'plugin_manifest_version_mismatch' });
  assert.throws(() => validateManifest(requiredExport, { version: '1.0.0' }, { enabled: 'yes' }), { code: 'plugin_instance_config_invalid' });
});

test('contribution descriptor validation rejects secret-shaped and unknown fields', () => {
  assert.equal(validateInput({ type: 'pasted-text', maxBytes: 1024, fields: [] }).type, 'pasted-text');
  assert.throws(() => validateInput({ type: 'pasted-text', maxBytes: 1024, fields: [{ id: 'fixture.token', label: 'Token', type: 'string' }] }), { code: 'plugin_input_secret_forbidden' });
  assert.throws(() => validateInput({ type: 'pasted-text', maxBytes: 1024, fields: [], unexpected: true }), { code: 'plugin_input_unknown_field' });
});

test('registry duplicate preflight preserves all-or-nothing publication and freezing', () => {
  const target = emptyState();
  target.providers.set('fixture.shared', /** @type {never} */ ({ id: 'fixture.shared' }));
  const staged = emptyState();
  staged.plugins.set('fixture.optional', /** @type {never} */ ({ id: 'fixture.optional' }));
  staged.providers.set('fixture.shared', /** @type {never} */ ({ id: 'fixture.shared' }));
  assert.throws(() => merge(target, staged), { code: 'duplicate_provider_id' });
  assert.equal(target.plugins.has('fixture.optional'), false);
  const registry = frozenRegistry(emptyState(), []);
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.providers), true);
});
