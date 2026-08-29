'use strict';

const db = require('../db/knex');
const { httpError } = require('./errors');

async function packageDetail(publicId, trx = db) {
  const pack = await trx('work_packages as w').join('sites as s', 's.id', 'w.site_id').where('w.public_id', publicId).select('w.*', 's.public_id as site_public_id', 's.code as site_code', 's.name as site_name').first();
  if (!pack) throw httpError(404, 'work_package_not_found', 'Work package not found');
  const workItems = await trx('work_items').where({ work_package_id: pack.id }).orderBy(['sequence', 'id']);
  const circuits = await trx('circuits').where({ work_package_id: pack.id }).orderBy('id');
  for (const circuit of circuits) circuit.segments = await trx('segments').where({ circuit_id: circuit.id }).orderBy(['sequence', 'id']);
  const requirements = await trx('consumable_requirements').where({ work_package_id: pack.id }).orderBy('id');
  return {
    publicId: pack.public_id, site: { publicId: pack.site_public_id, code: pack.site_code, name: pack.site_name },
    packageReference: pack.package_ref, externalReference: pack.external_reference, projectReference: pack.project_reference,
    title: pack.title, description: pack.description, status: pack.status, leadAssignee: pack.lead_assignee,
    assignees: JSON.parse(pack.assignees_json), version: pack.version,
    workItems: workItems.map((row) => ({ publicId: row.public_id, itemReference: row.item_reference, title: row.title, description: row.description, status: row.status, sequence: row.sequence, version: row.version })),
    circuits: circuits.map((row) => ({ publicId: row.public_id, circuitReference: row.circuit_reference, description: row.description, media: row.media, status: row.status, version: row.version, segments: row.segments.map((segment) => ({ publicId: segment.public_id, segmentReference: segment.segment_reference, sequence: segment.sequence, fromEndpoint: segment.from_endpoint, toEndpoint: segment.to_endpoint, lengthMetres: segment.length_metres, notes: segment.notes, version: segment.version })) })),
    consumableRequirements: requirements.map((row) => ({ publicId: row.public_id, description: row.description, quantityRequired: row.quantity_required, unit: row.unit }))
  };
}

module.exports = { packageDetail };
