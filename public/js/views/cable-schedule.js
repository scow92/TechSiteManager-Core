import { api } from '../api.js';
import { el, errorMessage, notify } from '../dom.js';
import { flushAll, mutatePackage } from '../work-package-store.js';

/** @typedef {import('../../../server/types/browser-models').CableReferenceData} CableReferenceData */
/** @typedef {import('../../../server/types/browser-models').Circuit} Circuit */
/** @typedef {import('../../../server/types/browser-models').Segment} Segment */
/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').WorkPackage} WorkPackage */

const MEDIA_LABELS = { fibre: 'Fibre', copper: 'Copper', dac: 'DAC' };
const CONNECTORS = ['lc', 'sc', 'mpo', 'mtp', 'fc', 'st', 'none'];
const DAC_CONNECTORS = ['sfp', 'sfp+', 'sfp28', 'qsfp+', 'qsfp28', 'qsfp56', 'qsfp-dd'];
const STOCK_LENGTHS = [0.5, 1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 50, 75, 100];

/** @param {string} label @param {string} value */
function option(label, value = label) { return el('option', { value }, label); }

/** @param {string} label @param {string} value @param {readonly (string | { label: string, value: string })[]} options @param {boolean} editable */
function selectControl(label, value, options, editable) {
  const select = el('select', { 'aria-label': label, disabled: editable ? null : '' }, ...options.map((entry) => typeof entry === 'string' ? option(entry) : option(entry.label, entry.value)));
  select.value = value;
  return select;
}

/** @param {string} label @param {string | number | null} value @param {boolean} editable @param {string} [type] */
function inputControl(label, value, editable, type = 'text') {
  return el('input', { 'aria-label': label, value: value ?? '', type, disabled: editable ? null : '', step: type === 'number' ? 'any' : null });
}

/** @param {HTMLElement} control @param {string} label */
function compactField(control, label) { return el('label', { class: 'cable-field' }, el('span', {}, label), control); }

/** @param {CableReferenceData} references */
function endpointChoices(references) {
  const devices = references.devices.map((device) => ({ mode: 'device', publicId: device.publicId, pointPublicId: null, label: device.hostname, roomPublicId: device.roomPublicId, rackPublicId: device.rackPublicId }));
  const odfs = references.terminationPoints.flatMap((point) => point.positions.map((position) => ({ mode: 'odf', publicId: position.publicId, pointPublicId: point.publicId, label: `${point.label} · T${position.tray}/P${position.position}${position.label ? ` · ${position.label}` : ''}`, roomPublicId: point.roomPublicId, rackPublicId: null })));
  return { devices, odfs, all: [...devices, ...odfs] };
}

/** @param {Segment} segment @param {'from' | 'to'} side @param {CableReferenceData} references */
function locationText(segment, side, references) {
  const deviceId = segment[`${side}DevicePublicId`];
  const positionId = segment[`${side}TerminationPositionPublicId`];
  if (segment[`${side}EndpointMode`] === 'device') {
    const device = references.devices.find((entry) => entry.publicId === deviceId);
    const room = references.rooms.find((entry) => entry.publicId === device?.roomPublicId);
    const rack = references.racks.find((entry) => entry.publicId === device?.rackPublicId);
    return [room?.name, rack?.label].filter(Boolean).join(' / ') || 'Canonical location not recorded';
  }
  const point = references.terminationPoints.find((entry) => entry.positions.some((position) => position.publicId === positionId));
  const room = references.rooms.find((entry) => entry.publicId === point?.roomPublicId);
  return room ? `${room.name} / ${point?.label}` : point?.label || 'ODF location not recorded';
}

