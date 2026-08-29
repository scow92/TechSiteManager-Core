'use strict';

const crypto = require('crypto');
const config = require('../config');
const db = require('../db/knex');
const { validateDraft } = require('./contracts');
const { buildProposal, flatten, FIELD_COLUMNS } = require('./reconcile');
const { boundedJson, knownKeys, string, integer, array, object } = require('../lib/validation');
const { httpError } = require('../lib/errors');
const audit = require('../lib/audit');
const { acquireArtifact, callProvider } = require('./artifacts');
const { sha256, canonicalHash, sourceFingerprint } = require('./fingerprints');
const draftStorage = require('./draft-storage');

const TABLES = Object.freeze({ work_package: 'work_packages', work_item: 'work_items', circuit: 'circuits', segment: 'segments' });

/** @typedef {import('techsitemanager/plugin-api').PluginRegistry} PluginRegistry */
/** @typedef {import('techsitemanager/import-contracts').ValidatedImportDraft} ValidatedImportDraft */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationEntityType} EntityType */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationEntityProposal} EntityProposal */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationFieldProposal} FieldProposal */
/** @typedef {import('techsitemanager/import-contracts').ImportApproval} ImportApproval */
/** @typedef {import('techsitemanager/import-contracts').FieldDecision} FieldDecision */
/** @typedef {import('techsitemanager/import-contracts').AbsenceDecision} AbsenceDecision */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationProposal} ReconciliationProposal */
/** @typedef {import('techsitemanager/import-contracts').ImportResult} ImportResult */
/** @typedef {import('knex').Knex.Transaction} Transaction */
/** @typedef {Record<string, unknown> & { id: number, public_id: string }} DbRow */
/** @typedef {DbRow & { provider_id: string, draft_hash: string, normalized_draft_json: string, proposal_json: string, target_versions_json: string, expires_at: string, applied_run_id: number | null }} DraftRow */
/** @typedef {DbRow & { source_id: number, source_version: string | null, content_hash: string, source_fingerprint: string, status: string, primary_entity_public_id: string | null, counts_json: string, warning_codes_json: string, finished_at: string | null, attempt_count: number }} ImportRunRow */
/** @typedef {DbRow & { provider_id: string, external_source_id: string }} SourceRow */
/** @typedef {DbRow & { source_link_id?: number | null, source_id?: number, entity_type?: EntityType, entity_public_id?: string, source_record_key?: string, policy?: string }} LinkOrOwnershipRow */
/** @typedef {DbRow & { version: number }} VersionedRow */
/** @typedef {Record<string, unknown> & { package_ref?: unknown, external_reference?: unknown, project_reference?: unknown, title?: unknown, description?: unknown, status?: unknown, item_reference?: unknown, circuit_reference?: unknown, media?: unknown, segment_reference?: unknown, from_endpoint?: unknown, to_endpoint?: unknown, length_metres?: unknown, notes?: unknown }} EntityChanges */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

/** @param {string} json @returns {unknown} */
function parseStoredJson(json) {
  try { return JSON.parse(json); }
  catch { throw httpError(500, 'import_state_invalid', 'Stored import state is invalid'); }
}

/** @param {unknown} value @returns {value is ValidatedImportDraft} */
function isValidatedDraft(value) {
  if (!isRecord(value) || value.schemaVersion !== 'techsitemanager.io/import-draft/v1' || typeof value.providerId !== 'string' || typeof value.providerVersion !== 'string') return false;
  const source = value.source;
  const target = value.target;
  const workPackage = value.workPackage;
  return isRecord(source) && typeof source.externalSourceId === 'string' && (source.sourceVersion === null || typeof source.sourceVersion === 'string') && typeof source.contentHash === 'string' && typeof source.connectorId === 'string' &&
    isRecord(target) && typeof target.siteCode === 'string' && typeof target.siteName === 'string' &&
    isRecord(workPackage) && typeof workPackage.sourceRecordKey === 'string' && isRecord(workPackage.fields) && Array.isArray(workPackage.workItems) && Array.isArray(workPackage.connections) && Array.isArray(value.warnings);
}

