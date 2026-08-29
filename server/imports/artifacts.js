'use strict';

const config = require('../config');
const { object, knownKeys, string, integer } = require('../lib/validation');
const { httpError } = require('../lib/errors');
const { sha256 } = require('./fingerprints');

/** @typedef {import('techsitemanager/plugin-api').PluginRegistry} PluginRegistry */
/** @typedef {import('techsitemanager/plugin-api').LoadedImportProvider} LoadedImportProvider */
/** @typedef {import('techsitemanager/plugin-api').LoadedSourceConnector} LoadedSourceConnector */
/** @typedef {import('techsitemanager/plugin-api').ImportProfile} ImportProfile */
/** @typedef {import('techsitemanager/import-contracts').SourceArtifact} SourceArtifact */

/** @returns {string} */
function now() { return new Date().toISOString(); }

/** @param {unknown} value @param {string} path @param {number} [max] @returns {string} */
function requiredText(value, path, max = 255) {
  const result = string(value, path, { required: true, max });
  if (result === null) throw httpError(422, 'required_field', `${path} is required`, path);
  return result;
}

/** @param {LoadedImportProvider} provider @param {unknown} value @returns {Readonly<Record<string, string | number | boolean>>} */
function inputFields(provider, value) {
  const supplied = object(value || {}, 'body.fields');
  const descriptors = new Map((provider.input.fields || []).map((field) => [field.id, field]));
  if (Object.keys(supplied).length > 20) throw httpError(422, 'too_many_input_fields', 'Too many input fields');
  /** @type {Record<string, string | number | boolean>} */
  const result = {};
  for (const key of Object.keys(supplied)) if (!descriptors.has(key)) throw httpError(422, 'unknown_input_field', 'Unknown provider input field', `body.fields.${key}`);
  for (const descriptor of descriptors.values()) {
    const valueAtField = supplied[descriptor.id];
    if ((valueAtField === undefined || valueAtField === null || valueAtField === '') && descriptor.required) throw httpError(422, 'required_field', `body.fields.${descriptor.id} is required`, `body.fields.${descriptor.id}`);
    if (valueAtField === undefined || valueAtField === null || valueAtField === '') continue;
    if (['string', 'multiline', 'core-entity-selector'].includes(descriptor.type)) result[descriptor.id] = requiredText(valueAtField, `body.fields.${descriptor.id}`, descriptor.maxLength || (descriptor.type === 'multiline' ? 20_000 : 255));
    else if (descriptor.type === 'integer') {
      const parsed = integer(valueAtField, `body.fields.${descriptor.id}`, { required: true });
      if (parsed === null) throw httpError(422, 'required_field', `body.fields.${descriptor.id} is required`, `body.fields.${descriptor.id}`);
      result[descriptor.id] = parsed;
    } else if (descriptor.type === 'boolean') {
      if (typeof valueAtField !== 'boolean') throw httpError(422, 'invalid_field', `body.fields.${descriptor.id} is invalid`, `body.fields.${descriptor.id}`);
      result[descriptor.id] = valueAtField;
    } else {
      if (typeof valueAtField !== 'string' || !descriptor.options || !descriptor.options.includes(valueAtField)) throw httpError(422, 'invalid_field', `body.fields.${descriptor.id} is invalid`, `body.fields.${descriptor.id}`);
      result[descriptor.id] = valueAtField;
    }
  }
  return Object.freeze(result);
}

/** @param {LoadedImportProvider} provider @param {unknown} body @returns {Readonly<SourceArtifact>} */
function frozenArtifact(provider, body) {
  const input = object(body, 'body');
  knownKeys(input, ['content', 'contentEncoding', 'mediaType', 'externalReference', 'fields'], 'body');
  const mediaType = requiredText(input.mediaType, 'body.mediaType', 128);
  if (input.contentEncoding !== undefined && input.contentEncoding !== 'utf8' && input.contentEncoding !== 'base64') throw httpError(422, 'invalid_content_encoding', 'Unsupported content encoding');
  const encoding = input.contentEncoding === 'base64' ? 'base64' : 'utf8';
  const contentString = requiredText(input.content, 'body.content', Math.ceil(provider.input.maxBytes * 4 / 3) + 16);
  const content = Buffer.from(contentString, encoding);
  if (!content.length || content.length > provider.input.maxBytes) throw httpError(413, 'source_artifact_too_large', 'Source artifact is too large');
  if (provider.input.type === 'file' && !provider.input.mediaTypes.includes(mediaType)) throw httpError(415, 'source_media_type_unsupported', 'Source media type is not supported');
  if (provider.input.type === 'pasted-text' && !['text/plain', 'text/html'].includes(mediaType)) throw httpError(415, 'source_media_type_unsupported', 'Source media type is not supported');
  return Object.freeze({ schemaVersion: 'techsitemanager.io/source-artifact/v1', providerId: provider.id, connectorId: provider.input.type === 'file' ? 'core.file' : 'core.paste', contentHash: sha256(content), mediaType, receivedAt: now(), externalReference: string(input.externalReference, 'body.externalReference', { max: 255 }), fields: inputFields(provider, input.fields), content });
}