/** @param {Segment} segment */
function validateSegment(segment) {
  if (!segment.segmentReference.trim()) return 'Segment reference is required.';
  for (const side of /** @type {const} */ (['from', 'to'])) {
    if (segment[`${side}EndpointMode`] === 'device' && (!segment[`${side}DevicePublicId`] || !segment[`${side}Port`].trim())) return `${side === 'from' ? 'From' : 'To'} device and port are required.`;
    if (segment[`${side}EndpointMode`] === 'odf' && !segment[`${side}TerminationPositionPublicId`]) return `${side === 'from' ? 'From' : 'To'} ODF position is required.`;
  }
  return '';
}

/** @param {WorkPackage} pack @param {Segment} segment @param {'from' | 'to'} side @param {CableReferenceData} references @param {boolean} editable @param {() => Promise<void>} rerender */
function locationCorrection(pack, segment, side, references, editable, rerender) {
  const details = el('details', { class: 'rack-correction' }, el('summary', {}, 'Correct canonical rack'));
  if (!editable) return details;
  const room = selectControl(`${side} correction room`, '', [{ label: 'Choose room…', value: '' }, ...references.rooms.map((entry) => ({ label: entry.name, value: entry.publicId }))], true);
  const rack = selectControl(`${side} correction rack`, '', [{ label: 'Choose existing rack…', value: '' }, ...references.racks.map((entry) => ({ label: `${entry.label} · ${references.rooms.find((candidate) => candidate.publicId === entry.roomPublicId)?.name || 'No room'}`, value: entry.publicId }))], true);
  const newLabel = inputControl(`${side} new rack label`, '', true);
  const suiteLine = inputControl(`${side} new rack suite line`, '', true);
  const message = el('p', { class: 'cable-location-note', role: 'status' }, 'A correction saves atomically with this package draft.');
  /** @param {boolean} newRack */
  const stage = async (newRack) => {
    const deviceId = segment[`${side}DevicePublicId`];
    const device = references.devices.find((entry) => entry.publicId === deviceId);
    if (!device) throw new Error('Choose a canonical device before correcting its rack');
    const newDefinition = { publicId: crypto.randomUUID(), roomPublicId: room.value, label: newLabel.value.trim(), suiteLine: suiteLine.value.trim(), suiteLineConfirmed: Boolean(suiteLine.value.trim()), sizeUnits: 47 };
    /** @type {import('../../../server/types/browser-models').ScheduleRackChange} */
    const change = newRack
      ? { devicePublicId: device.publicId, _baseDeviceVersion: device.version, newRack: newDefinition }
      : { devicePublicId: device.publicId, _baseDeviceVersion: device.version, targetRackPublicId: rack.value };
    if (newRack && (!room.value || !newLabel.value.trim())) throw new Error('Choose a room and enter the new rack label');
    if (!newRack && !rack.value) throw new Error('Choose an existing rack');
    await mutatePackage(() => {
      pack.scheduleRackChanges = pack.scheduleRackChanges.filter((entry) => entry.devicePublicId !== device.publicId);
      pack.scheduleRackChanges.push(change);
      const target = newRack ? newDefinition : references.racks.find((entry) => entry.publicId === rack.value);
      segment[`${side}RoomPublicId`] = target?.roomPublicId || null;
      segment[`${side}RackPublicId`] = newRack ? newDefinition.publicId : rack.value;
      segment[`${side}RackLabel`] = newRack ? newDefinition.label : references.racks.find((entry) => entry.publicId === rack.value)?.label || null;
    });
    message.textContent = 'Saving the rack correction with this package…';
    details.open = false;
    await flushAll();
    await rerender();
  };
  details.append(el('div', { class: 'rack-correction-grid' }, compactField(room, 'Room'), compactField(rack, 'Existing rack'), el('button', { type: 'button', class: 'secondary compact-button', onclick: () => stage(false).catch((error) => notify(errorMessage(error))) }, 'Use rack'), compactField(newLabel, 'New rack'), compactField(suiteLine, 'Suite line'), el('button', { type: 'button', class: 'secondary compact-button', onclick: () => stage(true).catch((error) => notify(errorMessage(error))) }, 'Create rack')), message);
  return details;
}

