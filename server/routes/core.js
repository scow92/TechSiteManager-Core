'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('../db/knex');
const auth = require('../lib/auth');
const audit = require('../lib/audit');
const { knownKeys, string, integer, enumeration, uuid } = require('../lib/validation');
const { httpError } = require('../lib/errors');

const router = express.Router();
const PACKAGE_STATUSES = ['planned', 'active', 'blocked', 'complete', 'cancelled'];

function id() { return crypto.randomUUID(); }

async function siteByPublicId(publicId, trx = db) {
  const site = await trx('sites').where({ public_id: publicId }).first();
  if (!site) throw httpError(404, 'site_not_found', 'Site not found');
  return site;
}

function publicSite(row) {
  return { publicId: row.public_id, code: row.code, name: row.name, description: row.description, version: row.version };
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
    const baseVersion = integer(req.body._baseVersion, '_baseVersion', { required: true, min: 0 });
    const changes = { code: string(req.body.code, 'code', { required: true, max: 64 }), name: string(req.body.name, 'name', { required: true, max: 255 }), description: string(req.body.description, 'description', { max: 20_000 }) || '', version: baseVersion + 1, updated_at: db.fn.now() };
    const updated = await db('sites').where({ public_id: req.params.publicId, version: baseVersion }).update(changes);
    if (!updated) {
      const current = await db('sites').where({ public_id: req.params.publicId }).first();
      if (!current) throw httpError(404, 'site_not_found', 'Site not found');
      throw httpError(409, 'version_conflict', 'The site changed since it was loaded');
    }
    res.json(publicSite(await db('sites').where({ public_id: req.params.publicId }).first()));
  } catch (error) { next(error); }
});

function infrastructureSpec(kind) {
  return {
    rooms: { table: 'rooms', fields: ['name', 'description'] },
    racks: { table: 'racks', fields: ['label', 'suiteLine', 'sizeUnits', 'roomPublicId'] },
    'termination-points': { table: 'termination_points', fields: ['label', 'kind', 'notes', 'roomPublicId'] },
    devices: { table: 'devices', fields: ['hostname', 'label', 'deviceKey', 'rackPublicId', 'rackUnit', 'sizeUnits', 'side'] },
    distances: { table: 'distance_samples', fields: ['endpointA', 'endpointB', 'media', 'lengthMetres'] }
  }[kind];
}

router.get('/sites/:sitePublicId/:kind', async (req, res, next) => {
  try {
    const spec = infrastructureSpec(req.params.kind);
    if (!spec) throw httpError(404, 'route_not_found', 'Route not found');
    const site = await siteByPublicId(req.params.sitePublicId);
    const rows = await db(spec.table).where({ site_id: site.id }).orderBy('id');
    res.json(rows.map((row) => ({ ...row, id: undefined, site_id: undefined, publicId: row.public_id })));
  } catch (error) { next(error); }
});

