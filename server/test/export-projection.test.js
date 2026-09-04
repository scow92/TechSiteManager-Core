'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-export-projection-'));
process.env.DATA_DIR = testDataDir;
process.env.DB_FILE = path.join(testDataDir, 'test.db');
process.env.NODE_ENV = 'test';

const db = require('../db/knex');
const { buildV1, SCHEMA_VERSION } = require('../plugins/export-projections');

const uid = () => crypto.randomUUID();
let richPackagePublicId;
let richIds;

test.before(async () => {
  await db.migrate.latest();
  const [siteId] = await db('sites').insert({ public_id: uid(), code: 'LAB-PROJECTION', name: 'Projection Laboratory', description: 'Fictional export projection site' });
  const [roomZId] = await db('rooms').insert({ public_id: uid(), site_id: siteId, name: 'Zulu Room', description: '' });
  const [roomAId] = await db('rooms').insert({ public_id: uid(), site_id: siteId, name: 'Alpha Room', description: '' });
  await db('racks').insert([
    { public_id: uid(), site_id: siteId, room_id: roomZId, label: 'Z9', suite_line: 'Z', size_units: 47 },
    { public_id: uid(), site_id: siteId, room_id: roomAId, label: 'A1', suite_line: 'A', size_units: 42 }
  ]);
  await db('termination_points').insert([
    { public_id: uid(), site_id: siteId, room_id: roomZId, label: 'TP-Z', kind: 'odf', notes: 'Fictional Z termination' },
    { public_id: uid(), site_id: siteId, room_id: roomAId, label: 'TP-A', kind: 'panel', notes: 'Fictional A termination' }
  ]);
  const cataloguePublicId = uid();
  const [catalogueId] = await db('consumable_catalogue').insert({ public_id: cataloguePublicId, catalogue_reference: 'CAT-FICTIONAL-1', description: 'Fictional consumable', estimated_unit_price: 2.5, unit: 'each' });
  await db('consumable_catalogue').insert({ public_id: uid(), catalogue_reference: 'CAT-UNREFERENCED', description: 'Unreferenced fictional item', estimated_unit_price: 1, unit: 'each' });

  richPackagePublicId = uid();
  const [packageId] = await db('work_packages').insert({ public_id: richPackagePublicId, site_id: siteId, package_ref: 'PKG-PROJECTION-1', title: 'Projection fixture', description: '', status: 'active' });
  const itemPublicId = uid();
  await db('work_items').insert({ public_id: itemPublicId, work_package_id: packageId, item_reference: 'ITEM-PROJECTION-1', title: 'Projection item', description: '', status: 'active', sequence: 2 });
  const circuitPublicId = uid();
  const [circuitId] = await db('circuits').insert({ public_id: circuitPublicId, work_package_id: packageId, circuit_reference: 'CIRCUIT-PROJECTION-1', description: '', media: 'fibre', status: 'planned' });
  const segmentPublicId = uid();
  await db('segments').insert({ public_id: segmentPublicId, circuit_id: circuitId, segment_reference: 'SEGMENT-PROJECTION-1', sequence: 3, from_endpoint: 'demo-a:1', to_endpoint: 'demo-b:2', notes: '' });
  const requirementPublicId = uid();
  await db('consumable_requirements').insert({ public_id: requirementPublicId, work_package_id: packageId, catalogue_id: catalogueId, description: 'Fictional consumable', quantity_required: 3, unit: 'each' });
  await db('extension_values').insert([
    { public_id: uid(), plugin_id: 'fixture.projection', entity_type: 'work-package', entity_public_id: richPackagePublicId, field_id: 'visible', value_json: JSON.stringify('allowed'), version: 1 },
    { public_id: uid(), plugin_id: 'fixture.other', entity_type: 'work-package', entity_public_id: richPackagePublicId, field_id: 'hidden', value_json: JSON.stringify('filtered'), version: 1 }
  ]);

  const sourcePublicId = uid();
  const [sourceId] = await db('import_sources').insert({ public_id: sourcePublicId, provider_id: 'fixture.projection.provider', external_source_id: 'fixture-source', display_reference: 'Fictional source', connector_id: 'core.upload', first_seen_at: '2026-01-01T00:00:00.000Z', last_seen_at: '2026-01-01T00:00:00.000Z' });
  const runPublicId = uid();
  const [runId] = await db('import_runs').insert({ public_id: runPublicId, source_id: sourceId, source_version: '1', content_hash: `sha256:${'1'.repeat(64)}`, source_fingerprint: `sha256:${'2'.repeat(64)}`, provider_version: '1.0.0', status: 'applied', counts_json: '{}', warning_codes_json: '[]', decisions_json: '{}', primary_entity_public_id: richPackagePublicId, started_at: '2026-01-01T00:00:00.000Z', finished_at: '2026-01-01T00:00:01.000Z' });
  const missingEntityPublicId = uid();
  await db('import_entity_links').insert([
    { public_id: uid(), source_id: sourceId, source_record_key: 'package:fixture', entity_type: 'work_package', entity_public_id: richPackagePublicId, first_run_id: runId, last_seen_run_id: runId, reconciliation_state: 'linked' },
    { public_id: uid(), source_id: sourceId, source_record_key: 'item:fixture', entity_type: 'work_item', entity_public_id: itemPublicId, first_run_id: runId, last_seen_run_id: runId, absent_at: '2026-01-02T00:00:00.000Z', reconciliation_state: 'absent' },
    { public_id: uid(), source_id: sourceId, source_record_key: 'circuit:fixture', entity_type: 'circuit', entity_public_id: circuitPublicId, first_run_id: runId, last_seen_run_id: runId, reconciliation_state: 'linked' },
    { public_id: uid(), source_id: sourceId, source_record_key: 'segment:fixture', entity_type: 'segment', entity_public_id: segmentPublicId, first_run_id: runId, last_seen_run_id: runId, reconciliation_state: 'linked' },
    { public_id: uid(), source_id: sourceId, source_record_key: 'item:missing', entity_type: 'work_item', entity_public_id: missingEntityPublicId, first_run_id: runId, last_seen_run_id: runId, reconciliation_state: 'linked' }
  ]);

  const [otherSourceId] = await db('import_sources').insert({ public_id: uid(), provider_id: 'fixture.other.provider', external_source_id: 'other-source', display_reference: 'Other source', connector_id: 'core.upload', first_seen_at: '2026-01-01T00:00:00.000Z', last_seen_at: '2026-01-01T00:00:00.000Z' });
  const [otherRunId] = await db('import_runs').insert({ public_id: uid(), source_id: otherSourceId, source_version: '1', content_hash: `sha256:${'3'.repeat(64)}`, source_fingerprint: `sha256:${'4'.repeat(64)}`, provider_version: '1.0.0', status: 'applied', counts_json: '{}', warning_codes_json: '[]', decisions_json: '{}', primary_entity_public_id: richPackagePublicId, started_at: '2026-01-01T00:00:00.000Z', finished_at: '2026-01-01T00:00:01.000Z' });
  await db('import_entity_links').insert({ public_id: uid(), source_id: otherSourceId, source_record_key: 'package:other', entity_type: 'work_package', entity_public_id: richPackagePublicId, first_run_id: otherRunId, last_seen_run_id: otherRunId });
  richIds = { sourcePublicId, itemPublicId, circuitPublicId, segmentPublicId, requirementPublicId, cataloguePublicId, missingEntityPublicId };
});

