'use strict';

const fs = require('fs');
const path = require('path');
const semver = require('semver');
const { plainRecord, pluginError, errorCode, failureSpec } = require('./contracts');
const { PACKAGE_NAME, resolvePackage } = require('./package-resolver');
const { CORE_VERSION, validateManifest } = require('./manifest-validator');
const { validateInput, stageContributions } = require('./contribution-validator');
const { emptyState, merge, frozenRegistry } = require('./registry');

/** @param {string | null} configFile @returns {{ plugins: unknown[] }} */
function readConfig(configFile) {
  if (!configFile) return { plugins: [] };
  /** @type {unknown} */
  const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const config = plainRecord(parsed, 'plugin_config_invalid');
  if (Object.keys(config).some((key) => key !== 'plugins') || !Array.isArray(config.plugins)) throw pluginError('plugin_config_invalid');
  return { plugins: config.plugins };
}

/** @param {unknown} spec @param {string} searchRoot @returns {ReturnType<typeof emptyState>} */
function loadOne(spec, searchRoot) {
  const configEntry = plainRecord(spec, 'plugin_config_entry_invalid');
  const allowed = ['package', 'required', 'expectedVersion', 'config'];
  if (Object.keys(configEntry).some((key) => !allowed.includes(key)) || typeof configEntry.package !== 'string' || typeof configEntry.required !== 'boolean' || typeof configEntry.expectedVersion !== 'string' || !semver.valid(configEntry.expectedVersion)) throw pluginError('plugin_config_entry_invalid');
  const instanceConfig = configEntry.config === undefined ? {} : plainRecord(configEntry.config, 'plugin_config_entry_invalid');
  const resolved = resolvePackage(configEntry.package, searchRoot);
  if (resolved.metadata.version !== configEntry.expectedVersion) throw pluginError('plugin_expected_version_mismatch');
  /** CommonJS is the stable Plugin API package boundary. @type {unknown} */
  const requiredExport = require(resolved.entry);
  const { plugin, manifest } = validateManifest(requiredExport, resolved.metadata, instanceConfig);
  return stageContributions(plugin, manifest, resolved, configEntry.package, instanceConfig);
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
      merge(state, loadOne(spec, searchRoot));
    } catch (error) {
      const failed = failureSpec(spec);
      const code = errorCode(error);
      if (failed.required) {
        const safeCode = /^(?:plugin_|profile_|presentation_|duplicate_)/.test(code) ? code : 'plugin_load_failed';
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
