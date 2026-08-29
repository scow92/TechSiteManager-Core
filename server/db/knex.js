'use strict';

const knex = require('knex');
const config = require('../config');
const knexfile = require('../knexfile');

const selected = config.environment === 'test' ? knexfile.test : config.environment === 'production' ? knexfile.production : knexfile.development;
module.exports = knex(selected);
