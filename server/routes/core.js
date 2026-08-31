'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db/knex');
const auth = require('../lib/auth');
const audit = require('../lib/audit');
const { packageDetail } = require('../lib/work-packages');
const { knownKeys, string, integer, number, array, enumeration, uuid } = require('../lib/validation');
const { httpError } = require('../lib/errors');

const router = express.Router();
const PACKAGE_STATUSES = ['planned', 'active', 'blocked', 'complete', 'cancelled'];

function id() { return crypto.randomUUID(); }

function baseVersion(body) {
  if (!Number.isInteger(body && body._baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
  return integer(body._baseVersion, '_baseVersion', { required: true, min: 0 });
}

async function siteByPublicId(publicId, trx = db) {
  const site = await trx('sites').where({ public_id: publicId }).first();
  if (!site) throw httpError(404, 'site_not_found', 'Site not found');
  return site;
}

function publicSite(row) {
  return { publicId: row.public_id, code: row.code, name: row.name, description: row.description, version: row.version };
}

function assignees(value, path = 'assignees') {
  return array(value, path, { max: 50 }).map((entry, index) => string(entry, `${path}[${index}]`, { required: true, max: 64 }));
}

function publicInfrastructure(kind, row) {
  const common = { publicId: row.public_id, version: row.version };
  if (kind === 'rooms') return { ...common, name: row.name, description: row.description };
  if (kind === 'racks') return { ...common, label: row.label, suiteLine: row.suite_line, sizeUnits: row.size_units, roomPublicId: row.room_public_id || null };
  if (kind === 'termination-points') return { ...common, label: row.label, kind: row.kind, notes: row.notes, roomPublicId: row.room_public_id || null };
  if (kind === 'devices') return { ...common, hostname: row.hostname, label: row.label, deviceKey: row.device_key, rackPublicId: row.rack_public_id || null, rackUnit: row.rack_unit, sizeUnits: row.size_units, side: row.side };
  return { publicId: row.public_id, endpointA: row.endpoint_a, endpointB: row.endpoint_b, media: row.media, lengthMetres: row.length_metres, observedAt: row.observed_at };
}

async function withInfrastructureRelation(kind, row, trx = db) {
  if (['racks', 'termination-points'].includes(kind) && row.room_id) {
    const related = await trx('rooms').where({ id: row.room_id }).select('public_id').first();
    return { ...row, room_public_id: related && related.public_id };
  }
  if (kind === 'devices' && row.rack_id) {
    const related = await trx('racks').where({ id: row.rack_id }).select('public_id').first();
    return { ...row, rack_public_id: related && related.public_id };
  }
  return row;
}

router.use(auth.requireSession);

router.get('/sites', async (_req, res, next) => {
  try { res.json((await db('sites').orderBy('code')).map(publicSite)); } catch (error) { next(error); }
});

router.post('/sites', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['code', 'name', 'description']);
    const record = { public_id: id(), code: string(req.body.code, 'code', { required: true, max: 64 }), name: string(req.body.name, 'name', { required: true, max: 255 }), description: string(req.body.description, 'description', { max: 20_000 }) || '' };
    const created = await db.transaction(async (trx) => {
      const [rowId] = await trx('sites').insert(record);
      await audit.record(trx, req.user.id, 'site.create', 'site', record.public_id);
      return trx('sites').where({ id: rowId }).first();
    });
    res.status(201).json(publicSite(created));
  } catch (error) { next(error); }
});

router.put('/sites/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['code', 'name', 'description', '_baseVersion']);
    const requestedVersion = baseVersion(req.body);
    const changes = { code: string(req.body.code, 'code', { required: true, max: 64 }), name: string(req.body.name, 'name', { required: true, max: 255 }), description: string(req.body.description, 'description', { max: 20_000 }) || '', version: requestedVersion + 1, updated_at: db.fn.now() };
    const updated = await db.transaction(async (trx) => {
      const count = await trx('sites').where({ public_id: req.params.publicId, version: requestedVersion }).update(changes);
      if (!count) {
        const current = await trx('sites').where({ public_id: req.params.publicId }).first();
        if (!current) throw httpError(404, 'site_not_found', 'Site not found');
        throw httpError(409, 'version_conflict', 'The site changed since it was loaded');
      }
      await audit.record(trx, req.user.id, 'site.update', 'site', req.params.publicId);
      return trx('sites').where({ public_id: req.params.publicId }).first();
    });
    res.json(publicSite(updated));
  } catch (error) { next(error); }
});

