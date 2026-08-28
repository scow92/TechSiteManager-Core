'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const semver = require('semver');
const { loadProfile } = require('./profiles');
const { DURABLE_ID } = require('../lib/validation');

const CORE_VERSION = require('../../package.json').version;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const CONTRIBUTION_KEYS = new Set(['manifest', 'configSchema', 'imports', 'connectors', 'transforms', 'profiles', 'exporters']);

function pluginError(code, pluginId) {
  const error = new Error(code);
  error.code = code;
  error.pluginId = pluginId;
  return error;
}

function assertId(value, code) {
  if (typeof value !== 'string' || value.length > 128 || !DURABLE_ID.test(value)) throw pluginError(code);
}

function deepFreeze(value, seen = new Set()) {
  if ((!value || (typeof value !== 'object' && typeof value !== 'function')) || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw pluginError('plugin_input_invalid');
  const types = ['file', 'pasted-text', 'external-reference'];
  if (!types.includes(input.type)) throw pluginError('plugin_input_type_invalid');
  if (!Number.isInteger(input.maxBytes) || input.maxBytes < 1 || input.maxBytes > 10 * 1024 * 1024) throw pluginError('plugin_input_limit_invalid');
  if (input.type === 'file' && (!Array.isArray(input.mediaTypes) || !input.mediaTypes.length)) throw pluginError('plugin_input_media_invalid');
  if (input.fields !== undefined) {
    if (!Array.isArray(input.fields) || input.fields.length > 20) throw pluginError('plugin_input_fields_invalid');
    for (const field of input.fields) {
      if (!field || typeof field !== 'object') throw pluginError('plugin_input_field_invalid');
      assertId(field.id, 'plugin_input_field_id_invalid');
      if (!['string', 'multiline', 'integer', 'boolean', 'enum', 'core-entity-selector'].includes(field.type)) throw pluginError('plugin_input_field_type_invalid');
      if (field.secret || /secret|password|credential|token|api[-_]?key/i.test(field.id)) throw pluginError('plugin_input_secret_forbidden');
      if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || field.maxLength > 20_000)) throw pluginError('plugin_input_field_limit_invalid');
      if (field.options !== undefined && (!Array.isArray(field.options) || field.options.length > 100)) throw pluginError('plugin_input_options_invalid');
    }
  }
}

function descriptor(provider) {
  return deepFreeze({ id: provider.id, label: provider.label, input: provider.input });
}

function frozenRegistry(state, degraded) {
  const providers = Object.freeze([...state.providers.values()].map(descriptor));
  return Object.freeze({
    providers,
    degraded: Object.freeze([...degraded]),
    provider(id) { return state.providers.get(id); },
    connector(id) { return state.connectors.get(id); },
    exporter(id) { return state.exporters.get(id); },
    transform(id) { return state.transforms.get(id); },
    profile(id) { return state.profiles.get(id); },
    plugin(id) { return state.plugins.get(id); }
  });
}

function emptyState() {
  return { plugins: new Map(), providers: new Map(), connectors: new Map(), transforms: new Map(), profiles: new Map(), exporters: new Map() };
}

function merge(target, staged) {
  for (const key of Object.keys(target)) {
    for (const id of staged[key].keys()) {
      if (target[key].has(id)) throw pluginError(`duplicate_${key.slice(0, -1)}_id`, id);
    }
  }
  for (const key of Object.keys(target)) {
    for (const [id, value] of staged[key]) {
      target[key].set(id, value);
    }
  }
}

function readConfig(configFile) {
  if (!configFile) return { plugins: [] };
  const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some((key) => key !== 'plugins') || !Array.isArray(parsed.plugins)) throw pluginError('plugin_config_invalid');
  return parsed;
}

function resolvePackage(packageName, searchRoot) {
  if (!PACKAGE_NAME.test(packageName) || packageName.includes('..')) throw pluginError('plugin_package_name_invalid');
  const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [searchRoot] });
  const packageRoot = fs.realpathSync(path.dirname(packageJsonPath));
  const metadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (metadata.name !== packageName) throw pluginError('plugin_package_name_mismatch');
  const entry = fs.realpathSync(require.resolve(packageName, { paths: [searchRoot] }));
  if (entry !== packageRoot && !entry.startsWith(packageRoot + path.sep)) throw pluginError('plugin_package_root_escape');
  return { packageRoot, metadata, entry };
}

