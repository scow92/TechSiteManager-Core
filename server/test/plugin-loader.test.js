'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadPlugins } = require('../plugins/loader');
const { parseProfile } = require('../plugins/profiles');
const { parsePresentation } = require('../plugins/presentations');

function temporaryRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-plugin-test-')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function packageFixture(root, name, options = {}) {
  const packageRoot = path.join(root, 'node_modules', ...name.split('/'));
  fs.mkdirSync(packageRoot, { recursive: true });
  writeJson(path.join(packageRoot, 'package.json'), { name, version: options.packageVersion || '1.0.0', main: 'index.cjs' });
  const manifest = options.manifest || { apiVersion: 1, id: options.pluginId || `fixture.${name.replace(/[^a-z0-9]+/g, '-')}`, version: options.manifestVersion || '1.0.0', coreCompatibility: options.compatibility || '>=1.0.0-rc.1 <2.0.0' };
  const provider = options.providerId ? `,imports:[{id:${JSON.stringify(options.providerId)},label:'Fixture provider',input:{type:'pasted-text',maxBytes:1024,fields:[]},transform:async()=>({})}]` : '';
  fs.writeFileSync(path.join(packageRoot, 'index.cjs'), `module.exports={manifest:${JSON.stringify(manifest)}${provider}};`);
  return packageRoot;
}
function config(root, entries) { const file = path.join(root, 'plugins.json'); writeJson(file, { plugins: entries.map((entry) => ({ expectedVersion: '1.0.0', ...entry })) }); return file; }

test('zero-plugin registry is ready and empty', () => {
  const registry = loadPlugins({ configFile: path.join(__dirname, '..', '..', 'config', 'zero-plugins.json'), searchRoot: path.join(__dirname, '..', '..') });
  assert.equal(registry.providers.length, 0);
  assert.equal(registry.degraded.length, 0);
  assert.ok(Object.isFrozen(registry));
});