function infrastructureSpec(kind) {
  return {
    rooms: { table: 'rooms', fields: ['name', 'description'] },
    racks: { table: 'racks', fields: ['label', 'suiteLine', 'sizeUnits', 'roomPublicId'] },
    'termination-points': { table: 'termination_points', fields: ['label', 'kind', 'notes', 'roomPublicId'] },
    devices: { table: 'devices', fields: ['hostname', 'label', 'deviceKey', 'rackPublicId', 'rackUnit', 'sizeUnits', 'side'] },
    distances: { table: 'distance_samples', fields: ['endpointA', 'endpointB', 'media', 'lengthMetres'], appendOnly: true }
  }[kind];
}

async function relatedId(trx, table, publicId, siteId, field) {
  if (publicId === undefined || publicId === null || publicId === '') return null;
  const row = await trx(table).where({ public_id: uuid(publicId, field), site_id: siteId }).first();
  if (!row) throw httpError(422, `${field === 'roomPublicId' ? 'room' : 'rack'}_site_mismatch`, `${field === 'roomPublicId' ? 'Room' : 'Rack'} does not belong to the site`);
  return row.id;
}

async function infrastructureValues(kind, body, site, trx) {
  if (kind === 'rooms') return {
    name: string(body.name, 'name', { required: true, max: 255 }),
    description: string(body.description, 'description', { max: 20_000 }) || ''
  };
  if (kind === 'racks') return {
    label: string(body.label, 'label', { required: true, max: 120 }),
    suite_line: string(body.suiteLine, 'suiteLine', { max: 64 }) || '',
    size_units: integer(body.sizeUnits === undefined ? 47 : body.sizeUnits, 'sizeUnits', { required: true, min: 1, max: 100 }),
    room_id: await relatedId(trx, 'rooms', body.roomPublicId, site.id, 'roomPublicId')
  };
  if (kind === 'termination-points') return {
    label: string(body.label, 'label', { required: true, max: 120 }),
    kind: string(body.kind, 'kind', { required: true, max: 64 }),
    notes: string(body.notes, 'notes', { max: 20_000 }) || '',
    room_id: await relatedId(trx, 'rooms', body.roomPublicId, site.id, 'roomPublicId')
  };
  if (kind === 'devices') return {
    hostname: string(body.hostname, 'hostname', { required: true, max: 255 }).toLowerCase(),
    label: string(body.label, 'label', { max: 255 }) || '',
    device_key: string(body.deviceKey, 'deviceKey', { required: true, max: 128 }),
    rack_id: await relatedId(trx, 'racks', body.rackPublicId, site.id, 'rackPublicId'),
    rack_unit: integer(body.rackUnit, 'rackUnit', { min: 1, max: 100 }),
    size_units: integer(body.sizeUnits === undefined ? 1 : body.sizeUnits, 'sizeUnits', { required: true, min: 1, max: 100 }),
    side: enumeration(body.side || 'front', 'side', ['front', 'rear'], true)
  };
  return {
    endpoint_a: string(body.endpointA, 'endpointA', { required: true, max: 255 }),
    endpoint_b: string(body.endpointB, 'endpointB', { required: true, max: 255 }),
    media: string(body.media, 'media', { required: true, max: 64 }),
    length_metres: number(body.lengthMetres, 'lengthMetres', { required: true, min: Number.EPSILON, max: 1_000_000 })
  };
}

router.get('/sites/:sitePublicId/:kind', async (req, res, next) => {
  try {
    const spec = infrastructureSpec(req.params.kind);
    if (!spec) throw httpError(404, 'route_not_found', 'Route not found');
    const site = await siteByPublicId(req.params.sitePublicId);
    const rows = await db(spec.table).where({ site_id: site.id }).orderBy('id');
    res.json(await Promise.all(rows.map(async (row) => publicInfrastructure(req.params.kind, await withInfrastructureRelation(req.params.kind, row)))));
  } catch (error) { next(error); }
});

router.post('/sites/:sitePublicId/:kind', auth.requireWrite, async (req, res, next) => {
  try {
    const spec = infrastructureSpec(req.params.kind);
    if (!spec) throw httpError(404, 'route_not_found', 'Route not found');
    knownKeys(req.body, spec.fields);
    const created = await db.transaction(async (trx) => {
      const site = await siteByPublicId(req.params.sitePublicId, trx);
      const record = { public_id: id(), site_id: site.id, ...(await infrastructureValues(req.params.kind, req.body, site, trx)) };
      const [rowId] = await trx(spec.table).insert(record);
      await audit.record(trx, req.user.id, `${req.params.kind}.create`, req.params.kind, record.public_id);
      return withInfrastructureRelation(req.params.kind, await trx(spec.table).where({ id: rowId }).first(), trx);
    });
    res.status(201).json(publicInfrastructure(req.params.kind, created));
  } catch (error) { next(error); }
});