/** @param {WorkPackage} pack @param {Segment} segment @param {'from' | 'to'} side @param {CableReferenceData} references @param {boolean} editable @param {HTMLElement} error @param {() => Promise<void>} rerender */
function endpointCell(pack, segment, side, references, editable, error, rerender) {
  const choices = endpointChoices(references);
  const mode = selectControl(`${side} endpoint mode`, segment[`${side}EndpointMode`] || 'legacy', [{ label: 'Device', value: 'device' }, { label: 'ODF', value: 'odf' }, { label: 'Legacy text', value: 'legacy' }], editable);
  const device = selectControl(`${side} device`, segment[`${side}DevicePublicId`] || '', [{ label: 'Choose device…', value: '' }, ...choices.devices.map((entry) => ({ label: entry.label, value: entry.publicId }))], editable);
  const odf = selectControl(`${side} ODF position`, segment[`${side}TerminationPositionPublicId`] || '', [{ label: 'Choose ODF position…', value: '' }, ...choices.odfs.map((entry) => ({ label: entry.label, value: entry.publicId }))], editable);
  const port = inputControl(`${side} port`, segment[`${side}Port`] || '', editable);
  const legacy = inputControl(`${side} legacy endpoint`, segment[`${side}Endpoint`] || '', editable);
  const location = el('span', { class: 'cable-location' }, locationText(segment, side, references));
  const correction = locationCorrection(pack, segment, side, references, editable, rerender);
  const refresh = () => {
    device.hidden = mode.value !== 'device'; port.hidden = mode.value !== 'device';
    odf.hidden = mode.value !== 'odf'; legacy.hidden = mode.value !== 'legacy'; correction.hidden = mode.value !== 'device';
    location.textContent = locationText(segment, side, references);
  };
  const changed = async () => {
    await mutatePackage(() => {
      segment[`${side}EndpointMode`] = /** @type {import('../../../server/types/browser-models').CableEndpointMode} */ (mode.value);
      segment[`${side}DevicePublicId`] = mode.value === 'device' ? device.value || null : null;
      segment[`${side}TerminationPositionPublicId`] = mode.value === 'odf' ? odf.value || null : null;
      segment[`${side}Port`] = mode.value === 'device' ? port.value : '';
      segment[`${side}Endpoint`] = mode.value === 'legacy' ? legacy.value : mode.value === 'device' ? `${choices.devices.find((entry) => entry.publicId === device.value)?.label || ''}:${port.value}` : choices.odfs.find((entry) => entry.publicId === odf.value)?.label || '';
      const selected = mode.value === 'device' ? choices.devices.find((entry) => entry.publicId === device.value) : choices.odfs.find((entry) => entry.publicId === odf.value);
      segment[`${side}RoomPublicId`] = selected?.roomPublicId || null; segment[`${side}RackPublicId`] = selected?.rackPublicId || null;
    });
    error.textContent = validateSegment(segment); refresh();
  };
  for (const control of [mode, device, odf, port, legacy]) { control.dataset.field = `${side}Endpoint`; control.addEventListener('input', () => changed().catch((failure) => notify(errorMessage(failure)))); }
  refresh();
  return el('td', { class: 'cable-endpoint' }, compactField(mode, 'Mode'), device, odf, port, legacy, location, correction);
}

