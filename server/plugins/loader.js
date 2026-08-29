'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = /** @type {typeof import('ajv').default} */ (/** @type {unknown} */ (require('ajv')));
const semver = require('semver');
const { loadProfile } = require('./profiles');
const { DURABLE_ID } = require('../lib/validation');

const CORE_VERSION = require('../../package.json').version;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const CONTRIBUTION_KEYS = new Set(['manifest', 'configSchema', 'imports', 'connectors', 'transforms', 'profiles', 'exporters']);
const MANIFEST_KEYS = new Set(['apiVersion', 'id', 'version', 'coreCompatibility']);

/** @typedef {import('techsitemanager/plugin-api').PluginManifest} PluginManifest */
/** @typedef {import('techsitemanager/plugin-api').PluginPackage} PluginPackage */
/** @typedef {import('techsitemanager/plugin-api').ProviderInputDescriptor} ProviderInputDescriptor */
/** @typedef {import('techsitemanager/plugin-api').LoadedImportProvider} LoadedImportProvider */
/** @typedef {import('techsitemanager/plugin-api').LoadedSourceConnector} LoadedSourceConnector */
/** @typedef {import('techsitemanager/plugin-api').LoadedExporter} LoadedExporter */
/** @typedef {import('techsitemanager/plugin-api').LoadedPlugin} LoadedPlugin */
/**
 * @typedef {{
 *   plugins: Map<string, LoadedPlugin>,
 *   providers: Map<string, LoadedImportProvider>,
 *   connectors: Map<string, LoadedSourceConnector>,
 *   transforms: Map<string, import('techsitemanager/plugin-api').NamedTransform>,
 *   profiles: Map<string, import('techsitemanager/plugin-api').ImportProfile>,
 *   exporters: Map<string, LoadedExporter>
 * }} RegistryState
 */
/** @typedef {keyof RegistryState} RegistryStateKey */
/** @typedef {Error & { code: string, pluginId?: string }} PluginError */

/** @param {string} code @param {string} [pluginId] @returns {PluginError} */
function pluginError(code, pluginId) {
  return Object.assign(new Error(code), { code, pluginId });
}

/** @param {unknown} value @param {string} code @returns {string} */
function assertId(value, code) {
  if (typeof value !== 'string' || value.length > 128 || !DURABLE_ID.test(value)) throw pluginError(code);
  return value;
}

/** @template T @param {T} value @param {Set<unknown>} [seen] @returns {Readonly<T>} */
function deepFreeze(value, seen = new Set()) {
  if ((!value || (typeof value !== 'object' && typeof value !== 'function')) || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), seen);
  return Object.freeze(value);
}

/** @param {unknown} input @returns {ProviderInputDescriptor} */
function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw pluginError('plugin_input_invalid');
  const descriptor = /** @type {Record<string, unknown>} */ (input);
  if (Object.keys(descriptor).some((key) => !['type', 'maxBytes', 'mediaTypes', 'fields'].includes(key))) throw pluginError('plugin_input_unknown_field');
  const types = ['file', 'pasted-text', 'external-reference'];
  if (typeof descriptor.type !== 'string' || !types.includes(descriptor.type)) throw pluginError('plugin_input_type_invalid');
  if (typeof descriptor.maxBytes !== 'number' || !Number.isInteger(descriptor.maxBytes) || descriptor.maxBytes < 1 || descriptor.maxBytes > 10 * 1024 * 1024) throw pluginError('plugin_input_limit_invalid');
  if (descriptor.type === 'file' && (!Array.isArray(descriptor.mediaTypes) || !descriptor.mediaTypes.length || descriptor.mediaTypes.length > 50 || descriptor.mediaTypes.some((mediaType) => typeof mediaType !== 'string' || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mediaType)))) throw pluginError('plugin_input_media_invalid');
  if (descriptor.fields !== undefined) {
    if (!Array.isArray(descriptor.fields) || descriptor.fields.length > 20) throw pluginError('plugin_input_fields_invalid');
    for (const fieldValue of descriptor.fields) {
      const field = plainRecord(fieldValue, 'plugin_input_field_invalid');
      if (Object.keys(field).some((key) => !['id', 'label', 'type', 'required', 'maxLength', 'options'].includes(key))) throw pluginError('plugin_input_field_invalid');
      const fieldId = assertId(field.id, 'plugin_input_field_id_invalid');
      if (typeof field.label !== 'string' || !field.label || field.label.length > 100) throw pluginError('plugin_input_field_label_invalid');
      if (typeof field.type !== 'string' || !['string', 'multiline', 'integer', 'boolean', 'enum', 'core-entity-selector'].includes(field.type)) throw pluginError('plugin_input_field_type_invalid');
      if (/secret|password|credential|token|api[-_]?key/i.test(fieldId)) throw pluginError('plugin_input_secret_forbidden');
      if (field.required !== undefined && typeof field.required !== 'boolean') throw pluginError('plugin_input_field_required_invalid');
      if (field.maxLength !== undefined && (typeof field.maxLength !== 'number' || !Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 20_000)) throw pluginError('plugin_input_field_limit_invalid');
      if (field.options !== undefined) {
        if (!Array.isArray(field.options) || field.options.length > 100) throw pluginError('plugin_input_options_invalid');
        const options = /** @type {unknown[]} */ (field.options);
        if (options.some((option) => typeof option !== 'string' || !option || option.length > 100)) throw pluginError('plugin_input_options_invalid');
      }
      if (field.type === 'enum' && (!Array.isArray(field.options) || !field.options.length)) throw pluginError('plugin_input_options_invalid');
    }
    if (new Set(descriptor.fields.map((field) => field.id)).size !== descriptor.fields.length) throw pluginError('plugin_input_field_id_duplicate');
  }
  return /** @type {ProviderInputDescriptor} */ (/** @type {unknown} */ (input));
}

