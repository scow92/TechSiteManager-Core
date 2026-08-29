'use strict';

const crypto = require('crypto');

/**
 * @param {import('knex').Knex.Transaction} trx
 * @param {number | null | undefined} actorUserId
 * @param {string} action
 * @param {string} entityType
 * @param {string | null | undefined} entityPublicId
 * @param {Readonly<Record<string, unknown>>} [metadata]
 */
async function record(trx, actorUserId, action, entityType, entityPublicId, metadata = {}) {
  /** @type {Record<string, unknown>} */
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (['count', 'fields', 'status', 'providerId', 'runId', 'reasonCode'].includes(key)) safe[key] = value;
  }
  await trx('audit_events').insert({
    public_id: crypto.randomUUID(), actor_user_id: actorUserId || null, action,
    entity_type: entityType, entity_public_id: entityPublicId || null,
    metadata_json: JSON.stringify(safe)
  });
}

module.exports = { record };
