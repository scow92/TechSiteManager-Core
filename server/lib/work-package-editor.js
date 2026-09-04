'use strict';

const db = require('../db/knex');
const audit = require('./audit');
const { packageDetail } = require('./work-packages');
const { assertMutable } = require('./work-package-locks');
const { MEDIA, segmentValues, validateChain, applyRackChanges } = require('./cable-schedules');
const { httpError } = require('./errors');
const { knownKeys, string, integer, number, array, enumeration, uuid } = require('./validation');

const OPEN_STATUSES = ['planned', 'active', 'blocked', 'cancelled'];
const ITEM_STATUSES = [...OPEN_STATUSES, 'complete'];

function assignees(value, path) {
  return array(value, path, { max: 50 }).map((entry, index) => string(entry, `${path}[${index}]`, { required: true, max: 64 }));
}

function identity(record, path) {
  const publicId = uuid(record.publicId, `${path}.publicId`);
  const version = integer(record._baseVersion, `${path}._baseVersion`, { required: true, min: 0 });
  return { publicId, version };
}

function itemInput(value, index) {
  const path = `workItems[${index}]`;
  knownKeys(value, ['publicId', '_baseVersion', 'itemReference', 'title', 'description', 'status', 'sequence', 'leadAssignee', 'assignees'], path);
  const key = identity(value, path);
  return { ...key, values: {
    item_reference: string(value.itemReference, `${path}.itemReference`, { required: true, max: 255 }),
    title: string(value.title, `${path}.title`, { required: true, max: 255 }),
    description: string(value.description, `${path}.description`, { max: 20_000 }) || '',
    status: enumeration(value.status || 'planned', `${path}.status`, ITEM_STATUSES, true),
    sequence: integer(value.sequence === undefined ? index : value.sequence, `${path}.sequence`, { required: true, min: 0, max: 100_000 }),
    lead_assignee: string(value.leadAssignee, `${path}.leadAssignee`, { max: 64 }),
    assignees_json: JSON.stringify(assignees(value.assignees, `${path}.assignees`))
  } };
}

async function segmentInput(trx, value, circuitIndex, index, siteId, media) {
  const path = `circuits[${circuitIndex}].segments[${index}]`;
  knownKeys(value, ['publicId', '_baseVersion', 'segmentReference', 'sequence', 'fromEndpoint', 'toEndpoint', 'fromEndpointMode', 'fromDevicePublicId', 'fromTerminationPositionPublicId', 'fromPort', 'toEndpointMode', 'toDevicePublicId', 'toTerminationPositionPublicId', 'toPort', 'fromConnector', 'toConnector', 'lengthMetres', 'notes', 'fibreType', 'fibreMode', 'fibreSimplex', 'stockLengthMetres', 'itemType', 'copperCategory', 'copperShielding', 'copperPinout', 'dacConnector', 'dacMedia', 'dacDirection'], path);
  const key = identity(value, path);
  return { ...key, values: await segmentValues(trx, { ...value, sequence: value.sequence === undefined ? index : value.sequence }, path, siteId, media) };
}

async function circuitInput(trx, value, index, siteId) {
  const path = `circuits[${index}]`;
  knownKeys(value, ['publicId', '_baseVersion', 'circuitReference', 'description', 'media', 'status', 'segments'], path);
  const key = identity(value, path);
  const media = enumeration(value.media, `${path}.media`, MEDIA, true);
  const segments = [];
  for (const [segmentIndex, segment] of array(value.segments, `${path}.segments`, { max: 1000 }).entries()) segments.push(await segmentInput(trx, segment, index, segmentIndex, siteId, media));
  validateChain(segments, path);
  return { ...key, values: {
    circuit_reference: string(value.circuitReference, `${path}.circuitReference`, { required: true, max: 255 }),
    description: string(value.description, `${path}.description`, { max: 20_000 }) || '',
    media,
    status: enumeration(value.status || 'planned', `${path}.status`, ITEM_STATUSES, true)
  }, segments };
}

