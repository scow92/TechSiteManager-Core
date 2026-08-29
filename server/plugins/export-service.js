'use strict';

const config = require('../config');
const { packageDetail } = require('../lib/work-packages');
const { httpError } = require('../lib/errors');

/** @template T @param {T} value @returns {Readonly<T>} */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
  return Object.freeze(value);
}

/**
 * @param {import('techsitemanager/plugin-api').LoadedExporter} exporter
 * @param {import('techsitemanager/plugin-api').WorkPackageProjection} workPackage
 * @returns {Promise<Buffer>}
 */
async function callExporter(exporter, workPackage) {
  const controller = new AbortController();
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => exporter.export(deepFreeze(structuredClone(workPackage)), Object.freeze({ abortSignal: controller.signal }))),
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
  const workPackage = await packageDetail(workPackagePublicId);
  const content = await callExporter(exporter, workPackage);
  return { content, mediaType: exporter.mediaType, fileName: `${safeBaseName(workPackage.packageReference)}${exporter.fileExtension}` };
}

module.exports = { generate, safeBaseName };
