'use strict';

const { httpError } = require('./errors');

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DURABLE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const OWNERSHIP = new Set(['source-owned', 'user-owned', 'source-default', 'review-required']);

function object(value, path = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(422, 'invalid_shape', `${path} must be an object`, path);
  return value;
}

function knownKeys(value, allowed, path = 'body') {
  object(value, path);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw httpError(422, 'unknown_field', `Unknown field at ${path}.${key}`, `${path}.${key}`);
  }
}

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

function integer(value, path, options = {}) {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, required = false } = options;
  if (value === undefined || value === null) {
    if (required) throw httpError(422, 'required_field', `${path} is required`, path);
    return null;
  }
  if (!Number.isInteger(value) || value < min || value > max) throw httpError(422, 'invalid_field', `${path} is invalid`, path);
  return value;
}

function enumeration(value, path, values, required = false) {
  if (value === undefined || value === null) {
    if (required) throw httpError(422, 'required_field', `${path} is required`, path);
    return null;
  }
  if (!values.includes(value)) throw httpError(422, 'invalid_field', `${path} is invalid`, path);
  return value;
}

function uuid(value, path, required = true) {
  return string(value, path, { required, max: 36, pattern: ID });
}

function durableId(value, path) {
  return string(value, path, { required: true, max: 128, pattern: DURABLE_ID });
}

function ownership(value, path) {
  if (!OWNERSHIP.has(value)) throw httpError(422, 'invalid_ownership', `${path} has an unsupported ownership policy`, path);
  return value;
}

function boundedJson(value, path, maxBytes = 5 * 1024 * 1024) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > maxBytes) throw httpError(413, 'normalized_draft_too_large', `${path} is too large`, path);
  return json;
}

module.exports = { object, knownKeys, string, integer, enumeration, uuid, durableId, ownership, boundedJson, DURABLE_ID };
