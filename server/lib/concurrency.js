'use strict';

const { httpError } = require('./errors');

async function updateByVersion(trx, table, publicId, baseVersion, changes) {
  if (!Number.isInteger(baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
  const updated = await trx(table).where({ public_id: publicId, version: baseVersion })
    .update({ ...changes, version: baseVersion + 1 });
  if (updated) return trx(table).where({ public_id: publicId }).first();
  const current = await trx(table).where({ public_id: publicId }).first();
  if (!current) throw httpError(404, 'not_found', 'Record not found');
  const error = httpError(409, 'version_conflict', 'The record changed since it was loaded');
  error.serverVersion = current.version;
  throw error;
}

module.exports = { updateByVersion };
