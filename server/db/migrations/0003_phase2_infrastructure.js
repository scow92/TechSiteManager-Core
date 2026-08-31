'use strict';

async function recreateBaselineTriggers(knex) {
  for (const name of ['racks_bounds_insert', 'racks_bounds_update', 'devices_values_insert', 'devices_values_update', 'distance_length_insert']) await knex.raw(`DROP TRIGGER IF EXISTS ${name}`);
  await knex.raw("CREATE TRIGGER racks_bounds_insert BEFORE INSERT ON racks WHEN NEW.size_units < 1 OR NEW.size_units > 100 BEGIN SELECT RAISE(ABORT, 'invalid rack size'); END");
  await knex.raw("CREATE TRIGGER racks_bounds_update BEFORE UPDATE OF size_units ON racks WHEN NEW.size_units < 1 OR NEW.size_units > 100 BEGIN SELECT RAISE(ABORT, 'invalid rack size'); END");
  await knex.raw("CREATE TRIGGER devices_values_insert BEFORE INSERT ON devices WHEN NEW.hostname <> lower(NEW.hostname) OR NEW.size_units < 1 OR NEW.size_units > 100 OR NEW.side NOT IN ('front','rear') OR (NEW.rack_unit IS NOT NULL AND (NEW.rack_unit < 1 OR NEW.rack_unit > 100)) BEGIN SELECT RAISE(ABORT, 'invalid device values'); END");
  await knex.raw("CREATE TRIGGER devices_values_update BEFORE UPDATE ON devices WHEN NEW.hostname <> lower(NEW.hostname) OR NEW.size_units < 1 OR NEW.size_units > 100 OR NEW.side NOT IN ('front','rear') OR (NEW.rack_unit IS NOT NULL AND (NEW.rack_unit < 1 OR NEW.rack_unit > 100)) BEGIN SELECT RAISE(ABORT, 'invalid device values'); END");
  await knex.raw("CREATE TRIGGER distance_length_insert BEFORE INSERT ON distance_samples WHEN NEW.length_metres <= 0 OR NEW.length_metres > 1000000 BEGIN SELECT RAISE(ABORT, 'invalid distance length'); END");
}

exports.up = async function up(knex) {
  await knex.schema.alterTable('racks', (table) => {
    table.boolean('suite_line_confirmed').notNullable().defaultTo(false);
  });
  await knex('racks').whereNot('suite_line', '').update({ suite_line_confirmed: true });

  await knex.schema.alterTable('termination_points', (table) => {
    table.integer('tray_count').notNullable().defaultTo(1);
    table.integer('positions_per_tray').notNullable().defaultTo(12);
  });
  await knex.schema.createTable('termination_positions', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('termination_point_id').notNullable().references('id').inTable('termination_points').onDelete('CASCADE');
    table.integer('tray').notNullable();
    table.integer('position').notNullable();
    table.text('label').notNullable().defaultTo('');
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['termination_point_id', 'tray', 'position']);
  });

  await knex.schema.alterTable('devices', (table) => {
    table.integer('room_id').references('id').inTable('rooms').onDelete('SET NULL');
  });
  await knex.raw('UPDATE devices SET room_id = (SELECT room_id FROM racks WHERE racks.id = devices.rack_id) WHERE rack_id IS NOT NULL');

  await knex.schema.alterTable('distance_samples', (table) => {
    table.integer('endpoint_a_device_id').references('id').inTable('devices').onDelete('SET NULL');
    table.integer('endpoint_b_device_id').references('id').inTable('devices').onDelete('SET NULL');
    table.integer('endpoint_a_rack_id').references('id').inTable('racks').onDelete('SET NULL');
    table.integer('endpoint_b_rack_id').references('id').inTable('racks').onDelete('SET NULL');
  });
  await knex.schema.alterTable('photos', (table) => {
    table.boolean('is_current').notNullable().defaultTo(true);
    table.integer('version').notNullable().defaultTo(0);
  });
  await knex('photos').update({ is_current: false });
  await knex.raw('UPDATE photos SET is_current = 1 WHERE id IN (SELECT MAX(id) FROM photos GROUP BY entity_type, entity_public_id)');

  await knex.raw("CREATE TRIGGER termination_position_insert BEFORE INSERT ON termination_positions WHEN NEW.tray < 1 OR NEW.position < 1 BEGIN SELECT RAISE(ABORT, 'invalid termination position'); END");
  await knex.raw("CREATE TRIGGER termination_position_capacity_insert BEFORE INSERT ON termination_positions WHEN NEW.tray > (SELECT tray_count FROM termination_points WHERE id = NEW.termination_point_id) OR NEW.position > (SELECT positions_per_tray FROM termination_points WHERE id = NEW.termination_point_id) BEGIN SELECT RAISE(ABORT, 'termination position exceeds capacity'); END");
  await knex.raw("CREATE TRIGGER termination_position_capacity_update BEFORE UPDATE OF tray, position ON termination_positions WHEN NEW.tray > (SELECT tray_count FROM termination_points WHERE id = NEW.termination_point_id) OR NEW.position > (SELECT positions_per_tray FROM termination_points WHERE id = NEW.termination_point_id) BEGIN SELECT RAISE(ABORT, 'termination position exceeds capacity'); END");
  await knex.raw("CREATE TRIGGER termination_point_capacity_insert BEFORE INSERT ON termination_points WHEN NEW.tray_count < 1 OR NEW.tray_count > 100 OR NEW.positions_per_tray < 1 OR NEW.positions_per_tray > 1000 BEGIN SELECT RAISE(ABORT, 'invalid termination capacity'); END");
  await knex.raw("CREATE TRIGGER termination_point_capacity_update BEFORE UPDATE OF tray_count, positions_per_tray ON termination_points WHEN NEW.tray_count < 1 OR NEW.tray_count > 100 OR NEW.positions_per_tray < 1 OR NEW.positions_per_tray > 1000 BEGIN SELECT RAISE(ABORT, 'invalid termination capacity'); END");
  await knex.raw('CREATE UNIQUE INDEX photos_one_current_per_entity ON photos(entity_type, entity_public_id) WHERE is_current = 1');
  await recreateBaselineTriggers(knex);
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS photos_one_current_per_entity');
  await knex.raw('DROP TRIGGER IF EXISTS termination_point_capacity_update');
  await knex.raw('DROP TRIGGER IF EXISTS termination_point_capacity_insert');
  await knex.raw('DROP TRIGGER IF EXISTS termination_position_capacity_update');
  await knex.raw('DROP TRIGGER IF EXISTS termination_position_capacity_insert');
  await knex.raw('DROP TRIGGER IF EXISTS termination_position_insert');
  await knex.schema.dropTableIfExists('termination_positions');
  await knex.schema.alterTable('photos', (table) => {
    table.dropColumn('version');
    table.dropColumn('is_current');
  });
  await knex.schema.alterTable('distance_samples', (table) => {
    table.dropColumn('endpoint_b_rack_id');
    table.dropColumn('endpoint_a_rack_id');
    table.dropColumn('endpoint_b_device_id');
    table.dropColumn('endpoint_a_device_id');
  });
  await knex.schema.alterTable('devices', (table) => table.dropColumn('room_id'));
  await knex.schema.alterTable('termination_points', (table) => {
    table.dropColumn('positions_per_tray');
    table.dropColumn('tray_count');
  });
  await knex.schema.alterTable('racks', (table) => table.dropColumn('suite_line_confirmed'));
  await recreateBaselineTriggers(knex);
};
