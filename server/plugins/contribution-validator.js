'use strict';

const { loadProfile } = require('./profiles');
const { loadPresentation } = require('./presentations');
const { assertId, deepFreeze, plainRecord, pluginError } = require('./contracts');
const { emptyState } = require('./registry');

/** @typedef {import('techsitemanager/plugin-api').ProviderInputDescriptor} ProviderInputDescriptor */
/** @typedef {import('./registry').RegistryState} RegistryState */

/** @param {unknown} input @returns {ProviderInputDescriptor} */
function validateInput(input) {
  const descriptor = plainRecord(input, 'plugin_input_invalid');
  if (Object.keys(descriptor).some((key) => !['type', 'maxBytes', 'mediaTypes', 'fields'].includes(key))) throw pluginError('plugin_input_unknown_field');
  if (typeof descriptor.type !== 'string' || !['file', 'pasted-text', 'external-reference'].includes(descriptor.type)) throw pluginError('plugin_input_type_invalid');
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
        if (!Array.isArray(field.options) || field.options.length > 100 || field.options.some((option) => typeof option !== 'string' || !option || option.length > 100)) throw pluginError('plugin_input_options_invalid');
      }
      if (field.type === 'enum' && (!Array.isArray(field.options) || !field.options.length)) throw pluginError('plugin_input_options_invalid');
    }
    if (new Set(descriptor.fields.map((field) => field.id)).size !== descriptor.fields.length) throw pluginError('plugin_input_field_id_duplicate');
  }
  return /** @type {ProviderInputDescriptor} */ (/** @type {unknown} */ (input));
}

/** @param {Record<string, unknown>} plugin @param {string} key @param {string} pluginId @returns {unknown[]} */
function contributionArray(plugin, key, pluginId) {
  const value = plugin[key];
  if (value !== undefined && (!Array.isArray(value) || value.length > 100)) throw pluginError(`plugin_${key}_invalid`, pluginId);
  return value === undefined ? [] : /** @type {unknown[]} */ (value);
}

/**
 * Validate a plugin's complete contribution set in an isolated staging state.
 * Nothing becomes visible in the registry unless all contributions validate.
 *
 * @param {Record<string, unknown>} plugin
 * @param {import('techsitemanager/plugin-api').PluginManifest} manifest
 * @param {{ packageRoot: string }} resolved
 * @param {string} packageName
 * @param {Record<string, unknown>} instanceConfig
 * @returns {ReturnType<typeof emptyState>}
 */
function stageContributions(plugin, manifest, resolved, packageName, instanceConfig) {
  const staged = emptyState();
  staged.plugins.set(manifest.id, deepFreeze({ ...manifest, package: packageName, config: instanceConfig }));

  if (!plugin.transforms || typeof plugin.transforms !== 'object' || Array.isArray(plugin.transforms)) {
    if (plugin.transforms !== undefined) throw pluginError('plugin_transforms_invalid', manifest.id);
  }
  const transforms = plugin.transforms === undefined ? {} : /** @type {Record<string, unknown>} */ (plugin.transforms);
  for (const [id, fn] of Object.entries(transforms)) {
    assertId(id, 'plugin_transform_id_invalid');
    if (typeof fn !== 'function') throw pluginError('plugin_transform_invalid', manifest.id);
    staged.transforms.set(id, /** @type {import('techsitemanager/plugin-api').NamedTransform} */ (fn));
  }

  for (const value of contributionArray(plugin, 'profiles', manifest.id)) {
    const profileEntry = plainRecord(value, 'plugin_profile_invalid');
    if (Object.keys(profileEntry).some((key) => !['id', 'file'].includes(key))) throw pluginError('plugin_profile_invalid', manifest.id);
    const profileId = assertId(profileEntry.id, 'plugin_profile_id_invalid');
    if (typeof profileEntry.file !== 'string') throw pluginError('plugin_profile_invalid', manifest.id);
    const loaded = loadProfile(resolved.packageRoot, profileEntry.file, staged.transforms);
    if (loaded.id !== profileId) throw pluginError('plugin_profile_id_mismatch', manifest.id);
    if (staged.profiles.has(loaded.id)) throw pluginError('duplicate_profile_id', loaded.id);
    staged.profiles.set(loaded.id, loaded);
  }

  if (manifest.apiVersion === 1 && plugin.presentations !== undefined) throw pluginError('plugin_api_incompatible', manifest.id);
  for (const value of contributionArray(plugin, 'presentations', manifest.id)) {
    const entry = plainRecord(value, 'plugin_presentation_invalid');
    if (Object.keys(entry).some((key) => !['id', 'file'].includes(key))) throw pluginError('plugin_presentation_invalid', manifest.id);
    const presentationId = assertId(entry.id, 'plugin_presentation_id_invalid');
    if (typeof entry.file !== 'string') throw pluginError('plugin_presentation_invalid', manifest.id);
    const loaded = loadPresentation(resolved.packageRoot, entry.file, manifest.id);
    if (loaded.id !== presentationId) throw pluginError('plugin_presentation_id_mismatch', manifest.id);
    if (staged.presentations.has(loaded.id)) throw pluginError('duplicate_presentation_id', loaded.id);
    staged.presentations.set(loaded.id, loaded);
  }

  for (const value of contributionArray(plugin, 'imports', manifest.id)) {
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

  for (const value of contributionArray(plugin, 'connectors', manifest.id)) {
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

  for (const value of contributionArray(plugin, 'exporters', manifest.id)) {
    const exporter = plainRecord(value, 'plugin_exporter_invalid');
    if (Object.keys(exporter).some((key) => !['id', 'label', 'mediaType', 'fileExtension', 'maxBytes', 'export'].includes(key))) throw pluginError('plugin_exporter_invalid', manifest.id);
    const exporterId = assertId(exporter.id, 'plugin_exporter_id_invalid');
    if (typeof exporter.label !== 'string' || !exporter.label || exporter.label.length > 100 || typeof exporter.mediaType !== 'string' || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(exporter.mediaType) || typeof exporter.fileExtension !== 'string' || !/^\.[a-z0-9][a-z0-9.-]{0,19}$/i.test(exporter.fileExtension) || exporter.fileExtension.includes('..') || typeof exporter.export !== 'function' || typeof exporter.maxBytes !== 'number' || !Number.isInteger(exporter.maxBytes) || exporter.maxBytes < 1 || exporter.maxBytes > 10 * 1024 * 1024) throw pluginError('plugin_exporter_invalid', manifest.id);
    if (staged.exporters.has(exporterId)) throw pluginError('duplicate_exporter_id', exporterId);
    staged.exporters.set(exporterId, deepFreeze({ id: exporterId, label: exporter.label, mediaType: exporter.mediaType, fileExtension: exporter.fileExtension, maxBytes: exporter.maxBytes, export: /** @type {import('techsitemanager/plugin-api').Exporter['export']} */ (exporter.export), pluginId: manifest.id }));
  }
  return staged;
}

module.exports = { validateInput, stageContributions };