router.put('/sites/:sitePublicId/:kind/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    const spec = infrastructureSpec(req.params.kind);
    if (!spec || spec.appendOnly) throw httpError(404, 'route_not_found', 'Route not found');
    knownKeys(req.body, [...spec.fields, '_baseVersion']);
    const requestedVersion = baseVersion(req.body);
    const updated = await db.transaction(async (trx) => {
      const site = await siteByPublicId(req.params.sitePublicId, trx);
      const changes = { ...(await infrastructureValues(req.params.kind, req.body, site, trx)), version: requestedVersion + 1 };
      const count = await trx(spec.table).where({ public_id: req.params.publicId, site_id: site.id, version: requestedVersion }).update(changes);
      if (!count) {
        const current = await trx(spec.table).where({ public_id: req.params.publicId, site_id: site.id }).first();
        if (!current) throw httpError(404, 'infrastructure_not_found', 'Record not found');
        throw httpError(409, 'version_conflict', 'The record changed since it was loaded');
      }
      await audit.record(trx, req.user.id, `${req.params.kind}.update`, req.params.kind, req.params.publicId);
      return withInfrastructureRelation(req.params.kind, await trx(spec.table).where({ public_id: req.params.publicId }).first(), trx);
    });
    res.json(publicInfrastructure(req.params.kind, updated));
  } catch (error) { next(error); }
});

router.get('/work-packages', async (_req, res, next) => {
  try {
    const rows = await db('work_packages as w').join('sites as s', 's.id', 'w.site_id').select('w.public_id', 'w.package_ref', 'w.external_reference', 'w.project_reference', 'w.title', 'w.description', 'w.status', 'w.version', 's.public_id as site_public_id', 's.code as site_code', 's.name as site_name').orderBy('w.updated_at', 'desc');
    res.json(rows.map((row) => ({ publicId: row.public_id, packageReference: row.package_ref, externalReference: row.external_reference, projectReference: row.project_reference, title: row.title, description: row.description, status: row.status, version: row.version, sitePublicId: row.site_public_id, siteCode: row.site_code, siteName: row.site_name })));
  } catch (error) { next(error); }
});

router.get('/work-packages/:publicId', async (req, res, next) => {
  try { res.json(await packageDetail(req.params.publicId)); } catch (error) { next(error); }
});

