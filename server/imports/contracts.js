'use strict';

const validation = require('../lib/validation');
const { httpError } = require('../lib/errors');
const { validateValue } = require('../plugins/extension-values');

const SCHEMA = 'techsitemanager.io/import-draft/v1';
const SCHEMA_V2 = 'techsitemanager.io/import-draft/v2';
const FIELD_SETS = Object.freeze({
  workPackage: new Set(['packageReference', 'externalReference', 'projectReference', 'title', 'description', 'status']),
  workItem: new Set(['itemReference', 'title', 'description', 'status']),
  connection: new Set(['circuitReference', 'description', 'media', 'status']),
  segment: new Set(['segmentReference', 'fromEndpoint', 'toEndpoint', 'lengthMetres', 'notes'])
});

/** @typedef {'workPackage' | 'workItem' | 'connection' | 'segment'} DraftKind */
/** @typedef {import('techsitemanager/import-contracts').ManagedValue} ManagedValue */

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {string}
 */
function requiredString(value, path) {
  const result = validation.string(value, path, { required: true, max: 255 });
  if (result === null) throw httpError(422, 'required_field', `${path} is required`, path);
  return result;
}

/**
 * @param {unknown} fields
 * @param {DraftKind} kind
 * @param {string} path
 * @returns {Readonly<Record<string, ManagedValue>>}
 */
function managedFields(fields, kind, path) {
  const record = validation.object(fields, path);
  /** @type {Record<string, ManagedValue>} */
  const result = {};
  for (const [name, value] of Object.entries(record)) {
    if (!FIELD_SETS[kind].has(name)) throw httpError(422, 'unknown_import_field', `Unknown import field at ${path}.${name}`, `${path}.${name}`);
    const entry = validation.object(value, `${path}.${name}`);
    validation.knownKeys(entry, ['value', 'ownership'], `${path}.${name}`);
    const ownership = validation.ownership(entry.ownership, `${path}.${name}.ownership`);
    const max = ['description', 'notes'].includes(name) ? 20_000 : 255;
    if (name === 'lengthMetres') {
      if (entry.value !== null && (typeof entry.value !== 'number' || !Number.isFinite(entry.value) || entry.value < 0 || entry.value > 1_000_000)) throw httpError(422, 'invalid_import_value', `${path}.${name} is invalid`, `${path}.${name}`);
    } else {
      validation.string(entry.value, `${path}.${name}.value`, { required: ['packageReference', 'title', 'itemReference', 'circuitReference', 'media', 'segmentReference', 'fromEndpoint', 'toEndpoint'].includes(name), max });
    }
    result[name] = Object.freeze({ value: /** @type {string | number | null} */ (entry.value), ownership: /** @type {import('techsitemanager/import-contracts').FieldOwnershipPolicy} */ (ownership) });
  }
  return Object.freeze(result);
}

/** @param {unknown} extensions @param {string} entityType @param {string} path @param {import('techsitemanager/plugin-api').PresentationProfile | null} presentation */
function managedExtensions(extensions, entityType, path, presentation) {
  if (extensions === undefined) return Object.freeze({});
  if (!presentation) throw httpError(422, 'presentation_required', 'Import extensions require a presentation profile', path);
  const values = validation.object(extensions, path);
  if (Object.keys(values).length > 200) throw httpError(422, 'too_many_extension_fields', `${path} contains too many fields`, path);
  /** @type {Record<string, ManagedValue>} */
  const result = {};
  for (const [fieldId, raw] of Object.entries(values)) {
    const field = presentation.fields.find((candidate) => candidate.id === fieldId && candidate.entityType === entityType && candidate.binding.startsWith(`extension.${presentation.pluginId}.`));
    if (!field) throw httpError(422, 'unknown_extension_field', `Unknown extension field at ${path}.${fieldId}`, `${path}.${fieldId}`);
    const entry = validation.object(raw, `${path}.${fieldId}`);
    validation.knownKeys(entry, ['value', 'ownership'], `${path}.${fieldId}`);
    const ownership = validation.ownership(entry.ownership, `${path}.${fieldId}.ownership`);
    result[field.binding] = Object.freeze({ value: validateValue(field, entry.value), ownership: /** @type {import('techsitemanager/import-contracts').FieldOwnershipPolicy} */ (ownership) });
  }
  return Object.freeze(result);
}