/** @param {LoadedImportProvider} provider @returns {import('techsitemanager/plugin-api').ProviderDescriptor} */
function descriptor(provider) {
  return deepFreeze({ id: provider.id, label: provider.label, input: { ...provider.input, fields: provider.input.fields || [] } });
}

/** @param {LoadedExporter} exporter @returns {import('techsitemanager/plugin-api').ExporterDescriptor} */
function exporterDescriptor(exporter) {
  return deepFreeze({ id: exporter.id, label: exporter.label, mediaType: exporter.mediaType, fileExtension: exporter.fileExtension });
}

/** @param {RegistryState} state @param {{ package: string, code: string }[]} degraded @returns {import('techsitemanager/plugin-api').PluginRegistry} */
function frozenRegistry(state, degraded) {
  const providers = Object.freeze([...state.providers.values()].map(descriptor));
  const exporters = Object.freeze([...state.exporters.values()].map(exporterDescriptor));
  return Object.freeze({
    providers, exporters,
    degraded: Object.freeze([...degraded]),
    provider(/** @type {string} */ id) { return state.providers.get(id); },
    connector(/** @type {string} */ id) { return state.connectors.get(id); },
    exporter(/** @type {string} */ id) { return state.exporters.get(id); },
    transform(/** @type {string} */ id) { return state.transforms.get(id); },
    profile(/** @type {string} */ id) { return state.profiles.get(id); },
    plugin(/** @type {string} */ id) { return state.plugins.get(id); }
  });
}

/** @returns {RegistryState} */
function emptyState() {
  return { plugins: new Map(), providers: new Map(), connectors: new Map(), transforms: new Map(), profiles: new Map(), exporters: new Map() };
}

/** @template T @param {Map<string, T>} target @param {Map<string, T>} staged @param {RegistryStateKey} key */
function assertNoDuplicates(target, staged, key) {
  for (const id of staged.keys()) if (target.has(id)) throw pluginError(`duplicate_${key.slice(0, -1)}_id`, id);
}

/** @template T @param {Map<string, T>} target @param {Map<string, T>} staged */
function appendMap(target, staged) {
  for (const [id, value] of staged) target.set(id, value);
}

/** @param {RegistryState} target @param {RegistryState} staged */
function merge(target, staged) {
  assertNoDuplicates(target.plugins, staged.plugins, 'plugins');
  assertNoDuplicates(target.providers, staged.providers, 'providers');
  assertNoDuplicates(target.connectors, staged.connectors, 'connectors');
  assertNoDuplicates(target.transforms, staged.transforms, 'transforms');
  assertNoDuplicates(target.profiles, staged.profiles, 'profiles');
  assertNoDuplicates(target.exporters, staged.exporters, 'exporters');
  appendMap(target.plugins, staged.plugins);
  appendMap(target.providers, staged.providers);
  appendMap(target.connectors, staged.connectors);
  appendMap(target.transforms, staged.transforms);
  appendMap(target.profiles, staged.profiles);
  appendMap(target.exporters, staged.exporters);
}

