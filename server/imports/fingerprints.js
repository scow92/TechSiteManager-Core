'use strict';

const crypto = require('crypto');

/** @param {crypto.BinaryLike} value @returns {`sha256:${string}`} */
function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

/** @param {object} value @returns {`sha256:${string}`} */
function canonicalHash(value) {
  return sha256(Buffer.from(JSON.stringify(value)));
}

/** @param {import('techsitemanager/import-contracts').ValidatedImportDraft} draft @returns {`sha256:${string}`} */
function sourceFingerprint(draft) {
  return sha256(Buffer.from([draft.providerId, draft.source.externalSourceId, draft.source.sourceVersion === null ? '<null>' : draft.source.sourceVersion, draft.source.contentHash].join('\u0000')));
}

module.exports = { sha256, canonicalHash, sourceFingerprint };
