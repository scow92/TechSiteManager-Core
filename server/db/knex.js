'use strict';

const knex = require('knex');
const config = require('../config');
const knexfile = require('../knexfile');

module.exports = knex(knexfile[config.environment]);
