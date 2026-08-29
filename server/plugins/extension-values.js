'use strict';

const crypto = require('crypto');
const db = require('../db/knex');
const { httpError } = require('../lib/errors');
const { object, knownKeys, integer, string } = require('../lib/validation');
const audit = require('../lib/audit');

const TABLES = Object.freeze({
  'work-package': 'work_packages',
  'work-item': 'work_items',
  circuit: 'circuits',
  segment: 'segments',
  'consumable-requirement': 'consumable_requirements'
});

/** @param {import('techsitemanager/plugin-api').PresentationField} field @param {unknown} value @returns {string | number | boolean | null} */
function validateValue(field, value) {
  if (value === null || value === undefined || value === '') {
    if (field.required) throw httpError(422, 'extension_value_required', `${field.label} is required`, field.id);
    return null;
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') throw httpError(422, 'extension_value_invalid', `${field.label} is invalid`, field.id);
    return value;
  }
  if (field.type === 'integer') {
    if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) throw httpError(422, 'extension_value_invalid', `${field.label} is invalid`, field.id);
    return value;
  }
  if (field.type === 'decimal') {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw httpError(422, 'extension_value_invalid', `${field.label} is invalid`, field.id);
    return value;
  }
  if (typeof value !== 'string' || value.length > field.maxLength) throw httpError(422, 'extension_value_invalid', `${field.label} is invalid`, field.id);
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw httpError(422, 'extension_value_invalid', `${field.label} is invalid`, field.id);
  if (field.type === 'enum' && !field.options.includes(value)) throw httpError(422, 'extension_value_invalid', `${field.label} is invalid`, field.id);
  return value;
}

/** @param {import('techsitemanager/plugin-api').PluginRegistry} registry @param {string} presentationId @param {string} entityType @param {string} fieldId */
function resolveField(registry, presentationId, entityType, fieldId) {
  const presentation = registry.presentation(presentationId);
  if (!presentation) throw httpError(404, 'presentation_not_found', 'Presentation profile not found');
  const field = presentation.fields.find((candidate) => candidate.id === fieldId && candidate.entityType === entityType);
  if (!field || !field.binding.startsWith(`extension.${presentation.pluginId}.`)) throw httpError(404, 'extension_field_not_found', 'Extension field not found');
  return { presentation, field, storedFieldId: field.binding.slice(`extension.${presentation.pluginId}.`.length) };
}

/** @param {import('knex').Knex.Transaction} trx @param {string} entityType @param {string} publicId */
async function requireEntity(trx, entityType, publicId) {
  const table = /** @type {Record<string, string>} */ (TABLES)[entityType];
  if (!table) throw httpError(422, 'extension_entity_invalid', 'Extension entity type is invalid');
  const row = await trx(table).where({ public_id: publicId }).first();
  if (!row) throw httpError(404, 'extension_entity_not_found', 'Extension entity not found');
  return row;
}

/**
 * @param {import('techsitemanager/plugin-api').PluginRegistry} registry
 * @param {string} entityType
 * @param {string} entityPublicId
 * @param {string} fieldId
 * @param {unknown} input
 * @param {number} actorUserId
 * @returns {Promise<{ binding: string, value: string | number | boolean | null, version: number }>}
 */
async function put(registry, entityType, entityPublicId, fieldId, input, actorUserId) {
  const body = object(input, 'extensionValue');
  knownKeys(body, ['presentationId', 'value', '_baseVersion'], 'extensionValue');
  const presentationId = string(body.presentationId, 'presentationId', { required: true, max: 128 });
  if (!presentationId) throw httpError(422, 'presentation_required', 'Presentation profile is required');
  const base = integer(body._baseVersion, '_baseVersion', { required: true, min: 0, max: Number.MAX_SAFE_INTEGER });
  if (base === null) throw httpError(428, 'base_version_required', '_baseVersion is required');
  const { presentation, field, storedFieldId } = resolveField(registry, presentationId, entityType, fieldId);
  const value = validateValue(field, body.value);
  return db.transaction(async (trx) => {
    await requireEntity(trx, entityType, entityPublicId);
    const key = { plugin_id: presentation.pluginId, entity_type: entityType, entity_public_id: entityPublicId, field_id: storedFieldId };
    const existing = await trx('extension_values').where(key).first();
    let version;
    if (existing) {
      if (existing.version !== base) throw httpError(409, 'version_conflict', 'The extension value changed since it was loaded');
      version = base + 1;
      await trx('extension_values').where({ ...key, version: base }).update({ value_json: JSON.stringify(value), version, updated_at: trx.fn.now() });
    } else {
      if (base !== 0) throw httpError(409, 'version_conflict', 'The extension value changed since it was loaded');
      version = 1;
      await trx('extension_values').insert({ public_id: crypto.randomUUID(), ...key, value_json: JSON.stringify(value), version });
    }
    await audit.record(trx, actorUserId, 'extension_value.update', entityType, entityPublicId, { fieldId, presentationId });
    return { binding: field.binding, value, version };
  });
}

/** @param {string[]} publicIds @param {import('knex').Knex | import('knex').Knex.Transaction} [trx] @returns {Promise<Map<string, Record<string, { value: unknown, version: number }>>>} */
async function valuesFor(publicIds, trx = db) {
  const result = new Map();
  if (!publicIds.length) return result;
  const rows = await trx('extension_values').whereIn('entity_public_id', publicIds);
  for (const row of rows) {
    const values = result.get(row.entity_public_id) || {};
    values[`extension.${row.plugin_id}.${row.field_id}`] = { value: JSON.parse(row.value_json), version: row.version };
    result.set(row.entity_public_id, values);
  }
  return result;
}

module.exports = { put, valuesFor, validateValue, resolveField, TABLES };
