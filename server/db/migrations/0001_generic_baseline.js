'use strict';

exports.up = async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.text('username').notNullable();
    table.text('password_hash').notNullable();
    table.text('role').notNullable().defaultTo('engineer');
    table.text('display_name').notNullable();
    table.text('email');
    table.boolean('active').notNullable().defaultTo(false);
    table.integer('version').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE UNIQUE INDEX users_username_lower_unique ON users(lower(username))');

  await knex.schema.createTable('sessions', (table) => {
    table.text('token_hash').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw('CREATE INDEX sessions_expires_at_index ON sessions(expires_at)');

  await knex.schema.createTable('sites', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.text('code').notNullable().unique();
    table.text('name').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.integer('version').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('rooms', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['site_id', 'name']);
  });

  await knex.schema.createTable('racks', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.integer('room_id').references('id').inTable('rooms').onDelete('SET NULL');
    table.text('label').notNullable();
    table.text('suite_line').notNullable().defaultTo('');
    table.integer('size_units').notNullable().defaultTo(47);
    table.text('layout_json').notNullable().defaultTo('{}');
    table.text('rear_layout_json').notNullable().defaultTo('{}');
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['site_id', 'room_id', 'label']);
  });
  await knex.raw('CREATE UNIQUE INDEX racks_site_label_without_room_unique ON racks(site_id, label) WHERE room_id IS NULL');

  await knex.schema.createTable('termination_points', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.integer('room_id').references('id').inTable('rooms').onDelete('SET NULL');
    table.text('label').notNullable();
    table.text('kind').notNullable().defaultTo('odf');
    table.text('notes').notNullable().defaultTo('');
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['site_id', 'label']);
  });

  await knex.schema.createTable('devices', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.integer('rack_id').references('id').inTable('racks').onDelete('SET NULL');
    table.text('hostname').notNullable();
    table.text('label').notNullable().defaultTo('');
    table.text('device_key').notNullable();
    table.integer('rack_unit');
    table.integer('size_units').notNullable().defaultTo(1);
    table.text('side').notNullable().defaultTo('front');
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['site_id', 'hostname']);
    table.unique(['site_id', 'device_key']);
  });
  await knex.raw('CREATE UNIQUE INDEX devices_site_hostname_lower_unique ON devices(site_id, lower(hostname))');

  await knex.schema.createTable('work_packages', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('site_id').notNullable().references('id').inTable('sites').onDelete('RESTRICT');
    table.text('package_ref').notNullable().unique();
    table.text('external_reference');
    table.text('project_reference');
    table.text('title').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('status').notNullable().defaultTo('planned');
    table.text('lead_assignee');
    table.text('assignees_json').notNullable().defaultTo('[]');
    table.integer('version').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('work_items', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('work_package_id').notNullable().references('id').inTable('work_packages').onDelete('CASCADE');
    table.text('item_reference').notNullable();
    table.text('title').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('status').notNullable().defaultTo('planned');
    table.integer('sequence').notNullable().defaultTo(0);
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['work_package_id', 'item_reference']);
  });

  await knex.schema.createTable('circuits', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('work_package_id').notNullable().references('id').inTable('work_packages').onDelete('CASCADE');
    table.text('circuit_reference').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('media').notNullable();
    table.text('status').notNullable().defaultTo('planned');
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['work_package_id', 'circuit_reference']);
  });

  await knex.schema.createTable('segments', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('circuit_id').notNullable().references('id').inTable('circuits').onDelete('CASCADE');
    table.text('segment_reference').notNullable();
    table.integer('sequence').notNullable().defaultTo(0);
    table.text('from_endpoint').notNullable();
    table.text('to_endpoint').notNullable();
    table.decimal('length_metres', 12, 3);
    table.text('notes').notNullable().defaultTo('');
    table.integer('version').notNullable().defaultTo(0);
    table.unique(['circuit_id', 'segment_reference']);
  });

  await knex.schema.createTable('consumable_catalogue', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.text('catalogue_reference').notNullable().unique();
    table.text('description').notNullable();
    table.decimal('estimated_unit_price', 12, 4);
    table.text('unit').notNullable().defaultTo('each');
    table.boolean('active').notNullable().defaultTo(true);
    table.integer('version').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('consumable_requirements', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('work_package_id').notNullable().references('id').inTable('work_packages').onDelete('CASCADE');
    table.integer('catalogue_id').references('id').inTable('consumable_catalogue').onDelete('SET NULL');
    table.text('description').notNullable();
    table.decimal('quantity_required', 12, 3).notNullable();
    table.text('unit').notNullable().defaultTo('each');
  });

  await knex.schema.createTable('distance_samples', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('site_id').notNullable().references('id').inTable('sites').onDelete('CASCADE');
    table.text('endpoint_a').notNullable();
    table.text('endpoint_b').notNullable();
    table.text('media').notNullable();
    table.decimal('length_metres', 12, 3).notNullable();
    table.timestamp('observed_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('photos', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.text('entity_type').notNullable();
    table.text('entity_public_id').notNullable();
    table.text('name').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('media_type').notNullable();
    table.binary('content').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('import_sources', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.text('provider_id').notNullable();
    table.text('external_source_id').notNullable();
    table.text('display_reference');
    table.text('connector_id').notNullable();
    table.text('metadata_json').notNullable().defaultTo('{}');
    table.timestamp('first_seen_at').notNullable();
    table.timestamp('last_seen_at').notNullable();
    table.timestamp('absent_at');
    table.unique(['provider_id', 'external_source_id']);
  });

  await knex.schema.createTable('import_runs', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('source_id').notNullable().references('id').inTable('import_sources').onDelete('CASCADE');
    table.text('source_version');
    table.text('content_hash').notNullable();
    table.text('source_fingerprint').notNullable();
    table.text('provider_version').notNullable();
    table.text('profile_id');
    table.text('profile_hash');
    table.text('status').notNullable();
    table.integer('actor_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.integer('attempt_count').notNullable().defaultTo(1);
    table.text('counts_json').notNullable().defaultTo('{}');
    table.text('warning_codes_json').notNullable().defaultTo('[]');
    table.text('decisions_json').notNullable().defaultTo('{}');
    table.text('primary_entity_public_id');
    table.timestamp('started_at').notNullable();
    table.timestamp('finished_at');
    table.unique(['source_id', 'source_fingerprint']);
  });

  await knex.schema.createTable('import_entity_links', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('source_id').notNullable().references('id').inTable('import_sources').onDelete('CASCADE');
    table.text('source_record_key').notNullable();
    table.text('entity_type').notNullable();
    table.text('entity_public_id').notNullable();
    table.integer('first_run_id').notNullable().references('id').inTable('import_runs').onDelete('RESTRICT');
    table.integer('last_seen_run_id').notNullable().references('id').inTable('import_runs').onDelete('RESTRICT');
    table.timestamp('absent_at');
    table.text('reconciliation_state').notNullable().defaultTo('linked');
    table.unique(['source_id', 'source_record_key', 'entity_type']);
    table.unique(['source_id', 'entity_type', 'entity_public_id']);
  });

  await knex.schema.createTable('import_field_ownership', (table) => {
    table.increments('id').primary();
    table.text('entity_type').notNullable();
    table.text('entity_public_id').notNullable();
    table.text('field_path').notNullable();
    table.text('policy').notNullable();
    table.integer('source_link_id').references('id').inTable('import_entity_links').onDelete('SET NULL');
    table.text('last_source_value_json');
    table.text('last_applied_value_json');
    table.integer('last_run_id').references('id').inTable('import_runs').onDelete('SET NULL');
    table.timestamp('updated_at').notNullable();
    table.unique(['entity_type', 'entity_public_id', 'field_path']);
  });

  await knex.schema.createTable('import_drafts', (table) => {
    table.text('id').primary();
    table.integer('actor_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('provider_id').notNullable();
    table.text('draft_hash').notNullable();
    table.text('normalized_draft_json').notNullable();
    table.text('proposal_json').notNullable();
    table.text('target_versions_json').notNullable();
    table.timestamp('created_at').notNullable();
    table.timestamp('expires_at').notNullable();
    table.integer('applied_run_id').references('id').inTable('import_runs').onDelete('SET NULL');
  });

  await knex.schema.createTable('audit_events', (table) => {
    table.increments('id').primary();
    table.text('public_id').notNullable().unique();
    table.integer('actor_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.text('action').notNullable();
    table.text('entity_type').notNullable();
    table.text('entity_public_id');
    table.text('metadata_json').notNullable().defaultTo('{}');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE TRIGGER users_role_insert BEFORE INSERT ON users WHEN NEW.role NOT IN ('admin','manager','engineer','viewer') BEGIN SELECT RAISE(ABORT, 'invalid role'); END");
  await knex.raw("CREATE TRIGGER users_role_update BEFORE UPDATE OF role ON users WHEN NEW.role NOT IN ('admin','manager','engineer','viewer') BEGIN SELECT RAISE(ABORT, 'invalid role'); END");
  await knex.raw("CREATE TRIGGER work_packages_status_insert BEFORE INSERT ON work_packages WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work package status'); END");
  await knex.raw("CREATE TRIGGER work_packages_status_update BEFORE UPDATE OF status ON work_packages WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work package status'); END");
  await knex.raw("CREATE TRIGGER work_items_status_insert BEFORE INSERT ON work_items WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work item status'); END");
  await knex.raw("CREATE TRIGGER work_items_status_update BEFORE UPDATE OF status ON work_items WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid work item status'); END");
  await knex.raw("CREATE TRIGGER circuits_status_insert BEFORE INSERT ON circuits WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid circuit status'); END");
  await knex.raw("CREATE TRIGGER circuits_status_update BEFORE UPDATE OF status ON circuits WHEN NEW.status NOT IN ('planned','active','blocked','complete','cancelled') BEGIN SELECT RAISE(ABORT, 'invalid circuit status'); END");
  await knex.raw("CREATE TRIGGER racks_bounds_insert BEFORE INSERT ON racks WHEN NEW.size_units < 1 OR NEW.size_units > 100 BEGIN SELECT RAISE(ABORT, 'invalid rack size'); END");
  await knex.raw("CREATE TRIGGER racks_bounds_update BEFORE UPDATE OF size_units ON racks WHEN NEW.size_units < 1 OR NEW.size_units > 100 BEGIN SELECT RAISE(ABORT, 'invalid rack size'); END");
  await knex.raw("CREATE TRIGGER devices_values_insert BEFORE INSERT ON devices WHEN NEW.hostname <> lower(NEW.hostname) OR NEW.size_units < 1 OR NEW.size_units > 100 OR NEW.side NOT IN ('front','rear') OR (NEW.rack_unit IS NOT NULL AND (NEW.rack_unit < 1 OR NEW.rack_unit > 100)) BEGIN SELECT RAISE(ABORT, 'invalid device values'); END");
  await knex.raw("CREATE TRIGGER devices_values_update BEFORE UPDATE ON devices WHEN NEW.hostname <> lower(NEW.hostname) OR NEW.size_units < 1 OR NEW.size_units > 100 OR NEW.side NOT IN ('front','rear') OR (NEW.rack_unit IS NOT NULL AND (NEW.rack_unit < 1 OR NEW.rack_unit > 100)) BEGIN SELECT RAISE(ABORT, 'invalid device values'); END");
  await knex.raw("CREATE TRIGGER segment_length_insert BEFORE INSERT ON segments WHEN NEW.length_metres IS NOT NULL AND (NEW.length_metres < 0 OR NEW.length_metres > 1000000) BEGIN SELECT RAISE(ABORT, 'invalid segment length'); END");
  await knex.raw("CREATE TRIGGER segment_length_update BEFORE UPDATE OF length_metres ON segments WHEN NEW.length_metres IS NOT NULL AND (NEW.length_metres < 0 OR NEW.length_metres > 1000000) BEGIN SELECT RAISE(ABORT, 'invalid segment length'); END");
  await knex.raw("CREATE TRIGGER consumable_quantity_insert BEFORE INSERT ON consumable_requirements WHEN NEW.quantity_required <= 0 BEGIN SELECT RAISE(ABORT, 'quantity must be positive'); END");
  await knex.raw("CREATE TRIGGER consumable_quantity_update BEFORE UPDATE OF quantity_required ON consumable_requirements WHEN NEW.quantity_required <= 0 BEGIN SELECT RAISE(ABORT, 'quantity must be positive'); END");
  await knex.raw("CREATE TRIGGER catalogue_price_insert BEFORE INSERT ON consumable_catalogue WHEN NEW.estimated_unit_price IS NOT NULL AND NEW.estimated_unit_price < 0 BEGIN SELECT RAISE(ABORT, 'price must be non-negative'); END");
  await knex.raw("CREATE TRIGGER catalogue_price_update BEFORE UPDATE OF estimated_unit_price ON consumable_catalogue WHEN NEW.estimated_unit_price IS NOT NULL AND NEW.estimated_unit_price < 0 BEGIN SELECT RAISE(ABORT, 'price must be non-negative'); END");
  await knex.raw("CREATE TRIGGER distance_length_insert BEFORE INSERT ON distance_samples WHEN NEW.length_metres <= 0 OR NEW.length_metres > 1000000 BEGIN SELECT RAISE(ABORT, 'invalid distance length'); END");
  await knex.raw("CREATE TRIGGER import_link_entity_insert BEFORE INSERT ON import_entity_links WHEN NEW.entity_type NOT IN ('work_package','work_item','circuit','segment') BEGIN SELECT RAISE(ABORT, 'invalid import entity type'); END");
  await knex.raw("CREATE TRIGGER import_link_state_insert BEFORE INSERT ON import_entity_links WHEN NEW.reconciliation_state NOT IN ('linked','absent') BEGIN SELECT RAISE(ABORT, 'invalid reconciliation state'); END");
  await knex.raw("CREATE TRIGGER import_link_state_update BEFORE UPDATE OF reconciliation_state ON import_entity_links WHEN NEW.reconciliation_state NOT IN ('linked','absent') BEGIN SELECT RAISE(ABORT, 'invalid reconciliation state'); END");
  await knex.raw("CREATE TRIGGER field_ownership_policy_insert BEFORE INSERT ON import_field_ownership WHEN NEW.policy NOT IN ('source-owned','user-owned','source-default','review-required') BEGIN SELECT RAISE(ABORT, 'invalid field ownership'); END");
  await knex.raw("CREATE TRIGGER field_ownership_policy_update BEFORE UPDATE OF policy ON import_field_ownership WHEN NEW.policy NOT IN ('source-owned','user-owned','source-default','review-required') BEGIN SELECT RAISE(ABORT, 'invalid field ownership'); END");
};

exports.down = async function down(knex) {
  const tables = [
    'audit_events', 'import_drafts', 'import_field_ownership', 'import_entity_links',
    'import_runs', 'import_sources', 'photos', 'distance_samples',
    'consumable_requirements', 'consumable_catalogue', 'segments', 'circuits',
    'work_items', 'work_packages', 'devices', 'termination_points', 'racks',
    'rooms', 'sites', 'sessions', 'users'
  ];
  for (const table of tables) await knex.schema.dropTableIfExists(table);
};
