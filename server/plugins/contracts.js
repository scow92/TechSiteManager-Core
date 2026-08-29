'use strict';

const { DURABLE_ID } = require('../lib/validation');

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

/** @param {unknown} value @param {string} code @returns {Record<string, unknown>} */
function plainRecord(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw pluginError(code);
  return /** @type {Record<string, unknown>} */ (value);
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

module.exports = { pluginError, assertId, deepFreeze, plainRecord, errorCode, failureSpec };
