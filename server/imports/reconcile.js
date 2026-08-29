'use strict';

/** @typedef {import('techsitemanager/import-contracts').FieldOwnershipPolicy} FieldOwnershipPolicy */
/** @typedef {import('techsitemanager/import-contracts').ManagedValue} ManagedValue */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationEntityType} EntityType */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationFieldProposal} FieldProposal */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationEntityProposal} EntityProposal */
/** @typedef {import('techsitemanager/import-contracts').ReconciliationAbsenceProposal} AbsenceProposal */
/** @typedef {Omit<import('techsitemanager/import-contracts').ReconciliationProposal, 'draftId' | 'draftHash' | 'expiresAt' | 'appliedRunId'>} ProposalCore */
/** @typedef {{ entityType: EntityType, sourceRecordKey: string, parentSourceRecordKey?: string, fields: Readonly<Record<string, ManagedValue>>, sequence: number }} FlatRecord */
/** @typedef {{ id: number, entity_type: EntityType, source_record_key: string, entity_public_id: string }} LinkRow */
/** @typedef {{ source_link_id: number | null, entity_type: EntityType, entity_public_id: string, field_path: string, policy: FieldOwnershipPolicy, last_applied_value_json: string }} OwnershipRow */
/** @typedef {Record<string, unknown> & { public_id: string, version: number }} EntityRow */

/** @type {Readonly<Record<EntityType, Readonly<Record<string, string>>>>} */
const FIELD_COLUMNS = Object.freeze({
  work_package: { packageReference: 'package_ref', externalReference: 'external_reference', projectReference: 'project_reference', title: 'title', description: 'description', status: 'status' },
  work_item: { itemReference: 'item_reference', title: 'title', description: 'description', status: 'status' },
  circuit: { circuitReference: 'circuit_reference', description: 'description', media: 'media', status: 'status' },
  segment: { segmentReference: 'segment_reference', fromEndpoint: 'from_endpoint', toEndpoint: 'to_endpoint', lengthMetres: 'length_metres', notes: 'notes' }
  , consumable_requirement: { description: 'description', quantityRequired: 'quantity_required', unit: 'unit' }
});