function loadOne(spec, searchRoot) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw pluginError('plugin_config_entry_invalid');
  const allowed = ['package', 'required', 'expectedVersion', 'config'];
  if (Object.keys(spec).some((key) => !allowed.includes(key)) || typeof spec.package !== 'string' || typeof spec.required !== 'boolean') throw pluginError('plugin_config_entry_invalid');
  const resolved = resolvePackage(spec.package, searchRoot);
  if (spec.expectedVersion && resolved.metadata.version !== spec.expectedVersion) throw pluginError('plugin_expected_version_mismatch');
  const plugin = require(resolved.entry);
  if (!plugin || typeof plugin !== 'object' || Object.keys(plugin).some((key) => !CONTRIBUTION_KEYS.has(key))) throw pluginError('plugin_export_invalid');
  const manifest = plugin.manifest;
  if (!manifest || manifest.apiVersion !== 1) throw pluginError('plugin_api_incompatible');
  assertId(manifest.id, 'plugin_id_invalid');
  if (manifest.version !== resolved.metadata.version) throw pluginError('plugin_manifest_version_mismatch', manifest.id);
  if (!semver.validRange(manifest.coreCompatibility) || manifest.coreCompatibility === '*' || !semver.satisfies(CORE_VERSION, manifest.coreCompatibility, { includePrerelease: true })) throw pluginError('plugin_core_incompatible', manifest.id);
  if (plugin.configSchema) {
    const validate = new Ajv({ allErrors: false, strict: true }).compile(plugin.configSchema);
    if (!validate(spec.config || {})) throw pluginError('plugin_instance_config_invalid', manifest.id);
  } else if (spec.config && Object.keys(spec.config).length) throw pluginError('plugin_instance_config_unsupported', manifest.id);

  const staged = emptyState();
  staged.plugins.set(manifest.id, deepFreeze({ ...manifest, package: spec.package, config: spec.config || {} }));
  for (const [id, fn] of Object.entries(plugin.transforms || {})) {
    assertId(id, 'plugin_transform_id_invalid');
    if (typeof fn !== 'function') throw pluginError('plugin_transform_invalid', manifest.id);
    staged.transforms.set(id, fn);
  }
  for (const profileEntry of plugin.profiles || []) {
    if (!profileEntry || typeof profileEntry !== 'object') throw pluginError('plugin_profile_invalid', manifest.id);
    assertId(profileEntry.id, 'plugin_profile_id_invalid');
    const loaded = loadProfile(resolved.packageRoot, profileEntry.file, staged.transforms);
    if (loaded.id !== profileEntry.id) throw pluginError('plugin_profile_id_mismatch', manifest.id);
    staged.profiles.set(loaded.id, loaded);
  }
  for (const provider of plugin.imports || []) {
    assertId(provider.id, 'plugin_provider_id_invalid');
    if (typeof provider.label !== 'string' || !provider.label || provider.label.length > 100 || typeof provider.transform !== 'function') throw pluginError('plugin_provider_invalid', manifest.id);
    validateInput(provider.input);
    if (provider.profileId && !staged.profiles.has(provider.profileId)) throw pluginError('plugin_provider_profile_unknown', manifest.id);
    staged.providers.set(provider.id, deepFreeze({ ...provider, pluginId: manifest.id, providerVersion: manifest.version }));
  }
  for (const connector of plugin.connectors || []) {
    assertId(connector.id, 'plugin_connector_id_invalid');
    if (typeof connector.acquire !== 'function') throw pluginError('plugin_connector_invalid', manifest.id);
    staged.connectors.set(connector.id, deepFreeze({ ...connector, pluginId: manifest.id }));
  }
  for (const exporter of plugin.exporters || []) {
    assertId(exporter.id, 'plugin_exporter_id_invalid');
    if (typeof exporter.export !== 'function' || !Number.isInteger(exporter.maxBytes) || exporter.maxBytes > 10 * 1024 * 1024) throw pluginError('plugin_exporter_invalid', manifest.id);
    staged.exporters.set(exporter.id, deepFreeze({ ...exporter, pluginId: manifest.id }));
  }
  return staged;
}

function loadPlugins(options = {}) {
  const { configFile = null, searchRoot = path.join(__dirname, '..', '..') } = options;
  const config = readConfig(configFile);
  const state = emptyState();
  const degraded = [];
  for (const spec of config.plugins) {
    try {
      const staged = loadOne(spec, searchRoot);
      merge(state, staged);
    } catch (error) {
      if (spec && spec.required) {
        const safeCode = /^(?:plugin_|profile_|duplicate_)/.test(error.code || '') ? error.code : 'plugin_load_failed';
        const sanitized = pluginError(safeCode, spec.package);
        sanitized.cause = undefined;
        throw sanitized;
      }
      degraded.push(Object.freeze({ package: spec && spec.package || 'invalid', code: error.code || 'plugin_load_failed' }));
    }
  }
  return frozenRegistry(state, degraded);
}

module.exports = { loadPlugins, CORE_VERSION, validateInput, PACKAGE_NAME };
