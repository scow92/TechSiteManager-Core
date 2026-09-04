'use strict';

const crypto = require('crypto');
const express = require('express');
const db = require('../db/knex');
const auth = require('../lib/auth');
const audit = require('../lib/audit');
const bom = require('../lib/bom');
const { knownKeys, string, number, enumeration, integer, uuid } = require('../lib/validation');
const { httpError } = require('../lib/errors');

const router = express.Router();
router.use(auth.requireSession);

/** @param {Record<string, any>} body */
function baseVersion(body) {
  if (!Number.isInteger(body._baseVersion)) throw httpError(428, 'base_version_required', '_baseVersion is required');
  return integer(body._baseVersion, '_baseVersion', { required: true, min: 0 });
}

/** @param {Record<string, any>} body */
function skuValues(body) {
  return {
    sku: string(body.sku, 'sku', { required: true, max: 120 }),
    description: string(body.description, 'description', { required: true, max: 255 }),
    item_type: enumeration(body.itemType, 'itemType', ['patch-lead', 'trunk', 'pigtail', 'other'], true),
    fibre_type: string(body.fibreType, 'fibreType', { required: true, max: 64 }),
    fibre_mode: enumeration(body.fibreMode, 'fibreMode', ['singlemode', 'multimode'], true),
    from_connector: enumeration(body.fromConnector, 'fromConnector', ['lc', 'sc', 'mpo', 'mtp', 'fc', 'st', 'none'], true),
    to_connector: enumeration(body.toConnector, 'toConnector', ['lc', 'sc', 'mpo', 'mtp', 'fc', 'st', 'none'], true),
    simplex: body.simplex === true ? 1 : 0,
    length_metres: number(body.lengthMetres, 'lengthMetres', { required: true, min: Number.EPSILON, max: 1_000_000 }),
    unit_price: number(body.unitPrice === undefined ? 0 : body.unitPrice, 'unitPrice', { required: true, min: 0, max: 1_000_000_000 }),
    active: body.active === false ? 0 : 1
  };
}

router.get('/catalogue/fibre-skus', async (_req, res, next) => {
  try { res.json((await db('fibre_sku_catalogue').orderBy(['sku', 'length_metres'])).map(bom.publicSku)); } catch (error) { next(error); }
});

router.post('/catalogue/fibre-skus', auth.requireAdmin, async (req, res, next) => {
  try {
    if (!req.user) throw new Error('authenticated route missing user');
    const actorUserId = req.user.id;
    knownKeys(req.body, ['sku', 'description', 'itemType', 'fibreType', 'fibreMode', 'fromConnector', 'toConnector', 'simplex', 'lengthMetres', 'unitPrice', 'active']);
    if (req.body.simplex !== undefined && typeof req.body.simplex !== 'boolean') throw httpError(422, 'invalid_field', 'simplex is invalid', 'simplex');
    const publicId = crypto.randomUUID();
    const created = await db.transaction(async (trx) => {
      const [rowId] = await trx('fibre_sku_catalogue').insert({ public_id: publicId, ...skuValues(req.body) });
      await audit.record(trx, actorUserId, 'fibre_sku.create', 'fibre_sku', publicId);
      return trx('fibre_sku_catalogue').where({ id: rowId }).first();
    });
    res.status(201).json(bom.publicSku(created));
  } catch (error) { next(error); }
});

router.put('/catalogue/fibre-skus/:publicId', auth.requireAdmin, async (req, res, next) => {
  try {
    if (!req.user) throw new Error('authenticated route missing user');
    const actorUserId = req.user.id;
    knownKeys(req.body, ['sku', 'description', 'itemType', 'fibreType', 'fibreMode', 'fromConnector', 'toConnector', 'simplex', 'lengthMetres', 'unitPrice', 'active', '_baseVersion']);
    if (typeof req.body.simplex !== 'boolean' || typeof req.body.active !== 'boolean') throw httpError(422, 'invalid_field', 'simplex and active must be booleans');
    const requestedVersion = Number(baseVersion(req.body));
    const updated = await db.transaction(async (trx) => {
      const count = await trx('fibre_sku_catalogue').where({ public_id: uuid(req.params.publicId, 'publicId'), version: requestedVersion }).update({ ...skuValues(req.body), version: requestedVersion + 1, updated_at: trx.fn.now() });
      if (!count) {
        const current = await trx('fibre_sku_catalogue').where({ public_id: req.params.publicId }).first();
        if (!current) throw httpError(404, 'fibre_sku_not_found', 'Fibre SKU not found');
        const conflict = httpError(409, 'version_conflict', 'The fibre SKU changed since it was loaded'); conflict.serverVersion = current.version; throw conflict;
      }
      await audit.record(trx, actorUserId, 'fibre_sku.update', 'fibre_sku', String(req.params.publicId));
      return trx('fibre_sku_catalogue').where({ public_id: req.params.publicId }).first();
    });
    res.json(bom.publicSku(updated));
  } catch (error) { next(error); }
});

router.delete('/catalogue/fibre-skus/:publicId', auth.requireAdmin, async (req, res, next) => {
  try {
    if (!req.user) throw new Error('authenticated route missing user');
    const actorUserId = req.user.id;
    const requestedVersion = integer(Number(req.query.baseVersion), 'baseVersion', { required: true, min: 0 });
    await db.transaction(async (trx) => {
      const count = await trx('fibre_sku_catalogue').where({ public_id: uuid(req.params.publicId, 'publicId'), version: requestedVersion }).delete();
      if (!count) {
        const current = await trx('fibre_sku_catalogue').where({ public_id: req.params.publicId }).first();
        if (!current) throw httpError(404, 'fibre_sku_not_found', 'Fibre SKU not found');
        throw httpError(409, 'version_conflict', 'The fibre SKU changed since it was loaded');
      }
      await audit.record(trx, actorUserId, 'fibre_sku.delete', 'fibre_sku', String(req.params.publicId));
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get('/work-packages/:publicId/bom', async (req, res, next) => {
  try { res.json(await bom.calculate(String(uuid(req.params.publicId, 'publicId')))); } catch (error) { next(error); }
});

/** @param {unknown} value */
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

router.get('/work-packages/:publicId/bom.csv', async (req, res, next) => {
  try {
    const result = await bom.calculate(String(uuid(req.params.publicId, 'publicId')));
    const rows = [['record_type', 'reference', 'description', 'match', 'length_metres', 'quantity', 'simplex_count', 'unit', 'unit_price', 'line_total', 'reason']];
    for (const line of result.fibreLines) rows.push(['fibre_sku', line.sku, line.description, 'matched', line.lengthMetres, line.quantity, line.simplexCount, 'each', line.unitPrice, line.lineTotal, '']);
    for (const line of result.consumables) rows.push(['consumable', line.catalogueReference || '', line.description, line.catalogueReference ? 'catalogue' : 'manual', '', line.quantity, '', line.unit, line.unitPrice, line.lineTotal, '']);
    for (const line of result.unmatched) rows.push(['unmatched_fibre', line.segmentReference, '', '', line.requiredLengthMetres, '', '', '', '', '', line.reason]);
    rows.push(['total', result.workPackage.packageReference, 'Combined estimated total', '', '', '', '', '', '', result.totals.combined, '']);
    res.type('text/csv').attachment(`${result.workPackage.packageReference.replace(/[^A-Za-z0-9._-]+/g, '_')}.bom.csv`).send(rows.map((row) => row.map(csvCell).join(',')).join('\n'));
  } catch (error) { next(error); }
});

module.exports = router;