async function requirementInput(trx, value, index) {
  const path = `consumableRequirements[${index}]`;
  knownKeys(value, ['publicId', '_baseVersion', 'cataloguePublicId', 'description', 'quantityRequired', 'unit'], path);
  const key = identity(value, path);
  let catalogueId = null;
  if (value.cataloguePublicId) {
    const catalogue = await trx('consumable_catalogue').where({ public_id: uuid(value.cataloguePublicId, `${path}.cataloguePublicId`) }).first();
    if (!catalogue) throw httpError(422, 'catalogue_record_not_found', 'Consumable catalogue record not found');
    catalogueId = catalogue.id;
  }
  return { ...key, values: {
    catalogue_id: catalogueId,
    description: string(value.description, `${path}.description`, { required: true, max: 255 }),
    quantity_required: number(value.quantityRequired, `${path}.quantityRequired`, { required: true, min: Number.EPSILON, max: 1_000_000 }),
    unit: string(value.unit, `${path}.unit`, { required: true, max: 64 })
  } };
}

function same(row, values) {
  return Object.entries(values).every(([key, value]) => value === null ? row[key] === null : String(row[key]) === String(value));
}

function unique(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.publicId)) throw httpError(422, 'duplicate_child_identity', `${label} contains a duplicate publicId`);
    ids.add(record.publicId);
  }
}

async function syncRows(trx, table, parentKey, parentId, records, extraInsert = {}) {
  unique(records, table);
  const existing = await trx(table).where({ [parentKey]: parentId });
  const byId = new Map(existing.map((row) => [row.public_id, row]));
  let changed = 0;
  for (const record of records) {
    const current = byId.get(record.publicId);
    if (!current) {
      if (await trx(table).where({ public_id: record.publicId }).first()) throw httpError(409, 'child_identity_conflict', 'A child publicId belongs to another record');
      if (record.version !== 0) throw httpError(409, 'version_conflict', 'A new child must start at version 0');
      const [rowId] = await trx(table).insert({ public_id: record.publicId, [parentKey]: parentId, ...extraInsert, ...record.values });
      record.rowId = rowId; changed += 1;
    } else {
      record.rowId = current.id;
      if (current.version !== record.version) { const error = httpError(409, 'version_conflict', 'A child record changed since it was loaded'); error.serverVersion = current.version; throw error; }
      if (!same(current, record.values)) {
        await trx(table).where({ id: current.id, version: record.version }).update({ ...record.values, version: record.version + 1 });
        changed += 1;
      }
      byId.delete(record.publicId);
    }
  }
  for (const row of byId.values()) { await trx(table).where({ id: row.id }).delete(); changed += 1; }
  return changed;
}