router.post('/work-packages', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['sitePublicId', 'packageReference', 'externalReference', 'projectReference', 'title', 'description', 'status', 'leadAssignee', 'assignees', 'workItems', 'circuits', 'consumableRequirements']);
    const workItems = array(req.body.workItems, 'workItems', { max: 1000 });
    const circuits = array(req.body.circuits, 'circuits', { max: 10_000 });
    const requirements = array(req.body.consumableRequirements, 'consumableRequirements', { max: 1000 });
    const assigned = assignees(req.body.assignees);
    const createdPublicId = id();
    await db.transaction(async (trx) => {
      const site = await siteByPublicId(uuid(req.body.sitePublicId, 'sitePublicId'), trx);
      const [packageId] = await trx('work_packages').insert({ public_id: createdPublicId, site_id: site.id, package_ref: string(req.body.packageReference, 'packageReference', { required: true, max: 255 }), external_reference: string(req.body.externalReference, 'externalReference', { max: 255 }), project_reference: string(req.body.projectReference, 'projectReference', { max: 255 }), title: string(req.body.title, 'title', { required: true, max: 255 }), description: string(req.body.description, 'description', { max: 20_000 }) || '', status: enumeration(req.body.status || 'planned', 'status', PACKAGE_STATUSES, true), lead_assignee: string(req.body.leadAssignee, 'leadAssignee', { max: 64 }), assignees_json: JSON.stringify(assigned) });
      for (const [sequence, item] of workItems.entries()) {
        knownKeys(item, ['itemReference', 'title', 'description', 'status'], `workItems[${sequence}]`);
        await trx('work_items').insert({ public_id: id(), work_package_id: packageId, item_reference: string(item.itemReference, `workItems[${sequence}].itemReference`, { required: true, max: 255 }), title: string(item.title, `workItems[${sequence}].title`, { required: true, max: 255 }), description: string(item.description, `workItems[${sequence}].description`, { max: 20_000 }) || '', status: enumeration(item.status || 'planned', `workItems[${sequence}].status`, PACKAGE_STATUSES, true), sequence });
      }
      for (const [circuitIndex, circuit] of circuits.entries()) {
        knownKeys(circuit, ['circuitReference', 'description', 'media', 'status', 'segments'], `circuits[${circuitIndex}]`);
        const segments = array(circuit.segments, `circuits[${circuitIndex}].segments`, { max: 100 });
        const [circuitId] = await trx('circuits').insert({ public_id: id(), work_package_id: packageId, circuit_reference: string(circuit.circuitReference, `circuits[${circuitIndex}].circuitReference`, { required: true, max: 255 }), description: string(circuit.description, `circuits[${circuitIndex}].description`, { max: 20_000 }) || '', media: string(circuit.media, `circuits[${circuitIndex}].media`, { required: true, max: 64 }), status: enumeration(circuit.status || 'planned', `circuits[${circuitIndex}].status`, PACKAGE_STATUSES, true) });
        for (const [sequence, segment] of segments.entries()) {
          knownKeys(segment, ['segmentReference', 'fromEndpoint', 'toEndpoint', 'lengthMetres', 'notes'], `circuits[${circuitIndex}].segments[${sequence}]`);
          await trx('segments').insert({ public_id: id(), circuit_id: circuitId, segment_reference: string(segment.segmentReference, `circuits[${circuitIndex}].segments[${sequence}].segmentReference`, { required: true, max: 255 }), sequence, from_endpoint: string(segment.fromEndpoint, `circuits[${circuitIndex}].segments[${sequence}].fromEndpoint`, { required: true, max: 255 }), to_endpoint: string(segment.toEndpoint, `circuits[${circuitIndex}].segments[${sequence}].toEndpoint`, { required: true, max: 255 }), length_metres: number(segment.lengthMetres, `circuits[${circuitIndex}].segments[${sequence}].lengthMetres`, { min: 0, max: 1_000_000 }), notes: string(segment.notes, `circuits[${circuitIndex}].segments[${sequence}].notes`, { max: 20_000 }) || '' });
        }
      }
      for (const [index, requirement] of requirements.entries()) {
        knownKeys(requirement, ['cataloguePublicId', 'description', 'quantityRequired', 'unit'], `consumableRequirements[${index}]`);
        let catalogueId = null;
        if (requirement.cataloguePublicId) {
          const catalogue = await trx('consumable_catalogue').where({ public_id: uuid(requirement.cataloguePublicId, `consumableRequirements[${index}].cataloguePublicId`) }).first();
          if (!catalogue) throw httpError(422, 'catalogue_record_not_found', 'Consumable catalogue record not found');
          catalogueId = catalogue.id;
        }
        await trx('consumable_requirements').insert({ public_id: id(), work_package_id: packageId, catalogue_id: catalogueId, description: string(requirement.description, `consumableRequirements[${index}].description`, { required: true, max: 255 }), quantity_required: number(requirement.quantityRequired, `consumableRequirements[${index}].quantityRequired`, { required: true, min: Number.EPSILON, max: 1_000_000 }), unit: string(requirement.unit, `consumableRequirements[${index}].unit`, { required: true, max: 64 }) });
      }
      await audit.record(trx, req.user.id, 'work_package.create', 'work_package', createdPublicId);
    });
    res.status(201).json(await packageDetail(createdPublicId));
  } catch (error) { next(error); }
});

router.put('/work-packages/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    const requestedVersion = baseVersion(req.body);
    knownKeys(req.body, ['packageReference', 'externalReference', 'projectReference', 'title', 'description', 'status', 'leadAssignee', 'assignees', '_baseVersion']);
    const changes = { package_ref: string(req.body.packageReference, 'packageReference', { required: true, max: 255 }), external_reference: string(req.body.externalReference, 'externalReference', { max: 255 }), project_reference: string(req.body.projectReference, 'projectReference', { max: 255 }), title: string(req.body.title, 'title', { required: true, max: 255 }), description: string(req.body.description, 'description', { max: 20_000 }) || '', status: enumeration(req.body.status, 'status', PACKAGE_STATUSES, true), lead_assignee: string(req.body.leadAssignee, 'leadAssignee', { max: 64 }), assignees_json: JSON.stringify(assignees(req.body.assignees)), version: requestedVersion + 1, updated_at: db.fn.now() };
    await db.transaction(async (trx) => {
      const updated = await trx('work_packages').where({ public_id: req.params.publicId, version: requestedVersion }).update(changes);
      if (!updated) {
        const current = await trx('work_packages').where({ public_id: req.params.publicId }).first();
        if (!current) throw httpError(404, 'work_package_not_found', 'Work package not found');
        throw httpError(409, 'version_conflict', 'The work package changed since it was loaded');
      }
      await audit.record(trx, req.user.id, 'work_package.update', 'work_package', req.params.publicId);
    });
    res.json(await packageDetail(req.params.publicId));
  } catch (error) { next(error); }
});

