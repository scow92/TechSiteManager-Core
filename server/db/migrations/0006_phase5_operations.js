'use strict';

const TRIGGERS = [
  'users_account_status_insert', 'users_account_status_update',
  'engineer_profiles_values_insert', 'engineer_profiles_values_update',
  'fibre_sku_values_insert', 'fibre_sku_values_update'
];

async function dropTriggers(knex) {
  for (const name of TRIGGERS) await knex.raw(`DROP TRIGGER IF EXISTS ${name}`);
}

async function createTriggers(knex) {
  await dropTriggers(knex);
  const userInvalid = "NEW.account_status NOT IN ('requested','approved','rejected') OR (NEW.account_status = 'requested' AND NEW.active <> 0) OR (NEW.account_status = 'rejected' AND NEW.active <> 0) OR (NEW.active = 1 AND NEW.account_status <> 'approved')";
  await knex.raw(`CREATE TRIGGER users_account_status_insert BEFORE INSERT ON users WHEN ${userInvalid} BEGIN SELECT RAISE(ABORT, 'invalid account status'); END`);
  await knex.raw(`CREATE TRIGGER users_account_status_update BEFORE UPDATE ON users WHEN ${userInvalid} BEGIN SELECT RAISE(ABORT, 'invalid account status'); END`);
  const profileInvalid = "trim(NEW.assignment_name) = '' OR NEW.weekly_capacity_hours < 0 OR NEW.weekly_capacity_hours > 168";
  await knex.raw(`CREATE TRIGGER engineer_profiles_values_insert BEFORE INSERT ON engineer_profiles WHEN ${profileInvalid} BEGIN SELECT RAISE(ABORT, 'invalid engineer profile'); END`);
  await knex.raw(`CREATE TRIGGER engineer_profiles_values_update BEFORE UPDATE ON engineer_profiles WHEN ${profileInvalid} BEGIN SELECT RAISE(ABORT, 'invalid engineer profile'); END`);
  const skuInvalid = "trim(NEW.sku) = '' OR NEW.item_type NOT IN ('patch-lead','trunk','pigtail','other') OR NEW.fibre_mode NOT IN ('singlemode','multimode') OR NEW.from_connector NOT IN ('lc','sc','mpo','mtp','fc','st','none') OR NEW.to_connector NOT IN ('lc','sc','mpo','mtp','fc','st','none') OR NEW.simplex NOT IN (0,1) OR NEW.length_metres <= 0 OR NEW.length_metres > 1000000 OR NEW.unit_price < 0 OR NEW.unit_price > 1000000000 OR NEW.active NOT IN (0,1)";
  await knex.raw(`CREATE TRIGGER fibre_sku_values_insert BEFORE INSERT ON fibre_sku_catalogue WHEN ${skuInvalid} BEGIN SELECT RAISE(ABORT, 'invalid fibre SKU'); END`);
  await knex.raw(`CREATE TRIGGER fibre_sku_values_update BEFORE UPDATE ON fibre_sku_catalogue WHEN ${skuInvalid} BEGIN SELECT RAISE(ABORT, 'invalid fibre SKU'); END`);
}

exports.up = async function up(knex) {
  // Existing users were provisioned under the earlier lifecycle and therefore
  // remain approved. New self-service requests explicitly set requested.
  await knex.raw("ALTER TABLE users ADD COLUMN account_status text NOT NULL DEFAULT 'approved'");
  await knex.raw('ALTER TABLE users ADD COLUMN requested_at datetime');
  await knex.raw('ALTER TABLE users ADD COLUMN approved_at datetime');
  await knex.raw('ALTER TABLE users ADD COLUMN approved_by_user_id integer REFERENCES users(id) ON DELETE SET NULL');
  await knex.raw("UPDATE users SET approved_at = coalesce(updated_at, created_at, CURRENT_TIMESTAMP)");

  await knex.schema.createTable('engineer_profiles', (table) => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    table.text('assignment_name').notNullable();
    table.text('job_title').notNullable().defaultTo('');
    table.decimal('weekly_capacity_hours', 6, 2).notNullable().defaultTo(40);
    table.integer('version').notNullable().defaultTo(0);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE UNIQUE INDEX engineer_profiles_assignment_name_lower_unique ON engineer_profiles(lower(assignment_name))');

  await knex.schema.createTable('push_subscriptions', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('endpoint').notNullable().unique();
    table.text('p256dh').notNullable();
    table.text('auth').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'endpoint']);
  });

  await knex.schema.createTable('fibre_sku_catalogue', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.text('sku').notNullable();
    table.text('description').notNullable();
    table.text('item_type').notNullable().defaultTo('patch-lead');
    table.text('fibre_type').notNullable().defaultTo('OS2');
    table.text('fibre_mode').notNullable().defaultTo('singlemode');
    table.text('from_connector').notNullable().defaultTo('lc');
    table.text('to_connector').notNullable().defaultTo('lc');
    table.boolean('simplex').notNullable().defaultTo(false);
    table.decimal('length_metres', 12, 3).notNullable();
    table.decimal('unit_price', 12, 4).notNullable().defaultTo(0);
    table.boolean('active').notNullable().defaultTo(true);
    table.integer('version').notNullable().defaultTo(0);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE UNIQUE INDEX fibre_sku_catalogue_sku_lower_unique ON fibre_sku_catalogue(lower(sku))');
  await knex.raw('CREATE INDEX fibre_sku_match_index ON fibre_sku_catalogue(item_type, fibre_type, fibre_mode, from_connector, to_connector, simplex, length_metres, active)');
  await createTriggers(knex);
};

exports.down = async function down(knex) {
  await dropTriggers(knex);
  await knex.schema.dropTableIfExists('fibre_sku_catalogue');
  await knex.schema.dropTableIfExists('push_subscriptions');
  await knex.schema.dropTableIfExists('engineer_profiles');
  await knex.raw('ALTER TABLE users DROP COLUMN approved_by_user_id');
  await knex.raw('ALTER TABLE users DROP COLUMN approved_at');
  await knex.raw('ALTER TABLE users DROP COLUMN requested_at');
  await knex.raw('ALTER TABLE users DROP COLUMN account_status');
};
