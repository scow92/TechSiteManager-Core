'use strict';

const { httpError } = require('./errors');

/** @param {import('knex').Knex | import('knex').Knex.Transaction} trx @param {string} entityType @param {string} publicId */
async function packageForEntity(trx, entityType, publicId) {
  if (entityType === 'work_package' || entityType === 'work-package') return trx('work_packages').where({ public_id: publicId }).first();
  if (entityType === 'work_item' || entityType === 'work-item') return trx('work_packages as w').join('work_items as i', 'i.work_package_id', 'w.id').where('i.public_id', publicId).select('w.*').first();
  if (entityType === 'circuit') return trx('work_packages as w').join('circuits as c', 'c.work_package_id', 'w.id').where('c.public_id', publicId).select('w.*').first();
  if (entityType === 'segment') return trx('work_packages as w').join('circuits as c', 'c.work_package_id', 'w.id').join('segments as s', 's.circuit_id', 'c.id').where('s.public_id', publicId).select('w.*').first();
  if (entityType === 'consumable_requirement' || entityType === 'consumable-requirement') return trx('work_packages as w').join('consumable_requirements as r', 'r.work_package_id', 'w.id').where('r.public_id', publicId).select('w.*').first();
  return null;
}

/** @param {{ status?: string } | null | undefined} pack */
function assertMutable(pack) {
  if (pack?.status === 'complete') throw httpError(423, 'work_package_complete', 'Reopen the completed work package before making changes');
}

/** @param {import('knex').Knex | import('knex').Knex.Transaction} trx @param {string} entityType @param {string} publicId */
async function assertEntityMutable(trx, entityType, publicId) {
  const pack = await packageForEntity(trx, entityType, publicId);
  if (pack) assertMutable(pack);
  if (entityType === 'work_item' || entityType === 'work-item') {
    const item = await trx('work_items').where({ public_id: publicId }).first();
    if (item?.status === 'complete') throw httpError(423, 'work_item_complete', 'Clear work-item completion before editing it');
  }
  return pack;
}

module.exports = { packageForEntity, assertMutable, assertEntityMutable };