async function workPackageRow(trx, publicId) {
  const row = await trx('work_packages').where({ public_id: uuid(publicId, 'workPackagePublicId') }).first();
  if (!row) throw httpError(404, 'work_package_not_found', 'Work package not found');
  return row;
}

function workItemValues(body) {
  return {
    item_reference: string(body.itemReference, 'itemReference', { required: true, max: 255 }),
    title: string(body.title, 'title', { required: true, max: 255 }),
    description: string(body.description, 'description', { max: 20_000 }) || '',
    status: enumeration(body.status || 'planned', 'status', PACKAGE_STATUSES, true),
    sequence: integer(body.sequence === undefined ? 0 : body.sequence, 'sequence', { required: true, min: 0, max: 100_000 })
  };
}

function circuitValues(body) {
  return {
    circuit_reference: string(body.circuitReference, 'circuitReference', { required: true, max: 255 }),
    description: string(body.description, 'description', { max: 20_000 }) || '',
    media: string(body.media, 'media', { required: true, max: 64 }),
    status: enumeration(body.status || 'planned', 'status', PACKAGE_STATUSES, true)
  };
}

function segmentValues(body) {
  return {
    segment_reference: string(body.segmentReference, 'segmentReference', { required: true, max: 255 }),
    sequence: integer(body.sequence === undefined ? 0 : body.sequence, 'sequence', { required: true, min: 0, max: 100_000 }),
    from_endpoint: string(body.fromEndpoint, 'fromEndpoint', { required: true, max: 255 }),
    to_endpoint: string(body.toEndpoint, 'toEndpoint', { required: true, max: 255 }),
    length_metres: number(body.lengthMetres, 'lengthMetres', { min: 0, max: 1_000_000 }),
    notes: string(body.notes, 'notes', { max: 20_000 }) || ''
  };
}

async function requirementValues(trx, body) {
  let catalogueId = null;
  if (body.cataloguePublicId) {
    const catalogue = await trx('consumable_catalogue').where({ public_id: uuid(body.cataloguePublicId, 'cataloguePublicId') }).first();
    if (!catalogue) throw httpError(422, 'catalogue_record_not_found', 'Consumable catalogue record not found');
    catalogueId = catalogue.id;
  }
  return {
    catalogue_id: catalogueId,
    description: string(body.description, 'description', { required: true, max: 255 }),
    quantity_required: number(body.quantityRequired, 'quantityRequired', { required: true, min: Number.EPSILON, max: 1_000_000 }),
    unit: string(body.unit, 'unit', { required: true, max: 64 })
  };
}

async function updateChild(trx, table, where, requestedVersion, values, notFoundCode, notFoundMessage) {
  const count = await trx(table).where({ ...where, version: requestedVersion }).update({ ...values, version: requestedVersion + 1 });
  if (count) return;
  if (!await trx(table).where(where).first()) throw httpError(404, notFoundCode, notFoundMessage);
  throw httpError(409, 'version_conflict', 'The record changed since it was loaded');
}

router.post('/work-packages/:workPackagePublicId/work-items', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['itemReference', 'title', 'description', 'status', 'sequence']);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId); const publicId = id();
      await trx('work_items').insert({ public_id: publicId, work_package_id: pack.id, ...workItemValues(req.body) });
      await audit.record(trx, req.user.id, 'work_item.create', 'work_item', publicId);
    });
    res.status(201).json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

router.put('/work-packages/:workPackagePublicId/work-items/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['itemReference', 'title', 'description', 'status', 'sequence', '_baseVersion']);
    const requestedVersion = baseVersion(req.body);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId);
      await updateChild(trx, 'work_items', { public_id: uuid(req.params.publicId, 'publicId'), work_package_id: pack.id }, requestedVersion, workItemValues(req.body), 'work_item_not_found', 'Work item not found');
      await audit.record(trx, req.user.id, 'work_item.update', 'work_item', req.params.publicId);
    });
    res.json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

router.post('/work-packages/:workPackagePublicId/circuits', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['circuitReference', 'description', 'media', 'status']);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId); const publicId = id();
      await trx('circuits').insert({ public_id: publicId, work_package_id: pack.id, ...circuitValues(req.body) });
      await audit.record(trx, req.user.id, 'circuit.create', 'circuit', publicId);
    });
    res.status(201).json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