/** @param {unknown} value @param {string} code @returns {Record<string, unknown>} */
function plainRecord(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw pluginError(code);
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {string | null} configFile @returns {{ plugins: unknown[] }} */
function readConfig(configFile) {
  if (!configFile) return { plugins: [] };
  /** @type {unknown} */
  const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const config = plainRecord(parsed, 'plugin_config_invalid');
  if (Object.keys(config).some((key) => key !== 'plugins') || !Array.isArray(config.plugins)) throw pluginError('plugin_config_invalid');
  return { plugins: config.plugins };
}

/**
 * @param {string} packageName
 * @param {string} searchRoot
 * @returns {{ packageRoot: string, metadata: { name: string, version: string }, entry: string }}
 */
function resolvePackage(packageName, searchRoot) {
  if (!PACKAGE_NAME.test(packageName) || packageName.includes('..')) throw pluginError('plugin_package_name_invalid');
  const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [searchRoot] });
  const packageRoot = fs.realpathSync(path.dirname(packageJsonPath));
  /** @type {unknown} */
  const parsedMetadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const metadataRecord = plainRecord(parsedMetadata, 'plugin_package_metadata_invalid');
  if (metadataRecord.name !== packageName) throw pluginError('plugin_package_name_mismatch');
  if (typeof metadataRecord.version !== 'string' || !semver.valid(metadataRecord.version)) throw pluginError('plugin_package_metadata_invalid');
  const metadata = { name: packageName, version: metadataRecord.version };
  const entry = fs.realpathSync(require.resolve(packageName, { paths: [searchRoot] }));
  if (entry !== packageRoot && !entry.startsWith(packageRoot + path.sep)) throw pluginError('plugin_package_root_escape');
  return { packageRoot, metadata, entry };
}

