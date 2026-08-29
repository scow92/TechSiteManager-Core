import { api } from '../api.js';
import { app, el, emptyState, errorMessage, field, notify, pageHead } from '../dom.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').Site} Site */
/** @typedef {import('../../../server/types/browser-models').SiteRecord} SiteRecord */

/** @param {User} user */
export async function sitesView(user) {
  const sites = /** @type {Site[]} */ (await api('/sites'));
  const form = el('form', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Add site')),
    el('div', { class: 'form-grid' }, field('Code', 'code', 'text', true), field('Name', 'name', 'text', true), field('Description', 'description')),
    el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Add site')));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const temporaryId = `urn:offline:${crypto.randomUUID()}`;
      const result = await api('/sites', { method: 'POST', body: Object.fromEntries(new FormData(form)), queueable: true, queueMetadata: { temporaryId } });
      notify(result.queued ? 'Site queued for sync' : 'Site created');
      await sitesView(user);
    } catch (error) { notify(errorMessage(error)); }
  });
  const cards = el('div', { class: 'stack' }, ...sites.map((site) => el('article', { class: 'card site-card' },
    el('div', { class: 'site-card-main' }, el('a', { class: 'site-code', href: `#site/${site.publicId}` }, site.code), el('h2', {}, site.name), el('p', { class: 'muted' }, site.description || 'No description recorded.')),
    el('a', { class: 'button secondary', href: `#site/${site.publicId}` }, 'Open site'))));
  app.replaceChildren(el('section', { class: 'stack' }, pageHead('Sites', 'Canonical rooms, racks, termination points and devices shared by every work package.'), sites.length ? cards : emptyState('No sites yet', 'Create the first site to begin recording infrastructure.'),
    user.role !== 'viewer' ? form : el('p', { class: 'muted' }, 'Read-only access')));
}

/** @param {string} publicId */
export async function siteView(publicId) {
  const sites = /** @type {Site[]} */ (await api('/sites'));
  const site = sites.find((entry) => entry.publicId === publicId);
  if (!site) throw new Error('Site not found');
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
  const sections = kinds.map(([, label], index) => el('section', { class: 'panel record-panel' },
    el('div', { class: 'section-head' }, el('h2', {}, label), el('span', { class: 'count-badge' }, records[index].length)), records[index].length
      ? el('ul', { class: 'record-list' }, ...records[index].map((record) => el('li', {}, record.name || record.label || record.hostname || `${record.endpointA} → ${record.endpointB}`)))
      : el('p', { class: 'empty-inline' }, `No ${label.toLowerCase()} recorded.`)));
  app.replaceChildren(el('section', { class: 'stack' }, el('p', { class: 'breadcrumb' }, el('a', { href: '#sites' }, 'Sites'), ' / ', site.code),
    pageHead(`${site.code} — ${site.name}`, site.description || 'Canonical site infrastructure and measured distances.'),
    rooms.length ? el('section', { class: 'panel' }, el('div', { class: 'section-head' }, el('h2', {}, 'Rooms'), el('span', { class: 'count-badge' }, rooms.length)), el('div', { class: 'room-grid' }, ...roomCards)) : null,
    racks.length ? el('section', { class: 'panel' }, el('div', { class: 'section-head' }, el('h2', {}, 'Rack previews'), el('span', { class: 'count-badge' }, racks.length)), el('div', { class: 'rack-preview-grid' }, ...rackPreviews)) : null,
    el('div', { class: 'site-record-grid' }, ...sections)));
}