/** @param {string} publicId @param {unknown} input @param {number} actorUserId */
async function saveSnapshot(publicId, input, actorUserId) {
  return db.transaction(async (trx) => {
    knownKeys(input, ['saveId', '_baseVersion', 'packageReference', 'externalReference', 'projectReference', 'title', 'description', 'status', 'leadAssignee', 'assignees', 'workItems', 'circuits', 'consumableRequirements', 'scheduleRackChanges']);
    const saveId = uuid(input.saveId, 'saveId');
    const requestedVersion = integer(input._baseVersion, '_baseVersion', { required: true, min: 0 });
    const pack = await trx('work_packages').where({ public_id: uuid(publicId, 'workPackagePublicId') }).first();
    if (!pack) throw httpError(404, 'work_package_not_found', 'Work package not found');
    const receipt = await trx('work_package_saves').where({ save_id: saveId }).first();
    if (receipt) {
      if (receipt.work_package_id !== pack.id) throw httpError(409, 'save_identity_conflict', 'saveId belongs to another work package');
      return packageDetail(publicId, trx);
    }
    assertMutable(pack);
    if (pack.version !== requestedVersion) { const error = httpError(409, 'version_conflict', 'The work package changed since it was loaded'); error.serverVersion = pack.version; throw error; }
    await applyRackChanges(trx, pack, array(input.scheduleRackChanges, 'scheduleRackChanges', { max: 1000 }), actorUserId);
    const status = enumeration(input.status, 'status', OPEN_STATUSES, true);
    const packageValues = {
      package_ref: string(input.packageReference, 'packageReference', { required: true, max: 255 }),
      external_reference: string(input.externalReference, 'externalReference', { max: 255 }),
      project_reference: string(input.projectReference, 'projectReference', { max: 255 }),
      title: string(input.title, 'title', { required: true, max: 255 }),
      description: string(input.description, 'description', { max: 20_000 }) || '', status,
      lead_assignee: string(input.leadAssignee, 'leadAssignee', { max: 64 }),
      assignees_json: JSON.stringify(assignees(input.assignees, 'assignees'))
    };
    const items = array(input.workItems, 'workItems', { max: 1000 }).map(itemInput);
    const circuits = [];
    for (const [index, circuit] of array(input.circuits, 'circuits', { max: 10_000 }).entries()) circuits.push(await circuitInput(trx, circuit, index, pack.site_id));
    const requirements = [];
    for (const [index, value] of array(input.consumableRequirements, 'consumableRequirements', { max: 1000 }).entries()) requirements.push(await requirementInput(trx, value, index));
    for (const item of items) {
      const current = await trx('work_items').where({ public_id: item.publicId, work_package_id: pack.id }).first();
      if (current?.status === 'complete' && !same(current, item.values)) throw httpError(423, 'work_item_complete', 'Clear work-item completion before editing it');
      if (current?.status !== 'complete' && item.values.status === 'complete') throw httpError(422, 'completion_endpoint_required', 'Use the work-item completion action');
      if (!current && item.values.status === 'complete') throw httpError(422, 'completion_endpoint_required', 'Create the work item before completing it');
    }
    const desiredItemIds = new Set(items.map((item) => item.publicId));
    if (await trx('work_items').where({ work_package_id: pack.id, status: 'complete' }).whereNotIn('public_id', [...desiredItemIds]).first()) throw httpError(423, 'work_item_complete', 'Clear work-item completion before removing it');
    let changed = await syncRows(trx, 'work_items', 'work_package_id', pack.id, items);
    const currentCircuits = await trx('circuits').where({ work_package_id: pack.id });
    const desiredCircuitIds = new Set(circuits.map((entry) => entry.publicId));
    for (const current of currentCircuits.filter((entry) => !desiredCircuitIds.has(entry.public_id))) { await trx('circuits').where({ id: current.id }).delete(); changed += 1; }
    unique(circuits, 'circuits');
    for (const circuit of circuits) {
      const current = currentCircuits.find((entry) => entry.public_id === circuit.publicId);
      if (!current) {
        if (await trx('circuits').where({ public_id: circuit.publicId }).first()) throw httpError(409, 'child_identity_conflict', 'A circuit publicId belongs to another record');
        if (circuit.version !== 0) throw httpError(409, 'version_conflict', 'A new circuit must start at version 0');
        const [rowId] = await trx('circuits').insert({ public_id: circuit.publicId, work_package_id: pack.id, ...circuit.values }); circuit.rowId = rowId; changed += 1;
      } else {
        if (current.version !== circuit.version) { const error = httpError(409, 'version_conflict', 'A circuit changed since it was loaded'); error.serverVersion = current.version; throw error; }
        circuit.rowId = current.id;
        if (!same(current, circuit.values)) { await trx('circuits').where({ id: current.id }).update({ ...circuit.values, version: circuit.version + 1 }); changed += 1; }
      }
      changed += await syncRows(trx, 'segments', 'circuit_id', circuit.rowId, circuit.segments);
    }
    changed += await syncRows(trx, 'consumable_requirements', 'work_package_id', pack.id, requirements);
    if (!same(pack, packageValues) || changed) await trx('work_packages').where({ id: pack.id, version: requestedVersion }).update({ ...packageValues, version: requestedVersion + 1, updated_at: trx.fn.now() });
    else await trx('work_packages').where({ id: pack.id, version: requestedVersion }).update({ version: requestedVersion + 1, updated_at: trx.fn.now() });
    await trx('work_package_saves').insert({ save_id: saveId, work_package_id: pack.id, actor_user_id: actorUserId });
    const oldReceipts = await trx('work_package_saves').where({ work_package_id: pack.id }).orderBy('created_at', 'desc').orderBy('save_id').offset(100).select('save_id');
    if (oldReceipts.length) await trx('work_package_saves').whereIn('save_id', oldReceipts.map((row) => row.save_id)).delete();
    await audit.record(trx, actorUserId, 'work_package.transactional_save', 'work_package', publicId, { changedChildren: changed });
    return packageDetail(publicId, trx);
  });
}

module.exports = { saveSnapshot, OPEN_STATUSES };
