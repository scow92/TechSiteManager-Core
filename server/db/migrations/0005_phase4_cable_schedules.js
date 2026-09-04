'use strict';

const SEGMENT_COLUMNS = [
  'dac_direction', 'dac_media', 'dac_connector',
  'copper_pinout', 'copper_shielding', 'copper_category',
  'item_type', 'stock_length_metres', 'fibre_simplex', 'fibre_mode', 'fibre_type', 'to_connector', 'from_connector',
  'to_rack_id', 'to_room_id', 'to_termination_position_id', 'to_device_id', 'to_port', 'to_endpoint_mode',
  'from_rack_id', 'from_room_id', 'from_termination_position_id', 'from_device_id', 'from_port', 'from_endpoint_mode'
];

const TRIGGERS = [
  'segments_cable_values_insert',
  'segments_cable_values_update'
];

async function dropTriggers(knex) {
  for (const name of TRIGGERS) await knex.raw(`DROP TRIGGER IF EXISTS ${name}`);
}

async function createTriggers(knex) {
  await dropTriggers(knex);
  const invalid = `
    NEW.from_endpoint_mode NOT IN ('legacy','device','odf') OR
    NEW.to_endpoint_mode NOT IN ('legacy','device','odf') OR
    (NEW.from_endpoint_mode = 'legacy' AND (NEW.from_device_id IS NOT NULL OR NEW.from_termination_position_id IS NOT NULL)) OR
    (NEW.from_endpoint_mode = 'device' AND (NEW.from_device_id IS NULL OR NEW.from_termination_position_id IS NOT NULL OR trim(NEW.from_port) = '')) OR
    (NEW.from_endpoint_mode = 'odf' AND (NEW.from_termination_position_id IS NULL OR NEW.from_device_id IS NOT NULL)) OR
    (NEW.to_endpoint_mode = 'legacy' AND (NEW.to_device_id IS NOT NULL OR NEW.to_termination_position_id IS NOT NULL)) OR
    (NEW.to_endpoint_mode = 'device' AND (NEW.to_device_id IS NULL OR NEW.to_termination_position_id IS NOT NULL OR trim(NEW.to_port) = '')) OR
    (NEW.to_endpoint_mode = 'odf' AND (NEW.to_termination_position_id IS NULL OR NEW.to_device_id IS NOT NULL)) OR
    NEW.fibre_mode NOT IN ('singlemode','multimode') OR
    NEW.from_connector NOT IN ('lc','sc','mpo','mtp','fc','st','rj45','sfp','sfp+','sfp28','qsfp+','qsfp28','qsfp56','qsfp-dd','none') OR
    NEW.to_connector NOT IN ('lc','sc','mpo','mtp','fc','st','rj45','sfp','sfp+','sfp28','qsfp+','qsfp28','qsfp56','qsfp-dd','none') OR
    NEW.fibre_simplex NOT IN (0,1) OR
    (NEW.stock_length_metres IS NOT NULL AND (NEW.stock_length_metres <= 0 OR NEW.stock_length_metres > 1000000)) OR
    NEW.copper_shielding NOT IN ('utp','f-utp','u-ftp','s-ftp') OR
    NEW.copper_pinout NOT IN ('straight','crossover') OR
    NEW.dac_media NOT IN ('passive','active','aoc') OR
    NEW.dac_direction NOT IN ('bidirectional','a-to-b','b-to-a')
  `;
  await knex.raw(`CREATE TRIGGER segments_cable_values_insert BEFORE INSERT ON segments WHEN ${invalid} BEGIN SELECT RAISE(ABORT, 'invalid cable schedule values'); END`);
  await knex.raw(`CREATE TRIGGER segments_cable_values_update BEFORE UPDATE ON segments WHEN ${invalid} BEGIN SELECT RAISE(ABORT, 'invalid cable schedule values'); END`);
}

