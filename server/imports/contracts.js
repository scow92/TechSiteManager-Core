'use strict';

const validation = require('../lib/validation');
const { httpError } = require('../lib/errors');

const SCHEMA = 'techsitemanager.io/import-draft/v1';
const FIELD_SETS = Object.freeze({
  workPackage: new Set(['packageReference', 'externalReference', 'projectReference', 'title', 'description', 'status']),
  workItem: new Set(['itemReference', 'title', 'description', 'status']),
  connection: new Set(['circuitReference', 'description', 'media', 'status']),
  segment: new Set(['segmentReference', 'fromEndpoint', 'toEndpoint', 'lengthMetres', 'notes'])
});

function managedFields(fields, kind, path) {
  validation.object(fields, path);
  const result = {};
  for (const [name, entry] of Object.entries(fields)) {
    if (!FIELD_SETS[kind].has(name)) throw httpError(422, 'unknown_import_field', `Unknown import field at ${path}.${name}`, `${path}.${name}`);
    validation.knownKeys(entry, ['value', 'ownership'], `${path}.${name}`);
    validation.ownership(entry.ownership, `${path}.${name}.ownership`);
    const max = ['description', 'notes'].includes(name) ? 20_000 : 255;
    if (name === 'lengthMetres') {
      if (entry.value !== null && (typeof entry.value !== 'number' || !Number.isFinite(entry.value) || entry.value < 0 || entry.value > 1_000_000)) throw httpError(422, 'invalid_import_value', `${path}.${name} is invalid`, `${path}.${name}`);
    } else {
      validation.string(entry.value, `${path}.${name}.value`, { required: ['packageReference', 'title', 'itemReference', 'circuitReference', 'media', 'segmentReference', 'fromEndpoint', 'toEndpoint'].includes(name), max });
    }
    result[name] = Object.freeze({ value: entry.value, ownership: entry.ownership });
  }
  return Object.freeze(result);
}

function recordArray(value, path, max) {
  if (!Array.isArray(value) || value.length > max) throw httpError(422, 'invalid_import_records', `${path} is invalid`, path);
  return value;
}

