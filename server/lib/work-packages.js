'use strict';

const db = require('../db/knex');
const { httpError } = require('./errors');
const extensionValues = require('../plugins/extension-values');

/** @typedef {{ id: number, public_id: string, version: number }} DbRow */
/** @typedef {DbRow & { site_public_id: string, site_code: string, site_name: string, package_ref: string, external_reference: string | null, project_reference: string | null, title: string, description: string, status: string, lead_assignee: string | null, assignees_json: string, completed_at: string | null, completed_by_public_id: string | null, completed_by_display_name: string | null }} WorkPackageRow */
/** @typedef {DbRow & { item_reference: string, title: string, description: string, status: string, sequence: number, lead_assignee: string | null, assignees_json: string, completed_at: string | null, completed_by_public_id: string | null, completed_by_display_name: string | null }} WorkItemRow */
/** @typedef {DbRow & { circuit_reference: string, description: string, media: string, status: string, segments: SegmentRow[] }} CircuitRow */
/** @typedef {DbRow & { segment_reference: string, sequence: number, from_endpoint: string, to_endpoint: string, length_metres: number | null, notes: string }} SegmentRow */
/** @typedef {DbRow & { catalogue_public_id: string | null, description: string, quantity_required: number, unit: string | null }} RequirementRow */

/**
 * @param {string} publicId
 * @param {import('knex').Knex | import('knex').Knex.Transaction} [trx]
 * @returns {Promise<import('techsitemanager/plugin-api').WorkPackageProjection>}
 */
async function packageDetail(publicId, trx = db) {
  /** @type {WorkPackageRow | undefined} */
  const pack = await trx('work_packages as w').join('sites as s', 's.id', 'w.site_id').leftJoin('users as completed_user', 'completed_user.id', 'w.completed_by_user_id').where('w.public_id', publicId).select('w.*', 's.public_id as site_public_id', 's.code as site_code', 's.name as site_name', 'completed_user.public_id as completed_by_public_id', 'completed_user.display_name as completed_by_display_name').first();
  if (!pack) throw httpError(404, 'work_package_not_found', 'Work package not found');
  /** @type {WorkItemRow[]} */
  const workItems = await trx('work_items as i').leftJoin('users as completed_user', 'completed_user.id', 'i.completed_by_user_id').where({ 'i.work_package_id': pack.id }).select('i.*', 'completed_user.public_id as completed_by_public_id', 'completed_user.display_name as completed_by_display_name').orderBy(['i.sequence', 'i.id']);
  /** @type {CircuitRow[]} */
  const circuits = await trx('circuits').where({ work_package_id: pack.id }).orderBy('id');
  for (const circuit of circuits) circuit.segments = /** @type {SegmentRow[]} */ (await trx('segments').where({ circuit_id: circuit.id }).orderBy(['sequence', 'id']));
  /** @type {RequirementRow[]} */
  const requirements = await trx('consumable_requirements as r').leftJoin('consumable_catalogue as c', 'c.id', 'r.catalogue_id').where({ 'r.work_package_id': pack.id }).select('r.*', 'c.public_id as catalogue_public_id').orderBy('r.id');
  const photos = await trx('photos').where((builder) => builder.where({ entity_type: 'work_package', entity_public_id: pack.public_id }).orWhere((nested) => nested.where({ entity_type: 'work_item' }).whereIn('entity_public_id', workItems.map((row) => row.public_id)))).select('public_id', 'entity_type', 'entity_public_id', 'name', 'description', 'media_type', 'is_current', 'version', 'created_at').orderBy('id', 'desc');
  const publicIds = [pack.public_id, ...workItems.map((row) => row.public_id), ...circuits.flatMap((row) => [row.public_id, ...row.segments.map((segment) => segment.public_id)]), ...requirements.map((row) => row.public_id)];
  const extensions = await extensionValues.valuesFor(publicIds, trx);
  /** @type {unknown} */
  const parsedAssignees = JSON.parse(pack.assignees_json);
  if (!Array.isArray(parsedAssignees) || parsedAssignees.some((entry) => typeof entry !== 'string')) throw new Error('invalid_assignees_json');
  /** @param {Record<string, any>} photo */
  const publicPhoto = (photo) => ({ publicId: photo.public_id, name: photo.name, description: photo.description, mediaType: photo.media_type, current: Boolean(photo.is_current), version: photo.version, createdAt: photo.created_at });
  return {
    publicId: pack.public_id, site: { publicId: pack.site_public_id, code: pack.site_code, name: pack.site_name },
    packageReference: pack.package_ref, externalReference: pack.external_reference, projectReference: pack.project_reference,
    title: pack.title, description: pack.description, status: pack.status, leadAssignee: pack.lead_assignee,
    assignees: parsedAssignees, version: pack.version, extensions: extensions.get(pack.public_id) || {},
    completedAt: pack.completed_at, completedBy: pack.completed_by_public_id ? { publicId: pack.completed_by_public_id, displayName: pack.completed_by_display_name || '' } : null,
    handoverPhotos: photos.filter((photo) => photo.entity_type === 'work_package').map(publicPhoto),
    workItems: workItems.map((row) => { const itemAssignees = JSON.parse(row.assignees_json); if (!Array.isArray(itemAssignees) || itemAssignees.some((entry) => typeof entry !== 'string')) throw new Error('invalid_work_item_assignees_json'); return { publicId: row.public_id, itemReference: row.item_reference, title: row.title, description: row.description, status: row.status, sequence: row.sequence, leadAssignee: row.lead_assignee, assignees: itemAssignees, completedAt: row.completed_at, completedBy: row.completed_by_public_id ? { publicId: row.completed_by_public_id, displayName: row.completed_by_display_name || '' } : null, handoverPhotos: photos.filter((photo) => photo.entity_type === 'work_item' && photo.entity_public_id === row.public_id).map(publicPhoto), version: row.version, extensions: extensions.get(row.public_id) || {} }; }),
    circuits: circuits.map((row) => ({ publicId: row.public_id, circuitReference: row.circuit_reference, description: row.description, media: row.media, status: row.status, version: row.version, extensions: extensions.get(row.public_id) || {}, segments: row.segments.map((segment) => ({ publicId: segment.public_id, segmentReference: segment.segment_reference, sequence: segment.sequence, fromEndpoint: segment.from_endpoint, toEndpoint: segment.to_endpoint, lengthMetres: segment.length_metres, notes: segment.notes, version: segment.version, extensions: extensions.get(segment.public_id) || {} })) })),
    consumableRequirements: requirements.map((row) => ({ publicId: row.public_id, cataloguePublicId: row.catalogue_public_id || null, description: row.description, quantityRequired: row.quantity_required, unit: row.unit, version: row.version, extensions: extensions.get(row.public_id) || {} }))
  };
}

module.exports = { packageDetail };