/** @param {unknown} spec @param {string} searchRoot @returns {RegistryState} */
function loadOne(spec, searchRoot) {
  const configEntry = plainRecord(spec, 'plugin_config_entry_invalid');
  const allowed = ['package', 'required', 'expectedVersion', 'config'];
  if (Object.keys(configEntry).some((key) => !allowed.includes(key)) || typeof configEntry.package !== 'string' || typeof configEntry.required !== 'boolean' || typeof configEntry.expectedVersion !== 'string' || !semver.valid(configEntry.expectedVersion)) throw pluginError('plugin_config_entry_invalid');
  const instanceConfig = configEntry.config === undefined ? {} : plainRecord(configEntry.config, 'plugin_config_entry_invalid');
  const resolved = resolvePackage(configEntry.package, searchRoot);
  if (resolved.metadata.version !== configEntry.expectedVersion) throw pluginError('plugin_expected_version_mismatch');
  /** @type {unknown} */
  const requiredExport = require(resolved.entry);
  const plugin = plainRecord(requiredExport, 'plugin_export_invalid');
  if (Object.keys(plugin).some((key) => !CONTRIBUTION_KEYS.has(key))) throw pluginError('plugin_export_invalid');
  const manifestRecord = plainRecord(plugin.manifest, 'plugin_api_incompatible');
  if (Object.keys(manifestRecord).some((key) => !MANIFEST_KEYS.has(key)) || manifestRecord.apiVersion !== 1) throw pluginError('plugin_api_incompatible');
  const pluginId = assertId(manifestRecord.id, 'plugin_id_invalid');
  if (typeof manifestRecord.version !== 'string' || typeof manifestRecord.coreCompatibility !== 'string') throw pluginError('plugin_api_incompatible');
  /** @type {PluginManifest} */
  const manifest = { apiVersion: 1, id: pluginId, version: manifestRecord.version, coreCompatibility: manifestRecord.coreCompatibility };
  if (manifest.version !== resolved.metadata.version) throw pluginError('plugin_manifest_version_mismatch', manifest.id);
  if (!semver.validRange(manifest.coreCompatibility) || manifest.coreCompatibility === '*' || !semver.satisfies(CORE_VERSION, manifest.coreCompatibility, { includePrerelease: true })) throw pluginError('plugin_core_incompatible', manifest.id);
  if (plugin.configSchema !== undefined) {
    if (typeof plugin.configSchema !== 'boolean' && (!plugin.configSchema || typeof plugin.configSchema !== 'object' || Array.isArray(plugin.configSchema))) throw pluginError('plugin_config_schema_invalid', manifest.id);
    const validate = new Ajv({ allErrors: false, strict: true }).compile(plugin.configSchema);
    if (!validate(instanceConfig)) throw pluginError('plugin_instance_config_invalid', manifest.id);
  } else if (Object.keys(instanceConfig).length) throw pluginError('plugin_instance_config_unsupported', manifest.id);

  const staged = emptyState();
  staged.plugins.set(manifest.id, deepFreeze({ ...manifest, package: configEntry.package, config: instanceConfig }));
  if (!plugin.transforms || typeof plugin.transforms !== 'object' || Array.isArray(plugin.transforms)) {
    if (plugin.transforms !== undefined) throw pluginError('plugin_transforms_invalid', manifest.id);
  }
  const transforms = plugin.transforms === undefined ? {} : /** @type {Record<string, unknown>} */ (plugin.transforms);
  for (const [id, fn] of Object.entries(transforms)) {
    assertId(id, 'plugin_transform_id_invalid');
    if (typeof fn !== 'function') throw pluginError('plugin_transform_invalid', manifest.id);
    staged.transforms.set(id, /** @type {import('techsitemanager/plugin-api').NamedTransform} */ (fn));
  }
  for (const key of /** @type {const} */ (['profiles', 'imports', 'connectors', 'exporters'])) {
    const contributions = plugin[key];
    if (contributions !== undefined && (!Array.isArray(contributions) || contributions.length > 100)) throw pluginError(`plugin_${key}_invalid`, manifest.id);
  }
  const profiles = plugin.profiles === undefined ? [] : /** @type {unknown[]} */ (plugin.profiles);
  for (const value of profiles) {
    const profileEntry = plainRecord(value, 'plugin_profile_invalid');
    if (Object.keys(profileEntry).some((key) => !['id', 'file'].includes(key))) throw pluginError('plugin_profile_invalid', manifest.id);
    const profileId = assertId(profileEntry.id, 'plugin_profile_id_invalid');
    if (typeof profileEntry.file !== 'string') throw pluginError('plugin_profile_invalid', manifest.id);
    const loaded = loadProfile(resolved.packageRoot, profileEntry.file, staged.transforms);
    if (loaded.id !== profileId) throw pluginError('plugin_profile_id_mismatch', manifest.id);
    if (staged.profiles.has(loaded.id)) throw pluginError('duplicate_profile_id', loaded.id);
    staged.profiles.set(loaded.id, loaded);
  }
  const imports = plugin.imports === undefined ? [] : /** @type {unknown[]} */ (plugin.imports);
  for (const value of imports) {
    const provider = plainRecord(value, 'plugin_provider_invalid');
    if (Object.keys(provider).some((key) => !['id', 'label', 'input', 'profileId', 'connectorId', 'transform'].includes(key))) throw pluginError('plugin_provider_invalid', manifest.id);
    const providerId = assertId(provider.id, 'plugin_provider_id_invalid');
    if (typeof provider.label !== 'string' || !provider.label || provider.label.length > 100 || typeof provider.transform !== 'function') throw pluginError('plugin_provider_invalid', manifest.id);
    if (provider.profileId !== undefined && typeof provider.profileId !== 'string') throw pluginError('plugin_provider_invalid', manifest.id);
    if (provider.connectorId !== undefined && typeof provider.connectorId !== 'string') throw pluginError('plugin_provider_invalid', manifest.id);
    const input = validateInput(provider.input);
    if (provider.profileId && !staged.profiles.has(provider.profileId)) throw pluginError('plugin_provider_profile_unknown', manifest.id);
    if (staged.providers.has(providerId)) throw pluginError('duplicate_provider_id', providerId);
    staged.providers.set(providerId, deepFreeze({ id: providerId, label: provider.label, input, profileId: provider.profileId, connectorId: provider.connectorId, transform: /** @type {import('techsitemanager/plugin-api').ImportTransform} */ (provider.transform), pluginId: manifest.id, providerVersion: manifest.version }));
  }
  const connectors = plugin.connectors === undefined ? [] : /** @type {unknown[]} */ (plugin.connectors);
  for (const value of connectors) {
    const connector = plainRecord(value, 'plugin_connector_invalid');
    if (Object.keys(connector).some((key) => !['id', 'acquire'].includes(key))) throw pluginError('plugin_connector_invalid', manifest.id);
    const connectorId = assertId(connector.id, 'plugin_connector_id_invalid');
    if (typeof connector.acquire !== 'function') throw pluginError('plugin_connector_invalid', manifest.id);
    if (staged.connectors.has(connectorId)) throw pluginError('duplicate_connector_id', connectorId);
    staged.connectors.set(connectorId, deepFreeze({ id: connectorId, acquire: /** @type {import('techsitemanager/plugin-api').SourceConnector['acquire']} */ (connector.acquire), pluginId: manifest.id }));
  }
  for (const provider of staged.providers.values()) {
    if (provider.input.type === 'external-reference' && (!provider.connectorId || !staged.connectors.has(provider.connectorId))) throw pluginError('plugin_provider_connector_unknown', manifest.id);
    if (provider.input.type !== 'external-reference' && provider.connectorId) throw pluginError('plugin_provider_connector_invalid', manifest.id);
  }
  const exporters = plugin.exporters === undefined ? [] : /** @type {unknown[]} */ (plugin.exporters);
  for (const value of exporters) {
    const exporter = plainRecord(value, 'plugin_exporter_invalid');
    if (Object.keys(exporter).some((key) => !['id', 'label', 'mediaType', 'fileExtension', 'maxBytes', 'export'].includes(key))) throw pluginError('plugin_exporter_invalid', manifest.id);
    const exporterId = assertId(exporter.id, 'plugin_exporter_id_invalid');
    if (typeof exporter.label !== 'string' || !exporter.label || exporter.label.length > 100 || typeof exporter.mediaType !== 'string' || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(exporter.mediaType) || typeof exporter.fileExtension !== 'string' || !/^\.[a-z0-9][a-z0-9.-]{0,19}$/i.test(exporter.fileExtension) || exporter.fileExtension.includes('..') || typeof exporter.export !== 'function' || typeof exporter.maxBytes !== 'number' || !Number.isInteger(exporter.maxBytes) || exporter.maxBytes < 1 || exporter.maxBytes > 10 * 1024 * 1024) throw pluginError('plugin_exporter_invalid', manifest.id);
    if (staged.exporters.has(exporterId)) throw pluginError('duplicate_exporter_id', exporterId);
    staged.exporters.set(exporterId, deepFreeze({ id: exporterId, label: exporter.label, mediaType: exporter.mediaType, fileExtension: exporter.fileExtension, maxBytes: exporter.maxBytes, export: /** @type {import('techsitemanager/plugin-api').Exporter['export']} */ (exporter.export), pluginId: manifest.id }));
  }
  return staged;
}