/** @param {ImportProfile | null} profile @param {PluginRegistry} registry @param {AbortController} controller @returns {import('techsitemanager/plugin-api').ProviderContext} */
function context(profile, registry, controller) {
  /** @type {Record<string, import('techsitemanager/plugin-api').NamedTransform>} */
  const transforms = {};
  for (const id of profile && profile.transforms || []) {
    const transform = registry.transform(id);
    if (transform) transforms[id] = transform;
  }
  const logger = Object.freeze({
    info(/** @type {import('techsitemanager/plugin-api').PluginLogEvent} */ event) { console.log(JSON.stringify({ type: 'plugin_event', level: 'info', code: String(event && event.code || 'event').slice(0, 128) })); },
    warn(/** @type {import('techsitemanager/plugin-api').PluginLogEvent} */ event) { console.warn(JSON.stringify({ type: 'plugin_event', level: 'warn', code: String(event && event.code || 'event').slice(0, 128) })); }
  });
  return Object.freeze({ abortSignal: controller.signal, now, logger, profile, transforms: Object.freeze(transforms) });
}

/** @param {unknown} error @returns {number | null} */
function errorStatus(error) { return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : null; }
/** @param {unknown} error @returns {string | null} */
function stableErrorCode(error) { return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null; }

/** @param {LoadedImportProvider} provider @param {SourceArtifact} artifact @param {ImportProfile | null} profile @param {PluginRegistry} registry @returns {Promise<unknown>} */
async function callProvider(provider, artifact, profile, registry) {
  const controller = new AbortController();
  /** @type {NodeJS.Timeout | undefined} */ let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.transform(artifact, context(profile, registry, controller))),
      new Promise((/** @type {(value: never) => void} */ _, reject) => { timer = setTimeout(() => { controller.abort(); reject(httpError(504, 'provider_timeout', 'Import provider timed out')); }, config.pluginTimeoutMs); })
    ]);
  } catch (error) {
    if (errorStatus(error)) throw error;
    throw httpError(422, stableErrorCode(error) === 'source_unrecognized' ? 'source_unrecognized' : 'provider_rejected_source', 'The import provider could not process the source');
  } finally { clearTimeout(timer); }
}

/** @param {LoadedSourceConnector} connector @param {import('techsitemanager/plugin-api').ExternalSourceReference} reference @returns {Promise<unknown>} */
async function callConnector(connector, reference) {
  const controller = new AbortController();
  /** @type {NodeJS.Timeout | undefined} */ let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => connector.acquire(reference, Object.freeze({ abortSignal: controller.signal, now }))),
      new Promise((/** @type {(value: never) => void} */ _, reject) => { timer = setTimeout(() => { controller.abort(); reject(httpError(504, 'connector_timeout', 'Source connector timed out')); }, config.pluginTimeoutMs); })
    ]);
  } catch (error) {
    if (errorStatus(error)) throw error;
    throw httpError(502, 'connector_acquisition_failed', 'The external source could not be acquired');
  } finally { clearTimeout(timer); }
}

/** @param {PluginRegistry} registry @param {LoadedImportProvider} provider @param {unknown} body @returns {Promise<Readonly<SourceArtifact>>} */
async function acquireArtifact(registry, provider, body) {
  if (provider.input.type !== 'external-reference') return frozenArtifact(provider, body);
  const input = object(body, 'body');
  knownKeys(input, ['externalReference', 'fields'], 'body');
  const connector = provider.connectorId && registry.connector(provider.connectorId);
  if (!connector) throw httpError(503, 'connector_not_available', 'This provider requires an unavailable source connector');
  const reference = Object.freeze({ externalReference: requiredText(input.externalReference, 'body.externalReference', 255), fields: inputFields(provider, input.fields) });
  const acquired = await callConnector(connector, reference);
  if (!acquired || typeof acquired !== 'object' || !('content' in acquired) || !Buffer.isBuffer(acquired.content) || acquired.content.length > provider.input.maxBytes || !('mediaType' in acquired)) throw httpError(502, 'connector_artifact_invalid', 'The external source returned an invalid artifact');
  return Object.freeze({ schemaVersion: 'techsitemanager.io/source-artifact/v1', providerId: provider.id, connectorId: connector.id, contentHash: sha256(acquired.content), mediaType: requiredText(acquired.mediaType, 'artifact.mediaType', 128), receivedAt: now(), externalReference: reference.externalReference, fields: reference.fields, content: acquired.content });
}

module.exports = { acquireArtifact, callProvider, inputFields };
