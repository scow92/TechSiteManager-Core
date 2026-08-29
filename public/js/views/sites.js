import { api } from '../api.js';
import { app, el, errorMessage, field, notify } from '../dom.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').Site} Site */
/** @typedef {import('../../../server/types/browser-models').SiteRecord} SiteRecord */

/** @param {User} user */
export async function sitesView(user) {
  const sites = /** @type {Site[]} */ (await api('/sites'));
  const form = el('form', { class: 'panel stack' }, el('h2', {}, 'Add site'), field('Code', 'code', 'text', true), field('Name', 'name', 'text', true), field('Description', 'description'), el('button', { type: 'submit' }, 'Add site'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const temporaryId = `urn:offline:${crypto.randomUUID()}`;
      const result = await api('/sites', { method: 'POST', body: Object.fromEntries(new FormData(form)), queueable: true, queueMetadata: { temporaryId } });
      notify(result.queued ? 'Site queued for sync' : 'Site created');
      await sitesView(user);
    } catch (error) { notify(errorMessage(error)); }
  });
  const cards = el('div', { class: 'grid' }, ...sites.map((site) => el('article', { class: 'card' },
    el('h2', {}, el('a', { href: `#site/${site.publicId}` }, site.code)), el('p', {}, site.name), el('p', { class: 'muted' }, site.description))));
  app.replaceChildren(el('section', { class: 'stack' }, el('h1', {}, 'Sites'), cards,
    user.role !== 'viewer' ? form : el('p', { class: 'muted' }, 'Read-only access')));
}

/** @param {string} publicId */
export async function siteView(publicId) {
  const sites = /** @type {Site[]} */ (await api('/sites'));
  const site = sites.find((entry) => entry.publicId === publicId);
  if (!site) throw new Error('Site not found');
  const kinds = [['rooms', 'Rooms'], ['racks', 'Racks'], ['termination-points', 'Termination points'], ['devices', 'Devices'], ['distances', 'Distance samples']];
  const records = /** @type {SiteRecord[][]} */ (await Promise.all(kinds.map(([kind]) => api(`/sites/${encodeURIComponent(publicId)}/${kind}`))));
  const sections = kinds.map(([, label], index) => el('section', { class: 'panel' }, el('h2', {}, label), records[index].length
    ? el('ul', {}, ...records[index].map((record) => el('li', {}, record.name || record.label || record.hostname || `${record.endpointA} → ${record.endpointB}`)))
    : el('p', { class: 'muted' }, `No ${label.toLowerCase()} recorded.`)));
  app.replaceChildren(el('section', { class: 'stack' }, el('a', { href: '#sites' }, '← Sites'), el('div', { class: 'panel' }, el('h1', {}, `${site.code} — ${site.name}`), el('p', {}, site.description)), ...sections));
}
