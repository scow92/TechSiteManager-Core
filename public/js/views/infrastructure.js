import { api } from '../api.js';
import { el, emptyState, errorMessage, notify } from '../dom.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').Site} Site */
/** @typedef {import('../../../server/types/browser-models').SiteRecord} SiteRecord */
/** @typedef {import('../../../server/types/browser-models').TerminationPosition} TerminationPosition */
/** @typedef {import('../../../server/types/browser-models').PhotoRecord} PhotoRecord */

const enc = encodeURIComponent;

/** @param {string} label @param {string} name @param {string} value @param {Record<string, unknown>} [attributes] */
function input(label, name, value = '', attributes = {}) {
  return el('label', { class: 'field' }, el('span', {}, label), el('input', { name, value, ...attributes }));
}

/** @param {string} label @param {string} name @param {readonly {value:string,label:string}[]} options @param {string} [selected] @param {boolean} [required] */
function select(label, name, options, selected = '', required = false) {
  return el('label', { class: 'field' }, el('span', {}, label), el('select', { name, required: required ? '' : null }, ...options.map((option) => el('option', { value: option.value, selected: option.value === selected ? '' : null }, option.label))));
}

/** @param {HTMLFormElement} form */
function values(form) { return Object.fromEntries(new FormData(form)); }

/** @param {string} path @param {(records: SiteRecord[]) => SiteRecord[]} update */
async function updateCache(path, update) {
  const cached = await OfflineStore.get('reference-cache', path);
  if (Array.isArray(cached)) await OfflineStore.put('reference-cache', update(/** @type {SiteRecord[]} */ (cached)), path);
}

/** @param {Record<string, unknown>} body */
async function dependencyMetadata(body) {
  /** @type {string[]} */
  const temporaryIds = [];
  for (const value of Object.values(body)) if (typeof value === 'string' && value.startsWith('urn:offline:')) temporaryIds.push(value);
  const operations = await OfflineStore.all('operation-queue');
  return { requiredTemporaryIds: temporaryIds, dependsOn: operations.filter((operation) => temporaryIds.includes(operation.temporaryId || '')).map((operation) => operation.id) };
}

/** @param {Site} site @param {string} kind @param {'POST'|'PUT'|'DELETE'} method @param {SiteRecord | null} record @param {Record<string, unknown>} body */
async function mutate(site, kind, method, record, body) {
  const collection = `/sites/${enc(site.publicId)}/${kind}`;
  const temporaryId = method === 'POST' ? `urn:offline:${crypto.randomUUID()}` : null;
  const targetId = record?.publicId || temporaryId;
  const path = method === 'POST' ? collection : `${collection}/${enc(String(targetId))}${method === 'DELETE' ? `?baseVersion=${record?.version}` : ''}`;
  const dependencies = await dependencyMetadata(method === 'POST' ? body : { ...body, targetId });
  const result = /** @type {{queued?:boolean, publicId?:string}} */ (await api(path, {
    method, body: method === 'DELETE' ? undefined : body, queueable: true,
    queueMetadata: { ...dependencies, temporaryId, operationKey: `infrastructure:${kind}:${targetId}:${method}`, entityType: kind, entityPublicId: targetId, label: String(body.label || body.name || body.hostname || '') }
  }));
  if (result.queued) {
    await updateCache(collection, (records) => method === 'POST'
      ? [...records, /** @type {SiteRecord} */ ({ publicId: temporaryId, version: 0, ...body })]
      : method === 'DELETE' ? records.filter((entry) => entry.publicId !== targetId)
        : records.map((entry) => entry.publicId === targetId ? /** @type {SiteRecord} */ ({ ...entry, ...body }) : entry));
  }
  notify(result.queued ? 'Change queued for sync' : 'Change saved');
}

/** @param {HTMLFormElement} form @param {(body:Record<string, FormDataEntryValue>) => Promise<void>} action */
function handle(form, action) {
  const error = el('p', { class: 'form-error', role: 'alert' });
  form.append(error);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); error.textContent = '';
    try { await action(values(form)); } catch (caught) { error.textContent = errorMessage(caught); notify(errorMessage(caught)); }
  });
  return form;
}