/** @param {unknown} value @returns {value is ReconciliationProposal} */
function isProposal(value) {
  if (!isRecord(value) || value.schemaVersion !== 'techsitemanager.io/reconciliation/v1' || typeof value.draftId !== 'string' || typeof value.draftHash !== 'string' || !isRecord(value.targetVersions) || !Array.isArray(value.entityProposals) || !Array.isArray(value.absences) || !Array.isArray(value.warnings)) return false;
  return value.entityProposals.every((entity) => isRecord(entity) && typeof entity.proposalId === 'string' && typeof entity.entityType === 'string' && typeof entity.sourceRecordKey === 'string' && Array.isArray(entity.fields) && entity.fields.every((field) => isRecord(field) && typeof field.fieldPath === 'string' && typeof field.recommended === 'string')) &&
    value.absences.every((absence) => isRecord(absence) && typeof absence.proposalId === 'string' && typeof absence.sourceRecordKey === 'string' && typeof absence.entityType === 'string') &&
    Object.values(value.targetVersions).every((version) => Number.isInteger(version) && /** @type {number} */ (version) >= 0);
}

/** @param {string} json @returns {ValidatedImportDraft} */
function parseDraft(json) {
  const value = parseStoredJson(json);
  if (!isValidatedDraft(value)) throw httpError(500, 'import_state_invalid', 'Stored import state is invalid');
  return value;
}

/** @param {string} json @returns {ReconciliationProposal} */
function parseProposal(json) {
  const value = parseStoredJson(json);
  if (!isProposal(value)) throw httpError(500, 'import_state_invalid', 'Stored import state is invalid');
  return value;
}

/** @param {string} json @returns {Record<string, number>} */
function parseVersions(json) {
  const value = parseStoredJson(json);
  if (!isRecord(value) || !Object.values(value).every((version) => Number.isInteger(version) && /** @type {number} */ (version) >= 0)) throw httpError(500, 'import_state_invalid', 'Stored import state is invalid');
  return /** @type {Record<string, number>} */ (value);
}

function uuid() { return crypto.randomUUID(); }
/** @returns {string} */
function now() { return new Date().toISOString(); }

/**
 * @param {PluginRegistry} registry
 * @param {string} providerId
 * @param {number} actorUserId
 * @param {unknown} body
 * @returns {Promise<import('techsitemanager/import-contracts').ReconciliationProposal>}
 */
async function stage(registry, providerId, actorUserId, body) {
  const provider = registry.provider(providerId);
  if (!provider) throw httpError(404, 'provider_not_found', 'Import provider not found');
  let artifact = await acquireArtifact(registry, provider, body);
  const profile = provider.profileId ? registry.profile(provider.profileId) || null : null;
  const providerDraft = await callProvider(provider, artifact, profile, registry);
  let draft = validateDraft(providerDraft, provider.id, provider.providerVersion, artifact, profile);
  const draftId = uuid();
  const createdAt = now();
  const expiresAt = new Date(Date.now() + config.draftTtlMs).toISOString();
  const proposal = await db.transaction(async (trx) => {
    const source = await trx('import_sources').where({ provider_id: draft.providerId, external_source_id: draft.source.externalSourceId }).first();
    if (source) {
      const previous = await trx('import_runs').where({ source_id: source.id }).orderBy('id', 'desc').first();
      if (previous && previous.source_version === draft.source.sourceVersion && previous.content_hash !== draft.source.contentHash) {
        draft = Object.freeze({ ...draft, warnings: Object.freeze([...draft.warnings, Object.freeze({ code: 'core.source-version-content-changed', severity: 'warning', path: 'source.sourceVersion', count: 1 })]) });
      }
    }
    const draftHash = canonicalHash(draft);
    const reconciliation = await buildProposal(trx, source, draft);
    const proposalWithIdentity = { ...reconciliation, draftId, draftHash };
    await trx('import_drafts').insert({
      id: draftId, actor_user_id: actorUserId, provider_id: provider.id, draft_hash: draftHash,
      normalized_draft_json: boundedJson(draft, 'draft'), proposal_json: boundedJson(proposalWithIdentity, 'proposal'),
      target_versions_json: JSON.stringify(reconciliation.targetVersions), created_at: createdAt, expires_at: expiresAt
    });
    return proposalWithIdentity;
  });
  return { ...proposal, expiresAt };
}

/** @param {string} draftId @param {number} actorUserId @returns {Promise<ReconciliationProposal>} */
async function getDraft(draftId, actorUserId) {
  const row = await draftStorage.findOwned(draftId, actorUserId);
  if (!row) throw httpError(404, 'draft_not_found', 'Import draft not found');
  if (row.expires_at <= now()) throw httpError(410, 'draft_expired', 'Import draft has expired');
  const proposal = parseProposal(row.proposal_json);
  return { ...proposal, expiresAt: row.expires_at, appliedRunId: row.applied_run_id };
}