router.post('/sites/:sitePublicId/:kind', auth.requireWrite, async (req, res, next) => {
  try {
    const spec = infrastructureSpec(req.params.kind);
    if (!spec) throw httpError(404, 'route_not_found', 'Route not found');
    knownKeys(req.body, spec.fields);
    const site = await siteByPublicId(req.params.sitePublicId);
    const record = { public_id: id(), site_id: site.id };
    if (req.params.kind === 'rooms') {
      record.name = string(req.body.name, 'name', { required: true, max: 255 }); record.description = string(req.body.description, 'description', { max: 20_000 }) || '';
    } else if (req.params.kind === 'racks') {
      record.label = string(req.body.label, 'label', { required: true, max: 120 }); record.suite_line = string(req.body.suiteLine, 'suiteLine', { max: 64 }) || ''; record.size_units = integer(req.body.sizeUnits, 'sizeUnits', { min: 1, max: 100 }) || 47;
      if (req.body.roomPublicId) { const room = await db('rooms').where({ public_id: uuid(req.body.roomPublicId, 'roomPublicId'), site_id: site.id }).first(); if (!room) throw httpError(422, 'room_site_mismatch', 'Room does not belong to the site'); record.room_id = room.id; }
    } else if (req.params.kind === 'termination-points') {
      record.label = string(req.body.label, 'label', { required: true, max: 120 }); record.kind = string(req.body.kind, 'kind', { required: true, max: 64 }); record.notes = string(req.body.notes, 'notes', { max: 20_000 }) || '';
      if (req.body.roomPublicId) { const room = await db('rooms').where({ public_id: uuid(req.body.roomPublicId, 'roomPublicId'), site_id: site.id }).first(); if (!room) throw httpError(422, 'room_site_mismatch', 'Room does not belong to the site'); record.room_id = room.id; }
    } else if (req.params.kind === 'devices') {
      record.hostname = string(req.body.hostname, 'hostname', { required: true, max: 255 }).toLowerCase(); record.label = string(req.body.label, 'label', { max: 255 }) || ''; record.device_key = string(req.body.deviceKey, 'deviceKey', { required: true, max: 128 }); record.rack_unit = integer(req.body.rackUnit, 'rackUnit', { min: 1, max: 100 }); record.size_units = integer(req.body.sizeUnits, 'sizeUnits', { min: 1, max: 100 }) || 1; record.side = enumeration(req.body.side || 'front', 'side', ['front', 'rear'], true);
      if (req.body.rackPublicId) { const rack = await db('racks').where({ public_id: uuid(req.body.rackPublicId, 'rackPublicId'), site_id: site.id }).first(); if (!rack) throw httpError(422, 'rack_site_mismatch', 'Rack does not belong to the site'); record.rack_id = rack.id; }
    } else {
      record.endpoint_a = string(req.body.endpointA, 'endpointA', { required: true, max: 255 }); record.endpoint_b = string(req.body.endpointB, 'endpointB', { required: true, max: 255 }); record.media = string(req.body.media, 'media', { required: true, max: 64 });
      if (typeof req.body.lengthMetres !== 'number' || req.body.lengthMetres <= 0 || req.body.lengthMetres > 1000000) throw httpError(422, 'invalid_length', 'lengthMetres is invalid'); record.length_metres = req.body.lengthMetres;
    }
    const [rowId] = await db(spec.table).insert(record);
    res.status(201).json({ ...(await db(spec.table).where({ id: rowId }).first()), id: undefined, site_id: undefined, publicId: record.public_id });
  } catch (error) { next(error); }
});

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

router.get('/work-packages', async (_req, res, next) => {
  try {
    const rows = await db('work_packages as w').join('sites as s', 's.id', 'w.site_id').select('w.public_id', 'w.package_ref', 'w.external_reference', 'w.project_reference', 'w.title', 'w.description', 'w.status', 'w.version', 's.code as site_code', 's.name as site_name').orderBy('w.updated_at', 'desc');
    res.json(rows.map((row) => ({ publicId: row.public_id, packageReference: row.package_ref, externalReference: row.external_reference, projectReference: row.project_reference, title: row.title, description: row.description, status: row.status, version: row.version, siteCode: row.site_code, siteName: row.site_name })));
  } catch (error) { next(error); }
});

router.get('/work-packages/:publicId', async (req, res, next) => {
  try { res.json(await packageDetail(req.params.publicId)); } catch (error) { next(error); }
});

