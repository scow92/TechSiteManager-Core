'use strict';

const db = require('../db/knex');
const { httpError } = require('./errors');

/** @param {Record<string, any>} sku @param {Record<string, any>} segment */
function connectorPairMatches(sku, segment) {
  return (sku.from_connector === segment.from_connector && sku.to_connector === segment.to_connector)
    || (sku.from_connector === segment.to_connector && sku.to_connector === segment.from_connector);
}

/** @param {Record<string, any>} sku @param {Record<string, any>} segment */
function compatible(sku, segment) {
  return sku.active && sku.item_type === segment.item_type && sku.fibre_type === segment.fibre_type
    && sku.fibre_mode === segment.fibre_mode && Boolean(sku.simplex) === Boolean(segment.fibre_simplex)
    && connectorPairMatches(sku, segment);
}

/** @param {Record<string, any>} row */
function publicSku(row) {
  return {
    publicId: row.public_id, sku: row.sku, description: row.description, itemType: row.item_type,
    fibreType: row.fibre_type, fibreMode: row.fibre_mode, fromConnector: row.from_connector,
    toConnector: row.to_connector, simplex: Boolean(row.simplex), lengthMetres: Number(row.length_metres),
    unitPrice: Number(row.unit_price), active: Boolean(row.active), version: row.version
  };
}

/** @param {string} workPackagePublicId @param {import('knex').Knex | import('knex').Knex.Transaction} [trx] */
async function calculate(workPackagePublicId, trx = db) {
  const pack = await trx('work_packages as w').join('sites as s', 's.id', 'w.site_id')
    .where('w.public_id', workPackagePublicId).select('w.*', 's.code as site_code').first();
  if (!pack) throw httpError(404, 'work_package_not_found', 'Work package not found');
  const [segments, skus, requirements] = await Promise.all([
    trx('segments as g').join('circuits as c', 'c.id', 'g.circuit_id').where({ 'c.work_package_id': pack.id, 'c.media': 'fibre' })
      .select('g.*', 'c.circuit_reference').orderBy(['c.id', 'g.sequence', 'g.id']),
    trx('fibre_sku_catalogue').orderBy(['length_metres', 'sku']),
    trx('consumable_requirements as r').leftJoin('consumable_catalogue as c', 'c.id', 'r.catalogue_id')
      .where({ 'r.work_package_id': pack.id }).select('r.*', 'c.catalogue_reference', 'c.estimated_unit_price')
  ]);
  const matches = [];
  const unmatched = [];
  for (const segment of segments) {
    const requiredLength = segment.stock_length_metres === null ? Number(segment.length_metres) : Number(segment.stock_length_metres);
    const validLength = Number.isFinite(requiredLength) && requiredLength > 0 ? requiredLength : null;
    const base = { segmentPublicId: segment.public_id, circuitReference: segment.circuit_reference, segmentReference: segment.segment_reference, requiredLengthMetres: validLength };
    if (!base.requiredLengthMetres) {
      unmatched.push({ ...base, reason: 'missing-length', message: 'Record a stock or measured length before matching.' });
      continue;
    }
    const candidates = skus.filter((sku) => compatible(sku, segment));
    if (!candidates.length) {
      unmatched.push({ ...base, reason: 'no-compatible-sku', message: 'No active SKU exactly matches the fibre attributes and connector pair.' });
      continue;
    }
    const selected = candidates.find((sku) => Number(sku.length_metres) === requiredLength)
      || candidates.find((sku) => Number(sku.length_metres) >= requiredLength);
    if (!selected) {
      unmatched.push({ ...base, reason: 'no-sufficient-length', message: 'Compatible SKUs exist, but none is long enough.' });
      continue;
    }
    const quantity = segment.fibre_simplex ? 2 : 1;
    matches.push({ ...base, sku: publicSku(selected), matchType: Number(selected.length_metres) === base.requiredLengthMetres ? 'exact' : 'next-up', quantity, simplexCount: quantity, lineTotal: quantity * Number(selected.unit_price) });
  }
  const linesBySku = new Map();
  for (const match of matches) {
    const line = linesBySku.get(match.sku.publicId) || { ...match.sku, quantity: 0, simplexCount: 0, lineTotal: 0, segmentReferences: [] };
    line.quantity += match.quantity; line.simplexCount += match.simplexCount; line.lineTotal += match.lineTotal; line.segmentReferences.push(match.segmentReference);
    linesBySku.set(match.sku.publicId, line);
  }
  const consumables = requirements.map((row) => ({
    publicId: row.public_id, catalogueReference: row.catalogue_reference || null, description: row.description,
    quantity: Number(row.quantity_required), unit: row.unit, unitPrice: row.estimated_unit_price === null ? null : Number(row.estimated_unit_price),
    lineTotal: row.estimated_unit_price === null ? null : Number(row.quantity_required) * Number(row.estimated_unit_price)
  }));
  const fibreLines = [...linesBySku.values()];
  const fibreTotal = fibreLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const consumableTotal = consumables.reduce((sum, line) => sum + (line.lineTotal || 0), 0);
  return {
    workPackage: { publicId: pack.public_id, packageReference: pack.package_ref, siteCode: pack.site_code },
    fibreLines, matches, unmatched, consumables,
    totals: { fibre: fibreTotal, consumables: consumableTotal, combined: fibreTotal + consumableTotal }
  };
}

module.exports = { calculate, publicSku };