/** @param {string} draftId @param {number} actorUserId @returns {Promise<void>} */
async function cancelDraft(draftId, actorUserId) {
  const deleted = await draftStorage.cancelOwned(draftId, actorUserId);
  if (!deleted) throw httpError(404, 'draft_not_found', 'Import draft not found');
}

/** @param {Transaction} trx @param {Readonly<Record<string, number>>} versions */
async function assertVersions(trx, versions) {
  for (const [publicId, expected] of Object.entries(versions)) {
    let found = null;
    for (const table of Object.values(TABLES)) {
      found = /** @type {VersionedRow | undefined} */ (await trx(table).where({ public_id: publicId }).select('version').first()) || null;
      if (found) break;
    }
    if (!found || found.version !== expected) throw httpError(409, 'stale_approval', 'Import approval is stale');
  }
}

/** @param {ImportApproval} approval @param {string} proposalId @param {FieldProposal} field @returns {FieldDecision} */
function decisionFor(approval, proposalId, field) {
  const key = `${proposalId}.${field.fieldPath}`;
  const explicit = approval.fieldDecisions && approval.fieldDecisions[key];
  const decision = explicit || field.recommended;
  if (!['accept-source', 'keep-current', 'make-user-owned', 'return-to-source', 'defer'].includes(decision)) throw httpError(422, 'invalid_field_decision', 'Import field decision is invalid', key);
  return decision;
}

/**
 * @param {unknown} input
 * @param {ReconciliationProposal} proposal
 * @returns {{ approval: ImportApproval, targetVersions: Record<string, number>, acknowledgements: string[] }}
 */
function validateApproval(input, proposal) {
  const approval = object(input, 'approval');
  knownKeys(approval, ['schemaVersion', 'draftHash', 'targetVersions', 'fieldDecisions', 'absenceDecisions', 'acknowledgeWarnings'], 'approval');
  if (approval.schemaVersion !== 'techsitemanager.io/import-approval/v1') throw httpError(422, 'approval_schema_version', 'Import approval schema is invalid');
  const draftHash = string(approval.draftHash, 'approval.draftHash', { required: true, max: 71, pattern: /^sha256:[a-f0-9]{64}$/ });
  if (!draftHash) throw httpError(422, 'required_field', 'approval.draftHash is required', 'approval.draftHash');
  const targetVersionValues = object(approval.targetVersions || {}, 'approval.targetVersions');
  /** @type {Record<string, number>} */
  const targetVersions = {};
  if (Object.keys(targetVersionValues).length > 20_000) throw httpError(422, 'approval_too_large', 'Import approval contains too many versions');
  for (const [publicId, version] of Object.entries(targetVersionValues)) {
    string(publicId, `approval.targetVersions.${publicId}`, { required: true, max: 36, pattern: /^[0-9a-f-]{36}$/i });
    const parsed = integer(version, `approval.targetVersions.${publicId}`, { required: true, min: 0 });
    if (parsed === null) throw httpError(422, 'required_field', `approval.targetVersions.${publicId} is required`, `approval.targetVersions.${publicId}`);
    targetVersions[publicId] = parsed;
  }
  const fieldDecisionValues = object(approval.fieldDecisions || {}, 'approval.fieldDecisions');
  const absenceDecisionValues = object(approval.absenceDecisions || {}, 'approval.absenceDecisions');
  if (Object.keys(fieldDecisionValues).length > 50_000 || Object.keys(absenceDecisionValues).length > 20_000) throw httpError(422, 'approval_too_large', 'Import approval contains too many decisions');
  const allowedFields = new Set(proposal.entityProposals.flatMap((entity) => entity.fields.map((field) => `${entity.proposalId}.${field.fieldPath}`)));
  const allowedAbsences = new Set(proposal.absences.map((absence) => absence.proposalId));
  /** @type {Record<string, FieldDecision>} */
  const fieldDecisions = {};
  for (const [key, decision] of Object.entries(fieldDecisionValues)) {
    if (!allowedFields.has(key) || typeof decision !== 'string' || !['accept-source', 'keep-current', 'make-user-owned', 'return-to-source', 'defer'].includes(decision)) throw httpError(422, 'invalid_field_decision', 'Import field decision is invalid', key);
    fieldDecisions[key] = /** @type {FieldDecision} */ (decision);
  }
  /** @type {Record<string, AbsenceDecision>} */
  const absenceDecisions = {};
  for (const [key, decision] of Object.entries(absenceDecisionValues)) {
    if (!allowedAbsences.has(key) || typeof decision !== 'string' || !['keep-linked-absent', 'unlink-and-keep', 'defer'].includes(decision)) throw httpError(422, 'invalid_absence_decision', 'Import absence decision is invalid', key);
    absenceDecisions[key] = /** @type {AbsenceDecision} */ (decision);
  }
  const warningCodes = new Set(proposal.warnings.map((warning) => warning.code));
  const acknowledgementValues = array(approval.acknowledgeWarnings, 'approval.acknowledgeWarnings', { max: 1000 });
  /** @type {string[]} */
  const acknowledgements = [];
  for (const [index, code] of acknowledgementValues.entries()) {
    const parsed = string(code, `approval.acknowledgeWarnings[${index}]`, { required: true, max: 128 });
    if (!parsed || !warningCodes.has(parsed)) throw httpError(422, 'unknown_warning_acknowledgement', 'Import warning acknowledgement is invalid');
    acknowledgements.push(parsed);
  }
  return { approval: Object.freeze({ schemaVersion: 'techsitemanager.io/import-approval/v1', draftHash: /** @type {`sha256:${string}`} */ (draftHash), targetVersions: Object.freeze(targetVersions), fieldDecisions: Object.freeze(fieldDecisions), absenceDecisions: Object.freeze(absenceDecisions), acknowledgeWarnings: Object.freeze(acknowledgements) }), targetVersions, acknowledgements };
}

