'use strict';

const db = require('../db/knex');

/** @typedef {Record<string, unknown> & { id: string, provider_id: string, draft_hash: string, normalized_draft_json: string, proposal_json: string, target_versions_json: string, expires_at: string, applied_run_id: number | null }} DraftRow */

/** @param {string} draftId @param {number} actorUserId @returns {Promise<DraftRow | undefined>} */
async function findOwned(draftId, actorUserId) {
  return /** @type {Promise<DraftRow | undefined>} */ (db('import_drafts').where({ id: draftId, actor_user_id: actorUserId }).first());
}

/** @param {string} draftId @param {number} actorUserId @returns {Promise<number>} */
async function cancelOwned(draftId, actorUserId) {
  return db('import_drafts').where({ id: draftId, actor_user_id: actorUserId, applied_run_id: null }).delete();
}

/** @param {string} timestamp @returns {Promise<number>} */
async function expireBefore(timestamp) {
  return db('import_drafts').where('expires_at', '<=', timestamp).whereNull('applied_run_id').delete();
}

module.exports = { findOwned, cancelOwned, expireBefore };
