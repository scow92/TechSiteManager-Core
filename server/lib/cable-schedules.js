'use strict';

const audit = require('./audit');
const { httpError } = require('./errors');
const { knownKeys, string, integer, number, enumeration, uuid } = require('./validation');

const ENDPOINT_MODES = ['legacy', 'device', 'odf'];
const MEDIA = ['fibre', 'copper', 'dac'];
const CONNECTORS = ['lc', 'sc', 'mpo', 'mtp', 'fc', 'st', 'rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp+', 'qsfp28', 'qsfp56', 'qsfp-dd', 'none'];
const FIBRE_TYPES = ['OS1', 'OS2', 'OM1', 'OM2', 'OM3', 'OM4', 'OM5'];
const FIBRE_MODES = ['singlemode', 'multimode'];
const ITEM_TYPES = ['patch-lead', 'trunk', 'pigtail', 'field-terminated'];
const COPPER_CATEGORIES = ['cat5e', 'cat6', 'cat6a', 'cat7', 'cat8'];
const COPPER_SHIELDING = ['utp', 'f-utp', 'u-ftp', 's-ftp'];
const COPPER_PINOUTS = ['straight', 'crossover'];
const DAC_CONNECTORS = ['sfp', 'sfp+', 'sfp28', 'qsfp+', 'qsfp28', 'qsfp56', 'qsfp-dd'];
const DAC_MEDIA = ['passive', 'active', 'aoc'];
const DAC_DIRECTIONS = ['bidirectional', 'a-to-b', 'b-to-a'];

function boolean(value, path, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw httpError(422, 'invalid_field', `${path} is invalid`, path);
  return value;
}

async function endpointValues(trx, value, side, path, siteId) {
  const mode = enumeration(value[`${side}EndpointMode`] || 'legacy', `${path}.${side}EndpointMode`, ENDPOINT_MODES, true);
  const endpoint = string(value[`${side}Endpoint`], `${path}.${side}Endpoint`, { required: mode === 'legacy', max: 255 }) || '';
  const port = string(value[`${side}Port`], `${path}.${side}Port`, { max: 120 }) || '';
  const output = {
    [`${side}_endpoint_mode`]: mode,
    [`${side}_endpoint`]: endpoint,
    [`${side}_port`]: port,
    [`${side}_device_id`]: null,
    [`${side}_termination_position_id`]: null,
    [`${side}_room_id`]: null,
    [`${side}_rack_id`]: null
  };
  if (mode === 'legacy') {
    if (value[`${side}DevicePublicId`] || value[`${side}TerminationPositionPublicId`]) throw httpError(422, 'endpoint_mode_mismatch', `${path}.${side}Endpoint does not match its endpoint mode`, `${path}.${side}EndpointMode`);
    return output;
  }
  if (mode === 'device') {
    const publicId = uuid(value[`${side}DevicePublicId`], `${path}.${side}DevicePublicId`);
    const device = await trx('devices').where({ public_id: publicId, site_id: siteId }).first();
    if (!device) throw httpError(422, 'endpoint_device_site_mismatch', `${side === 'from' ? 'From' : 'To'} device does not belong to the work-package site`, `${path}.${side}DevicePublicId`);
    if (!port) throw httpError(422, 'endpoint_port_required', `${side === 'from' ? 'From' : 'To'} device port is required`, `${path}.${side}Port`);
    output[`${side}_endpoint`] = `${device.hostname}:${port}`;
    output[`${side}_device_id`] = device.id;
    output[`${side}_room_id`] = device.room_id;
    output[`${side}_rack_id`] = device.rack_id;
    return output;
  }
  const publicId = uuid(value[`${side}TerminationPositionPublicId`], `${path}.${side}TerminationPositionPublicId`);
  const position = await trx('termination_positions as p')
    .join('termination_points as t', 't.id', 'p.termination_point_id')
    .where({ 'p.public_id': publicId, 't.site_id': siteId })
    .select('p.*', 't.label as point_label', 't.room_id')
    .first();
  if (!position) throw httpError(422, 'endpoint_odf_site_mismatch', `${side === 'from' ? 'From' : 'To'} ODF position does not belong to the work-package site`, `${path}.${side}TerminationPositionPublicId`);
  output[`${side}_endpoint`] = `${position.point_label} · T${position.tray}/P${position.position}`;
  output[`${side}_port`] = `T${position.tray}/P${position.position}`;
  output[`${side}_termination_position_id`] = position.id;
  output[`${side}_room_id`] = position.room_id;
  return output;
}

