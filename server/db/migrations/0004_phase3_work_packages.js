'use strict';

const LOCK_TRIGGERS = [
  'completed_pack_metadata_update',
  'completed_pack_work_item_insert', 'completed_pack_work_item_update', 'completed_pack_work_item_delete',
  'completed_pack_circuit_insert', 'completed_pack_circuit_update', 'completed_pack_circuit_delete',
  'completed_pack_segment_insert', 'completed_pack_segment_update', 'completed_pack_segment_delete',
  'completed_pack_requirement_insert', 'completed_pack_requirement_update', 'completed_pack_requirement_delete',
  'completed_pack_photo_insert', 'completed_pack_photo_update', 'completed_pack_photo_delete'
];

async function dropLockTriggers(knex) {
  for (const name of LOCK_TRIGGERS) await knex.raw(`DROP TRIGGER IF EXISTS ${name}`);
}

async function recreateAffectedBaselineTriggers(knex) {
  for (const name of ['work_packages_status_insert', 'work_packages_status_update', 'work_items_status_insert', 'work_items_status_update', 'extension_values_work_package_delete', 'extension_values_work_item_delete']) await knex.raw(`DROP TRIGGER IF EXISTS ${name}`);
  await knex.raw("CREATE TRIGGER work_packages_status_insert BEFORE INSERT ON work_packages WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work package status'); END");
  await knex.raw("CREATE TRIGGER work_packages_status_update BEFORE UPDATE OF status ON work_packages WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work package status'); END");
  await knex.raw("CREATE TRIGGER work_items_status_insert BEFORE INSERT ON work_items WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work item status'); END");
  await knex.raw("CREATE TRIGGER work_items_status_update BEFORE UPDATE OF status ON work_items WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work item status'); END");
  if (await knex.schema.hasTable('extension_values')) {
    await knex.raw("CREATE TRIGGER extension_values_work_package_delete AFTER DELETE ON work_packages BEGIN DELETE FROM extension_values WHERE entity_type = 'work-package' AND entity_public_id = OLD.public_id; END");
    await knex.raw("CREATE TRIGGER extension_values_work_item_delete AFTER DELETE ON work_items BEGIN DELETE FROM extension_values WHERE entity_type = 'work-item' AND entity_public_id = OLD.public_id; END");
  }
}

async function createLockTriggers(knex) {
  await dropLockTriggers(knex);
  await knex.raw("CREATE TRIGGER completed_pack_metadata_update BEFORE UPDATE ON work_packages WHEN OLD.status = 'complete' AND NEW.status = 'complete' AND (NEW.package_ref <> OLD.package_ref OR coalesce(NEW.external_reference, '') <> coalesce(OLD.external_reference, '') OR coalesce(NEW.project_reference, '') <> coalesce(OLD.project_reference, '') OR NEW.title <> OLD.title OR NEW.description <> OLD.description OR coalesce(NEW.lead_assignee, '') <> coalesce(OLD.lead_assignee, '') OR NEW.assignees_json <> OLD.assignees_json OR NEW.version <> OLD.version) BEGIN SELECT RAISE(ABORT, 'work package is complete'); END");
  for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
    const row = operation === 'DELETE' ? 'OLD' : 'NEW';
    const suffix = operation.toLowerCase();
    await knex.raw(`CREATE TRIGGER completed_pack_work_item_${suffix} BEFORE ${operation} ON work_items WHEN (SELECT status FROM work_packages WHERE id = ${row}.work_package_id) = 'complete' BEGIN SELECT RAISE(ABORT, 'work package is complete'); END`);
    await knex.raw(`CREATE TRIGGER completed_pack_circuit_${suffix} BEFORE ${operation} ON circuits WHEN (SELECT status FROM work_packages WHERE id = ${row}.work_package_id) = 'complete' BEGIN SELECT RAISE(ABORT, 'work package is complete'); END`);
    await knex.raw(`CREATE TRIGGER completed_pack_segment_${suffix} BEFORE ${operation} ON segments WHEN (SELECT w.status FROM work_packages w JOIN circuits c ON c.work_package_id = w.id WHERE c.id = ${row}.circuit_id) = 'complete' BEGIN SELECT RAISE(ABORT, 'work package is complete'); END`);
    await knex.raw(`CREATE TRIGGER completed_pack_requirement_${suffix} BEFORE ${operation} ON consumable_requirements WHEN (SELECT status FROM work_packages WHERE id = ${row}.work_package_id) = 'complete' BEGIN SELECT RAISE(ABORT, 'work package is complete'); END`);
    await knex.raw(`CREATE TRIGGER completed_pack_photo_${suffix} BEFORE ${operation} ON photos WHEN (${row}.entity_type = 'work_package' AND (SELECT status FROM work_packages WHERE public_id = ${row}.entity_public_id) = 'complete') OR (${row}.entity_type = 'work_item' AND (SELECT w.status FROM work_packages w JOIN work_items i ON i.work_package_id = w.id WHERE i.public_id = ${row}.entity_public_id) = 'complete') BEGIN SELECT RAISE(ABORT, 'work package is complete'); END`);
  }
}