/** @param {Transaction} trx @param {EntityProposal} entity @param {LinkOrOwnershipRow} link @param {FieldProposal} field @param {FieldDecision} decision @param {number} runId @param {unknown} currentValue */
async function upsertOwnership(trx, entity, link, field, decision, runId, currentValue) {
  const key = { entity_type: entity.entityType, entity_public_id: entity.entityPublicId, field_path: field.fieldPath };
  const existing = await trx('import_field_ownership').where(key).first();
  if (decision === 'defer') return;
  if (existing && existing.source_link_id && existing.source_link_id !== link.id && decision !== 'return-to-source') return;
  const appliedValue = ['accept-source', 'return-to-source'].includes(decision) ? field.sourceValue : currentValue;
  const policy = decision === 'make-user-owned' || decision === 'keep-current' ? 'user-owned' : field.ownership;
  const data = {
    ...key, policy, source_link_id: link.id, last_source_value_json: JSON.stringify(field.sourceValue),
    last_applied_value_json: JSON.stringify(appliedValue), last_run_id: runId, updated_at: now()
  };
  if (existing) await trx('import_field_ownership').where({ id: existing.id }).update(data);
  else await trx('import_field_ownership').insert(data);
}

/** @param {EntityProposal} entity @param {ImportApproval} approval @returns {EntityChanges} */
function acceptedChanges(entity, approval) {
  /** @type {EntityChanges} */
  const changes = {};
  for (const field of entity.fields) {
    const decision = decisionFor(approval, entity.proposalId, field);
    if (['accept-source', 'return-to-source'].includes(decision)) changes[FIELD_COLUMNS[entity.entityType][field.fieldPath]] = field.sourceValue;
  }
  return changes;
}

