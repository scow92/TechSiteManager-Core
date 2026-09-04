import { api } from './api.js';

/** @typedef {import('../../server/types/browser-models').WorkPackage} WorkPackage */

const DEBOUNCE_MS = 550;
/** @type {{ publicId: string, pack: WorkPackage, dirty: boolean, revision: number, timer: ReturnType<typeof setTimeout> | null, tail: Promise<unknown>, listeners: Set<(status: string, detail?: unknown) => void> } | null} */
let active = null;

globalThis.addEventListener('offline-operation-complete', (event) => {
  const detail = event instanceof CustomEvent ? event.detail : null;
  if (!active || detail?.operation?.dirtyPackagePublicId !== active.publicId) return;
  if (detail.result?.publicId === active.publicId) mergeLivePackage(active.pack, detail.result);
  active.pack.scheduleRackChanges = [];
  active.dirty = false;
  if (active.timer) { clearTimeout(active.timer); active.timer = null; }
  emit('saved');
});

/** @template T @param {T} value @returns {T} */
function clone(value) { return structuredClone(value); }

/** @param {Record<string, any>} target @param {Record<string, any>} source @param {string[]} childKeys */
function mergeRecord(target, source, childKeys = []) {
  for (const [key, value] of Object.entries(source)) if (!childKeys.includes(key)) target[key] = clone(value);
  for (const key of childKeys) mergeArray(target[key], source[key], key === 'circuits' ? ['segments'] : []);
  return target;
}

/** @param {Record<string, any>[]} target @param {Record<string, any>[]} source @param {string[]} childKeys */
function mergeArray(target, source, childKeys = []) {
  const current = new Map(target.map((record) => [record.publicId, record]));
  target.splice(0, target.length, ...source.map((record) => { const existing = current.get(record.publicId); return existing ? mergeRecord(existing, record, childKeys) : clone(record); }));
}

/** Preserve the object graph while applying the canonical save response. @param {WorkPackage} target @param {WorkPackage} source */
export function mergeLivePackage(target, source) {
  return /** @type {WorkPackage} */ (mergeRecord(target, source, ['workItems', 'circuits', 'consumableRequirements']));
}

/** @param {WorkPackage} target @param {WorkPackage} source */
function mergeVersions(target, source) {
  target.version = source.version;
  const pairs = /** @type {[Record<string, any>[], Record<string, any>[]][]} */ ([[target.workItems, source.workItems], [target.circuits, source.circuits], [target.consumableRequirements, source.consumableRequirements]]);
  for (const [localRecords, serverRecords] of pairs) {
    const server = new Map(serverRecords.map((record) => [record.publicId, record]));
    for (const local of localRecords) { const remote = server.get(local.publicId); local.version = remote ? remote.version : 0; }
  }
  const serverCircuits = new Map(source.circuits.map((circuit) => [circuit.publicId, circuit]));
  for (const circuit of target.circuits) {
    const serverCircuit = serverCircuits.get(circuit.publicId);
    if (!serverCircuit) { circuit.version = 0; for (const segment of circuit.segments) segment.version = 0; continue; }
    const serverSegments = new Map(serverCircuit.segments.map((segment) => [segment.publicId, segment]));
    for (const segment of circuit.segments) { const remote = serverSegments.get(segment.publicId); segment.version = remote ? remote.version : 0; }
  }
}

/** @param {WorkPackage} pack */
function payload(pack) {
  return {
    saveId: crypto.randomUUID(), _baseVersion: pack.version,
    packageReference: pack.packageReference, externalReference: pack.externalReference, projectReference: pack.projectReference,
    title: pack.title, description: pack.description, status: pack.status, leadAssignee: pack.leadAssignee, assignees: pack.assignees,
    workItems: pack.workItems.map((item) => ({ publicId: item.publicId, _baseVersion: item.version, itemReference: item.itemReference, title: item.title, description: item.description, status: item.status, sequence: item.sequence, leadAssignee: item.leadAssignee, assignees: item.assignees })),
    circuits: pack.circuits.map((circuit) => ({ publicId: circuit.publicId, _baseVersion: circuit.version, circuitReference: circuit.circuitReference, description: circuit.description, media: circuit.media, status: circuit.status, segments: circuit.segments.map((segment) => ({
      publicId: segment.publicId, _baseVersion: segment.version, segmentReference: segment.segmentReference, sequence: segment.sequence,
      fromEndpoint: segment.fromEndpoint, fromEndpointMode: segment.fromEndpointMode, fromDevicePublicId: segment.fromDevicePublicId, fromTerminationPositionPublicId: segment.fromTerminationPositionPublicId, fromPort: segment.fromPort,
      toEndpoint: segment.toEndpoint, toEndpointMode: segment.toEndpointMode, toDevicePublicId: segment.toDevicePublicId, toTerminationPositionPublicId: segment.toTerminationPositionPublicId, toPort: segment.toPort,
      fromConnector: segment.fromConnector, toConnector: segment.toConnector, lengthMetres: segment.lengthMetres, notes: segment.notes,
      fibreType: segment.fibreType, fibreMode: segment.fibreMode, fibreSimplex: segment.fibreSimplex, stockLengthMetres: segment.stockLengthMetres, itemType: segment.itemType,
      copperCategory: segment.copperCategory, copperShielding: segment.copperShielding, copperPinout: segment.copperPinout,
      dacConnector: segment.dacConnector, dacMedia: segment.dacMedia, dacDirection: segment.dacDirection
    })) })),
    consumableRequirements: pack.consumableRequirements.map((requirement) => ({ publicId: requirement.publicId, _baseVersion: requirement.version, cataloguePublicId: requirement.cataloguePublicId, description: requirement.description, quantityRequired: requirement.quantityRequired, unit: requirement.unit })),
    scheduleRackChanges: pack.scheduleRackChanges || []
  };
}

