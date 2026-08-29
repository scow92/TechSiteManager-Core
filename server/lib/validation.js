'use strict';

const { httpError } = require('./errors');

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DURABLE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const OWNERSHIP = new Set(['source-owned', 'user-owned', 'source-default', 'review-required']);

/** @typedef {{ required?: boolean, max?: number, min?: number, pattern?: RegExp }} StringOptions */
/** @typedef {{ required?: boolean, max?: number, min?: number }} NumberOptions */
/** @typedef {{ required?: boolean, max?: number }} ArrayOptions */

/**
 * @param {unknown} value
 * @param {string} [path]
 * @returns {Record<string, unknown>}
 */
function object(value, path = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(422, 'invalid_shape', `${path} must be an object`, path);
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} [path]
 */
function knownKeys(value, allowed, path = 'body') {
  const record = object(value, path);
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw httpError(422, 'unknown_field', `Unknown field at ${path}.${key}`, `${path}.${key}`);
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {StringOptions} [options]
 * @returns {string | null}
 */
function string(value, path, options = {}) {
  const { required = false, max = 255, min = required ? 1 : 0, pattern } = options;
  if (value === undefined || value === null) {
    if (required) throw httpError(422, 'required_field', `${path} is required`, path);
    return null;
  }
  if (typeof value !== 'string' || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    throw httpError(422, 'invalid_field', `${path} is invalid`, path);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {NumberOptions} [options]
 * @returns {number | null}
 */
function integer(value, path, options = {}) {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, required = false } = options;
  if (value === undefined || value === null) {
    if (required) throw httpError(422, 'required_field', `${path} is required`, path);
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw httpError(422, 'invalid_field', `${path} is invalid`, path);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {NumberOptions} [options]
 * @returns {number | null}
 */
function number(value, path, options = {}) {
  const { min = -Number.MAX_VALUE, max = Number.MAX_VALUE, required = false } = options;
  if (value === undefined || value === null) {
    if (required) throw httpError(422, 'required_field', `${path} is required`, path);
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw httpError(422, 'invalid_field', `${path} is invalid`, path);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {ArrayOptions} [options]
 * @returns {unknown[]}
 */
function array(value, path, options = {}) {
  const { max = 1000, required = false } = options;
  if (value === undefined || value === null) {
    if (required) throw httpError(422, 'required_field', `${path} is required`, path);
    return [];
  }
  if (!Array.isArray(value) || value.length > max) throw httpError(422, 'invalid_shape', `${path} must be an array`, path);
  return value;
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {string} path
 * @param {readonly T[]} values
 * @param {boolean} [required]
 * @returns {T | null}
 */
function enumeration(value, path, values, required = false) {
  if (value === undefined || value === null) {
    if (required) throw httpError(422, 'required_field', `${path} is required`, path);
    return null;
  }
  if (typeof value !== 'string' || !values.includes(/** @type {T} */ (value))) throw httpError(422, 'invalid_field', `${path} is invalid`, path);
  return /** @type {T} */ (value);
}

/** @param {unknown} value @param {string} path @param {boolean} [required] */
function uuid(value, path, required = true) {
  return string(value, path, { required, max: 36, pattern: ID });
}

/** @param {unknown} value @param {string} path */
function durableId(value, path) {
  return string(value, path, { required: true, max: 128, pattern: DURABLE_ID });
}

/** @param {unknown} value @param {string} path @returns {string} */
function ownership(value, path) {
  if (typeof value !== 'string' || !OWNERSHIP.has(value)) throw httpError(422, 'invalid_ownership', `${path} has an unsupported ownership policy`, path);
  return value;
}

/**
 * @param {Record<string, unknown> | unknown[]} value
 * @param {string} path
 * @param {number} [maxBytes]
 */
function boundedJson(value, path, maxBytes = 5 * 1024 * 1024) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > maxBytes) throw httpError(413, 'normalized_draft_too_large', `${path} is too large`, path);
  return json;
}

module.exports = { object, knownKeys, string, integer, number, array, enumeration, uuid, durableId, ownership, boundedJson, DURABLE_ID };
