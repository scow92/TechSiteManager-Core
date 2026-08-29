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
  assert.deepEqual(migrations.map((row) => row.name), ['0001_generic_baseline.js', '0002_plugin_api_v2_extensions.js']);
  const tables = (await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((row) => row.name);
  for (const expected of ['sites', 'rooms', 'racks', 'termination_points', 'devices', 'work_packages', 'work_items', 'circuits', 'segments', 'extension_values', 'import_sources', 'import_runs', 'import_entity_links', 'import_field_ownership', 'import_drafts']) assert.ok(tables.includes(expected));
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
  const [userId] = await db('users').insert({ public_id: crypto.randomUUID(), username: 'recovery-admin', password_hash: 'test', role: 'admin', display_name: 'Recovery Admin', active: 1 });
  const [packageId] = await db('work_packages').insert({ public_id: crypto.randomUUID(), site_id: site.id, package_ref: 'PKG-RECOVERY-1', external_reference: 'EXT-RECOVERY-1', title: 'Recovery fixture', status: 'active' });
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
    assert.equal((await restoredDb('import_entity_links').count({ count: '*' }).first()).count, 1);
    assert.deepEqual(await restoredDb.raw('PRAGMA foreign_key_check'), []);
  } finally { await restoredDb.destroy(); }
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
