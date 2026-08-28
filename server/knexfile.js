'use strict';

const path = require('path');
const config = require('./config');

const base = {
  client: 'better-sqlite3',
  connection: { filename: config.dbFile },
  useNullAsDefault: true,
  migrations: { directory: path.join(__dirname, 'db', 'migrations') },
  pool: {
    afterCreate(connection, done) {
      connection.pragma('foreign_keys = ON');
      connection.pragma('journal_mode = WAL');
      connection.pragma('busy_timeout = 5000');
      done(null, connection);
    }
  }
};

module.exports = { development: base, test: base, production: base };