function endpointIdentity(values, side) {
  if (values[`${side}_endpoint_mode`] === 'device') return `device:${values[`${side}_device_id`]}:${values[`${side}_port`]}`;
  if (values[`${side}_endpoint_mode`] === 'odf') return `odf:${values[`${side}_termination_position_id`]}`;
  return `legacy:${values[`${side}_endpoint`]}`;
}

async function segmentValues(trx, value, path, siteId, media) {
  const from = await endpointValues(trx, value, 'from', path, siteId);
  const to = await endpointValues(trx, value, 'to', path, siteId);
  const values = {
    segment_reference: string(value.segmentReference, `${path}.segmentReference`, { required: true, max: 255 }),
    sequence: integer(value.sequence, `${path}.sequence`, { required: true, min: 0, max: 100_000 }),
    ...from,
    ...to,
    length_metres: number(value.lengthMetres, `${path}.lengthMetres`, { min: 0, max: 1_000_000 }),
    notes: string(value.notes, `${path}.notes`, { max: 20_000 }) || '',
    from_connector: enumeration(value.fromConnector || (media === 'copper' ? 'rj45' : media === 'dac' ? 'sfp28' : 'lc'), `${path}.fromConnector`, CONNECTORS, true),
    to_connector: enumeration(value.toConnector || (media === 'copper' ? 'rj45' : media === 'dac' ? 'sfp28' : 'lc'), `${path}.toConnector`, CONNECTORS, true),
    fibre_type: enumeration(value.fibreType || 'OS2', `${path}.fibreType`, FIBRE_TYPES, true),
    fibre_mode: enumeration(value.fibreMode || 'singlemode', `${path}.fibreMode`, FIBRE_MODES, true),
    fibre_simplex: boolean(value.fibreSimplex, `${path}.fibreSimplex`) ? 1 : 0,
    stock_length_metres: number(value.stockLengthMetres, `${path}.stockLengthMetres`, { min: Number.EPSILON, max: 1_000_000 }),
    item_type: enumeration(value.itemType || 'patch-lead', `${path}.itemType`, ITEM_TYPES, true),
    copper_category: enumeration(value.copperCategory || 'cat6a', `${path}.copperCategory`, COPPER_CATEGORIES, true),
    copper_shielding: enumeration(value.copperShielding || 'utp', `${path}.copperShielding`, COPPER_SHIELDING, true),
    copper_pinout: enumeration(value.copperPinout || 'straight', `${path}.copperPinout`, COPPER_PINOUTS, true),
    dac_connector: enumeration(value.dacConnector || 'sfp28', `${path}.dacConnector`, DAC_CONNECTORS, true),
    dac_media: enumeration(value.dacMedia || 'passive', `${path}.dacMedia`, DAC_MEDIA, true),
    dac_direction: enumeration(value.dacDirection || 'bidirectional', `${path}.dacDirection`, DAC_DIRECTIONS, true)
  };
  if (endpointIdentity(values, 'from') === endpointIdentity(values, 'to')) throw httpError(422, 'cable_endpoints_equal', 'Cable endpoints must be different', path);
  if (media === 'fibre' && ((values.fibre_type.startsWith('OS')) !== (values.fibre_mode === 'singlemode'))) throw httpError(422, 'fibre_type_mode_mismatch', 'OS fibre must be singlemode and OM fibre must be multimode', `${path}.fibreMode`);
  if (media === 'copper' && (values.from_connector !== 'rj45' || values.to_connector !== 'rj45')) throw httpError(422, 'copper_connector_invalid', 'Copper rows require RJ45 connectors', path);
  if (media === 'dac' && (values.from_connector !== values.dac_connector || values.to_connector !== values.dac_connector)) throw httpError(422, 'dac_connector_mismatch', 'DAC endpoint connectors must match the DAC connector', path);
  return values;
}

function validateChain(segments, path) {
  const ordered = [...segments].sort((left, right) => left.values.sequence - right.values.sequence);
  for (let index = 1; index < ordered.length; index += 1) {
    const prior = ordered[index - 1].values;
    const current = ordered[index].values;
    if (prior.to_endpoint_mode === 'odf' || current.from_endpoint_mode === 'odf') {
      if (endpointIdentity(prior, 'to') !== endpointIdentity(current, 'from')) throw httpError(422, 'odf_chain_disconnected', 'Adjacent ODF hops must share the same termination position', `${path}.segments`);
    }
  }
}