exports.up = async function up(knex) {
  // Native additive ALTER avoids Knex's SQLite table-rebuild path, which can
  // cascade-delete child rows while rebuilding a referenced parent table.
  await knex.raw('ALTER TABLE work_packages ADD COLUMN completed_at datetime');
  await knex.raw('ALTER TABLE work_packages ADD COLUMN completed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL');
  await knex.raw('ALTER TABLE work_items ADD COLUMN lead_assignee text');
  await knex.raw("ALTER TABLE work_items ADD COLUMN assignees_json text NOT NULL DEFAULT '[]'");
  await knex.raw('ALTER TABLE work_items ADD COLUMN completed_at datetime');
  await knex.raw('ALTER TABLE work_items ADD COLUMN completed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL');
  await knex.schema.createTable('work_package_saves', (table) => {
    table.text('save_id').primary();
    table.integer('work_package_id').notNullable().references('id').inTable('work_packages').onDelete('CASCADE');
    table.integer('actor_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await recreateAffectedBaselineTriggers(knex);
  await knex.raw('CREATE INDEX work_package_saves_package_index ON work_package_saves(work_package_id, created_at)');
  // Candidate databases may contain completed rows created before completion
  // evidence existed. Preserve them with an explicit migrated timestamp; new
  // completion routes always record the authenticated actor as well.
  await knex('work_packages').where({ status: 'complete' }).whereNull('completed_at').update({ completed_at: knex.raw('coalesce(updated_at, created_at, CURRENT_TIMESTAMP)') });
  await knex.raw("UPDATE work_items SET completed_at = coalesce((SELECT updated_at FROM work_packages WHERE work_packages.id = work_items.work_package_id), CURRENT_TIMESTAMP) WHERE status = 'complete' AND completed_at IS NULL");
  await knex.raw("CREATE TRIGGER work_item_completion_insert BEFORE INSERT ON work_items WHEN (NEW.status = 'complete' AND NEW.completed_at IS NULL) OR (NEW.status <> 'complete' AND (NEW.completed_at IS NOT NULL OR NEW.completed_by_user_id IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'invalid work item completion'); END");
  await knex.raw("CREATE TRIGGER work_item_completion_update BEFORE UPDATE ON work_items WHEN (NEW.status = 'complete' AND NEW.completed_at IS NULL) OR (NEW.status <> 'complete' AND (NEW.completed_at IS NOT NULL OR NEW.completed_by_user_id IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'invalid work item completion'); END");
  await knex.raw("CREATE TRIGGER work_package_completion_insert BEFORE INSERT ON work_packages WHEN (NEW.status = 'complete' AND NEW.completed_at IS NULL) OR (NEW.status <> 'complete' AND (NEW.completed_at IS NOT NULL OR NEW.completed_by_user_id IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'invalid work package completion'); END");
  await knex.raw("CREATE TRIGGER work_package_completion_update BEFORE UPDATE ON work_packages WHEN (NEW.status = 'complete' AND NEW.completed_at IS NULL) OR (NEW.status <> 'complete' AND (NEW.completed_at IS NOT NULL OR NEW.completed_by_user_id IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'invalid work package completion'); END");
  await knex.raw("CREATE TRIGGER work_item_photo_cleanup AFTER DELETE ON work_items BEGIN DELETE FROM photos WHERE entity_type = 'work_item' AND entity_public_id = OLD.public_id; END");
  await knex.raw("CREATE TRIGGER work_package_photo_cleanup AFTER DELETE ON work_packages BEGIN DELETE FROM photos WHERE entity_type = 'work_package' AND entity_public_id = OLD.public_id; END");
  await createLockTriggers(knex);
};

exports.down = async function down(knex) {
  await dropLockTriggers(knex);
  for (const name of ['work_package_photo_cleanup', 'work_item_photo_cleanup', 'work_package_completion_update', 'work_package_completion_insert', 'work_item_completion_update', 'work_item_completion_insert']) await knex.raw(`DROP TRIGGER IF EXISTS ${name}`);
  await knex.schema.dropTableIfExists('work_package_saves');
  await knex.raw('ALTER TABLE work_items DROP COLUMN completed_by_user_id');
  await knex.raw('ALTER TABLE work_items DROP COLUMN completed_at');
  await knex.raw('ALTER TABLE work_items DROP COLUMN assignees_json');
  await knex.raw('ALTER TABLE work_items DROP COLUMN lead_assignee');
  await knex.raw('ALTER TABLE work_packages DROP COLUMN completed_by_user_id');
  await knex.raw('ALTER TABLE work_packages DROP COLUMN completed_at');
  await recreateAffectedBaselineTriggers(knex);
};
