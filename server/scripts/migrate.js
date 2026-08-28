'use strict';

const db = require('../db/knex');

db.migrate.latest()
  .then(() => db.destroy())
  .catch((error) => {
    console.error('Migration failed');
    if (process.env.NODE_ENV !== 'production') console.error(error.message);
    process.exitCode = 1;
  });