function validateDraft(input, expectedProviderId, expectedProviderVersion, artifact, profile) {
  validation.knownKeys(input, ['schemaVersion', 'providerId', 'source', 'target', 'workPackage', 'warnings'], 'draft');
  if (input.schemaVersion !== SCHEMA || input.providerId !== expectedProviderId) throw httpError(422, 'import_contract_mismatch', 'Provider returned an incompatible draft');
  validation.knownKeys(input.source, ['externalSourceId', 'sourceVersion'], 'draft.source');
  const externalSourceId = validation.string(input.source.externalSourceId, 'draft.source.externalSourceId', { required: true, max: 255 });
  const sourceVersion = validation.string(input.source.sourceVersion, 'draft.source.sourceVersion', { max: 255 });
  validation.knownKeys(input.target, ['siteCode', 'siteName'], 'draft.target');
  const siteCode = validation.string(input.target.siteCode, 'draft.target.siteCode', { required: true, max: 64 });
  const siteName = validation.string(input.target.siteName, 'draft.target.siteName', { required: true, max: 255 });
  validation.knownKeys(input.workPackage, ['sourceRecordKey', 'fields', 'workItems', 'connections'], 'draft.workPackage');
  const sourceRecordKey = validation.string(input.workPackage.sourceRecordKey, 'draft.workPackage.sourceRecordKey', { required: true, max: 255 });
  const fields = managedFields(input.workPackage.fields, 'workPackage', 'draft.workPackage.fields');
  for (const required of ['packageReference', 'title']) if (!fields[required]) throw httpError(422, 'required_import_field', `draft.workPackage.fields.${required} is required`);

  const seen = new Set([`work_package:${sourceRecordKey}`]);
  const workItems = recordArray(input.workPackage.workItems || [], 'draft.workPackage.workItems', 1000).map((item, index) => {
    const path = `draft.workPackage.workItems[${index}]`;
    validation.knownKeys(item, ['sourceRecordKey', 'sequenceHint', 'fields'], path);
    const key = validation.string(item.sourceRecordKey, `${path}.sourceRecordKey`, { required: true, max: 255 });
    if (seen.has(`work_item:${key}`)) throw httpError(422, 'duplicate_source_record_key', `${path}.sourceRecordKey is duplicated`, `${path}.sourceRecordKey`);
    seen.add(`work_item:${key}`);
    const itemFields = managedFields(item.fields, 'workItem', `${path}.fields`);
    if (!itemFields.itemReference || !itemFields.title) throw httpError(422, 'required_import_field', `${path} requires itemReference and title`);
    return Object.freeze({ sourceRecordKey: key, sequenceHint: validation.integer(item.sequenceHint, `${path}.sequenceHint`, { min: 0, max: 100000 }) || index, fields: itemFields });
  });
  const connections = recordArray(input.workPackage.connections || [], 'draft.workPackage.connections', 10_000).map((connection, index) => {
    const path = `draft.workPackage.connections[${index}]`;
    validation.knownKeys(connection, ['sourceRecordKey', 'fields', 'segments'], path);
    const key = validation.string(connection.sourceRecordKey, `${path}.sourceRecordKey`, { required: true, max: 255 });
    if (seen.has(`circuit:${key}`)) throw httpError(422, 'duplicate_source_record_key', `${path}.sourceRecordKey is duplicated`, `${path}.sourceRecordKey`);
    seen.add(`circuit:${key}`);
    const connectionFields = managedFields(connection.fields, 'connection', `${path}.fields`);
    if (!connectionFields.circuitReference || !connectionFields.media) throw httpError(422, 'required_import_field', `${path} requires circuitReference and media`);
    const segments = recordArray(connection.segments, `${path}.segments`, 100).map((segment, segmentIndex) => {
      const segmentPath = `${path}.segments[${segmentIndex}]`;
      validation.knownKeys(segment, ['sourceRecordKey', 'fields'], segmentPath);
      const segmentKey = validation.string(segment.sourceRecordKey, `${segmentPath}.sourceRecordKey`, { required: true, max: 255 });
      if (seen.has(`segment:${segmentKey}`)) throw httpError(422, 'duplicate_source_record_key', `${segmentPath}.sourceRecordKey is duplicated`, `${segmentPath}.sourceRecordKey`);
      seen.add(`segment:${segmentKey}`);
      const segmentFields = managedFields(segment.fields, 'segment', `${segmentPath}.fields`);
      for (const required of ['segmentReference', 'fromEndpoint', 'toEndpoint']) if (!segmentFields[required]) throw httpError(422, 'required_import_field', `${segmentPath}.fields.${required} is required`);
      return Object.freeze({ sourceRecordKey: segmentKey, fields: segmentFields });
    });
    if (!segments.length) throw httpError(422, 'connection_requires_segment', `${path}.segments must not be empty`);
    return Object.freeze({ sourceRecordKey: key, fields: connectionFields, segments: Object.freeze(segments) });
  });
  if (!Array.isArray(input.warnings || []) || input.warnings.length > 1000) throw httpError(422, 'invalid_import_warnings', 'draft.warnings is invalid');
  const warnings = (input.warnings || []).map((warning, index) => {
    validation.knownKeys(warning, ['code', 'severity', 'path', 'count'], `draft.warnings[${index}]`);
    return Object.freeze({
      code: validation.durableId(warning.code, `draft.warnings[${index}].code`),
      severity: validation.enumeration(warning.severity, `draft.warnings[${index}].severity`, ['info', 'warning', 'blocking'], true),
      path: validation.string(warning.path, `draft.warnings[${index}].path`, { max: 255 }),
      count: validation.integer(warning.count, `draft.warnings[${index}].count`, { min: 0, max: 100000 })
    });
  });
  return Object.freeze({
    schemaVersion: SCHEMA, providerId: expectedProviderId, providerVersion: expectedProviderVersion,
    profileId: profile && profile.id || null, profileHash: profile && profile.hash || null,
    source: Object.freeze({ externalSourceId, sourceVersion, contentHash: artifact.contentHash, connectorId: artifact.connectorId }),
    target: Object.freeze({ siteCode, siteName }),
    workPackage: Object.freeze({ sourceRecordKey, fields, workItems: Object.freeze(workItems), connections: Object.freeze(connections) }),
    warnings: Object.freeze(warnings)
  });
}

module.exports = { validateDraft, SCHEMA, FIELD_SETS };