test.after(async () => { await db.destroy(); fs.rmSync(testDataDir, { recursive: true, force: true }); });

test('V1 export projection is scoped, related, ordered and deterministic', async () => {
  const options = { pluginId: 'fixture.projection', providerIds: ['fixture.projection.provider'], maxRecords: 100 };
  const projection = await buildV1(richPackagePublicId, options);
  assert.equal(projection.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(projection.workPackage.extensions), ['extension.fixture.projection.visible']);
  assert.equal(projection.workPackage.extensions['extension.fixture.projection.visible'].value, 'allowed');
  assert.deepEqual(projection.site.rooms.map((room) => room.name), ['Alpha Room', 'Zulu Room']);
  assert.deepEqual(projection.site.racks.map((rack) => rack.label), ['A1', 'Z9']);
  assert.equal(projection.site.racks[0].roomName, 'Alpha Room');
  assert.deepEqual(projection.site.terminationPoints.map((point) => point.label), ['TP-A', 'TP-Z']);
  assert.deepEqual(projection.catalogueItems.map((item) => item.publicId), [richIds.cataloguePublicId]);
  assert.equal(projection.catalogueItems[0].estimatedUnitPrice, 2.5);
  assert.deepEqual(projection.approvedImportRecords.map((record) => record.entityType), ['work-package', 'work-item', 'work-item', 'circuit', 'segment']);
  assert.equal(projection.approvedImportRecords.find((record) => record.entityPublicId === richIds.itemPublicId).state, 'source-absent');
  assert.equal(projection.approvedImportRecords.find((record) => record.entityPublicId === richIds.itemPublicId).parentEntityPublicId, richPackagePublicId);
  assert.equal(projection.approvedImportRecords.find((record) => record.entityPublicId === richIds.segmentPublicId).parentEntityPublicId, richIds.circuitPublicId);
  assert.equal(projection.approvedImportRecords.find((record) => record.entityPublicId === richIds.missingEntityPublicId).state, 'entity-missing');
  assert.ok(projection.approvedImportRecords.every((record) => record.sourcePublicId === richIds.sourcePublicId));
  assert.deepEqual(await buildV1(richPackagePublicId, options), projection);
});

test('V1 export projection returns empty optional collections', async () => {
  const [siteId] = await db('sites').insert({ public_id: uid(), code: 'EMPTY-PROJECTION', name: 'Empty Projection', description: '' });
  const publicId = uid();
  await db('work_packages').insert({ public_id: publicId, site_id: siteId, package_ref: 'PKG-EMPTY-PROJECTION', title: 'Empty projection', description: '', status: 'planned' });
  const projection = await buildV1(publicId, { pluginId: 'fixture.projection', providerIds: ['fixture.projection.provider'], maxRecords: 10 });
  assert.deepEqual(projection.site.rooms, []);
  assert.deepEqual(projection.site.racks, []);
  assert.deepEqual(projection.site.terminationPoints, []);
  assert.deepEqual(projection.catalogueItems, []);
  assert.deepEqual(projection.approvedImportRecords, []);
});

test('V1 export projection rejects missing and oversized snapshots with redacted errors', async () => {
  await assert.rejects(buildV1(uid(), { pluginId: 'fixture.projection', providerIds: [], maxRecords: 100 }), { status: 404, code: 'work_package_not_found' });
  await assert.rejects(buildV1(richPackagePublicId, { pluginId: 'fixture.projection', providerIds: ['fixture.projection.provider'], maxRecords: 1 }), (error) => error.status === 413 && error.code === 'export_projection_too_large' && !error.message.includes(richPackagePublicId));
});