router.post('/work-packages', auth.requireWrite, async (req, res, next) => {
  try {
    knownKeys(req.body, ['sitePublicId', 'packageReference', 'externalReference', 'projectReference', 'title', 'description', 'status', 'leadAssignee', 'assignees', 'workItems', 'circuits', 'consumableRequirements']);
    const createdPublicId = id();
    await db.transaction(async (trx) => {
      const site = await siteByPublicId(uuid(req.body.sitePublicId, 'sitePublicId'), trx);
      const [packageId] = await trx('work_packages').insert({ public_id: createdPublicId, site_id: site.id, package_ref: string(req.body.packageReference, 'packageReference', { required: true, max: 255 }), external_reference: string(req.body.externalReference, 'externalReference', { max: 255 }), project_reference: string(req.body.projectReference, 'projectReference', { max: 255 }), title: string(req.body.title, 'title', { required: true, max: 255 }), description: string(req.body.description, 'description', { max: 20_000 }) || '', status: enumeration(req.body.status || 'planned', 'status', PACKAGE_STATUSES, true), lead_assignee: string(req.body.leadAssignee, 'leadAssignee', { max: 64 }), assignees_json: JSON.stringify(Array.isArray(req.body.assignees) ? req.body.assignees.slice(0, 50) : []) });
      for (const [sequence, item] of (req.body.workItems || []).entries()) await trx('work_items').insert({ public_id: id(), work_package_id: packageId, item_reference: string(item.itemReference, 'workItems.itemReference', { required: true, max: 255 }), title: string(item.title, 'workItems.title', { required: true, max: 255 }), description: string(item.description, 'workItems.description', { max: 20_000 }) || '', status: enumeration(item.status || 'planned', 'workItems.status', PACKAGE_STATUSES, true), sequence });
      for (const circuit of req.body.circuits || []) {
        const [circuitId] = await trx('circuits').insert({ public_id: id(), work_package_id: packageId, circuit_reference: string(circuit.circuitReference, 'circuits.circuitReference', { required: true, max: 255 }), description: string(circuit.description, 'circuits.description', { max: 20_000 }) || '', media: string(circuit.media, 'circuits.media', { required: true, max: 64 }), status: enumeration(circuit.status || 'planned', 'circuits.status', PACKAGE_STATUSES, true) });
        for (const [sequence, segment] of (circuit.segments || []).entries()) await trx('segments').insert({ public_id: id(), circuit_id: circuitId, segment_reference: string(segment.segmentReference, 'segments.segmentReference', { required: true, max: 255 }), sequence, from_endpoint: string(segment.fromEndpoint, 'segments.fromEndpoint', { required: true, max: 255 }), to_endpoint: string(segment.toEndpoint, 'segments.toEndpoint', { required: true, max: 255 }), length_metres: segment.lengthMetres || null, notes: string(segment.notes, 'segments.notes', { max: 20_000 }) || '' });
      }
      for (const requirement of req.body.consumableRequirements || []) await trx('consumable_requirements').insert({ public_id: id(), work_package_id: packageId, description: string(requirement.description, 'consumableRequirements.description', { required: true, max: 255 }), quantity_required: requirement.quantityRequired, unit: string(requirement.unit, 'consumableRequirements.unit', { required: true, max: 64 }) });
      await audit.record(trx, req.user.id, 'work_package.create', 'work_package', createdPublicId);
    });
    res.status(201).json(await packageDetail(createdPublicId));
  } catch (error) { next(error); }
});

