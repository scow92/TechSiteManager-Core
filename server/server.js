'use strict';

const path = require('path');
const config = require('./config');
const db = require('./db/knex');
const auth = require('./lib/auth');
const imports = require('./imports/service');
const { loadPlugins } = require('./plugins/loader');

async function start() {
  const registry = loadPlugins({ configFile: config.pluginConfigFile, searchRoot: path.join(__dirname, '..') });
  await db.migrate.latest();
  const app = require('./app')(registry);
  const server = app.listen(config.port, config.host, () => console.log(`TechSiteManager listening on ${config.host}:${config.port}`));
  const maintenance = setInterval(() => {
    Promise.all([auth.sweepExpiredSessions(), imports.expireDrafts()]).catch(() => console.error(JSON.stringify({ type: 'maintenance_error', code: 'sweep_failed' })));
  }, 60 * 60 * 1000);
  maintenance.unref();
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    clearInterval(maintenance);
    server.close(async () => { await db.destroy(); process.exit(0); });
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (require.main === module) start().catch((error) => {
  console.error(JSON.stringify({ type: 'startup_error', code: error.code || 'startup_failed' }));
  process.exit(1);
});

module.exports = { start };
