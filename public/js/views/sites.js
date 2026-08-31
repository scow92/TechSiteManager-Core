import { api } from '../api.js';
import { app, el, emptyState, errorMessage, field, multilineField, notify, pageHead } from '../dom.js';
import { infrastructureSection } from './infrastructure.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').Site} Site */
/** @typedef {import('../../../server/types/browser-models').SiteRecord} SiteRecord */

/** @param {string} publicId */
function siteUpdateKey(publicId) { return `site:update:${publicId}`; }

/** @param {string} publicId */
async function siteSynchronization(publicId) {
  const key = siteUpdateKey(publicId);
  const path = `/sites/${publicId}`;
  const [queued, rejected] = await Promise.all([OfflineStore.all('operation-queue'), OfflineStore.all('dead-letters')]);
  /** @param {OfflineOperation} operation */
  const matches = (operation) => operation.operationKey === key || (operation.method === 'PUT' && operation.path === path);
  return { queued: queued.find(matches) || null, rejected: rejected.find(matches) || null };
}

/** @param {OfflineOperation | null} operation @param {Site} fallback @returns {Site} */
function siteDraft(operation, fallback) {
  if (!operation || typeof operation.body !== 'string') return fallback;
  try {
    const draft = JSON.parse(operation.body);
    if (!draft || typeof draft !== 'object') return fallback;
    return {
      ...fallback,
      code: typeof draft.code === 'string' ? draft.code : fallback.code,
      name: typeof draft.name === 'string' ? draft.name : fallback.name,
      description: typeof draft.description === 'string' ? draft.description : fallback.description
    };
  } catch { return fallback; }
}

/** @param {Site} site */
async function cacheSite(site) {
  const cached = await OfflineStore.get('reference-cache', '/sites');
  if (!Array.isArray(cached)) return;
  const sites = cached.filter((entry) => entry && typeof entry === 'object');
  const index = sites.findIndex((entry) => 'publicId' in entry && entry.publicId === site.publicId);
  if (index === -1) sites.push(site); else sites[index] = site;
  await OfflineStore.put('reference-cache', sites, '/sites');
}

/** @param {User} user */
export async function sitesView(user) {
  const sites = /** @type {Site[]} */ (await api('/sites'));
  const formError = el('p', { class: 'form-error', role: 'alert', 'aria-live': 'assertive' });
  const form = el('form', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Add site')),
    el('div', { class: 'form-grid' }, field('Code', 'code', 'text', true), field('Name', 'name', 'text', true), field('Description', 'description')),
    formError, el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Add site')));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';
    try {
      const values = Object.fromEntries(new FormData(form));
      const temporaryId = `urn:offline:${crypto.randomUUID()}`;
      const result = /** @type {{ queued?: boolean }} */ (await api('/sites', { method: 'POST', body: values, queueable: true, queueMetadata: { temporaryId, entityType: 'site', entityPublicId: temporaryId, label: String(values.code || '') } }));
      if (result.queued) await cacheSite({ publicId: temporaryId, code: String(values.code || ''), name: String(values.name || ''), description: String(values.description || ''), version: 0 });
      notify(result.queued ? 'Site queued for sync' : 'Site created');
      await sitesView(user);
    } catch (error) { formError.textContent = errorMessage(error); notify(errorMessage(error)); }
  });
  const cards = el('div', { class: 'stack' }, ...sites.map((site) => el('article', { class: 'card site-card' },
    el('div', { class: 'site-card-main' }, el('a', { class: 'site-code', href: `#site/${site.publicId}` }, site.code), el('h2', {}, site.name), el('p', { class: 'muted' }, site.description || 'No description recorded.')),
    el('a', { class: 'button secondary', href: `#site/${site.publicId}` }, 'Open site'))));
  app.replaceChildren(el('section', { class: 'stack' }, pageHead('Sites', 'Canonical rooms, racks, termination points and devices shared by every work package.'), sites.length ? cards : emptyState('No sites yet', 'Create the first site to begin recording infrastructure.'),
    user.role !== 'viewer' ? form : el('p', { class: 'muted' }, 'Read-only access')));
}

