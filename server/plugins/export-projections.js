'use strict';

const db = require('../db/knex');
const { httpError } = require('../lib/errors');
const { packageDetail } = require('../lib/work-packages');

const SCHEMA_VERSION = 'techsitemanager.io/export-projection/v1';
/** @type {Readonly<Record<string, number>>} */
const ENTITY_ORDER = Object.freeze({ work_package: 0, work_item: 1, circuit: 2, segment: 3, consumable_requirement: 4 });
const ENTITY_TABLES = Object.freeze({
  work_package: 'work_packages', work_item: 'work_items', circuit: 'circuits',
  segment: 'segments', consumable_requirement: 'consumable_requirements'
});

/** @param {unknown} value @returns {number} */
function countValue(value) { return Number(value || 0); }

/** @param {Record<string, { value: unknown, version: number }>} values @param {string} pluginId */
function scopedExtensions(values, pluginId) {
  const prefix = `extension.${pluginId}.`;
  return Object.fromEntries(Object.entries(values || {}).filter(([key]) => key.startsWith(prefix)));
}

/** @param {import('techsitemanager/plugin-api').WorkPackageProjection} workPackage @param {string} pluginId */
function scopeWorkPackage(workPackage, pluginId) {
  return {
    ...workPackage,
    extensions: scopedExtensions(workPackage.extensions, pluginId),
    workItems: workPackage.workItems.map((item) => ({ ...item, extensions: scopedExtensions(item.extensions, pluginId) })),
    circuits: workPackage.circuits.map((circuit) => ({
      ...circuit,
      extensions: scopedExtensions(circuit.extensions, pluginId),
      segments: circuit.segments.map((segment) => ({ ...segment, extensions: scopedExtensions(segment.extensions, pluginId) }))
    })),
    consumableRequirements: workPackage.consumableRequirements.map((requirement) => ({ ...requirement, extensions: scopedExtensions(requirement.extensions, pluginId) }))
  };
}

/** @param {import('techsitemanager/plugin-api').WorkPackageProjection} workPackage */
function packageRelationships(workPackage) {
  /** @type {Map<string, string | null>} */
  const parent = new Map([[workPackage.publicId, null]]);
  for (const item of workPackage.workItems) parent.set(item.publicId, workPackage.publicId);
  for (const circuit of workPackage.circuits) {
    parent.set(circuit.publicId, workPackage.publicId);
    for (const segment of circuit.segments) parent.set(segment.publicId, circuit.publicId);
  }
  for (const requirement of workPackage.consumableRequirements) parent.set(requirement.publicId, workPackage.publicId);
  return parent;
}

/**
 * @param {string} workPackagePublicId
 * @param {{ pluginId: string, providerIds: readonly string[], maxRecords: number }} options
 * @returns {Promise<import('techsitemanager/plugin-api').ExportProjectionV1>}
 */