/** @param {Segment} segment @param {Circuit} circuit @param {boolean} editable @param {() => Promise<void>} rerender */
function mediaCell(segment, circuit, editable, rerender) {
  /** @type {[string, keyof Segment, readonly string[]][]} */
  const definitions = circuit.media === 'fibre'
    ? [['From connector', 'fromConnector', CONNECTORS], ['To connector', 'toConnector', CONNECTORS], ['Fibre type', 'fibreType', ['OS1', 'OS2', 'OM1', 'OM2', 'OM3', 'OM4', 'OM5']], ['Mode', 'fibreMode', ['singlemode', 'multimode']], ['Item type', 'itemType', ['patch-lead', 'trunk', 'pigtail', 'field-terminated']]]
    : circuit.media === 'copper'
      ? [['Category', 'copperCategory', ['cat5e', 'cat6', 'cat6a', 'cat7', 'cat8']], ['Shielding', 'copperShielding', ['utp', 'f-utp', 'u-ftp', 's-ftp']], ['Pinout', 'copperPinout', ['straight', 'crossover']]]
      : [['Connector', 'dacConnector', DAC_CONNECTORS], ['Media', 'dacMedia', ['passive', 'active', 'aoc']], ['Direction', 'dacDirection', ['bidirectional', 'a-to-b', 'b-to-a']]];
  const container = el('td', { class: 'cable-media-fields' });
  for (const [label, property, options] of definitions) {
    const control = selectControl(label, String(segment[property] || options[0]), options, editable); control.dataset.field = String(property);
    control.addEventListener('input', () => mutatePackage(() => {
      // @ts-expect-error The selected field is one of the editable string schedule properties above.
      segment[property] = control.value;
      if (property === 'fibreType') segment.fibreMode = control.value.startsWith('OS') ? 'singlemode' : 'multimode';
      if (property === 'dacConnector') { segment.fromConnector = control.value; segment.toConnector = control.value; }
    }).catch((error) => notify(errorMessage(error))));
    container.append(compactField(control, label));
  }
  if (circuit.media === 'fibre') {
    const simplex = el('input', { type: 'checkbox', 'aria-label': 'Simplex', disabled: editable ? null : '', checked: segment.fibreSimplex ? '' : null, 'data-field': 'fibreSimplex' });
    simplex.addEventListener('input', () => mutatePackage(() => { segment.fibreSimplex = simplex.checked; }).catch((error) => notify(errorMessage(error))));
    const stock = inputControl('Stock length', segment.stockLengthMetres, editable, 'number'); stock.dataset.field = 'stockLengthMetres';
    stock.addEventListener('input', () => mutatePackage(() => { segment.stockLengthMetres = stock.value === '' ? null : Number(stock.value); }).catch((error) => notify(errorMessage(error))));
    container.append(compactField(simplex, 'Simplex'), compactField(stock, 'Stock length (m)'), el('button', { type: 'button', class: 'secondary compact-button cable-helper', disabled: editable ? null : '', onclick: async () => { const next = STOCK_LENGTHS.find((length) => length >= (segment.lengthMetres || 0)); if (!next) return notify('No standard stock length covers this row'); await mutatePackage(() => { segment.stockLengthMetres = next; }); await rerender(); } }, 'Next stock length'));
  }
  return container;
}

/** @param {Segment} segment */
function swapEndpoints(segment) {
  const values = /** @type {Record<string, any>} */ (segment);
  for (const suffix of ['Endpoint', 'EndpointMode', 'DevicePublicId', 'TerminationPositionPublicId', 'TerminationPointPublicId', 'Port', 'RoomPublicId', 'RoomName', 'RackPublicId', 'RackLabel', 'Connector']) {
    const from = `from${suffix}`; const to = `to${suffix}`; const value = values[from]; values[from] = values[to]; values[to] = value;
  }
  if (segment.dacDirection === 'a-to-b') segment.dacDirection = 'b-to-a'; else if (segment.dacDirection === 'b-to-a') segment.dacDirection = 'a-to-b';
}