router.put('/work-packages/:workPackagePublicId/circuits/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['circuitReference', 'description', 'media', 'status', '_baseVersion']);
    const requestedVersion = baseVersion(req.body);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId);
      await updateChild(trx, 'circuits', { public_id: uuid(req.params.publicId, 'publicId'), work_package_id: pack.id }, requestedVersion, circuitValues(req.body), 'circuit_not_found', 'Circuit not found');
      await audit.record(trx, req.user.id, 'circuit.update', 'circuit', req.params.publicId);
    });
    res.json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

async function circuitRow(trx, workPackageId, publicId) {
  const row = await trx('circuits').where({ public_id: uuid(publicId, 'circuitPublicId'), work_package_id: workPackageId }).first();
  if (!row) throw httpError(404, 'circuit_not_found', 'Circuit not found');
  return row;
}

router.post('/work-packages/:workPackagePublicId/circuits/:circuitPublicId/segments', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['segmentReference', 'sequence', 'fromEndpoint', 'toEndpoint', 'lengthMetres', 'notes']);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId); const circuit = await circuitRow(trx, pack.id, req.params.circuitPublicId); const publicId = id();
      await trx('segments').insert({ public_id: publicId, circuit_id: circuit.id, ...segmentValues(req.body) });
      await audit.record(trx, req.user.id, 'segment.create', 'segment', publicId);
    });
    res.status(201).json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

router.put('/work-packages/:workPackagePublicId/circuits/:circuitPublicId/segments/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['segmentReference', 'sequence', 'fromEndpoint', 'toEndpoint', 'lengthMetres', 'notes', '_baseVersion']);
    const requestedVersion = baseVersion(req.body);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId); const circuit = await circuitRow(trx, pack.id, req.params.circuitPublicId);
      await updateChild(trx, 'segments', { public_id: uuid(req.params.publicId, 'publicId'), circuit_id: circuit.id }, requestedVersion, segmentValues(req.body), 'segment_not_found', 'Segment not found');
      await audit.record(trx, req.user.id, 'segment.update', 'segment', req.params.publicId);
    });
    res.json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

router.post('/work-packages/:workPackagePublicId/consumable-requirements', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['cataloguePublicId', 'description', 'quantityRequired', 'unit']);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId); const publicId = id();
      await trx('consumable_requirements').insert({ public_id: publicId, work_package_id: pack.id, ...(await requirementValues(trx, req.body)) });
      await audit.record(trx, req.user.id, 'consumable_requirement.create', 'consumable_requirement', publicId);
    });
    res.status(201).json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

router.put('/work-packages/:workPackagePublicId/consumable-requirements/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['cataloguePublicId', 'description', 'quantityRequired', 'unit', '_baseVersion']);
    const requestedVersion = baseVersion(req.body);
    await db.transaction(async (trx) => {
      const pack = await workPackageRow(trx, req.params.workPackagePublicId);
      await updateChild(trx, 'consumable_requirements', { public_id: uuid(req.params.publicId, 'publicId'), work_package_id: pack.id }, requestedVersion, await requirementValues(trx, req.body), 'consumable_requirement_not_found', 'Consumable requirement not found');
      await audit.record(trx, req.user.id, 'consumable_requirement.update', 'consumable_requirement', req.params.publicId);
    });
    res.json(await packageDetail(req.params.workPackagePublicId));
  } catch (error) { next(error); }
});