router.put('/work-packages/:publicId', auth.requireWrite, async (req, res, next) => {
  try {
    if (!Number.isInteger(req.body._baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
    const baseVersion = integer(req.body._baseVersion, '_baseVersion', { required: true, min: 0 });
    knownKeys(req.body, ['packageReference', 'externalReference', 'projectReference', 'title', 'description', 'status', 'leadAssignee', 'assignees', '_baseVersion']);
    const changes = { package_ref: string(req.body.packageReference, 'packageReference', { required: true, max: 255 }), external_reference: string(req.body.externalReference, 'externalReference', { max: 255 }), project_reference: string(req.body.projectReference, 'projectReference', { max: 255 }), title: string(req.body.title, 'title', { required: true, max: 255 }), description: string(req.body.description, 'description', { max: 20_000 }) || '', status: enumeration(req.body.status, 'status', PACKAGE_STATUSES, true), lead_assignee: string(req.body.leadAssignee, 'leadAssignee', { max: 64 }), assignees_json: JSON.stringify(Array.isArray(req.body.assignees) ? req.body.assignees.slice(0, 50) : []), version: baseVersion + 1, updated_at: db.fn.now() };
    const updated = await db('work_packages').where({ public_id: req.params.publicId, version: baseVersion }).update(changes);
    if (!updated) {
      const current = await db('work_packages').where({ public_id: req.params.publicId }).first();
      if (!current) throw httpError(404, 'work_package_not_found', 'Work package not found');
      throw httpError(409, 'version_conflict', 'The work package changed since it was loaded');
    }
    res.json(await packageDetail(req.params.publicId));
  } catch (error) { next(error); }
});

router.get('/search', async (req, res, next) => {
  try {
    const query = string(req.query.q, 'q', { required: true, max: 255 }).toLowerCase();
    const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await db('work_packages as w').join('sites as s', 's.id', 'w.site_id')
      .leftJoin('work_items as i', 'i.work_package_id', 'w.id')
      .where((builder) => builder.whereRaw('lower(w.package_ref) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(w.external_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(w.project_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(w.title) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(w.description) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(s.code) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(s.name) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(i.item_reference, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]).orWhereRaw('lower(coalesce(i.description, \'\')) LIKE ? ESCAPE \'\\\'', [pattern]))
      .distinct('w.public_id', 'w.package_ref', 'w.external_reference', 'w.project_reference', 'w.title', 'w.status', 's.code as site_code', 's.name as site_name').limit(100);
    res.json(rows.map((row) => ({ publicId: row.public_id, packageReference: row.package_ref, externalReference: row.external_reference, projectReference: row.project_reference, title: row.title, status: row.status, siteCode: row.site_code, siteName: row.site_name })));
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
    if (req.body.estimatedUnitPrice !== undefined && (typeof req.body.estimatedUnitPrice !== 'number' || req.body.estimatedUnitPrice < 0)) throw httpError(422, 'invalid_price', 'estimatedUnitPrice is invalid');
    const publicId = id();
    await db('consumable_catalogue').insert({ public_id: publicId, catalogue_reference: string(req.body.catalogueReference, 'catalogueReference', { required: true, max: 255 }), description: string(req.body.description, 'description', { required: true, max: 255 }), estimated_unit_price: req.body.estimatedUnitPrice === undefined ? null : req.body.estimatedUnitPrice, unit: string(req.body.unit || 'each', 'unit', { required: true, max: 64 }) });
    res.status(201).json({ publicId });
  } catch (error) { next(error); }
});

router.post('/photos/:entityType/:entityPublicId', auth.requireWrite, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }), async (req, res, next) => {
  try {
    if (!['rack', 'device', 'work_package'].includes(req.params.entityType) || !Buffer.isBuffer(req.body) || !req.body.length) throw httpError(415, 'photo_type_invalid', 'Photo must be JPEG, PNG, or WebP');
    const publicId = id();
    await db('photos').insert({ public_id: publicId, entity_type: req.params.entityType, entity_public_id: uuid(req.params.entityPublicId, 'entityPublicId'), name: string(req.headers['x-photo-name'], 'x-photo-name', { required: true, max: 255 }), description: string(req.headers['x-photo-description'], 'x-photo-description', { max: 2000 }) || '', media_type: req.headers['content-type'], content: req.body });
    res.status(201).json({ publicId });
  } catch (error) { next(error); }
});

router.get('/photos/:publicId/content', async (req, res, next) => {
  try { const photo = await db('photos').where({ public_id: req.params.publicId }).first(); if (!photo) throw httpError(404, 'photo_not_found', 'Photo not found'); res.type(photo.media_type).send(photo.content); } catch (error) { next(error); }
});

router.get('/photos/:entityType/:entityPublicId', async (req, res, next) => {
  try { res.json(await db('photos').where({ entity_type: req.params.entityType, entity_public_id: req.params.entityPublicId }).select('public_id as publicId', 'name', 'description', 'media_type as mediaType', 'created_at as createdAt')); } catch (error) { next(error); }
});

router.get('/audit', auth.requireAdmin, async (_req, res, next) => {
  try { res.json(await db('audit_events').select('public_id as publicId', 'action', 'entity_type as entityType', 'entity_public_id as entityPublicId', 'metadata_json as metadata', 'created_at as createdAt').orderBy('id', 'desc').limit(200)); } catch (error) { next(error); }
});

module.exports = router;
