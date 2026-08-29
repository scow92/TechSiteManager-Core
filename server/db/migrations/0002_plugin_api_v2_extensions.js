'use strict';

exports.up = async function up(knex) {
  await knex.schema.createTable('extension_values', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.text('plugin_id').notNullable();
    table.text('entity_type').notNullable();
    table.text('entity_public_id').notNullable();
    table.text('field_id').notNullable();
    table.text('value_json').notNullable();
    table.integer('version').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['plugin_id', 'entity_type', 'entity_public_id', 'field_id']);
    table.index(['entity_type', 'entity_public_id']);
  });
  await knex.raw("CREATE TRIGGER extension_values_entity_insert BEFORE INSERT ON extension_values WHEN NEW.entity_type NOT IN ('work-package','work-item','circuit','segment','consumable-requirement') BEGIN SELECT RAISE(ABORT, 'invalid extension entity type'); END");
  await knex.raw("CREATE TRIGGER extension_values_entity_update BEFORE UPDATE OF entity_type ON extension_values WHEN NEW.entity_type NOT IN ('work-package','work-item','circuit','segment','consumable-requirement') BEGIN SELECT RAISE(ABORT, 'invalid extension entity type'); END");
  await knex.raw("CREATE TRIGGER extension_values_json_insert BEFORE INSERT ON extension_values WHEN json_valid(NEW.value_json) = 0 BEGIN SELECT RAISE(ABORT, 'invalid extension value'); END");
  await knex.raw("CREATE TRIGGER extension_values_json_update BEFORE UPDATE OF value_json ON extension_values WHEN json_valid(NEW.value_json) = 0 BEGIN SELECT RAISE(ABORT, 'invalid extension value'); END");
  for (const [trigger, table, entityType] of [
    ['extension_values_work_package_delete', 'work_packages', 'work-package'],
    ['extension_values_work_item_delete', 'work_items', 'work-item'],
    ['extension_values_circuit_delete', 'circuits', 'circuit'],
    ['extension_values_segment_delete', 'segments', 'segment'],
    ['extension_values_requirement_delete', 'consumable_requirements', 'consumable-requirement']
  ]) await knex.raw(`CREATE TRIGGER ${trigger} AFTER DELETE ON ${table} BEGIN DELETE FROM extension_values WHERE entity_type = '${entityType}' AND entity_public_id = OLD.public_id; END`);
  await knex.raw('DROP TRIGGER import_link_entity_insert');
  await knex.raw("CREATE TRIGGER import_link_entity_insert BEFORE INSERT ON import_entity_links WHEN NEW.entity_type NOT IN ('work_package','work_item','circuit','segment','consumable_requirement') BEGIN SELECT RAISE(ABORT, 'invalid import entity type'); END");
};

exports.down = async function down(knex) {
  for (const trigger of ['extension_values_work_package_delete', 'extension_values_work_item_delete', 'extension_values_circuit_delete', 'extension_values_segment_delete', 'extension_values_requirement_delete']) await knex.raw(`DROP TRIGGER IF EXISTS ${trigger}`);
  await knex.schema.dropTableIfExists('extension_values');
  await knex.raw('DROP TRIGGER import_link_entity_insert');
  await knex.raw("CREATE TRIGGER import_link_entity_insert BEFORE INSERT ON import_entity_links WHEN NEW.entity_type NOT IN ('work_package','work_item','circuit','segment') BEGIN SELECT RAISE(ABORT, 'invalid import entity type'); END");
};