/** @param {string} label */
function inferSuiteLine(label) {
  const match = label.trim().match(/(?:^|[-_\s])([a-z]+)(?:[-_\s]?\d+)$/i);
  return match ? match[1].toUpperCase() : '';
}

/** @param {Site} site @param {SiteRecord[]} rooms @param {User} user @param {() => Promise<void>} rerender */
function roomsSection(site, rooms, user, rerender) {
  const records = rooms.map((room) => {
    if (user.role === 'viewer') return el('article', { class: 'card' }, el('h3', {}, room.name || ''), el('p', { class: 'muted' }, room.description || 'No description recorded.'));
    const form = handle(el('form', { class: 'card stack' }, el('h3', {}, room.name || ''), el('div', { class: 'form-grid' }, input('Name', 'name', room.name || '', { required: '', maxlength: 255 }), input('Description', 'description', room.description || '', { maxlength: 20000 })), el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Save room'), el('button', { type: 'button', class: 'danger', onclick: async () => { if (confirm(`Delete room ${room.name}?`)) { await mutate(site, 'rooms', 'DELETE', room, {}); await rerender(); } } }, 'Delete'))), async (body) => { await mutate(site, 'rooms', 'PUT', room, { name: String(body.name), description: String(body.description), _baseVersion: room.version }); await rerender(); });
    return form;
  });
  const add = user.role === 'viewer' ? null : handle(el('form', { class: 'panel stack' }, el('h2', {}, 'Add room'), el('div', { class: 'form-grid' }, input('Name', 'name', '', { required: '', maxlength: 255 }), input('Description', 'description', '', { maxlength: 20000 })), el('button', { type: 'submit' }, 'Add room')), async (body) => { await mutate(site, 'rooms', 'POST', null, { name: String(body.name), description: String(body.description) }); await rerender(); });
  return el('div', { class: 'stack' }, el('section', { class: 'panel' }, el('div', { class: 'section-head' }, el('h2', {}, 'Rooms'), el('span', { class: 'count-badge' }, rooms.length)), rooms.length ? el('div', { class: 'room-grid' }, ...records) : el('p', { class: 'empty-inline' }, 'No rooms recorded.')), ...(add ? [add] : []));
}

/** @param {string} entityType @param {string} entityPublicId @param {PhotoRecord[]} photos @param {User} user @param {() => Promise<void>} rerender */
function photoPanel(entityType, entityPublicId, photos, user, rerender) {
  if (entityPublicId.startsWith('urn:offline:')) return el('p', { class: 'muted' }, 'Photos become available after this pending record synchronizes.');
  const list = el('div', { class: 'photo-grid' }, ...photos.map((photo) => el('figure', { class: `photo-card${photo.current ? ' current' : ''}` },
    el('img', { src: `/api/photos/${enc(photo.publicId)}/content`, alt: photo.description || photo.name, loading: 'lazy' }),
    el('figcaption', {}, el('strong', {}, photo.name), el('span', { class: 'muted' }, photo.current ? 'Current' : new Date(photo.createdAt).toLocaleString()), ...(user.role === 'viewer' ? [] : [el('button', { type: 'button', class: 'danger small', onclick: async () => { if (confirm(`Delete photo ${photo.name}?`)) { await api(`/photos/${enc(photo.publicId)}?baseVersion=${photo.version}`, { method: 'DELETE' }); notify('Photo deleted'); await rerender(); } } }, 'Delete')])))));
  if (user.role === 'viewer') return el('details', { class: 'photo-panel' }, el('summary', {}, `Photos (${photos.length})`), photos.length ? list : el('p', { class: 'muted' }, 'No photos recorded.'));
  const upload = handle(el('form', { class: 'photo-upload form-grid' }, input('Photo name', 'name', '', { required: '', maxlength: 255 }), input('Description', 'description', '', { maxlength: 2000 }), input('JPEG, PNG, or WebP', 'photo', '', { type: 'file', accept: 'image/jpeg,image/png,image/webp', required: '' }), el('button', { type: 'submit' }, photos.length ? 'Upload replacement' : 'Upload photo')), async (body) => {
    const file = body.photo;
    if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP photo');
    if (file.size > 10 * 1024 * 1024) throw new Error('Photo must be 10 MB or smaller');
    const response = await fetch(`/api/photos/${entityType}/${enc(entityPublicId)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'X-Photo-Name': String(body.name), 'X-Photo-Description': String(body.description) }, body: file });
    if (!response.ok) { const details = await response.json(); throw new Error(details.error || 'Photo upload failed'); }
    notify('Photo uploaded'); await rerender();
  });
  return el('details', { class: 'photo-panel' }, el('summary', {}, `Photos (${photos.length})`), photos.length ? list : el('p', { class: 'muted' }, 'No photos recorded.'), upload);
}

/** @param {Site} site @param {SiteRecord} device @param {SiteRecord[]} rooms @param {SiteRecord[]} racks @param {PhotoRecord[]} photos @param {User} user @param {() => Promise<void>} rerender */
function deviceEditor(site, device, rooms, racks, photos, user, rerender) {
  const location = device.rackPublicId ? racks.find((rack) => rack.publicId === device.rackPublicId)?.label : rooms.find((room) => room.publicId === device.roomPublicId)?.name;
  if (user.role === 'viewer') return el('article', { class: 'card stack' }, el('h3', {}, device.hostname || ''), el('p', { class: 'muted' }, `${device.label || 'No label'} · ${location || 'Unplaced'}${device.rackUnit ? ` · U${device.rackUnit} ${device.side}` : ''}`), photoPanel('device', device.publicId, photos, user, rerender));
  return handle(el('form', { class: 'card stack' }, el('h3', {}, device.hostname || ''), el('div', { class: 'form-grid' }, input('Hostname', 'hostname', device.hostname || '', { required: '', maxlength: 255 }), input('Label', 'label', device.label || '', { maxlength: 255 }), select('Room', 'roomPublicId', [{ value: '', label: 'No room' }, ...rooms.map((room) => ({ value: room.publicId, label: room.name || '' }))], device.roomPublicId || ''), select('Rack', 'rackPublicId', [{ value: '', label: 'No rack' }, ...racks.map((rack) => ({ value: rack.publicId, label: rack.label || '' }))], device.rackPublicId || ''), input('Rack unit', 'rackUnit', device.rackUnit ? String(device.rackUnit) : '', { type: 'number', min: 1, max: 100 }), input('Height (U)', 'sizeUnits', String(device.sizeUnits || 1), { type: 'number', min: 1, max: 100, required: '' }), select('Face', 'side', [{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }], device.side || 'front')), el('p', { class: 'muted' }, `Stable key: ${device.deviceKey}`), el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Save device'), el('button', { type: 'button', class: 'danger', onclick: async () => { if (confirm(`Delete device ${device.hostname}?`)) { await mutate(site, 'devices', 'DELETE', device, {}); await rerender(); } } }, 'Delete')), photoPanel('device', device.publicId, photos, user, rerender)), async (body) => { await mutate(site, 'devices', 'PUT', device, { hostname: String(body.hostname), label: String(body.label), roomPublicId: String(body.roomPublicId) || null, rackPublicId: String(body.rackPublicId) || null, rackUnit: body.rackUnit ? Number(body.rackUnit) : null, sizeUnits: Number(body.sizeUnits), side: String(body.side), _baseVersion: device.version }); await rerender(); });
}

/** @param {Site} site @param {SiteRecord[]} rooms @param {SiteRecord[]} racks @param {SiteRecord[]} devices @param {User} user @param {() => Promise<void>} rerender */
async function racksSection(site, rooms, racks, devices, user, rerender) {
  const allPhotoGroups = await Promise.all(racks.map(async (rack) => {
    const rackDevices = devices.filter((device) => device.rackPublicId === rack.publicId);
    const photoEntries = await Promise.all(rackDevices.map(async (device) => /** @type {[string, PhotoRecord[]]} */ ([device.publicId, device.publicId.startsWith('urn:offline:') ? [] : /** @type {PhotoRecord[]} */ (await api(`/photos/device/${enc(device.publicId)}`))])));
    return { rack, rackPhotos: rack.publicId.startsWith('urn:offline:') ? [] : /** @type {PhotoRecord[]} */ (await api(`/photos/rack/${enc(rack.publicId)}`)), devicePhotos: new Map(photoEntries) };
  }));
  const cards = allPhotoGroups.map(({ rack, rackPhotos, devicePhotos }) => {
    const rackDevices = devices.filter((device) => device.rackPublicId === rack.publicId);
    const faces = ['front', 'rear'].map((face) => el('section', { class: 'rack-face-column' }, el('h4', {}, `${face[0].toUpperCase()}${face.slice(1)} elevation`), el('div', { class: 'rack-face', style: `--rack-units:${rack.sizeUnits || 47}` }, ...rackDevices.filter((device) => device.side === face).map((device) => el('div', { class: 'rack-device', style: `--device-u:${device.sizeUnits || 1};--rack-u:${device.rackUnit || 1}`, title: `${device.hostname} · U${device.rackUnit}` }, device.label || device.hostname || 'Device')))));
    const editor = user.role === 'viewer' ? el('div', {}, el('h3', {}, rack.label || ''), el('p', { class: 'muted' }, `${rack.sizeUnits || 47}U · suite ${rack.suiteLine || 'not recorded'}${rack.suiteLineConfirmed ? ' (confirmed)' : ''}`)) : handle(el('form', { class: 'stack' }, el('div', { class: 'form-grid' }, input('Rack label', 'label', rack.label || '', { required: '', maxlength: 120 }), input('Suite line', 'suiteLine', rack.suiteLine || '', { maxlength: 64 }), input('Height (U)', 'sizeUnits', String(rack.sizeUnits || 47), { type: 'number', min: 1, max: 100, required: '' }), select('Room', 'roomPublicId', rooms.map((room) => ({ value: room.publicId, label: room.name || '' })), rack.roomPublicId || '', true), el('label', { class: 'field checkbox' }, el('input', { type: 'checkbox', name: 'suiteLineConfirmed', checked: rack.suiteLineConfirmed ? '' : null }), el('span', {}, 'Suite line confirmed'))), el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Save rack'), el('button', { type: 'button', class: 'danger', onclick: async () => { if (confirm(`Delete rack ${rack.label}?`)) { await mutate(site, 'racks', 'DELETE', rack, {}); await rerender(); } } }, 'Delete rack'))), async (body) => { await mutate(site, 'racks', 'PUT', rack, { label: String(body.label), suiteLine: String(body.suiteLine), suiteLineConfirmed: body.suiteLineConfirmed === 'on', sizeUnits: Number(body.sizeUnits), roomPublicId: String(body.roomPublicId), _baseVersion: rack.version }); await rerender(); });
    const addDevice = user.role === 'viewer' ? null : handle(el('form', { class: 'subpanel stack' }, el('h4', {}, 'Add rack device'), el('div', { class: 'form-grid' }, input('Hostname', 'hostname', '', { required: '', maxlength: 255 }), input('Label', 'label', '', { maxlength: 255 }), input('Rack unit', 'rackUnit', '', { type: 'number', min: 1, max: rack.sizeUnits || 47, required: '' }), input('Height (U)', 'sizeUnits', '1', { type: 'number', min: 1, max: rack.sizeUnits || 47, required: '' }), select('Face', 'side', [{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }])), el('button', { type: 'submit' }, 'Add device')), async (body) => { await mutate(site, 'devices', 'POST', null, { hostname: String(body.hostname), label: String(body.label), roomPublicId: rack.roomPublicId, rackPublicId: rack.publicId, rackUnit: Number(body.rackUnit), sizeUnits: Number(body.sizeUnits), side: String(body.side) }); await rerender(); });
    return el('article', { class: 'panel stack rack-workflow' }, editor, el('div', { class: 'rack-faces' }, ...faces), photoPanel('rack', rack.publicId, rackPhotos, user, rerender), ...(addDevice ? [addDevice] : []), ...(rackDevices.length ? [el('details', {}, el('summary', {}, `Edit installed devices (${rackDevices.length})`), el('div', { class: 'stack details-content' }, ...rackDevices.map((device) => deviceEditor(site, device, rooms, racks, devicePhotos.get(device.publicId) || [], user, rerender))))] : []));
  });
  const add = user.role === 'viewer' || !rooms.length ? null : (() => {
    const labelInput = input('Rack label', 'label', '', { required: '', maxlength: 120 });
    const suiteInput = input('Suite line', 'suiteLine', '', { maxlength: 64 });
    const suiteControl = /** @type {HTMLInputElement} */ (suiteInput.querySelector('input'));
    const labelControl = /** @type {HTMLInputElement} */ (labelInput.querySelector('input'));
    labelControl.addEventListener('input', () => { if (!suiteControl.dataset.edited) suiteControl.value = inferSuiteLine(labelControl.value); });
    suiteControl.addEventListener('input', () => { suiteControl.dataset.edited = 'true'; });
    return handle(el('form', { class: 'panel stack' }, el('h2', {}, 'Add rack'), el('p', { class: 'muted' }, 'Rack labels are unique within a room. Height defaults to 47U; inferred suite lines must be confirmed.'), el('div', { class: 'form-grid' }, labelInput, suiteInput, input('Height (U)', 'sizeUnits', '47', { type: 'number', min: 1, max: 100, required: '' }), select('Room', 'roomPublicId', rooms.map((room) => ({ value: room.publicId, label: room.name || '' })), rooms[0].publicId, true), el('label', { class: 'field checkbox' }, el('input', { type: 'checkbox', name: 'suiteLineConfirmed', required: '' }), el('span', {}, 'I confirm the suite line'))), el('button', { type: 'submit' }, 'Add rack')), async (body) => { await mutate(site, 'racks', 'POST', null, { label: String(body.label), suiteLine: String(body.suiteLine), suiteLineConfirmed: body.suiteLineConfirmed === 'on', sizeUnits: Number(body.sizeUnits), roomPublicId: String(body.roomPublicId) }); await rerender(); });
  })();
  return el('div', { class: 'stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Rack elevations'), el('span', { class: 'count-badge' }, racks.length)), ...(cards.length ? cards : [emptyState('No racks recorded', rooms.length ? 'Add the first room-owned rack.' : 'Add a room before adding racks.')]), ...(add ? [add] : []));
}

/** @param {Site} site @param {SiteRecord[]} rooms @param {SiteRecord[]} points @param {User} user @param {() => Promise<void>} rerender */
async function terminationSection(site, rooms, points, user, rerender) {
  const positionEntries = await Promise.all(points.map(async (point) => /** @type {[string, TerminationPosition[]]} */ ([point.publicId, /** @type {TerminationPosition[]} */ (await api(`/sites/${enc(site.publicId)}/termination-points/${enc(point.publicId)}/positions`))])));
  const positions = new Map(positionEntries);
  const cards = points.map((point) => {
    const owned = positions.get(point.publicId) || [];
    const pointForm = user.role === 'viewer' ? el('div', {}, el('h3', {}, point.label || ''), el('p', { class: 'muted' }, `${point.kind} · ${point.trayCount} trays × ${point.positionsPerTray} positions`)) : handle(el('form', { class: 'stack' }, el('h3', {}, point.label || ''), el('div', { class: 'form-grid' }, input('Label', 'label', point.label || '', { required: '', maxlength: 120 }), input('Kind', 'kind', point.kind || '', { required: '', maxlength: 64 }), input('Trays', 'trayCount', String(point.trayCount || 1), { type: 'number', min: 1, max: 100, required: '' }), input('Positions per tray', 'positionsPerTray', String(point.positionsPerTray || 12), { type: 'number', min: 1, max: 1000, required: '' }), select('Room', 'roomPublicId', [{ value: '', label: 'No room' }, ...rooms.map((room) => ({ value: room.publicId, label: room.name || '' }))], point.roomPublicId || ''), input('Notes', 'notes', point.notes || '', { maxlength: 20000 })), el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Save termination point'), el('button', { type: 'button', class: 'danger', onclick: async () => { if (confirm(`Delete ${point.label}?`)) { await mutate(site, 'termination-points', 'DELETE', point, {}); await rerender(); } } }, 'Delete'))), async (body) => { await mutate(site, 'termination-points', 'PUT', point, { label: String(body.label), kind: String(body.kind), notes: String(body.notes), trayCount: Number(body.trayCount), positionsPerTray: Number(body.positionsPerTray), roomPublicId: String(body.roomPublicId) || null, _baseVersion: point.version }); await rerender(); });
    const positionRows = owned.map((position) => user.role === 'viewer' ? el('li', {}, `Tray ${position.tray}, position ${position.position} — ${position.label || 'Unlabelled'}`) : handle(el('form', { class: 'inline-record' }, input('Tray', 'tray', String(position.tray), { type: 'number', min: 1, max: point.trayCount || 1, required: '' }), input('Position', 'position', String(position.position), { type: 'number', min: 1, max: point.positionsPerTray || 12, required: '' }), input('Label', 'label', position.label, { maxlength: 120 }), el('button', { type: 'submit' }, 'Save'), el('button', { type: 'button', class: 'danger', onclick: async () => { await api(`/sites/${enc(site.publicId)}/termination-points/${enc(point.publicId)}/positions/${enc(position.publicId)}?baseVersion=${position.version}`, { method: 'DELETE' }); await rerender(); } }, 'Delete')), async (body) => { await api(`/sites/${enc(site.publicId)}/termination-points/${enc(point.publicId)}/positions/${enc(position.publicId)}`, { method: 'PUT', body: { tray: Number(body.tray), position: Number(body.position), label: String(body.label), _baseVersion: position.version } }); await rerender(); }));
    const addPosition = user.role === 'viewer' ? null : handle(el('form', { class: 'inline-record' }, input('Tray', 'tray', '1', { type: 'number', min: 1, max: point.trayCount || 1, required: '' }), input('Position', 'position', '1', { type: 'number', min: 1, max: point.positionsPerTray || 12, required: '' }), input('Label', 'label', '', { maxlength: 120 }), el('button', { type: 'submit' }, 'Add position')), async (body) => { await api(`/sites/${enc(site.publicId)}/termination-points/${enc(point.publicId)}/positions`, { method: 'POST', body: { tray: Number(body.tray), position: Number(body.position), label: String(body.label) } }); await rerender(); });
    return el('article', { class: 'panel stack' }, pointForm, el('h4', {}, `Tray/fibre positions (${owned.length})`), ...(positionRows.length ? [el('div', { class: 'stack' }, ...positionRows)] : [el('p', { class: 'muted' }, 'No positions recorded.')]), ...(addPosition ? [addPosition] : []));
  });
  const add = user.role === 'viewer' ? null : handle(el('form', { class: 'panel stack' }, el('h2', {}, 'Add termination point'), el('div', { class: 'form-grid' }, input('Label', 'label', '', { required: '', maxlength: 120 }), input('Kind', 'kind', 'ODF', { required: '', maxlength: 64 }), input('Trays', 'trayCount', '1', { type: 'number', min: 1, max: 100, required: '' }), input('Positions per tray', 'positionsPerTray', '12', { type: 'number', min: 1, max: 1000, required: '' }), select('Room', 'roomPublicId', [{ value: '', label: 'No room' }, ...rooms.map((room) => ({ value: room.publicId, label: room.name || '' }))]), input('Notes', 'notes', '', { maxlength: 20000 })), el('button', { type: 'submit' }, 'Add termination point')), async (body) => { await mutate(site, 'termination-points', 'POST', null, { label: String(body.label), kind: String(body.kind), notes: String(body.notes), trayCount: Number(body.trayCount), positionsPerTray: Number(body.positionsPerTray), roomPublicId: String(body.roomPublicId) || null }); await rerender(); });
  return el('div', { class: 'stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Termination points'), el('span', { class: 'count-badge' }, points.length)), ...cards, ...(add ? [add] : []));
}

/** @param {Site} site @param {SiteRecord[]} rooms @param {SiteRecord[]} racks @param {SiteRecord[]} devices @param {User} user @param {() => Promise<void>} rerender */
async function devicesSection(site, rooms, racks, devices, user, rerender) {
  const photoEntries = await Promise.all(devices.map(async (device) => /** @type {[string, PhotoRecord[]]} */ ([device.publicId, device.publicId.startsWith('urn:offline:') ? [] : /** @type {PhotoRecord[]} */ (await api(`/photos/device/${enc(device.publicId)}`))])));
  const photos = new Map(photoEntries);
  const add = user.role === 'viewer' ? null : handle(el('form', { class: 'panel stack' }, el('h2', {}, 'Add device'), el('p', { class: 'muted' }, 'Hostnames are stored in lowercase. The generated device key remains stable when the device moves.'), el('div', { class: 'form-grid' }, input('Hostname', 'hostname', '', { required: '', maxlength: 255 }), input('Label', 'label', '', { maxlength: 255 }), select('Room', 'roomPublicId', [{ value: '', label: 'No room' }, ...rooms.map((room) => ({ value: room.publicId, label: room.name || '' }))]), select('Rack', 'rackPublicId', [{ value: '', label: 'No rack' }, ...racks.map((rack) => ({ value: rack.publicId, label: rack.label || '' }))]), input('Rack unit', 'rackUnit', '', { type: 'number', min: 1, max: 100 }), input('Height (U)', 'sizeUnits', '1', { type: 'number', min: 1, max: 100, required: '' }), select('Face', 'side', [{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }])), el('button', { type: 'submit' }, 'Add device')), async (body) => { await mutate(site, 'devices', 'POST', null, { hostname: String(body.hostname), label: String(body.label), roomPublicId: String(body.roomPublicId) || null, rackPublicId: String(body.rackPublicId) || null, rackUnit: body.rackUnit ? Number(body.rackUnit) : null, sizeUnits: Number(body.sizeUnits), side: String(body.side) }); await rerender(); });
  return el('div', { class: 'stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Devices'), el('span', { class: 'count-badge' }, devices.length)), ...(devices.length ? devices.map((device) => deviceEditor(site, device, rooms, racks, photos.get(device.publicId) || [], user, rerender)) : [emptyState('No devices recorded', 'Add a canonical device to place it in a room or rack.')]), ...(add ? [add] : []));
}

/** @param {Site} site @param {SiteRecord[]} devices @param {SiteRecord[]} distances @param {User} user @param {() => Promise<void>} rerender */
function distancesSection(site, devices, distances, user, rerender) {
  const options = devices.map((device) => ({ value: device.publicId, label: device.hostname || '' }));
  const calculator = user.role === 'viewer' || devices.length < 2 ? null : (() => {
    const suggestion = el('p', { class: 'muted', role: 'status' }, 'Choose two devices and media to calculate from history.');
    const form = handle(el('form', { class: 'panel stack' }, el('h2', {}, 'Distance calculator'), el('div', { class: 'form-grid' }, select('Endpoint A', 'endpointADevicePublicId', options, options[0]?.value, true), select('Endpoint B', 'endpointBDevicePublicId', options, options[1]?.value, true), select('Media', 'media', [{ value: 'fibre', label: 'Fibre' }, { value: 'copper', label: 'Copper' }, { value: 'other', label: 'Other' }]), input('Measured length (m)', 'lengthMetres', '', { type: 'number', min: 0.001, step: 'any', required: '' })), suggestion, el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'secondary', onclick: async () => {
      try { const body = values(form); const result = /** @type {{matchType:string,suggestedLengthMetres:number|null,samples:{lengthMetres:number}[]}} */ (await api(`/sites/${enc(site.publicId)}/distances/suggestions?endpointADevicePublicId=${enc(String(body.endpointADevicePublicId))}&endpointBDevicePublicId=${enc(String(body.endpointBDevicePublicId))}&media=${enc(String(body.media))}`)); suggestion.textContent = result.suggestedLengthMetres === null ? 'No matching device or rack-pair history.' : `${result.matchType === 'device' ? 'Exact device-pair' : 'Rack-pair fallback'} suggestion: ${result.suggestedLengthMetres} m from ${result.samples.length} sample(s).`; } catch (caught) { suggestion.textContent = errorMessage(caught); }
    } }, 'Suggest from history'), el('button', { type: 'submit' }, 'Record measurement'))), async (body) => { await mutate(site, 'distances', 'POST', null, { endpointADevicePublicId: String(body.endpointADevicePublicId), endpointBDevicePublicId: String(body.endpointBDevicePublicId), media: String(body.media), lengthMetres: Number(body.lengthMetres) }); await rerender(); });
    return form;
  })();
  const table = distances.length
    ? el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, 'Endpoint A'), el('th', {}, 'Endpoint B'), el('th', {}, 'Media'), el('th', {}, 'Length'), el('th', {}, 'Observed'))),
      el('tbody', {}, ...distances.slice().reverse().map((distance) => el('tr', {},
        el('td', {}, distance.endpointA || ''), el('td', {}, distance.endpointB || ''), el('td', {}, distance.media || ''), el('td', {}, `${distance.lengthMetres} m`), el('td', {}, distance.observedAt ? new Date(distance.observedAt).toLocaleString() : ''))))))
    : emptyState('No distance history', 'Record a measured equipment-pair distance to seed suggestions.');
  return el('div', { class: 'stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Distance samples'), el('span', { class: 'count-badge' }, distances.length)), ...(calculator ? [calculator] : []), table);
}

/** @param {{site:Site,user:User,section:string,records:SiteRecord[][],rerender:() => Promise<void>}} context */
export async function infrastructureSection({ site, user, section, records, rerender }) {
  const [rooms, racks, points, devices, distances] = records;
  const content = section === 'rooms' ? roomsSection(site, rooms, user, rerender)
    : section === 'racks' ? await racksSection(site, rooms, racks, devices, user, rerender)
      : section === 'termination-points' ? await terminationSection(site, rooms, points, user, rerender)
        : section === 'devices' ? await devicesSection(site, rooms, racks, devices, user, rerender)
          : distancesSection(site, devices, distances, user, rerender);
  const [queued, rejected] = await Promise.all([OfflineStore.all('operation-queue'), OfflineStore.all('dead-letters')]);
  const pending = queued.filter((operation) => operation.entityType === section);
  const failed = rejected.filter((operation) => operation.entityType === section);
  const notices = [];
  if (pending.length) notices.push(el('aside', { class: 'panel', role: 'status' }, el('h2', {}, 'Changes pending synchronization'), el('p', { class: 'muted' }, `${pending.length} ${section} change${pending.length === 1 ? ' is' : 's are'} stored durably on this device.`)));
  for (const operation of failed) {
    const reapply = operation.method === 'PUT' && operation.body && operation.entityPublicId ? el('button', { type: 'button', onclick: async () => {
      try {
        const latest = records[['rooms', 'racks', 'termination-points', 'devices', 'distances'].indexOf(section)].find((entry) => entry.publicId === operation.entityPublicId);
        if (!latest) throw new Error('The record no longer exists');
        const draft = JSON.parse(operation.body || '{}');
        await api(operation.path, { method: 'PUT', body: { ...draft, _baseVersion: latest.version } });
        await OfflineStore.delete('dead-letters', operation.id); notify('Retained draft reapplied'); await rerender();
      } catch (caught) { notify(errorMessage(caught)); }
    } }, 'Reapply retained draft') : null;
    notices.push(el('aside', { class: 'panel stack', role: 'alert' }, el('h2', {}, 'Change needs review'), el('p', { class: 'error' }, operation.serverMessage || 'The server rejected an offline change. The saved record was not overwritten.'), el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'secondary', onclick: async () => { await OfflineStore.delete('dead-letters', operation.id); await rerender(); } }, 'Discard retained change'), ...(reapply ? [reapply] : []))));
  }
  return el('div', { class: 'stack' }, ...notices, content);
}
