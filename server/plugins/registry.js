'use strict';

const { deepFreeze, pluginError } = require('./contracts');

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
 *   presentations: Map<string, import('techsitemanager/plugin-api').PresentationProfile>,
 *   exporters: Map<string, LoadedExporter>
 * }} RegistryState
 */
/** @typedef {keyof RegistryState} RegistryStateKey */

/** @param {LoadedImportProvider} provider @returns {import('techsitemanager/plugin-api').ProviderDescriptor} */
function descriptor(provider) {
  return deepFreeze({ id: provider.id, label: provider.label, input: { ...provider.input, fields: provider.input.fields || [] } });
}

/** @param {LoadedExporter} exporter @returns {import('techsitemanager/plugin-api').ExporterDescriptor} */
function exporterDescriptor(exporter) {
  return deepFreeze({ id: exporter.id, label: exporter.label, mediaType: exporter.mediaType, fileExtension: exporter.fileExtension });
}

/** @returns {RegistryState} */
function emptyState() {
  return { plugins: new Map(), providers: new Map(), connectors: new Map(), transforms: new Map(), profiles: new Map(), presentations: new Map(), exporters: new Map() };
}

/** @template T @param {Map<string, T>} target @param {Map<string, T>} staged @param {RegistryStateKey} key */
function assertNoDuplicates(target, staged, key) {
  for (const id of staged.keys()) if (target.has(id)) throw pluginError(`duplicate_${key.slice(0, -1)}_id`, id);
}

/** @template T @param {Map<string, T>} target @param {Map<string, T>} staged */
function appendMap(target, staged) {
  for (const [id, value] of staged) target.set(id, value);
}

/** Publish staged contributions only after every namespace passes duplicate checks. @param {RegistryState} target @param {RegistryState} staged */
function merge(target, staged) {
  assertNoDuplicates(target.plugins, staged.plugins, 'plugins');
  assertNoDuplicates(target.providers, staged.providers, 'providers');
  assertNoDuplicates(target.connectors, staged.connectors, 'connectors');
  assertNoDuplicates(target.transforms, staged.transforms, 'transforms');
  assertNoDuplicates(target.profiles, staged.profiles, 'profiles');
  assertNoDuplicates(target.presentations, staged.presentations, 'presentations');
  for (const presentation of staged.presentations.values()) {
    if ([...target.presentations.values()].some((current) => current.entityType === presentation.entityType) || [...staged.presentations.values()].some((current) => current !== presentation && current.entityType === presentation.entityType)) throw pluginError('duplicate_presentation_entity', presentation.entityType);
  }
  assertNoDuplicates(target.exporters, staged.exporters, 'exporters');
  appendMap(target.plugins, staged.plugins);
  appendMap(target.providers, staged.providers);
  appendMap(target.connectors, staged.connectors);
  appendMap(target.transforms, staged.transforms);
  appendMap(target.profiles, staged.profiles);
  appendMap(target.presentations, staged.presentations);
  appendMap(target.exporters, staged.exporters);
}

/** @param {RegistryState} state @param {{ package: string, code: string }[]} degraded @returns {import('techsitemanager/plugin-api').PluginRegistry} */
function frozenRegistry(state, degraded) {
  const providers = Object.freeze([...state.providers.values()].map(descriptor));
  const exporters = Object.freeze([...state.exporters.values()].map(exporterDescriptor));
  const presentations = Object.freeze([...state.presentations.values()]);
  return Object.freeze({
    providers, exporters, presentations,
    degraded: Object.freeze([...degraded]),
    provider(/** @type {string} */ id) { return state.providers.get(id); },
    connector(/** @type {string} */ id) { return state.connectors.get(id); },
    exporter(/** @type {string} */ id) { return state.exporters.get(id); },
    transform(/** @type {string} */ id) { return state.transforms.get(id); },
    profile(/** @type {string} */ id) { return state.profiles.get(id); },
    presentation(/** @type {string} */ id) { return state.presentations.get(id); },
    presentationFor(/** @type {string} */ entityType) { return [...state.presentations.values()].find((entry) => entry.entityType === entityType); },
    plugin(/** @type {string} */ id) { return state.plugins.get(id); }
  });
}

module.exports = { emptyState, merge, frozenRegistry };