/** @param {Transaction} trx @param {EntityProposal} entity @param {Map<string, number>} parentIds @param {number} siteId @param {number | null} workPackageId @param {ImportApproval} approval @returns {Promise<DbRow>} */
async function createEntity(trx, entity, parentIds, siteId, workPackageId, approval) {
  const publicId = uuid();
  const changes = acceptedChanges(entity, approval);
  let row;
  if (entity.entityType === 'work_package') {
    if (!changes.package_ref || !changes.title) throw httpError(422, 'required_field_deferred', 'Required work package fields must be approved');
    const [id] = await trx('work_packages').insert({ public_id: publicId, site_id: siteId, package_ref: changes.package_ref, external_reference: changes.external_reference || null, project_reference: changes.project_reference || null, title: changes.title, description: changes.description || '', status: changes.status || 'planned' });
    row = await trx('work_packages').where({ id }).first();
  } else if (entity.entityType === 'work_item') {
    if (!changes.item_reference || !changes.title) throw httpError(422, 'required_field_deferred', 'Required work item fields must be approved');
    const [id] = await trx('work_items').insert({ public_id: publicId, work_package_id: workPackageId, item_reference: changes.item_reference, title: changes.title, description: changes.description || '', status: changes.status || 'planned', sequence: entity.sequence || 0 });
    row = await trx('work_items').where({ id }).first();
  } else if (entity.entityType === 'circuit') {
    if (!changes.circuit_reference || !changes.media) throw httpError(422, 'required_field_deferred', 'Required circuit fields must be approved');
    const [id] = await trx('circuits').insert({ public_id: publicId, work_package_id: workPackageId, circuit_reference: changes.circuit_reference, description: changes.description || '', media: changes.media, status: changes.status || 'planned' });
    row = await trx('circuits').where({ id }).first();
    parentIds.set(entity.sourceRecordKey, row.id);
  } else {
    const circuitId = entity.parentSourceRecordKey ? parentIds.get(entity.parentSourceRecordKey) : undefined;
    if (!circuitId || !changes.segment_reference || !changes.from_endpoint || !changes.to_endpoint) throw httpError(422, 'required_field_deferred', 'Required segment fields must be approved');
    const [id] = await trx('segments').insert({ public_id: publicId, circuit_id: circuitId, segment_reference: changes.segment_reference, sequence: entity.sequence || 0, from_endpoint: changes.from_endpoint, to_endpoint: changes.to_endpoint, length_metres: changes.length_metres === undefined ? null : changes.length_metres, notes: changes.notes || '' });
    row = await trx('segments').where({ id }).first();
  }
  if (!row) throw httpError(500, 'import_persistence_failed', 'Imported entity could not be read after creation');
  return /** @type {DbRow} */ (row);
}

/** @param {Transaction} trx @param {EntityProposal} entity @param {ImportApproval} approval @param {number} expectedVersion @returns {Promise<DbRow>} */
async function updateEntity(trx, entity, approval, expectedVersion) {
  const table = TABLES[entity.entityType];
  const changes = acceptedChanges(entity, approval);
  if (!Object.keys(changes).length) return /** @type {Promise<DbRow>} */ (trx(table).where({ public_id: entity.entityPublicId }).first());
  const changed = await trx(table).where({ public_id: entity.entityPublicId, version: expectedVersion }).update({ ...changes, version: expectedVersion + 1 });
  if (!changed) throw httpError(409, 'stale_approval', 'Import approval is stale');
  return /** @type {Promise<DbRow>} */ (trx(table).where({ public_id: entity.entityPublicId }).first());
}