/** @param {WorkPackage} pack @param {Circuit} circuit @param {Segment} segment @param {CableReferenceData} references @param {boolean} editable @param {() => Promise<void>} rerender */
function scheduleRow(pack, circuit, segment, references, editable, rerender) {
  const error = el('p', { class: 'cable-row-error', role: 'alert' }, validateSegment(segment));
  const circuitReference = inputControl('Circuit reference', circuit.circuitReference, editable); circuitReference.dataset.field = 'circuitReference';
  const segmentReference = inputControl('Segment reference', segment.segmentReference, editable); segmentReference.dataset.field = 'segmentReference';
  const length = inputControl('Length metres', segment.lengthMetres, editable, 'number'); length.dataset.field = 'lengthMetres';
  const notes = inputControl('Notes', segment.notes, editable); notes.dataset.field = 'notes';
  /** @type {[HTMLInputElement, () => void][]} */
  const editableFields = [[circuitReference, () => { circuit.circuitReference = circuitReference.value; }], [segmentReference, () => { segment.segmentReference = segmentReference.value; }], [length, () => { segment.lengthMetres = length.value === '' ? null : Number(length.value); }], [notes, () => { segment.notes = notes.value; }]];
  for (const [control, change] of editableFields) control.addEventListener('input', () => mutatePackage(change).then(() => { error.textContent = validateSegment(segment); }).catch((failure) => notify(errorMessage(failure))));
  const suggest = el('button', { type: 'button', class: 'secondary compact-button', disabled: editable && segment.fromDevicePublicId && segment.toDevicePublicId ? null : '', onclick: async () => {
    try { const result = /** @type {{ suggestedLengthMetres: number | null, matchType: string }} */ (await api(`/sites/${encodeURIComponent(pack.site.publicId)}/distances/suggestions?endpointADevicePublicId=${encodeURIComponent(segment.fromDevicePublicId || '')}&endpointBDevicePublicId=${encodeURIComponent(segment.toDevicePublicId || '')}&media=${encodeURIComponent(circuit.media)}`)); if (result.suggestedLengthMetres === null) return notify('No matching distance history'); await mutatePackage(() => { segment.lengthMetres = result.suggestedLengthMetres; }); notify(`Used ${result.matchType} distance history`); await rerender(); } catch (failure) { notify(errorMessage(failure)); }
  } }, 'Suggest distance');
  const actions = el('td', { class: 'cable-row-actions' }, suggest, el('button', { type: 'button', class: 'secondary compact-button', disabled: editable ? null : '', onclick: async () => { await mutatePackage(() => swapEndpoints(segment)); await rerender(); } }, circuit.media === 'dac' ? 'Reverse direction' : 'Swap ends'), el('button', { type: 'button', class: 'secondary compact-button', disabled: editable ? null : '', onclick: async () => {
    const odf = endpointChoices(references).odfs[0]; if (!odf) return notify('Add an ODF position at this site first');
    await mutatePackage(() => {
      const values = /** @type {Record<string, any>} */ (segment); const oldTo = /** @type {Record<string, any>} */ ({}); for (const suffix of ['Endpoint', 'EndpointMode', 'DevicePublicId', 'TerminationPositionPublicId', 'TerminationPointPublicId', 'Port', 'RoomPublicId', 'RoomName', 'RackPublicId', 'RackLabel', 'Connector']) oldTo[suffix] = values[`to${suffix}`];
      segment.toEndpointMode = 'odf'; segment.toEndpoint = odf.label; segment.toDevicePublicId = null; segment.toTerminationPositionPublicId = odf.publicId; segment.toPort = ''; segment.toRoomPublicId = odf.roomPublicId; segment.toRackPublicId = null;
      const next = /** @type {Segment & Record<string, any>} */ ({ ...structuredClone(segment), publicId: crypto.randomUUID(), segmentReference: `${segment.segmentReference}-H${circuit.segments.length + 1}`, sequence: segment.sequence + 1, version: 0, extensions: {} });
      next.fromEndpointMode = 'odf'; next.fromEndpoint = odf.label; next.fromDevicePublicId = null; next.fromTerminationPositionPublicId = odf.publicId; next.fromPort = ''; next.fromRoomPublicId = odf.roomPublicId; next.fromRackPublicId = null;
      for (const suffix of Object.keys(oldTo)) next[`to${suffix}`] = oldTo[suffix];
      circuit.segments.filter((entry) => entry.sequence > segment.sequence).forEach((entry) => { entry.sequence += 1; }); circuit.segments.push(next);
    }); await rerender();
  } }, 'Add ODF hop'), el('button', { type: 'button', class: 'danger compact-button', disabled: editable ? null : '', onclick: async () => { await mutatePackage(() => { circuit.segments.splice(circuit.segments.indexOf(segment), 1); if (!circuit.segments.length) pack.circuits.splice(pack.circuits.indexOf(circuit), 1); }); await rerender(); } }, 'Delete row'));
  return el('tr', { 'data-row-id': segment.publicId }, el('td', { class: 'cable-identifiers' }, compactField(circuitReference, 'Circuit'), compactField(segmentReference, 'Segment'), error), endpointCell(pack, segment, 'from', references, editable, error, rerender), endpointCell(pack, segment, 'to', references, editable, error, rerender), mediaCell(segment, circuit, editable, rerender), el('td', { class: 'cable-length-notes' }, compactField(length, 'Installed length (m)'), compactField(notes, 'Notes')), actions);
}