router.get('/search', async (req, res, next) => {
  try {
    const query = string(req.query.q, 'q', { required: true, max: 255 }).toLowerCase();
    const scope = enumeration(req.query.scope || 'packages', 'scope', ['packages', 'all'], true);
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await db('work_packages as w').join('sites as s', 's.id', 'w.site_id')
      .leftJoin('work_items as i', 'i.work_package_id', 'w.id')
      .leftJoin('circuits as c', 'c.work_package_id', 'w.id')
      .leftJoin('segments as g', 'g.circuit_id', 'c.id')
      .where((builder) => builder.whereRaw('lower(w.package_ref) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(w.external_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(w.project_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(w.title) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(w.description) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(s.code) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(s.name) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(i.item_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(i.description, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(c.circuit_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(c.description, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(g.segment_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(g.from_endpoint, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(g.to_endpoint, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]))
      .distinct('w.public_id', 'w.package_ref', 'w.external_reference', 'w.project_reference', 'w.title', 'w.status', 's.public_id as site_public_id', 's.code as site_code', 's.name as site_name').limit(100);
    const results = rows.map((row) => ({ entityType: 'work_package', publicId: row.public_id, packageReference: row.package_ref, externalReference: row.external_reference, projectReference: row.project_reference, title: row.title, status: row.status, sitePublicId: row.site_public_id, siteCode: row.site_code, siteName: row.site_name }));
    if (scope === 'all' && results.length < 100) {
      const siteRows = await db('sites').where((builder) => builder.whereRaw('lower(code) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(name) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(description) LIKE ? ESCAPE \'\\\'', [pattern])).limit(100);
      results.push(...siteRows.map((row) => ({ entityType: 'site', publicId: row.public_id, title: row.name, reference: row.code, description: row.description, sitePublicId: row.public_id, siteCode: row.code, siteName: row.name })));
      const infrastructure = [
        ['room', 'rooms', ['e.name', 'e.description'], 'e.name'],
        ['rack', 'racks', ['e.label', 'e.suite_line'], 'e.label'],
        ['termination_point', 'termination_points', ['e.label', 'e.kind', 'e.notes'], 'e.label'],
        ['device', 'devices', ['e.hostname', 'e.label', 'e.device_key'], 'e.hostname'],
        ['distance', 'distance_samples', ['e.endpoint_a', 'e.endpoint_b', 'e.media'], 'e.endpoint_a']
      ];
      for (const [entityType, table, columns, titleColumn] of infrastructure) {
        const matches = await db(`${table} as e`).join('sites as s', 's.id', 'e.site_id').where((builder) => {
          columns.forEach((column, index) => builder[index ? 'orWhereRaw' : 'whereRaw'](`lower(coalesce(${column}, '')) LIKE ? ESCAPE '\\'`, [pattern]));
        }).select('e.public_id', 's.public_id as site_public_id', 's.code as site_code', 's.name as site_name', db.raw(`${titleColumn} as result_title`)).limit(100);
        results.push(...matches.map((row) => ({ entityType, publicId: row.public_id, title: row.result_title, sitePublicId: row.site_public_id, siteCode: row.site_code, siteName: row.site_name })));
      }
    }
    res.json(results.slice(0, 100));
  } catch (error) { next(error); }
});

router.get('/work-packages/:publicId/export', async (req, res, next) => {
  try {
    const pack = await packageDetail(req.params.publicId);
    if ((req.query.format || 'json') === 'json') return res.type('application/json').attachment(`${pack.packageReference}.json`).send(JSON.stringify(pack, null, 2));
    if (req.query.format !== 'csv') throw httpError(422, 'export_format_invalid', 'Export format must be json or csv');
    const quote = (value) => {
      const safe = String(value === null || value === undefined ? '' : value)
        .replace(/"/g, '""').replace(/^[=+\-@]/, "'$&");
      return `"${safe}"`;
    };
    const rows = [['record_type', 'reference', 'description', 'from', 'to', 'media', 'length_metres']];
    for (const item of pack.workItems) rows.push(['work_item', item.itemReference, item.description, '', '', '', '']);
    for (const circuit of pack.circuits) for (const segment of circuit.segments) rows.push(['segment', segment.segmentReference, circuit.description, segment.fromEndpoint, segment.toEndpoint, circuit.media, segment.lengthMetres || '']);
    res.type('text/csv').attachment(`${pack.packageReference}.csv`).send(rows.map((row) => row.map(quote).join(',')).join('\n'));
  } catch (error) { next(error); }
});

router.get('/catalogue/consumables', async (_req, res, next) => {
  try { res.json(await db('consumable_catalogue').select('public_id as publicId', 'catalogue_reference as catalogueReference', 'description', 'estimated_unit_price as estimatedUnitPrice', 'unit', 'active', 'version').orderBy('catalogue_reference')); } catch (error) { next(error); }
});

router.post('/catalogue/consumables', auth.requireAdmin, async (req, res, next) => {
  try {
    knownKeys(req.body, ['catalogueReference', 'description', 'estimatedUnitPrice', 'unit']);
    const publicId = id();
    const created = await db.transaction(async (trx) => {
      const [rowId] = await trx('consumable_catalogue').insert({ public_id: publicId, catalogue_reference: string(req.body.catalogueReference, 'catalogueReference', { required: true, max: 255 }), description: string(req.body.description, 'description', { required: true, max: 255 }), estimated_unit_price: number(req.body.estimatedUnitPrice, 'estimatedUnitPrice', { min: 0, max: 1_000_000_000 }), unit: string(req.body.unit || 'each', 'unit', { required: true, max: 64 }) });
      await audit.record(trx, req.user.id, 'consumable.create', 'consumable', publicId);
      return trx('consumable_catalogue').where({ id: rowId }).first();
    });
    res.status(201).json({ publicId, catalogueReference: created.catalogue_reference, description: created.description, estimatedUnitPrice: created.estimated_unit_price, unit: created.unit, active: Boolean(created.active), version: created.version });
  } catch (error) { next(error); }
});

router.put('/catalogue/consumables/:publicId', auth.requireAdmin, async (req, res, next) => {
  try {
    knownKeys(req.body, ['catalogueReference', 'description', 'estimatedUnitPrice', 'unit', 'active', '_baseVersion']);
    const requestedVersion = baseVersion(req.body);
    if (typeof req.body.active !== 'boolean') throw httpError(422, 'invalid_field', 'active is invalid', 'active');
    const changes = { catalogue_reference: string(req.body.catalogueReference, 'catalogueReference', { required: true, max: 255 }), description: string(req.body.description, 'description', { required: true, max: 255 }), estimated_unit_price: number(req.body.estimatedUnitPrice, 'estimatedUnitPrice', { min: 0, max: 1_000_000_000 }), unit: string(req.body.unit, 'unit', { required: true, max: 64 }), active: req.body.active ? 1 : 0, version: requestedVersion + 1 };
    const updated = await db.transaction(async (trx) => {
      const count = await trx('consumable_catalogue').where({ public_id: req.params.publicId, version: requestedVersion }).update(changes);
      if (!count) {
        const current = await trx('consumable_catalogue').where({ public_id: req.params.publicId }).first();
        if (!current) throw httpError(404, 'catalogue_record_not_found', 'Consumable catalogue record not found');
        throw httpError(409, 'version_conflict', 'The catalogue record changed since it was loaded');
      }
      await audit.record(trx, req.user.id, 'consumable.update', 'consumable', req.params.publicId);
      return trx('consumable_catalogue').where({ public_id: req.params.publicId }).first();
    });
    res.json({ publicId: updated.public_id, catalogueReference: updated.catalogue_reference, description: updated.description, estimatedUnitPrice: updated.estimated_unit_price, unit: updated.unit, active: Boolean(updated.active), version: updated.version });
  } catch (error) { next(error); }
});

async function photoEntity(entityType, publicId, trx = db) {
  const table = { rack: 'racks', device: 'devices', work_package: 'work_packages' }[entityType];
  if (!table) throw httpError(415, 'photo_type_invalid', 'Photo entity type is invalid');
  const entity = await trx(table).where({ public_id: uuid(publicId, 'entityPublicId') }).first();
  if (!entity) throw httpError(404, 'photo_entity_not_found', 'Photo entity not found');
  return entity;
}

router.post('/photos/:entityType/:entityPublicId', auth.requireWrite, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(415, 'photo_type_invalid', 'Photo must be JPEG, PNG, or WebP');
    const publicId = id();
    await db.transaction(async (trx) => {
      await photoEntity(req.params.entityType, req.params.entityPublicId, trx);
      await trx('photos').insert({ public_id: publicId, entity_type: req.params.entityType, entity_public_id: req.params.entityPublicId, name: string(req.headers['x-photo-name'], 'x-photo-name', { required: true, max: 255 }), description: string(req.headers['x-photo-description'], 'x-photo-description', { max: 2000 }) || '', media_type: req.headers['content-type'], content: req.body });
      await audit.record(trx, req.user.id, 'photo.create', req.params.entityType, req.params.entityPublicId, { photoId: publicId });
    });
    res.status(201).json({ publicId });
  } catch (error) { next(error); }
});

router.get('/photos/:publicId/content', async (req, res, next) => {
  try { const photo = await db('photos').where({ public_id: req.params.publicId }).first(); if (!photo) throw httpError(404, 'photo_not_found', 'Photo not found'); res.type(photo.media_type).send(photo.content); } catch (error) { next(error); }
});

router.get('/photos/:entityType/:entityPublicId', async (req, res, next) => {
  try { await photoEntity(req.params.entityType, req.params.entityPublicId); res.json(await db('photos').where({ entity_type: req.params.entityType, entity_public_id: req.params.entityPublicId }).select('public_id as publicId', 'name', 'description', 'media_type as mediaType', 'created_at as createdAt')); } catch (error) { next(error); }
});

router.get('/audit', auth.requireAdmin, async (_req, res, next) => {
  try { res.json(await db('audit_events').select('public_id as publicId', 'action', 'entity_type as entityType', 'entity_public_id as entityPublicId', 'metadata_json as metadata', 'created_at as createdAt').orderBy('id', 'desc').limit(200)); } catch (error) { next(error); }
});

module.exports = router;