async function buildV1(workPackagePublicId, options) {
  const packRow = await db('work_packages').where({ public_id: workPackagePublicId }).first('id', 'site_id');
  if (!packRow) throw httpError(404, 'work_package_not_found', 'Work package not found');

  const sourceRows = options.providerIds.length ? await db('import_sources as source')
    .join('import_entity_links as link', 'link.source_id', 'source.id')
    .whereIn('source.provider_id', options.providerIds)
    .where({ 'link.entity_type': 'work_package', 'link.entity_public_id': workPackagePublicId })
    .distinct('source.id', 'source.public_id')
    .orderBy('source.public_id') : [];
  const sourceIds = sourceRows.map((row) => row.id);

  const counts = await Promise.all([
    db('work_items').where({ work_package_id: packRow.id }).count({ count: '*' }).first(),
    db('circuits').where({ work_package_id: packRow.id }).count({ count: '*' }).first(),
    db('segments as segment').join('circuits as circuit', 'circuit.id', 'segment.circuit_id').where({ 'circuit.work_package_id': packRow.id }).count({ count: '*' }).first(),
    db('consumable_requirements').where({ work_package_id: packRow.id }).count({ count: '*' }).first(),
    db('rooms').where({ site_id: packRow.site_id }).count({ count: '*' }).first(),
    db('racks').where({ site_id: packRow.site_id }).count({ count: '*' }).first(),
    db('termination_points').where({ site_id: packRow.site_id }).count({ count: '*' }).first(),
    db('consumable_requirements').where({ work_package_id: packRow.id }).whereNotNull('catalogue_id').countDistinct({ count: 'catalogue_id' }).first(),
    sourceIds.length ? db('import_entity_links').whereIn('source_id', sourceIds).count({ count: '*' }).first() : Promise.resolve({ count: 0 })
  ]);
  const recordCount = 1 + counts.reduce((total, row) => total + countValue(row && row.count), 0);
  if (recordCount > options.maxRecords) throw httpError(413, 'export_projection_too_large', 'The export projection is too large');

  const workPackage = scopeWorkPackage(await packageDetail(workPackagePublicId), options.pluginId);
  const [siteRow, rooms, racks, terminationPoints, catalogueItems, links] = await Promise.all([
    db('sites').where({ id: packRow.site_id }).first(),
    db('rooms').where({ site_id: packRow.site_id }).orderBy(['name', 'public_id']),
    db('racks as rack').leftJoin('rooms as room', 'room.id', 'rack.room_id').where({ 'rack.site_id': packRow.site_id })
      .select('rack.*', 'room.public_id as room_public_id', 'room.name as room_name').orderBy(['rack.label', 'rack.public_id']),
    db('termination_points as point').leftJoin('rooms as room', 'room.id', 'point.room_id').where({ 'point.site_id': packRow.site_id })
      .select('point.*', 'room.public_id as room_public_id', 'room.name as room_name').orderBy(['point.label', 'point.public_id']),
    db('consumable_catalogue as catalogue').join('consumable_requirements as requirement', 'requirement.catalogue_id', 'catalogue.id')
      .where({ 'requirement.work_package_id': packRow.id }).distinct('catalogue.*').orderBy(['catalogue.catalogue_reference', 'catalogue.public_id']),
    sourceIds.length ? db('import_entity_links as link').join('import_sources as source', 'source.id', 'link.source_id')
      .whereIn('link.source_id', sourceIds)
      .select('source.public_id as source_public_id', 'link.source_record_key', 'link.entity_type', 'link.entity_public_id', 'link.reconciliation_state', 'link.absent_at') : Promise.resolve([])
  ]);
  if (!siteRow) throw httpError(500, 'export_projection_invalid', 'The export projection could not be constructed');

  const parent = packageRelationships(workPackage);
  const outside = links.filter((link) => !parent.has(link.entity_public_id));
  const existingOutside = new Set();
  for (const [entityType, table] of Object.entries(ENTITY_TABLES)) {
    const publicIds = outside.filter((link) => link.entity_type === entityType).map((link) => link.entity_public_id);
    if (!publicIds.length) continue;
    for (const row of await db(table).whereIn('public_id', publicIds).select('public_id')) existingOutside.add(row.public_id);
  }
  /** @type {import('techsitemanager/plugin-api').ApprovedImportRecordProjection[]} */
  const approvedImportRecords = links
    .filter((link) => parent.has(link.entity_public_id) || !existingOutside.has(link.entity_public_id))
    .map((link) => ({
      sourcePublicId: link.source_public_id,
      sourceRecordKey: link.source_record_key,
      entityType: link.entity_type.replaceAll('_', '-'),
      entityPublicId: link.entity_public_id,
      parentEntityPublicId: parent.get(link.entity_public_id) || null,
      state: /** @type {'present' | 'source-absent' | 'entity-missing'} */ (!parent.has(link.entity_public_id) ? 'entity-missing' : (link.reconciliation_state === 'absent' || link.absent_at ? 'source-absent' : 'present'))
    }))
    .sort((left, right) => left.sourcePublicId.localeCompare(right.sourcePublicId)
      || (ENTITY_ORDER[left.entityType.replaceAll('-', '_')] - ENTITY_ORDER[right.entityType.replaceAll('-', '_')])
      || left.sourceRecordKey.localeCompare(right.sourceRecordKey)
      || left.entityPublicId.localeCompare(right.entityPublicId));

  return {
    schemaVersion: SCHEMA_VERSION,
    workPackage,
    site: {
      publicId: siteRow.public_id, code: siteRow.code, name: siteRow.name,
      description: siteRow.description, version: siteRow.version,
      rooms: rooms.map((room) => ({ publicId: room.public_id, name: room.name, description: room.description, version: room.version })),
      racks: racks.map((rack) => ({ publicId: rack.public_id, label: rack.label, suiteLine: rack.suite_line, sizeUnits: rack.size_units, roomPublicId: rack.room_public_id || null, roomName: rack.room_name || null, version: rack.version })),
      terminationPoints: terminationPoints.map((point) => ({ publicId: point.public_id, label: point.label, kind: point.kind, notes: point.notes, roomPublicId: point.room_public_id || null, roomName: point.room_name || null, version: point.version }))
    },
    catalogueItems: catalogueItems.map((item) => ({ publicId: item.public_id, catalogueReference: item.catalogue_reference, description: item.description, estimatedUnitPrice: item.estimated_unit_price === null ? null : Number(item.estimated_unit_price), unit: item.unit, active: Boolean(item.active), version: item.version })),
    approvedImportRecords
  };
}

module.exports = { SCHEMA_VERSION, buildV1, scopeWorkPackage };