/** @param {'fibre' | 'copper' | 'dac'} media @param {number} index @param {CableReferenceData} references @returns {Circuit} */
function newCircuit(media, index, references) {
  const choices = endpointChoices(references).all; const from = choices[0]; const to = choices[1];
  if (!from || !to) throw new Error('Add at least two devices or ODF positions at this site before creating a cable row');
  /** @param {Record<string, any>} choice @param {'from' | 'to'} side @returns {Record<string, any>} */
  const endpoint = (choice, side) => ({ [`${side}Endpoint`]: choice.label, [`${side}EndpointMode`]: choice.mode, [`${side}DevicePublicId`]: choice.mode === 'device' ? choice.publicId : null, [`${side}TerminationPositionPublicId`]: choice.mode === 'odf' ? choice.publicId : null, [`${side}TerminationPointPublicId`]: choice.pointPublicId || null, [`${side}Port`]: choice.mode === 'device' ? '1' : '', [`${side}RoomPublicId`]: choice.roomPublicId || null, [`${side}RoomName`]: null, [`${side}RackPublicId`]: choice.rackPublicId || null, [`${side}RackLabel`]: null });
  const segment = /** @type {Segment} */ ({ publicId: crypto.randomUUID(), segmentReference: `${media.toUpperCase()}-${index}-1`, sequence: 0, ...endpoint(from, 'from'), ...endpoint(to, 'to'), fromConnector: media === 'copper' ? 'rj45' : media === 'dac' ? 'sfp28' : 'lc', toConnector: media === 'copper' ? 'rj45' : media === 'dac' ? 'sfp28' : 'lc', lengthMetres: null, notes: '', fibreType: 'OS2', fibreMode: 'singlemode', fibreSimplex: false, stockLengthMetres: null, itemType: 'patch-lead', copperCategory: 'cat6a', copperShielding: 'utp', copperPinout: 'straight', dacConnector: 'sfp28', dacMedia: 'passive', dacDirection: 'bidirectional', version: 0, extensions: {} });
  return { publicId: crypto.randomUUID(), circuitReference: `${media.toUpperCase()}-${index}`, description: '', media, status: 'planned', version: 0, extensions: {}, segments: [segment] };
}