/** @param {unknown} value @param {string} path @param {number} max @returns {unknown[]} */
function recordArray(value, path, max) {
  if (!Array.isArray(value) || value.length > max) throw httpError(422, 'invalid_import_records', `${path} is invalid`, path);
  return value;
}

/**
 * @param {unknown} input
 * @param {string} expectedProviderId
 * @param {string} expectedProviderVersion
 * @param {Pick<import('techsitemanager/import-contracts').SourceArtifact, 'contentHash' | 'connectorId'>} artifact
 * @param {import('techsitemanager/plugin-api').ImportProfile | null} profile
 * @param {import('techsitemanager/plugin-api').PresentationProfile | null} [presentation]
 * @returns {import('techsitemanager/import-contracts').ValidatedImportDraft}
 */
function validateDraft(input, expectedProviderId, expectedProviderVersion, artifact, profile, presentation = null) {
  const draft = validation.object(input, 'draft');
  validation.knownKeys(draft, ['schemaVersion', 'providerId', 'presentationId', 'source', 'target', 'workPackage', 'warnings'], 'draft');
  if (![SCHEMA, SCHEMA_V2].includes(/** @type {string} */ (draft.schemaVersion)) || draft.providerId !== expectedProviderId) throw httpError(422, 'import_contract_mismatch', 'Provider returned an incompatible draft');
  if (draft.schemaVersion === SCHEMA_V2 && (!presentation || draft.presentationId !== presentation.id)) throw httpError(422, 'presentation_contract_mismatch', 'Provider returned an incompatible presentation profile');
  if (draft.schemaVersion === SCHEMA && draft.presentationId !== undefined) throw httpError(422, 'presentation_contract_mismatch', 'Plugin API V1 drafts cannot select a presentation profile');
  const source = validation.object(draft.source, 'draft.source');
  validation.knownKeys(source, ['externalSourceId', 'sourceVersion'], 'draft.source');
  const externalSourceId = requiredString(source.externalSourceId, 'draft.source.externalSourceId');
  const sourceVersion = validation.string(source.sourceVersion, 'draft.source.sourceVersion', { max: 255 });
  const target = validation.object(draft.target, 'draft.target');
  validation.knownKeys(target, ['siteCode', 'siteName'], 'draft.target');
  const siteCode = validation.string(target.siteCode, 'draft.target.siteCode', { required: true, max: 64 });
  const siteName = requiredString(target.siteName, 'draft.target.siteName');
  const workPackage = validation.object(draft.workPackage, 'draft.workPackage');
  validation.knownKeys(workPackage, ['sourceRecordKey', 'fields', 'extensions', 'workItems', 'connections', 'consumableRequirements'], 'draft.workPackage');
  const sourceRecordKey = requiredString(workPackage.sourceRecordKey, 'draft.workPackage.sourceRecordKey');
  /** @type {Readonly<Record<string, ManagedValue>>} */
  const fields = Object.freeze({ ...managedFields(workPackage.fields, 'workPackage', 'draft.workPackage.fields'), ...managedExtensions(workPackage.extensions, 'work-package', 'draft.workPackage.extensions', presentation) });
  for (const required of ['packageReference', 'title']) if (!fields[required]) throw httpError(422, 'required_import_field', `draft.workPackage.fields.${required} is required`);

  const seen = new Set([`work_package:${sourceRecordKey}`]);
  const workItems = recordArray(workPackage.workItems || [], 'draft.workPackage.workItems', 1000).map((value, index) => {
    const path = `draft.workPackage.workItems[${index}]`;
    const item = validation.object(value, path);
    validation.knownKeys(item, ['sourceRecordKey', 'sequenceHint', 'fields', 'extensions'], path);
    const key = requiredString(item.sourceRecordKey, `${path}.sourceRecordKey`);
    if (seen.has(`work_item:${key}`)) throw httpError(422, 'duplicate_source_record_key', `${path}.sourceRecordKey is duplicated`, `${path}.sourceRecordKey`);
    seen.add(`work_item:${key}`);
    /** @type {Readonly<Record<string, ManagedValue>>} */
    const itemFields = Object.freeze({ ...managedFields(item.fields, 'workItem', `${path}.fields`), ...managedExtensions(item.extensions, 'work-item', `${path}.extensions`, presentation) });
    if (!itemFields.itemReference || !itemFields.title) throw httpError(422, 'required_import_field', `${path} requires itemReference and title`);
    return Object.freeze({ sourceRecordKey: key, sequenceHint: validation.integer(item.sequenceHint, `${path}.sequenceHint`, { min: 0, max: 100000 }) || index, fields: itemFields });
  });
  const connections = recordArray(workPackage.connections || [], 'draft.workPackage.connections', 10_000).map((value, index) => {
    const path = `draft.workPackage.connections[${index}]`;
    const connection = validation.object(value, path);
    validation.knownKeys(connection, ['sourceRecordKey', 'fields', 'extensions', 'segments'], path);
    const key = requiredString(connection.sourceRecordKey, `${path}.sourceRecordKey`);
    if (seen.has(`circuit:${key}`)) throw httpError(422, 'duplicate_source_record_key', `${path}.sourceRecordKey is duplicated`, `${path}.sourceRecordKey`);
    seen.add(`circuit:${key}`);
    /** @type {Readonly<Record<string, ManagedValue>>} */
    const connectionFields = Object.freeze({ ...managedFields(connection.fields, 'connection', `${path}.fields`), ...managedExtensions(connection.extensions, 'circuit', `${path}.extensions`, presentation) });
    if (!connectionFields.circuitReference || !connectionFields.media) throw httpError(422, 'required_import_field', `${path} requires circuitReference and media`);
    const segments = recordArray(connection.segments, `${path}.segments`, 100).map((segmentValue, segmentIndex) => {
      const segmentPath = `${path}.segments[${segmentIndex}]`;
      const segment = validation.object(segmentValue, segmentPath);
      validation.knownKeys(segment, ['sourceRecordKey', 'fields', 'extensions'], segmentPath);
      const segmentKey = requiredString(segment.sourceRecordKey, `${segmentPath}.sourceRecordKey`);
      if (seen.has(`segment:${segmentKey}`)) throw httpError(422, 'duplicate_source_record_key', `${segmentPath}.sourceRecordKey is duplicated`, `${segmentPath}.sourceRecordKey`);
      seen.add(`segment:${segmentKey}`);
      /** @type {Readonly<Record<string, ManagedValue>>} */
      const segmentFields = Object.freeze({ ...managedFields(segment.fields, 'segment', `${segmentPath}.fields`), ...managedExtensions(segment.extensions, 'segment', `${segmentPath}.extensions`, presentation) });
      for (const required of ['segmentReference', 'fromEndpoint', 'toEndpoint']) if (!segmentFields[required]) throw httpError(422, 'required_import_field', `${segmentPath}.fields.${required} is required`);
      return Object.freeze({ sourceRecordKey: segmentKey, fields: segmentFields });
    });
    if (!segments.length) throw httpError(422, 'connection_requires_segment', `${path}.segments must not be empty`);
    return Object.freeze({ sourceRecordKey: key, fields: connectionFields, segments: Object.freeze(segments) });
  });
  const consumableRequirements = recordArray(workPackage.consumableRequirements || [], 'draft.workPackage.consumableRequirements', 1000).map((value, index) => {
    const path = `draft.workPackage.consumableRequirements[${index}]`;
    const requirement = validation.object(value, path);
    validation.knownKeys(requirement, ['sourceRecordKey', 'fields', 'extensions'], path);
    const key = requiredString(requirement.sourceRecordKey, `${path}.sourceRecordKey`);
    if (seen.has(`consumable_requirement:${key}`)) throw httpError(422, 'duplicate_source_record_key', `${path}.sourceRecordKey is duplicated`, `${path}.sourceRecordKey`);
    seen.add(`consumable_requirement:${key}`);
    const sourceFields = validation.object(requirement.fields, `${path}.fields`);
    validation.knownKeys(sourceFields, ['description', 'quantityRequired', 'unit'], `${path}.fields`);
    /** @type {Record<string, ManagedValue>} */
    const requirementFields = {};
    for (const [name, raw] of Object.entries(sourceFields)) {
      const entry = validation.object(raw, `${path}.fields.${name}`);
      validation.knownKeys(entry, ['value', 'ownership'], `${path}.fields.${name}`);
      const ownership = validation.ownership(entry.ownership, `${path}.fields.${name}.ownership`);
      const value = name === 'quantityRequired'
        ? validation.number(entry.value, `${path}.fields.${name}.value`, { required: true, min: Number.EPSILON, max: 1_000_000 })
        : validation.string(entry.value, `${path}.fields.${name}.value`, { required: true, max: 255 });
      requirementFields[name] = Object.freeze({ value, ownership: /** @type {import('techsitemanager/import-contracts').FieldOwnershipPolicy} */ (ownership) });
    }
    for (const required of ['description', 'quantityRequired', 'unit']) if (!requirementFields[required]) throw httpError(422, 'required_import_field', `${path}.fields.${required} is required`);
    return Object.freeze({ sourceRecordKey: key, fields: Object.freeze({ ...requirementFields, ...managedExtensions(requirement.extensions, 'consumable-requirement', `${path}.extensions`, presentation) }) });
  });
  const warningValues = draft.warnings || [];
  if (!Array.isArray(warningValues) || warningValues.length > 1000) throw httpError(422, 'invalid_import_warnings', 'draft.warnings is invalid');
  const warnings = warningValues.map((warningValue, index) => {
    const warning = validation.object(warningValue, `draft.warnings[${index}]`);
    validation.knownKeys(warning, ['code', 'severity', 'path', 'count'], `draft.warnings[${index}]`);
    return Object.freeze({
      code: validation.durableId(warning.code, `draft.warnings[${index}].code`) || '',
      severity: validation.enumeration(warning.severity, `draft.warnings[${index}].severity`, /** @type {const} */ (['info', 'warning', 'blocking']), true) || 'info',
      path: validation.string(warning.path, `draft.warnings[${index}].path`, { max: 255 }),
      count: validation.integer(warning.count, `draft.warnings[${index}].count`, { min: 0, max: 100000 })
    });
  });
  return Object.freeze({
    schemaVersion: /** @type {'techsitemanager.io/import-draft/v1' | 'techsitemanager.io/import-draft/v2'} */ (draft.schemaVersion), providerId: expectedProviderId, providerVersion: expectedProviderVersion, presentationId: presentation && presentation.id || null,
    profileId: profile && profile.id || null, profileHash: profile && profile.hash || null,
    source: Object.freeze({ externalSourceId, sourceVersion, contentHash: artifact.contentHash, connectorId: artifact.connectorId }),
    target: Object.freeze({ siteCode: siteCode || '', siteName }),
    workPackage: Object.freeze({ sourceRecordKey, fields, workItems: Object.freeze(workItems), connections: Object.freeze(connections), consumableRequirements: Object.freeze(consumableRequirements) }),
    warnings: Object.freeze(warnings)
  });
}

module.exports = { validateDraft, SCHEMA, SCHEMA_V2, FIELD_SETS };