/** @param {PluginRegistry} registry @param {string} draftId @param {number} actorUserId @param {unknown} input @returns {Promise<ImportResult>} */
async function apply(registry, draftId, actorUserId, input) {
  const inputObject = object(input, 'approval');
  const row = /** @type {DraftRow | undefined} */ (await db('import_drafts').where({ id: draftId, actor_user_id: actorUserId }).first());
  if (!row) throw httpError(404, 'draft_not_found', 'Import draft not found');
  if (row.expires_at <= now()) throw httpError(410, 'draft_expired', 'Import draft has expired');
  if (row.draft_hash !== inputObject.draftHash) throw httpError(409, 'draft_hash_mismatch', 'Import draft changed');
  const draft = parseDraft(row.normalized_draft_json);
  const proposal = parseProposal(row.proposal_json);
  const validated = validateApproval(inputObject, proposal);
  const approval = validated.approval;
  const expectedVersions = parseVersions(row.target_versions_json);
  const versionKeys = new Set([...Object.keys(validated.targetVersions), ...Object.keys(expectedVersions)]);
  if ([...versionKeys].some((key) => validated.targetVersions[key] !== expectedVersions[key])) throw httpError(409, 'stale_approval', 'Import approval versions do not match');
  if (draft.warnings.some((warning) => warning.severity === 'blocking' && !validated.acknowledgements.includes(warning.code))) throw httpError(422, 'blocking_warning_unacknowledged', 'Blocking import warnings must be acknowledged');
  if (!registry.provider(draft.providerId)) throw httpError(409, 'provider_unavailable', 'Import provider is no longer available');

  return db.transaction(async (trx) => {
    const lockedDraft = /** @type {DraftRow | undefined} */ (await trx('import_drafts').where({ id: draftId, actor_user_id: actorUserId }).first());
    if (!lockedDraft) throw httpError(404, 'draft_not_found', 'Import draft not found');
    if (lockedDraft.applied_run_id) {
      const prior = /** @type {ImportRunRow | undefined} */ (await trx('import_runs').where({ id: lockedDraft.applied_run_id }).first());
      if (!prior) throw httpError(500, 'import_state_invalid', 'Stored import state is invalid');
      return resultFromRun(prior);
    }
    await assertVersions(trx, expectedVersions);
    const fingerprint = sourceFingerprint(draft);
    let source = /** @type {SourceRow | undefined} */ (await trx('import_sources').where({ provider_id: draft.providerId, external_source_id: draft.source.externalSourceId }).first());
    if (!source) {
      const [sourceId] = await trx('import_sources').insert({ public_id: uuid(), provider_id: draft.providerId, external_source_id: draft.source.externalSourceId, display_reference: draft.source.externalSourceId, connector_id: draft.source.connectorId, first_seen_at: now(), last_seen_at: now() });
      source = /** @type {SourceRow | undefined} */ (await trx('import_sources').where({ id: sourceId }).first());
      if (!source) throw httpError(500, 'import_persistence_failed', 'Import source could not be read after creation');
    }
    const priorRun = /** @type {ImportRunRow | undefined} */ (await trx('import_runs').where({ source_id: source.id, source_fingerprint: fingerprint, status: 'applied' }).first());
    if (priorRun) {
      await trx('import_runs').where({ id: priorRun.id }).increment('attempt_count', 1);
      await trx('import_drafts').where({ id: draftId }).update({ applied_run_id: priorRun.id });
      return resultFromRun({ ...priorRun, attempt_count: priorRun.attempt_count + 1 });
    }
    const [runId] = await trx('import_runs').insert({
      public_id: uuid(), source_id: source.id, source_version: draft.source.sourceVersion,
      content_hash: draft.source.contentHash, source_fingerprint: fingerprint,
      provider_version: draft.providerVersion, profile_id: draft.profileId, profile_hash: draft.profileHash,
      status: 'applying', actor_user_id: actorUserId, counts_json: '{}', warning_codes_json: JSON.stringify(draft.warnings.map((warning) => warning.code)),
      decisions_json: JSON.stringify({ fields: Object.keys(approval.fieldDecisions || {}).length, absences: Object.keys(approval.absenceDecisions || {}).length }), started_at: now()
    });
    let workPackageId = null;
    /** @type {Map<string, number>} */
    const parentIds = new Map();
    const counts = { created: 0, updated: 0, unchanged: 0, absent: 0, unlinked: 0, conflicted: 0 };
    const records = flatten(draft);
    const entityByProposal = new Map(proposal.entityProposals.map((entry) => [entry.proposalId, { ...entry }]));
    for (const record of records) {
      const proposalEntry = entityByProposal.get(`${record.entityType}:${record.sourceRecordKey}`);
      if (!proposalEntry) throw httpError(500, 'import_state_invalid', 'Stored import state is invalid');
      let entityRow;
      if (proposalEntry.entityPublicId) {
        entityRow = await updateEntity(trx, proposalEntry, approval, expectedVersions[proposalEntry.entityPublicId]);
        counts[proposalEntry.action === 'unchanged' ? 'unchanged' : 'updated'] += 1;
      } else {
        let site = /** @type {DbRow | undefined} */ (await trx('sites').where({ code: draft.target.siteCode }).first());
        if (!site) {
          const [siteId] = await trx('sites').insert({ public_id: uuid(), code: draft.target.siteCode, name: draft.target.siteName, description: '' });
          site = /** @type {DbRow | undefined} */ (await trx('sites').where({ id: siteId }).first());
          if (!site) throw httpError(500, 'import_persistence_failed', 'Import site could not be read after creation');
        }
        entityRow = await createEntity(trx, proposalEntry, parentIds, site.id, workPackageId, approval);
        counts.created += 1;
      }
      proposalEntry.entityPublicId = entityRow.public_id;
      if (record.entityType === 'work_package') workPackageId = entityRow.id;
      if (record.entityType === 'circuit') parentIds.set(record.sourceRecordKey, entityRow.id);
      let link = /** @type {LinkOrOwnershipRow | undefined} */ (await trx('import_entity_links').where({ source_id: source.id, source_record_key: record.sourceRecordKey, entity_type: record.entityType }).first());
      if (link) {
        await trx('import_entity_links').where({ id: link.id }).update({ entity_public_id: entityRow.public_id, last_seen_run_id: runId, absent_at: null, reconciliation_state: 'linked' });
        link = { ...link, entity_public_id: entityRow.public_id, last_seen_run_id: runId };
      } else {
        const [linkId] = await trx('import_entity_links').insert({ public_id: uuid(), source_id: source.id, source_record_key: record.sourceRecordKey, entity_type: record.entityType, entity_public_id: entityRow.public_id, first_run_id: runId, last_seen_run_id: runId });
        link = /** @type {LinkOrOwnershipRow | undefined} */ (await trx('import_entity_links').where({ id: linkId }).first());
        if (!link) throw httpError(500, 'import_persistence_failed', 'Import link could not be read after creation');
      }
      for (const field of proposalEntry.fields) {
        const decision = decisionFor(approval, proposalEntry.proposalId, field);
        if (field.conflict) counts.conflicted += 1;
        const currentValue = entityRow[FIELD_COLUMNS[record.entityType][field.fieldPath]];
        await upsertOwnership(trx, proposalEntry, link, field, decision, runId, currentValue);
      }
    }
    for (const absence of proposal.absences) {
      const decision = approval.absenceDecisions && approval.absenceDecisions[absence.proposalId] || 'defer';
      const link = /** @type {LinkOrOwnershipRow | undefined} */ (await trx('import_entity_links').where({ source_id: source.id, source_record_key: absence.sourceRecordKey, entity_type: absence.entityType }).first());
      if (!link) continue;
      if (decision === 'unlink-and-keep') {
        await trx('import_field_ownership').where({ source_link_id: link.id }).update({ source_link_id: null, policy: 'user-owned', updated_at: now() });
        await trx('import_entity_links').where({ id: link.id }).delete();
        counts.unlinked += 1;
      } else if (decision === 'keep-linked-absent') {
        await trx('import_entity_links').where({ id: link.id }).update({ absent_at: now(), reconciliation_state: 'absent' });
        counts.absent += 1;
      } else if (decision !== 'defer') throw httpError(422, 'invalid_absence_decision', 'Import absence decision is invalid');
    }
    await trx('import_sources').where({ id: source.id }).update({ last_seen_at: now(), absent_at: null });
    const workPackageProposal = entityByProposal.get(`work_package:${draft.workPackage.sourceRecordKey}`);
    if (!workPackageProposal || !workPackageProposal.entityPublicId) throw httpError(500, 'import_state_invalid', 'Stored import state is invalid');
    await trx('import_runs').where({ id: runId }).update({ status: 'applied', primary_entity_public_id: workPackageProposal.entityPublicId, counts_json: JSON.stringify(counts), finished_at: now() });
    await trx('import_drafts').where({ id: draftId }).update({ applied_run_id: runId });
    await audit.record(trx, actorUserId, 'import.apply', 'work_package', workPackageProposal.entityPublicId, { providerId: draft.providerId, runId, count: records.length });
    const run = /** @type {ImportRunRow | undefined} */ (await trx('import_runs').where({ id: runId }).first());
    if (!run) throw httpError(500, 'import_persistence_failed', 'Import result could not be read after application');
    return resultFromRun(run, workPackageProposal.entityPublicId);
  });
}

/** @param {ImportRunRow} run @param {string | null} [workPackagePublicId] @returns {ImportResult} */
function resultFromRun(run, workPackagePublicId) {
  return {
    schemaVersion: 'techsitemanager.io/import-result/v1', runId: run.public_id,
    status: run.status === 'applied' ? 'applied' : run.status,
    workPackagePublicId: workPackagePublicId || run.primary_entity_public_id || null,
    counts: JSON.parse(run.counts_json), warningCodes: JSON.parse(run.warning_codes_json),
    appliedAt: run.finished_at, attemptCount: run.attempt_count
  };
}

/** @param {string} publicId @returns {Promise<ImportResult>} */
async function getRun(publicId) {
  const row = /** @type {ImportRunRow | undefined} */ (await db('import_runs').where({ public_id: publicId }).first());
  if (!row) throw httpError(404, 'run_not_found', 'Import run not found');
  return resultFromRun(row);
}

/** @returns {Promise<number>} */
async function expireDrafts() {
  return draftStorage.expireBefore(now());
}

module.exports = { stage, getDraft, cancelDraft, apply, getRun, expireDrafts, sha256, canonicalHash };