/** @param {unknown} error @returns {string} */
function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'plugin_load_failed';
}

/** @param {unknown} spec @returns {{ required: boolean, package: string }} */
function failureSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { required: false, package: 'invalid' };
  const value = /** @type {Record<string, unknown>} */ (spec);
  return { required: value.required === true, package: typeof value.package === 'string' ? value.package : 'invalid' };
}

/** @param {{ configFile?: string | null, searchRoot?: string }} [options] @returns {import('techsitemanager/plugin-api').PluginRegistry} */
function loadPlugins(options = {}) {
  const { configFile = null, searchRoot = path.join(__dirname, '..', '..') } = options;
  const config = readConfig(configFile);
  const state = emptyState();
  /** @type {{ package: string, code: string }[]} */
  const degraded = [];
  for (const spec of config.plugins) {
    try {
      const staged = loadOne(spec, searchRoot);
      merge(state, staged);
    } catch (error) {
      const failed = failureSpec(spec);
      const code = errorCode(error);
      if (failed.required) {
        const safeCode = /^(?:plugin_|profile_|duplicate_)/.test(code) ? code : 'plugin_load_failed';
        const sanitized = pluginError(safeCode, failed.package);
        sanitized.cause = undefined;
        throw sanitized;
      }
      degraded.push(Object.freeze({ package: failed.package, code }));
    }
  }
  return frozenRegistry(state, degraded);
}

module.exports = { loadPlugins, CORE_VERSION, validateInput, PACKAGE_NAME };