/** @param {string} status @param {unknown} [detail] */
function emit(status, detail) { if (active) for (const listener of active.listeners) listener(status, detail); }

async function persistDirty() {
  if (!active || !active.dirty) return;
  await OfflineStore.put('dirty-work-packages', { publicId: active.publicId, snapshot: clone(active.pack), updatedAt: Date.now() });
}

async function performSave() {
  if (!active || !active.dirty || active.pack.status === 'complete') return active?.pack;
  const state = active;
  await persistDirty();
  const operation = state.tail.then(async () => {
    if (!state.dirty || state.pack.status === 'complete') return state.pack;
    const revision = state.revision; const body = payload(state.pack); emit('saving');
    try {
      const requiredTemporaryIds = [...new Set(JSON.stringify(body).match(/urn:offline:[0-9a-f-]+/g) || [])];
      const queuedOperations = requiredTemporaryIds.length ? await OfflineStore.all('operation-queue') : [];
      const result = /** @type {WorkPackage & { queued?: boolean }} */ (await api(`/work-packages/${encodeURIComponent(state.publicId)}/editor`, {
        method: 'PUT', body, queueable: true,
        queueMetadata: { operationKey: `work-package:${state.publicId}`, requiredTemporaryIds, dependsOn: queuedOperations.filter((operation) => requiredTemporaryIds.includes(operation.temporaryId || '')).map((operation) => operation.id), entityType: 'work_package', entityPublicId: state.publicId, dirtyPackagePublicId: state.publicId, label: `Save ${state.pack.packageReference}` }
      }));
      if ('queued' in result && result.queued) { emit('queued'); return state.pack; }
      if (state.revision === revision) { mergeLivePackage(state.pack, result); state.pack.scheduleRackChanges = []; state.dirty = false; await OfflineStore.delete('dirty-work-packages', state.publicId); emit('saved'); }
      else { mergeVersions(state.pack, result); const appliedDevices = new Set(body.scheduleRackChanges.map((entry) => entry.devicePublicId)); state.pack.scheduleRackChanges = (state.pack.scheduleRackChanges || []).filter((entry) => !appliedDevices.has(entry.devicePublicId)); await persistDirty(); emit('changed'); scheduleSave(); }
      return state.pack;
    } catch (error) {
      await persistDirty(); emit(error && typeof error === 'object' && 'code' in error && error.code === 'version_conflict' ? 'conflict' : 'error', error); throw error;
    }
  });
  state.tail = operation.catch(() => undefined);
  return operation;
}

function scheduleSave() {
  if (!active) return;
  if (active.timer) clearTimeout(active.timer);
  active.timer = setTimeout(() => { if (active) active.timer = null; performSave().catch(() => undefined); }, DEBOUNCE_MS);
}

/** @param {(pack: WorkPackage) => void} mutation */
export async function mutatePackage(mutation) {
  if (!active) throw new Error('No work package is open');
  if (active.pack.status === 'complete') throw new Error('Reopen the completed work package before making changes');
  mutation(active.pack); active.dirty = true; active.revision += 1;
  await persistDirty(); emit('changed'); scheduleSave();
  return active.pack;
}

export async function flushAll() {
  if (!active) return;
  if (active.timer) { clearTimeout(active.timer); active.timer = null; }
  await performSave(); await active.tail;
}

/** @param {string} publicId */
export async function openPackage(publicId) {
  if (active?.publicId === publicId) {
    if (!navigator.onLine) return active.pack;
    const dirty = await OfflineStore.get('dirty-work-packages', publicId);
    if (!dirty) {
      const server = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(publicId)}?refresh=${Date.now()}`));
      mergeLivePackage(active.pack, server); active.dirty = false; emit('saved');
    }
    return active.pack;
  }
  await flushAll();
  const server = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(publicId)}`));
  const dirty = /** @type {{ snapshot?: WorkPackage } | undefined} */ (await OfflineStore.get('dirty-work-packages', publicId));
  const pack = dirty?.snapshot?.publicId === publicId ? /** @type {WorkPackage} */ (dirty.snapshot) : server;
  pack.scheduleRackChanges ||= [];
  active = { publicId, pack, dirty: Boolean(dirty), revision: 0, timer: null, tail: Promise.resolve(), listeners: new Set() };
  if (dirty) { mergeVersions(pack, server); emit('changed'); scheduleSave(); }
  return pack;
}

/** @param {(status: string, detail?: unknown) => void} listener */
export function observePackage(listener) { if (!active) return () => {}; active.listeners.add(listener); return () => active?.listeners.delete(listener); }

export function packageSaveState() { return active ? { dirty: active.dirty, pack: active.pack } : null; }

export async function discardPackageChanges() {
  if (!active) return null;
  const publicId = active.publicId; if (active.timer) clearTimeout(active.timer);
  await active.tail; await OfflineStore.delete('dirty-work-packages', publicId); active = null;
  return openPackage(publicId);
}

export async function rebasePackageChanges() {
  if (!active) return null;
  const state = active; const latest = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(state.publicId)}?refresh=${Date.now()}`));
  mergeVersions(state.pack, latest); state.dirty = true; state.revision += 1; await persistDirty(); return performSave();
}
