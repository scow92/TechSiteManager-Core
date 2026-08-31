'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tsm-recovery-'));
const dataDir = path.join(testRoot, 'live');
process.env.DATA_DIR = dataDir;
process.env.DB_FILE = path.join(dataDir, 'live.db');
process.env.NODE_ENV = 'test';

const knex = require('knex');
const db = require('../db/knex');
const knexfile = require('../knexfile').test;
const { createBackup, restoreBackup, verify, sha256 } = require('../lib/backup');

test.after(async () => { await db.destroy(); fs.rmSync(testRoot, { recursive: true, force: true }); });

test('fresh generic baseline installs with integrity and no legacy migration history', async () => {
  await db.migrate.latest();
  assert.equal((await db.raw('PRAGMA integrity_check'))[0].integrity_check, 'ok');
  assert.deepEqual(await db.raw('PRAGMA foreign_key_check'), []);
  const migrations = await db('knex_migrations').select('name');
  assert.deepEqual(migrations.map((row) => row.name), ['0001_generic_baseline.js', '0002_plugin_api_v2_extensions.js', '0003_phase2_infrastructure.js', '0004_phase3_work_packages.js']);
  const tables = (await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((row) => row.name);
  for (const expected of ['sites', 'rooms', 'racks', 'termination_points', 'termination_positions', 'devices', 'distance_samples', 'photos', 'work_packages', 'work_items', 'work_package_saves', 'circuits', 'segments', 'extension_values', 'import_sources', 'import_runs', 'import_entity_links', 'import_field_ownership', 'import_drafts']) assert.ok(tables.includes(expected));
});

test('database constraints defend roles, statuses, quantities, and foreign keys', async () => {
  await assert.rejects(db('users').insert({ public_id: crypto.randomUUID(), username: 'invalid-role', password_hash: 'x', role: 'owner', display_name: 'Invalid', active: 1 }), /invalid role/);
  const [siteId] = await db('sites').insert({ public_id: crypto.randomUUID(), code: 'REC-01', name: 'Recovery Lab' });
  await assert.rejects(db('work_packages').insert({ public_id: crypto.randomUUID(), site_id: siteId, package_ref: 'PKG-INVALID-STATUS', title: 'Invalid', status: 'unknown' }), /invalid work package status/);
  await assert.rejects(db('rooms').insert({ public_id: crypto.randomUUID(), site_id: 999999, name: 'Orphan' }), /FOREIGN KEY/);
  const [packageId] = await db('work_packages').insert({ public_id: crypto.randomUUID(), site_id: siteId, package_ref: 'PKG-CONSTRAINTS', title: 'Constraint checks' });
  await assert.rejects(db('work_items').insert({ public_id: crypto.randomUUID(), work_package_id: packageId, item_reference: 'ITEM-BAD', title: 'Invalid', status: 'unknown' }), /invalid work item status/);
  await assert.rejects(db('devices').insert({ public_id: crypto.randomUUID(), site_id: siteId, hostname: 'UPPERCASE-DEVICE', device_key: 'invalid-device-case' }), /invalid device values/);
  await assert.rejects(db('consumable_catalogue').insert({ public_id: crypto.randomUUID(), catalogue_reference: 'CAT-NEGATIVE', description: 'Invalid price', estimated_unit_price: -1 }), /price must be non-negative/);
  const [requirementId] = await db('consumable_requirements').insert({ public_id: crypto.randomUUID(), work_package_id: packageId, description: 'Valid quantity', quantity_required: 1 });
  await assert.rejects(db('consumable_requirements').where({ id: requirementId }).update({ quantity_required: 0 }), /quantity must be positive/);
  await assert.rejects(db('import_field_ownership').insert({ entity_type: 'work_package', entity_public_id: crypto.randomUUID(), field_path: 'title', policy: 'unsupported', updated_at: new Date().toISOString() }), /invalid field ownership/);
});

test('SQLite-safe backup and restore preserve generic records and provenance', async () => {
  const site = await db('sites').where({ code: 'REC-01' }).first();
  const [roomId] = await db('rooms').insert({ public_id: crypto.randomUUID(), site_id: site.id, name: 'Fictional Recovery Room' });
  const rackPublicId = crypto.randomUUID();
  const [rackId] = await db('racks').insert({ public_id: rackPublicId, site_id: site.id, room_id: roomId, label: 'REC-RACK-A1', suite_line: 'A', suite_line_confirmed: true, size_units: 47 });
  const firstDevicePublicId = crypto.randomUUID(); const secondDevicePublicId = crypto.randomUUID();
  const [firstDeviceId] = await db('devices').insert({ public_id: firstDevicePublicId, site_id: site.id, room_id: roomId, rack_id: rackId, hostname: 'recovery-device-a', device_key: crypto.randomUUID(), rack_unit: 10, side: 'front' });
  const [secondDeviceId] = await db('devices').insert({ public_id: secondDevicePublicId, site_id: site.id, room_id: roomId, rack_id: rackId, hostname: 'recovery-device-b', device_key: crypto.randomUUID(), rack_unit: 20, side: 'front' });
  const [pointId] = await db('termination_points').insert({ public_id: crypto.randomUUID(), site_id: site.id, room_id: roomId, label: 'REC-ODF-01', kind: 'odf', tray_count: 2, positions_per_tray: 12 });
  await db('termination_positions').insert({ public_id: crypto.randomUUID(), termination_point_id: pointId, tray: 2, position: 4, label: 'Fictional fibre 4' });
  await db('distance_samples').insert({ public_id: crypto.randomUUID(), site_id: site.id, endpoint_a: 'recovery-device-a', endpoint_b: 'recovery-device-b', endpoint_a_device_id: firstDeviceId, endpoint_b_device_id: secondDeviceId, endpoint_a_rack_id: rackId, endpoint_b_rack_id: rackId, media: 'fibre', length_metres: 14.5 });
  const photoBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  await db('photos').insert({ public_id: crypto.randomUUID(), entity_type: 'rack', entity_public_id: rackPublicId, name: 'Fictional recovery rack', media_type: 'image/jpeg', content: photoBytes, is_current: true });
  const [userId] = await db('users').insert({ public_id: crypto.randomUUID(), username: 'recovery-admin', password_hash: 'test', role: 'admin', display_name: 'Recovery Admin', active: 1 });
  const packagePublicId = crypto.randomUUID(); const workItemPublicId = crypto.randomUUID(); const packagePhotoPublicId = crypto.randomUUID(); const itemPhotoPublicId = crypto.randomUUID(); const saveId = crypto.randomUUID();
  const [packageId] = await db('work_packages').insert({ public_id: packagePublicId, site_id: site.id, package_ref: 'PKG-RECOVERY-1', external_reference: 'EXT-RECOVERY-1', project_reference: 'PROJECT-RECOVERY', title: 'Recovery fixture', status: 'active', lead_assignee: 'recovery-admin', assignees_json: '["recovery-admin"]' });
  const [workItemId] = await db('work_items').insert({ public_id: workItemPublicId, work_package_id: packageId, item_reference: 'ITEM-RECOVERY-1', title: 'Recovery handover item', status: 'active', lead_assignee: 'recovery-admin', assignees_json: '["recovery-admin"]' });
  await db('photos').insert([
    { public_id: packagePhotoPublicId, entity_type: 'work_package', entity_public_id: packagePublicId, name: 'Fictional package handover', description: 'Package recovery evidence', media_type: 'image/jpeg', content: photoBytes, is_current: true },
    { public_id: itemPhotoPublicId, entity_type: 'work_item', entity_public_id: workItemPublicId, name: 'Fictional item handover', description: 'Item recovery evidence', media_type: 'image/jpeg', content: photoBytes, is_current: true }
  ]);
  const completedAt = new Date().toISOString();
  await db('work_items').where({ id: workItemId }).update({ status: 'complete', completed_at: completedAt, completed_by_user_id: userId, version: 1 });
  await db('work_packages').where({ id: packageId }).update({ status: 'complete', completed_at: completedAt, completed_by_user_id: userId, version: 1 });
  await db('work_package_saves').insert({ save_id: saveId, work_package_id: packageId, actor_user_id: userId });
  const [sourceId] = await db('import_sources').insert({ public_id: crypto.randomUUID(), provider_id: 'example.recovery.provider', external_source_id: 'recovery-source-1', connector_id: 'core.file', first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
  const [runId] = await db('import_runs').insert({ public_id: crypto.randomUUID(), source_id: sourceId, content_hash: `sha256:${'a'.repeat(64)}`, source_fingerprint: `sha256:${'b'.repeat(64)}`, provider_version: '1.0.0', status: 'applied', actor_user_id: userId, started_at: new Date().toISOString(), finished_at: new Date().toISOString() });
  await db('import_entity_links').insert({ public_id: crypto.randomUUID(), source_id: sourceId, source_record_key: 'package:recovery', entity_type: 'work_package', entity_public_id: (await db('work_packages').where({ id: packageId }).first()).public_id, first_run_id: runId, last_seen_run_id: runId });
  const backupDir = path.join(testRoot, 'backups');
  const { destination, manifest } = await createBackup(process.env.DB_FILE, backupDir);
  assert.equal(manifest.integrity, 'ok'); assert.equal(manifest.sha256, sha256(destination));
  const restored = path.join(testRoot, 'restored', 'restored.db');
  restoreBackup(destination, restored); verify(restored);
  const restoredDb = knex({ ...knexfile, connection: { filename: restored } });
  try {
    assert.equal((await restoredDb('work_packages').where({ package_ref: 'PKG-RECOVERY-1' }).first()).title, 'Recovery fixture');
    assert.equal((await restoredDb('work_packages').where({ package_ref: 'PKG-RECOVERY-1' }).first()).status, 'complete');
    assert.deepEqual(JSON.parse((await restoredDb('work_items').where({ public_id: workItemPublicId }).first()).assignees_json), ['recovery-admin']);
    assert.equal((await restoredDb('work_package_saves').where({ save_id: saveId }).first()).work_package_id, packageId);
    assert.deepEqual((await restoredDb('photos').where({ public_id: packagePhotoPublicId }).first()).content, photoBytes);
    assert.deepEqual((await restoredDb('photos').where({ public_id: itemPhotoPublicId }).first()).content, photoBytes);
    assert.equal((await restoredDb('import_entity_links').count({ count: '*' }).first()).count, 1);
    assert.equal((await restoredDb('termination_positions').where({ termination_point_id: pointId }).first()).label, 'Fictional fibre 4');
    assert.equal(Number((await restoredDb('distance_samples').where({ endpoint_a_device_id: firstDeviceId }).first()).length_metres), 14.5);
    assert.deepEqual((await restoredDb('photos').where({ entity_public_id: rackPublicId }).first()).content, photoBytes);
    assert.deepEqual(await restoredDb.raw('PRAGMA foreign_key_check'), []);
  } finally { await restoredDb.destroy(); }
});

test('phase 3 migration preserves legacy completion and installs mutation locks', async () => {
  const file = path.join(testRoot, 'phase3-upgrade', 'upgrade.db'); fs.mkdirSync(path.dirname(file), { recursive: true });
  const upgradeDb = knex({ ...knexfile, connection: { filename: file } });
  try {
    await upgradeDb.migrate.up({ name: '0001_generic_baseline.js' });
    await upgradeDb.migrate.up({ name: '0002_plugin_api_v2_extensions.js' });
    await upgradeDb.migrate.up({ name: '0003_phase2_infrastructure.js' });
    const [siteId] = await upgradeDb('sites').insert({ public_id: crypto.randomUUID(), code: 'UPGRADE-01', name: 'Fictional Upgrade Site' });
    const packagePublicId = crypto.randomUUID(); const itemPublicId = crypto.randomUUID();
    const [packageId] = await upgradeDb('work_packages').insert({ public_id: packagePublicId, site_id: siteId, package_ref: 'PKG-UPGRADE-1', title: 'Legacy complete package', status: 'complete' });
    await upgradeDb('work_items').insert({ public_id: itemPublicId, work_package_id: packageId, item_reference: 'ITEM-UPGRADE-1', title: 'Legacy complete item', status: 'complete' });
    await upgradeDb.migrate.latest();
    const pack = await upgradeDb('work_packages').where({ public_id: packagePublicId }).first(); const item = await upgradeDb('work_items').where({ public_id: itemPublicId }).first();
    assert.ok(pack.completed_at); assert.equal(pack.completed_by_user_id, null); assert.ok(item.completed_at); assert.equal(item.completed_by_user_id, null);
    await assert.rejects(upgradeDb('work_packages').where({ id: packageId }).update({ title: 'Rejected mutation', version: pack.version + 1 }), /work package is complete/);
    await assert.rejects(upgradeDb('work_items').where({ public_id: itemPublicId }).delete(), /work package is complete/);
    assert.deepEqual(await upgradeDb.raw('PRAGMA foreign_key_check'), []);
    await upgradeDb.migrate.rollback();
    assert.equal((await upgradeDb('work_packages').where({ public_id: packagePublicId }).first()).title, 'Legacy complete package');
    assert.equal((await upgradeDb('work_items').where({ public_id: itemPublicId }).first()).title, 'Legacy complete item');
    await upgradeDb.migrate.latest();
    assert.ok((await upgradeDb('work_items').where({ public_id: itemPublicId }).first()).completed_at);
    assert.deepEqual(await upgradeDb.raw('PRAGMA foreign_key_check'), []);
  } finally { await upgradeDb.destroy(); }
});

test('restore refuses overwrite and backup refuses the live data directory', async () => {
  await assert.rejects(createBackup(process.env.DB_FILE, dataDir), /backup_directory_must_be_separate/);
  assert.throws(() => restoreBackup(process.env.DB_FILE, process.env.DB_FILE), /restore_source_equals_target/);
  const existing = path.join(testRoot, 'existing.db'); fs.writeFileSync(existing, 'occupied');
  assert.throws(() => restoreBackup(process.env.DB_FILE, existing), /restore_target_exists/);
});

test('baseline supports a clean down/up cycle only in a throwaway database', async () => {
  const file = path.join(testRoot, 'cycle', 'cycle.db'); fs.mkdirSync(path.dirname(file), { recursive: true });
  const cycleDb = knex({ ...knexfile, connection: { filename: file } });
  try {
    await cycleDb.migrate.latest(); await cycleDb.migrate.rollback(); await cycleDb.migrate.latest();
    assert.equal((await cycleDb.raw('PRAGMA integrity_check'))[0].integrity_check, 'ok');
  } finally { await cycleDb.destroy(); }
});