/** @param {WorkPackage} pack @param {User} user @param {'fibre' | 'copper' | 'dac'} media @param {CableReferenceData} references @param {() => Promise<void>} rerender */
export function cableScheduleView(pack, user, media, references, rerender) {
  const editable = user.role !== 'viewer' && pack.status !== 'complete';
  const records = pack.circuits.filter((circuit) => circuit.media === media).flatMap((circuit) => circuit.segments.map((segment) => ({ circuit, segment }))).sort((left, right) => left.circuit.circuitReference.localeCompare(right.circuit.circuitReference) || left.segment.sequence - right.segment.sequence);
  let focusedRowId = records[0]?.segment.publicId || '';
  const fillFields = media === 'fibre' ? ['fromConnector', 'toConnector', 'fibreType', 'fibreMode', 'fibreSimplex', 'stockLengthMetres', 'itemType'] : media === 'copper' ? ['copperCategory', 'copperShielding', 'copperPinout'] : ['dacConnector', 'dacMedia', 'dacDirection'];
  const fillField = selectControl('Fill field', fillFields[0], fillFields, editable);
  const toolbar = el('div', { class: 'cable-toolbar' }, el('button', { type: 'button', disabled: editable ? null : '', onclick: async () => { try { await mutatePackage(() => pack.circuits.push(newCircuit(media, pack.circuits.filter((entry) => entry.media === media).length + 1, references))); await rerender(); } catch (error) { notify(errorMessage(error)); } } }, `Add ${MEDIA_LABELS[media]} row`), compactField(fillField, 'Fill field'), el('button', { type: 'button', class: 'secondary', disabled: editable && records.length ? null : '', onclick: async () => {
    const start = records.findIndex(({ segment }) => segment.publicId === focusedRowId); if (start < 0) return;
    await mutatePackage(() => { const source = /** @type {Record<string, any>} */ (records[start].segment); for (const record of records.slice(start + 1)) { const segment = /** @type {Record<string, any>} */ (record.segment); segment[fillField.value] = structuredClone(source[fillField.value]); if (fillField.value === 'fibreType') segment.fibreMode = source.fibreMode; if (fillField.value === 'dacConnector') { segment.fromConnector = source.fromConnector; segment.toConnector = source.toConnector; } } }); await rerender();
  } }, 'Fill down from focused row'));
  const state = !editable ? el('div', { class: 'notice', role: 'status' }, pack.status === 'complete' ? 'This completed schedule is locked. Reopen the package before editing.' : 'Viewer access is read-only.') : !navigator.onLine ? el('div', { class: 'notice notice-warn', role: 'status' }, 'Offline schedule edits remain on this device and replay as one package transaction.') : null;
  if (!records.length) return el('div', { class: 'stack cable-schedule', 'data-media': media }, ...(state ? [state] : []), toolbar, el('div', { class: 'empty-state' }, el('h2', {}, `No ${MEDIA_LABELS[media]} rows recorded`), el('p', {}, 'Create the first row after the site device or ODF endpoints are available.')));
  const body = el('tbody', {}, ...records.map(({ circuit, segment }) => scheduleRow(pack, circuit, segment, references, editable, rerender)));
  const table = el('table', { class: 'cable-grid' }, el('thead', {}, el('tr', {}, ...['References', 'From endpoint', 'To endpoint', `${MEDIA_LABELS[media]} details`, 'Length and notes', 'Actions'].map((heading) => el('th', { scope: 'col' }, heading)))), body);
  table.addEventListener('focusin', (event) => { const row = event.target instanceof Element ? event.target.closest('[data-row-id]') : null; if (row) focusedRowId = row.getAttribute('data-row-id') || focusedRowId; });
  table.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
    const field = event.target.dataset.field; if (!field) return; const row = event.target.closest('[data-row-id]'); if (!row) return; const rows = [...body.querySelectorAll('[data-row-id]')]; const next = rows[rows.indexOf(row) + 1]?.querySelector(`[data-field="${CSS.escape(field)}"]`); if (next instanceof HTMLElement) { event.preventDefault(); next.focus(); }
  });
  return el('div', { class: 'stack cable-schedule', 'data-media': media }, ...(state ? [state] : []), toolbar, el('p', { class: 'muted cable-help' }, 'Edit cells directly. Enter moves to the same field on the next row; saves are debounced without replacing live inputs.'), el('div', { class: 'table-wrap cable-grid-wrap' }, table));
}