async function applyRackChanges(trx, pack, changes, actorUserId) {
  const seenDevices = new Set();
  for (const [index, change] of changes.entries()) {
    const path = `scheduleRackChanges[${index}]`;
    knownKeys(change, ['devicePublicId', '_baseDeviceVersion', 'targetRackPublicId', 'newRack'], path);
    const devicePublicId = uuid(change.devicePublicId, `${path}.devicePublicId`);
    if (seenDevices.has(devicePublicId)) throw httpError(422, 'duplicate_rack_correction', 'A device can have only one rack correction per save', path);
    seenDevices.add(devicePublicId);
    const requestedVersion = integer(change._baseDeviceVersion, `${path}._baseDeviceVersion`, { required: true, min: 0 });
    const device = await trx('devices').where({ public_id: devicePublicId, site_id: pack.site_id }).first();
    if (!device) throw httpError(422, 'endpoint_device_site_mismatch', 'Rack correction device does not belong to the work-package site', `${path}.devicePublicId`);
    if (device.version !== requestedVersion) { const error = httpError(409, 'version_conflict', 'The canonical device location changed since it was loaded'); error.serverVersion = device.version; throw error; }
    let rack;
    if (change.targetRackPublicId && change.newRack) throw httpError(422, 'rack_target_ambiguous', 'Choose an existing rack or create a new rack', path);
    if (change.targetRackPublicId) rack = await trx('racks').where({ public_id: uuid(change.targetRackPublicId, `${path}.targetRackPublicId`), site_id: pack.site_id }).first();
    else {
      const input = change.newRack;
      knownKeys(input, ['publicId', 'roomPublicId', 'label', 'suiteLine', 'suiteLineConfirmed', 'sizeUnits'], `${path}.newRack`);
      const room = await trx('rooms').where({ public_id: uuid(input.roomPublicId, `${path}.newRack.roomPublicId`), site_id: pack.site_id }).first();
      if (!room) throw httpError(422, 'room_site_mismatch', 'New rack room does not belong to the work-package site', `${path}.newRack.roomPublicId`);
      const label = string(input.label, `${path}.newRack.label`, { required: true, max: 120 });
      if (await trx('racks').where({ site_id: pack.site_id, room_id: room.id }).whereRaw('lower(label) = lower(?)', [label]).first()) throw httpError(409, 'rack_duplicate', 'A rack with that label already exists in the room');
      const publicId = uuid(input.publicId, `${path}.newRack.publicId`);
      if (await trx('racks').where({ public_id: publicId }).first()) throw httpError(409, 'child_identity_conflict', 'The new rack publicId belongs to another record');
      const suiteLine = string(input.suiteLine, `${path}.newRack.suiteLine`, { max: 64 }) || '';
      const [rackId] = await trx('racks').insert({ public_id: publicId, site_id: pack.site_id, room_id: room.id, label, suite_line: suiteLine, suite_line_confirmed: boolean(input.suiteLineConfirmed, `${path}.newRack.suiteLineConfirmed`, Boolean(suiteLine)), size_units: integer(input.sizeUnits === undefined ? 47 : input.sizeUnits, `${path}.newRack.sizeUnits`, { required: true, min: 1, max: 100 }) });
      rack = await trx('racks').where({ id: rackId }).first();
      await audit.record(trx, actorUserId, 'rack.create_from_schedule', 'rack', publicId, { workPackagePublicId: pack.public_id });
    }
    if (!rack) throw httpError(422, 'rack_site_mismatch', 'Target rack does not belong to the work-package site', `${path}.targetRackPublicId`);
    if (device.rack_unit && device.rack_unit + device.size_units - 1 > rack.size_units) throw httpError(422, 'device_outside_rack', 'The device placement exceeds the corrected rack height', path);
    if (device.rack_unit) {
      const occupied = await trx('devices').where({ rack_id: rack.id, side: device.side }).whereNot({ id: device.id }).whereNotNull('rack_unit');
      const end = device.rack_unit + device.size_units - 1;
      if (occupied.some((row) => device.rack_unit <= row.rack_unit + row.size_units - 1 && end >= row.rack_unit)) throw httpError(409, 'rack_position_conflict', 'The corrected rack units are already occupied');
    }
    await trx('devices').where({ id: device.id, version: requestedVersion }).update({ rack_id: rack.id, room_id: rack.room_id, version: requestedVersion + 1 });
    await audit.record(trx, actorUserId, 'device.location_correct_from_schedule', 'device', device.public_id, { rackPublicId: rack.public_id, workPackagePublicId: pack.public_id });
  }
}

module.exports = { MEDIA, segmentValues, validateChain, applyRackChanges };
