'use strict';

const crypto = require('crypto');

async function record(trx, actorUserId, action, entityType, entityPublicId, metadata = {}) {
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
