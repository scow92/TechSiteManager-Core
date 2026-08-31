'use strict';

const config = require('../config');
const { packageDetail } = require('../lib/work-packages');
const { httpError } = require('../lib/errors');
const exportProjections = require('./export-projections');

/** @template T @param {T} value @returns {Readonly<T>} */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
  return Object.freeze(value);
}

/**
 * @param {import('techsitemanager/plugin-api').LoadedExporter} exporter
 * @param {import('techsitemanager/plugin-api').WorkPackageProjection | import('techsitemanager/plugin-api').ExportProjectionV1} projection
 * @returns {Promise<Buffer>}
 */
async function callExporter(exporter, projection) {
  const controller = new AbortController();
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => exporter.export(/** @type {never} */ (deepFreeze(structuredClone(projection))), Object.freeze({ abortSignal: controller.signal }))),
      new Promise((/** @type {(value: never) => void} */ _, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(httpError(504, 'exporter_timeout', 'Export generation timed out'));
        }, config.pluginTimeoutMs);
      })
    ]);
    if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some((key) => key !== 'content') || !Buffer.isBuffer(result.content) || !result.content.length || result.content.length > exporter.maxBytes) {
      throw httpError(422, 'exporter_result_invalid', 'The exporter returned an invalid result');
    }
    return result.content;
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw httpError(422, 'exporter_failed', 'The exporter could not generate the requested file');
  } finally {
    clearTimeout(timer);
  }
}

/** @param {unknown} value @returns {string} */
function safeBaseName(value) {
  return String(value || 'work-package').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'work-package';
}

/**
 * @param {import('techsitemanager/plugin-api').PluginRegistry} registry
 * @param {string} exporterId
 * @param {string} workPackagePublicId
 */
async function generate(registry, exporterId, workPackagePublicId) {
  const exporter = registry.exporter(exporterId);
  if (!exporter) throw httpError(404, 'exporter_not_found', 'Exporter not found');
  let workPackage;
  let projection;
  if (exporter.projectionVersion === exportProjections.SCHEMA_VERSION) {
    const providerIds = registry.providers.flatMap((descriptor) => {
      const provider = registry.provider(descriptor.id);
      return provider && provider.pluginId === exporter.pluginId ? [provider.id] : [];
    });
    projection = await exportProjections.buildV1(workPackagePublicId, { pluginId: exporter.pluginId, providerIds, maxRecords: config.exportProjectionMaxRecords });
    workPackage = projection.workPackage;
  } else {
    workPackage = await packageDetail(workPackagePublicId);
    projection = workPackage;
  }
  const content = await callExporter(exporter, projection);
  return { content, mediaType: exporter.mediaType, fileName: `${safeBaseName(workPackage.packageReference)}${exporter.fileExtension}` };
}

module.exports = { generate, safeBaseName };
