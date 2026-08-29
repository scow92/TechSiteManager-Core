'use strict';

const { httpError } = require('./errors');

/**
 * @param {import('knex').Knex.Transaction} trx
 * @param {string} table
 * @param {string} publicId
 * @param {unknown} baseVersion
 * @param {Record<string, unknown>} changes
 * @returns {Promise<Record<string, unknown>>}
 */
async function updateByVersion(trx, table, publicId, baseVersion, changes) {
  if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
  const updated = await trx(table).where({ public_id: publicId, version: baseVersion })
    .update({ ...changes, version: baseVersion + 1 });
  if (updated) return /** @type {Promise<Record<string, unknown>>} */ (trx(table).where({ public_id: publicId }).first());
  const current = await trx(table).where({ public_id: publicId }).first();
  if (!current) throw httpError(404, 'not_found', 'Record not found');
  const error = httpError(409, 'version_conflict', 'The record changed since it was loaded');
  error.serverVersion = current.version;
  throw error;
}

module.exports = { updateByVersion };