test('fictional plugin registers one validated provider and profile', () => {
  const root = path.join(__dirname, '..', '..');
  const registry = loadPlugins({ configFile: path.join(root, 'config', 'fictional-plugin.json'), searchRoot: root });
  assert.deepEqual(registry.providers.map((entry) => entry.id), ['example.fictional-facility.json']);
  assert.deepEqual(registry.exporters.map((entry) => entry.id), ['example.fictional-facility.summary']);
  assert.deepEqual(registry.presentations.map((entry) => entry.id), ['example.fictional-facility.presentation-v1']);
  assert.equal(registry.presentationFor('work-package').terms.singular, 'Facility plan');
  assert.equal(registry.profile('example.facility-json-v1').schemaVersion, 'techsitemanager.io/import-profile/v1');
  assert.match(registry.profile('example.facility-json-v1').hash, /^sha256:[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(registry.provider('example.fictional-facility.json').input));
  assert.ok(Object.isFrozen(registry.profile('example.facility-json-v1').fieldOwnership));
});

test('plugin configuration requires an exact expected package version', () => {
  const root = temporaryRoot(); packageFixture(root, 'fixture-unpinned');
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-unpinned', required: true, expectedVersion: undefined }]), searchRoot: root }), { code: 'plugin_config_entry_invalid' });
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-unpinned', required: true, expectedVersion: '^1.0.0' }]), searchRoot: root }), { code: 'plugin_config_entry_invalid' });
});

test('missing required plugin fails with a sanitized code', () => {
  const root = temporaryRoot();
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-missing', required: true }]), searchRoot: root }), (error) => error.code === 'plugin_load_failed' || error.code === 'MODULE_NOT_FOUND');
});

test('missing optional plugin is omitted atomically and degrades readiness', () => {
  const root = temporaryRoot();
  const registry = loadPlugins({ configFile: config(root, [{ package: 'fixture-missing', required: false }]), searchRoot: root });
  assert.equal(registry.providers.length, 0);
  assert.equal(registry.degraded.length, 1);
  assert.equal(registry.degraded[0].package, 'fixture-missing');
});

test('manifest version and core compatibility are verified', () => {
  const root = temporaryRoot();
  packageFixture(root, 'fixture-version', { manifestVersion: '2.0.0' });
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-version', required: true }]), searchRoot: root }), { code: 'plugin_manifest_version_mismatch' });
  packageFixture(root, 'fixture-core', { compatibility: '>=9.0.0 <10.0.0' });
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-core', required: true }]), searchRoot: root }), { code: 'plugin_core_incompatible' });
});

test('duplicate durable provider IDs reject registry publication', () => {
  const root = temporaryRoot();
  packageFixture(root, 'fixture-one', { pluginId: 'fixture.one', providerId: 'fixture.shared.provider' });
  packageFixture(root, 'fixture-two', { pluginId: 'fixture.two', providerId: 'fixture.shared.provider' });
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-one', required: true }, { package: 'fixture-two', required: true }]), searchRoot: root }), { code: 'duplicate_provider_id' });
  const registry = loadPlugins({ configFile: config(root, [{ package: 'fixture-one', required: true }, { package: 'fixture-two', required: false }]), searchRoot: root });
  assert.equal(registry.plugin('fixture.two'), undefined);
  assert.equal(registry.degraded[0].code, 'duplicate_provider_id');
});

test('unknown contribution fields and duplicate IDs within one package are rejected', () => {
  const root = temporaryRoot();
  const packageRoot = packageFixture(root, 'fixture-strict');
  fs.writeFileSync(path.join(packageRoot, 'index.cjs'), "module.exports={manifest:{apiVersion:1,id:'fixture.strict',version:'1.0.0',coreCompatibility:'>=1.0.0-rc.1 <2.0.0'},imports:[{id:'fixture.strict.provider',label:'Strict',input:{type:'pasted-text',maxBytes:10,fields:[],unexpected:true},transform:async()=>({})}]};");
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-strict', required: true }]), searchRoot: root }), { code: 'plugin_input_unknown_field' });
  fs.writeFileSync(path.join(packageRoot, 'index.cjs'), "const provider={id:'fixture.strict.provider',label:'Strict',input:{type:'pasted-text',maxBytes:10,fields:[]},transform:async()=>({})};module.exports={manifest:{apiVersion:1,id:'fixture.strict',version:'1.0.0',coreCompatibility:'>=1.0.0-rc.1 <2.0.0'},imports:[provider,provider]};");
  delete require.cache[path.join(packageRoot, 'index.cjs')];
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-strict', required: true }]), searchRoot: root }), { code: 'duplicate_provider_id' });
});

test('package names are exact and reject paths, URLs, and package-root escape', () => {
  const root = temporaryRoot();
  for (const name of ['../fixture', '/tmp/fixture', 'https://invalid.test/pkg', 'git+ssh://invalid/pkg']) {
    assert.throws(() => loadPlugins({ configFile: config(root, [{ package: name, required: true }]), searchRoot: root }), { code: 'plugin_package_name_invalid' });
  }
  const packageRoot = packageFixture(root, 'fixture-escape');
  const outside = path.join(root, 'outside.cjs');
  fs.writeFileSync(outside, `module.exports={manifest:{apiVersion:1,id:'fixture.escape',version:'1.0.0',coreCompatibility:'>=1.0.0-rc.1 <2.0.0'}};`);
  fs.unlinkSync(path.join(packageRoot, 'index.cjs'));
  fs.symlinkSync(outside, path.join(packageRoot, 'index.cjs'));
  assert.throws(() => loadPlugins({ configFile: config(root, [{ package: 'fixture-escape', required: true }]), searchRoot: root }), { code: 'plugin_package_root_escape' });
});

test('profile traversal and symlink escape are rejected', () => {
  for (const symlink of [false, true]) {
    const root = temporaryRoot();
    const packageRoot = packageFixture(root, symlink ? 'fixture-profile-symlink' : 'fixture-profile-traversal');
    const outside = path.join(root, 'outside.yaml');
    fs.writeFileSync(outside, 'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\ntransforms: []\n');
    const profileFile = symlink ? 'linked.yaml' : '../../../outside.yaml';
    if (symlink) fs.symlinkSync(outside, path.join(packageRoot, profileFile));
    fs.writeFileSync(path.join(packageRoot, 'index.cjs'), `module.exports={manifest:{apiVersion:1,id:'fixture.profile-plugin',version:'1.0.0',coreCompatibility:'>=1.0.0-rc.1 <2.0.0'},profiles:[{id:'fixture.profile',file:${JSON.stringify(profileFile)}}]};`);
    const name = symlink ? 'fixture-profile-symlink' : 'fixture-profile-traversal';
    assert.throws(() => loadPlugins({ configFile: config(root, [{ package: name, required: true }]), searchRoot: root }), (error) => ['profile_path_escape', 'profile_symlink_escape'].includes(error.code));
  }
});

test('profiles reject duplicate keys, aliases, unknown schema/keys/transforms, secrets, and expressions', () => {
  const transforms = new Map([['fixture.transform', () => {}]]);
  const invalid = [
    'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\nid: fixture.other\ntransforms: []\n',
    'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\ndefaults: &base\n  status: planned\nmappings: *base\ntransforms: []\n',
    'schemaVersion: techsitemanager.io/import-profile/v2\nid: fixture.profile\ntransforms: []\n',
    'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\nunknown: true\ntransforms: []\n',
    'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\ntransforms: [fixture.missing]\n',
    'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\ndefaults:\n  apiKey: value\ntransforms: []\n',
    'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\ndefaults:\n  status: "${run()}"\ntransforms: []\n'
    , 'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\nregex: "(a+)+$"\ntransforms: []\n'
    , 'schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\ndefaults:\n  status: !custom planned\ntransforms: []\n'
  ];
  for (const source of invalid) assert.throws(() => parseProfile(source, transforms));
});

test('valid profile supports data mappings, ownership, identity, and registered transforms', () => {
  const profile = parseProfile('schemaVersion: techsitemanager.io/import-profile/v1\nid: fixture.profile\naliases:\n  room: suite\ndefaults:\n  status: planned\nfieldOwnership:\n  title: source-owned\nidentity:\n  source: sourceId\ntransforms: [fixture.transform]\n', new Map([['fixture.transform', () => {}]]));
  assert.equal(profile.fieldOwnership.title, 'source-owned');
  assert.ok(Object.isFrozen(profile));
});

test('presentation profiles reject executable data, foreign namespaces, and unknown components', () => {
  const base = 'schemaVersion: techsitemanager.io/presentation-profile/v1\nid: fixture.presentation\nentityType: work-package\nterms: { singular: Plan, plural: Plans, childSingular: Task, childPlural: Tasks }\nfields:\n  - { id: title, entityType: work-package, binding: core.title, label: Title, type: string }\nviews:\n  - { id: details, label: Details, component: record-form, sections: [{ id: main, label: Main, fields: [title] }] }\n';
  assert.equal(parsePresentation(base, 'fixture.plugin').views[0].component, 'record-form');
  assert.throws(() => parsePresentation(base.replace('core.title', 'extension.other.plugin.field'), 'fixture.plugin'), { code: 'presentation_binding_scope_invalid' });
  assert.throws(() => parsePresentation(base.replace('record-form', 'browser-script'), 'fixture.plugin'), { code: 'presentation_component_invalid' });
  assert.throws(() => parsePresentation(base.replace('label: Title', 'label: "${run()}"'), 'fixture.plugin'), { code: 'presentation_forbidden_value' });
});