/** @param {unknown} a @param {unknown} b */
function equal(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

/**
 * @param {import('techsitemanager/import-contracts').ValidatedImportDraft} draft
 * @returns {FlatRecord[]}
 */
function flatten(draft) {
  /** @type {FlatRecord[]} */
  const records = [{ entityType: 'work_package', sourceRecordKey: draft.workPackage.sourceRecordKey, fields: draft.workPackage.fields, sequence: 0 }];
  draft.workPackage.workItems.forEach((item) => records.push({ entityType: 'work_item', sourceRecordKey: item.sourceRecordKey, fields: item.fields, sequence: item.sequenceHint }));
  draft.workPackage.connections.forEach((connection, connectionIndex) => {
    records.push({ entityType: 'circuit', sourceRecordKey: connection.sourceRecordKey, fields: connection.fields, sequence: connectionIndex });
    connection.segments.forEach((segment, segmentIndex) => records.push({ entityType: 'segment', sourceRecordKey: segment.sourceRecordKey, parentSourceRecordKey: connection.sourceRecordKey, fields: segment.fields, sequence: segmentIndex }));
  });
  draft.workPackage.consumableRequirements.forEach((requirement, index) => records.push({ entityType: 'consumable_requirement', sourceRecordKey: requirement.sourceRecordKey, fields: requirement.fields, sequence: index }));
  return records;
}

/**
 * @param {import('knex').Knex.Transaction} trx
 * @param {EntityType} entityType
 * @param {string} publicId
 * @returns {Promise<EntityRow | undefined>}
 */
async function currentRow(trx, entityType, publicId) {
  const table = { work_package: 'work_packages', work_item: 'work_items', circuit: 'circuits', segment: 'segments', consumable_requirement: 'consumable_requirements' }[entityType];
  return /** @type {Promise<EntityRow | undefined>} */ (trx(table).where({ public_id: publicId }).first());
}

/**
 * @param {import('knex').Knex.Transaction} trx
 * @param {{ id: number } | null | undefined} source
 * @param {import('techsitemanager/import-contracts').ValidatedImportDraft} draft
 * @returns {Promise<ProposalCore>}
 */
async function buildProposal(trx, source, draft) {
  /** @type {LinkRow[]} */
  const links = source ? await trx('import_entity_links').where({ source_id: source.id }) : [];
  const linkMap = new Map(links.map((link) => [`${link.entity_type}:${link.source_record_key}`, link]));
  /** @type {OwnershipRow[]} */
  const ownershipRows = links.length ? await trx('import_field_ownership').whereIn('source_link_id', links.map((link) => link.id)) : [];
  const ownershipMap = new Map(ownershipRows.map((row) => [`${row.entity_type}:${row.entity_public_id}:${row.field_path}`, row]));
  /** @type {EntityProposal[]} */
  const entityProposals = [];
  /** @type {Set<number>} */
  const seenLinkIds = new Set();
  /** @type {Record<string, number>} */
  const targetVersions = {};

  for (const record of flatten(draft)) {
    const key = `${record.entityType}:${record.sourceRecordKey}`;
    const link = linkMap.get(key);
    let current = link ? await currentRow(trx, record.entityType, link.entity_public_id) : null;
    if (!current && record.entityType === 'work_package' && record.fields.packageReference) {
      current = /** @type {EntityRow | undefined} */ (await trx('work_packages').where({ package_ref: record.fields.packageReference.value }).first());
    }
    if (link) seenLinkIds.add(link.id);
    if (current && current.version !== undefined) targetVersions[current.public_id] = current.version;
    /** @type {FieldProposal[]} */
    const fields = [];
    for (const [fieldPath, candidate] of Object.entries(record.fields)) {
      const column = FIELD_COLUMNS[record.entityType][fieldPath];
      let currentValue = current && column ? current[column] : null;
      if (current && !column && fieldPath.startsWith('extension.')) {
        const extension = await trx('extension_values').where({ entity_public_id: current.public_id }).whereRaw("? = 'extension.' || plugin_id || '.' || field_id", [fieldPath]).first();
        currentValue = extension ? JSON.parse(extension.value_json) : null;
      }
      let owner = current ? ownershipMap.get(`${record.entityType}:${current.public_id}:${fieldPath}`) : undefined;
      if (current && !owner) owner = /** @type {OwnershipRow | undefined} */ (await trx('import_field_ownership').where({ entity_type: record.entityType, entity_public_id: current.public_id, field_path: fieldPath }).first());
      let conflict = false;
      /** @type {import('techsitemanager/import-contracts').FieldDecision} */
      let recommended = 'accept-source';
      const policy = owner ? owner.policy : candidate.ownership;
      if (current) {
        if (owner && (!link || owner.source_link_id !== link.id)) {
          conflict = true;
          recommended = 'keep-current';
        } else if (policy === 'user-owned') recommended = 'keep-current';
        else if (policy === 'source-default' && currentValue !== null && currentValue !== '') recommended = 'keep-current';
        else if (policy === 'review-required' && !equal(currentValue, candidate.value)) recommended = 'defer';
        else if (owner && !equal(currentValue, JSON.parse(owner.last_applied_value_json))) {
          conflict = true;
          recommended = 'keep-current';
        }
      }
      fields.push({ fieldPath, currentValue, sourceValue: candidate.value, ownership: policy, conflict, recommended, changed: !equal(currentValue, candidate.value) });
    }
    entityProposals.push({
      proposalId: `${record.entityType}:${record.sourceRecordKey}`, entityType: record.entityType,
      sourceRecordKey: record.sourceRecordKey, entityPublicId: current && current.public_id || null,
      action: current ? (fields.some((field) => field.changed) ? 'update' : 'unchanged') : 'create',
      parentSourceRecordKey: record.parentSourceRecordKey || null, sequence: record.sequence, fields
    });
  }
  /** @type {AbsenceProposal[]} */
  const absences = links.filter((link) => !seenLinkIds.has(link.id)).map((link) => ({
    proposalId: `absent:${link.entity_type}:${link.source_record_key}`, entityType: link.entity_type,
    sourceRecordKey: link.source_record_key, entityPublicId: link.entity_public_id,
    action: 'absent', choices: ['keep-linked-absent', 'unlink-and-keep', 'defer']
  }));
  return { schemaVersion: 'techsitemanager.io/reconciliation/v1', targetVersions, entityProposals, absences, warnings: draft.warnings };
}

module.exports = { buildProposal, flatten, FIELD_COLUMNS, equal };