exports.up = async function up(knex) {
  // Additive native ALTER statements preserve candidate rows and avoid SQLite
  // table rebuilds around the completed-package lock triggers.
  await knex.raw("ALTER TABLE segments ADD COLUMN from_endpoint_mode text NOT NULL DEFAULT 'legacy'");
  await knex.raw("ALTER TABLE segments ADD COLUMN from_port text NOT NULL DEFAULT ''");
  await knex.raw('ALTER TABLE segments ADD COLUMN from_device_id integer REFERENCES devices(id) ON DELETE RESTRICT');
  await knex.raw('ALTER TABLE segments ADD COLUMN from_termination_position_id integer REFERENCES termination_positions(id) ON DELETE RESTRICT');
  await knex.raw('ALTER TABLE segments ADD COLUMN from_room_id integer REFERENCES rooms(id) ON DELETE SET NULL');
  await knex.raw('ALTER TABLE segments ADD COLUMN from_rack_id integer REFERENCES racks(id) ON DELETE SET NULL');
  await knex.raw("ALTER TABLE segments ADD COLUMN to_endpoint_mode text NOT NULL DEFAULT 'legacy'");
  await knex.raw("ALTER TABLE segments ADD COLUMN to_port text NOT NULL DEFAULT ''");
  await knex.raw('ALTER TABLE segments ADD COLUMN to_device_id integer REFERENCES devices(id) ON DELETE RESTRICT');
  await knex.raw('ALTER TABLE segments ADD COLUMN to_termination_position_id integer REFERENCES termination_positions(id) ON DELETE RESTRICT');
  await knex.raw('ALTER TABLE segments ADD COLUMN to_room_id integer REFERENCES rooms(id) ON DELETE SET NULL');
  await knex.raw('ALTER TABLE segments ADD COLUMN to_rack_id integer REFERENCES racks(id) ON DELETE SET NULL');
  await knex.raw("ALTER TABLE segments ADD COLUMN from_connector text NOT NULL DEFAULT 'lc'");
  await knex.raw("ALTER TABLE segments ADD COLUMN to_connector text NOT NULL DEFAULT 'lc'");
  await knex.raw("ALTER TABLE segments ADD COLUMN fibre_type text NOT NULL DEFAULT 'OS2'");
  await knex.raw("ALTER TABLE segments ADD COLUMN fibre_mode text NOT NULL DEFAULT 'singlemode'");
  await knex.raw('ALTER TABLE segments ADD COLUMN fibre_simplex integer NOT NULL DEFAULT 0');
  await knex.raw('ALTER TABLE segments ADD COLUMN stock_length_metres decimal(12,3)');
  await knex.raw("ALTER TABLE segments ADD COLUMN item_type text NOT NULL DEFAULT 'patch-lead'");
  await knex.raw("ALTER TABLE segments ADD COLUMN copper_category text NOT NULL DEFAULT 'cat6a'");
  await knex.raw("ALTER TABLE segments ADD COLUMN copper_shielding text NOT NULL DEFAULT 'utp'");
  await knex.raw("ALTER TABLE segments ADD COLUMN copper_pinout text NOT NULL DEFAULT 'straight'");
  await knex.raw("ALTER TABLE segments ADD COLUMN dac_connector text NOT NULL DEFAULT 'sfp28'");
  await knex.raw("ALTER TABLE segments ADD COLUMN dac_media text NOT NULL DEFAULT 'passive'");
  await knex.raw("ALTER TABLE segments ADD COLUMN dac_direction text NOT NULL DEFAULT 'bidirectional'");
  await knex.raw('CREATE INDEX segments_from_device_index ON segments(from_device_id)');
  await knex.raw('CREATE INDEX segments_to_device_index ON segments(to_device_id)');
  await knex.raw('CREATE INDEX segments_from_termination_index ON segments(from_termination_position_id)');
  await knex.raw('CREATE INDEX segments_to_termination_index ON segments(to_termination_position_id)');
  await createTriggers(knex);
};

exports.down = async function down(knex) {
  await dropTriggers(knex);
  for (const name of ['segments_to_termination_index', 'segments_from_termination_index', 'segments_to_device_index', 'segments_from_device_index']) await knex.raw(`DROP INDEX IF EXISTS ${name}`);
  for (const column of SEGMENT_COLUMNS) await knex.raw(`ALTER TABLE segments DROP COLUMN ${column}`);
};
