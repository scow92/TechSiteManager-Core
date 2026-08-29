'use strict';

const Ajv = /** @type {typeof import('ajv').default} */ (/** @type {unknown} */ (require('ajv')));
const semver = require('semver');
const { assertId, plainRecord, pluginError } = require('./contracts');

const CORE_VERSION = require('../../package.json').version;
const CONTRIBUTION_KEYS = new Set(['manifest', 'configSchema', 'imports', 'connectors', 'transforms', 'profiles', 'presentations', 'exporters']);
const MANIFEST_KEYS = new Set(['apiVersion', 'id', 'version', 'coreCompatibility']);

/**
 * @param {unknown} requiredExport
 * @param {{ version: string }} metadata
 * @param {Record<string, unknown>} instanceConfig
 * @returns {{ plugin: Record<string, unknown>, manifest: import('techsitemanager/plugin-api').PluginManifest }}
 */
function validateManifest(requiredExport, metadata, instanceConfig) {
  const plugin = plainRecord(requiredExport, 'plugin_export_invalid');
  if (Object.keys(plugin).some((key) => !CONTRIBUTION_KEYS.has(key))) throw pluginError('plugin_export_invalid');
  const manifestRecord = plainRecord(plugin.manifest, 'plugin_api_incompatible');
  if (Object.keys(manifestRecord).some((key) => !MANIFEST_KEYS.has(key)) || ![1, 2].includes(/** @type {number} */ (manifestRecord.apiVersion))) throw pluginError('plugin_api_incompatible');
  const pluginId = assertId(manifestRecord.id, 'plugin_id_invalid');
  if (typeof manifestRecord.version !== 'string' || typeof manifestRecord.coreCompatibility !== 'string') throw pluginError('plugin_api_incompatible');
  const manifest = { apiVersion: /** @type {1 | 2} */ (manifestRecord.apiVersion), id: pluginId, version: manifestRecord.version, coreCompatibility: manifestRecord.coreCompatibility };
  if (manifest.version !== metadata.version) throw pluginError('plugin_manifest_version_mismatch', manifest.id);
  if (!semver.validRange(manifest.coreCompatibility) || manifest.coreCompatibility === '*' || !semver.satisfies(CORE_VERSION, manifest.coreCompatibility, { includePrerelease: true })) throw pluginError('plugin_core_incompatible', manifest.id);
  if (plugin.configSchema !== undefined) {
    if (typeof plugin.configSchema !== 'boolean' && (!plugin.configSchema || typeof plugin.configSchema !== 'object' || Array.isArray(plugin.configSchema))) throw pluginError('plugin_config_schema_invalid', manifest.id);
    const validate = new Ajv({ allErrors: false, strict: true }).compile(plugin.configSchema);
    if (!validate(instanceConfig)) throw pluginError('plugin_instance_config_invalid', manifest.id);
  } else if (Object.keys(instanceConfig).length) throw pluginError('plugin_instance_config_unsupported', manifest.id);
  return { plugin, manifest };
}

module.exports = { CORE_VERSION, validateManifest };