/** @param {string} publicId @param {User} user @param {string} [section] */
export async function siteView(publicId, user, section = 'overview') {
  const sites = /** @type {Site[]} */ (await api('/sites'));
  const site = sites.find((entry) => entry.publicId === publicId);
  if (!site) throw new Error('Site not found');
  const synchronization = await siteSynchronization(publicId);
  const kinds = [['rooms', 'Rooms'], ['racks', 'Racks'], ['termination-points', 'Termination points'], ['devices', 'Devices'], ['distances', 'Distance samples']];
  const records = /** @type {SiteRecord[][]} */ (await Promise.all(kinds.map(([kind]) => api(`/sites/${encodeURIComponent(publicId)}/${kind}`))));
  const [rooms, racks, , devices] = records;
  const roomCards = rooms.map((room) => {
    const roomRacks = racks.filter((rack) => rack.roomPublicId === room.publicId);
    return el('article', { class: 'room-card' }, el('h3', {}, room.name),
      el('p', { class: 'muted' }, room.description || 'No room description recorded.'),
      el('span', { class: 'count-badge' }, `${roomRacks.length} rack${roomRacks.length === 1 ? '' : 's'}`));
  });
  const rackPreviews = racks.map((rack) => {
    const installed = devices.filter((device) => device.rackPublicId === rack.publicId && device.side !== 'rear');
    return el('article', { class: 'rack-preview' },
      el('div', { class: 'rack-preview-head' }, el('strong', {}, rack.label), el('span', { class: 'badge' }, `${rack.sizeUnits || 47}U`)),
      el('div', { class: 'rack-face', style: `--rack-units:${rack.sizeUnits || 47}` },
        installed.length ? installed.map((device) => el('div', {
          class: 'rack-device',
          style: `--device-u:${Math.max(1, device.sizeUnits || 1)};--rack-u:${Math.max(1, device.rackUnit || 1)}`,
          title: `${device.hostname} · U${device.rackUnit || '?'}`
        }, device.label || device.hostname)) : el('span', { class: 'rack-empty' }, 'No front devices')),
      el('p', { class: 'muted rack-meta' }, rack.suiteLine ? `Suite line ${rack.suiteLine}` : 'Suite line not recorded'));
  });
  const roomSection = rooms.length ? el('section', { class: 'panel' }, el('div', { class: 'section-head' }, el('h2', {}, 'Rooms'), el('span', { class: 'count-badge' }, rooms.length)), el('div', { class: 'room-grid' }, ...roomCards)) : emptyState('No rooms recorded', 'Add a room before placing racks and devices.');
  const rackSection = racks.length ? el('section', { class: 'panel' }, el('div', { class: 'section-head' }, el('h2', {}, section === 'racks' ? 'Rack elevations' : 'Rack previews'), el('span', { class: 'count-badge' }, racks.length)), el('div', { class: `rack-preview-grid${section === 'racks' ? ' rack-elevation-grid' : ''}` }, ...rackPreviews)) : emptyState('No racks recorded', 'Racks are canonical site records and remain available to every work package.');
  const selectedIndex = { rooms: 0, racks: 1, 'termination-points': 2, devices: 3, distances: 4 }[section];
  const content = selectedIndex !== undefined ? await infrastructureSection({ site, user, section, records, rerender: () => siteView(publicId, user, section) }) : el('div', { class: 'stack' },
    el('div', { class: 'summary-grid site-summary' },
      el('div', { class: 'summary-card' }, el('strong', {}, rooms.length), el('span', {}, 'Rooms')),
      el('div', { class: 'summary-card' }, el('strong', {}, racks.length), el('span', {}, 'Racks')),
      el('div', { class: 'summary-card' }, el('strong', {}, devices.length), el('span', {}, 'Devices'))),
    roomSection, rackSection);
  const edit = el('button', { type: 'button' }, 'Edit site');
  const editError = el('p', { class: 'form-error', role: 'alert', 'aria-live': 'assertive' });
  const conflictActions = el('div', { class: 'form-actions', hidden: '' });
  const editForm = el('form', { class: 'panel stack', hidden: '' },
    el('div', { class: 'section-head' }, el('h2', {}, 'Edit site')),
    el('div', { class: 'form-grid' },
      el('label', { class: 'field' }, el('span', {}, 'Code'), el('input', { name: 'code', required: '', maxlength: 64, value: site.code })),
      el('label', { class: 'field' }, el('span', {}, 'Name'), el('input', { name: 'name', required: '', maxlength: 255, value: site.name })),
      multilineField('Description', 'description', site.description)),
    editError, conflictActions,
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'secondary', onclick: () => { editForm.hidden = true; editError.textContent = ''; } }, 'Cancel'),
      el('button', { type: 'submit' }, 'Save site')));
  let baseVersion = site.version;
  /** @param {Site} draft */
  const setFormDraft = (draft) => {
    for (const name of /** @type {const} */ (['code', 'name', 'description'])) {
      const control = editForm.elements.namedItem(name);
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) control.value = draft[name];
    }
  };
  edit.addEventListener('click', () => { editForm.hidden = false; editForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    editError.textContent = '';
    conflictActions.hidden = true;
    const values = Object.fromEntries(new FormData(editForm));
    const body = { code: String(values.code || ''), name: String(values.name || ''), description: String(values.description || ''), _baseVersion: baseVersion };
    try {
      const result = /** @type {{ queued?: boolean }} */ (await api(`/sites/${encodeURIComponent(publicId)}`, {
        method: 'PUT', body, queueable: true,
        queueMetadata: { operationKey: siteUpdateKey(publicId), entityType: 'site', entityPublicId: publicId, label: site.code }
      }));
      if (synchronization.rejected) await OfflineStore.delete('dead-letters', synchronization.rejected.id);
      if (result.queued) {
        await cacheSite({ ...site, code: body.code, name: body.name, description: body.description });
        notify('Site update queued for sync');
      } else notify('Site saved');
      await siteView(publicId, user, section);
    } catch (error) {
      editError.textContent = errorMessage(error);
      if (error && typeof error === 'object' && 'code' in error && error.code === 'version_conflict') {
        const reapply = el('button', { type: 'button', class: 'secondary', onclick: async () => {
          const latestSites = /** @type {Site[]} */ (await api('/sites'));
          const latest = latestSites.find((entry) => entry.publicId === publicId);
          if (!latest) return;
          baseVersion = latest.version;
          editError.textContent = 'Latest site version loaded. Review your retained draft, then save again to reapply it.';
          conflictActions.hidden = true;
        } }, 'Review and reapply draft');
        const discard = el('button', { type: 'button', class: 'secondary', onclick: () => siteView(publicId, user, section) }, 'Discard draft and reload');
        conflictActions.replaceChildren(discard, reapply);
        conflictActions.hidden = false;
      }
      notify(errorMessage(error));
    }
  });
  const synchronizationPanels = [];
  if (synchronization.queued) synchronizationPanels.push(el('aside', { class: 'panel stack', role: 'status' },
    el('h2', {}, 'Site update pending'), el('p', { class: 'muted' }, 'This site edit is stored on this device and will be replayed when the connection returns.')));
  if (synchronization.rejected) {
    const rejectedOperation = synchronization.rejected;
    const rejectedDraft = siteDraft(rejectedOperation, site);
    const conflict = rejectedOperation.reason === 'version_conflict' || rejectedOperation.serverCode === 'version_conflict';
    synchronizationPanels.push(el('aside', { class: 'panel stack', role: 'alert' },
      el('h2', {}, 'Site update needs review'),
      el('p', { class: 'error' }, conflict
        ? 'An offline site edit was rejected because the site changed since it was loaded. The retained draft has not overwritten the saved site.'
        : `An offline site edit was rejected by the server${rejectedOperation.serverMessage ? `: ${rejectedOperation.serverMessage}` : '.'} The retained draft has not overwritten the saved site.`),
      el('div', { class: 'form-actions' },
        el('button', { type: 'button', class: 'secondary', onclick: async () => { await OfflineStore.delete('dead-letters', rejectedOperation.id); await siteView(publicId, user, section); } }, 'Discard offline draft'),
        el('button', { type: 'button', onclick: () => { setFormDraft(rejectedDraft); baseVersion = site.version; editForm.hidden = false; editForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, 'Review offline draft'))));
  }
  app.replaceChildren(el('section', { class: 'view stack' }, el('p', { class: 'breadcrumb' }, el('a', { href: '#home' }, 'Home'), ' / ', site.code),
    pageHead(`${site.code} — ${site.name}`, site.description || 'Canonical site infrastructure and measured distances.', ...(user.role === 'viewer' ? [] : [edit])),
    ...(user.role === 'viewer' ? [el('p', { class: 'muted' }, 'Read-only access')] : []),
    ...synchronizationPanels, editForm, content));
}
