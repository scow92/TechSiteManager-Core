import { api } from '../api.js';
import { app, el, errorMessage, field, selectField, notify } from '../dom.js';
import { offlineStatus } from '../offline-ui.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').Site} Site */
/** @typedef {import('../../../server/types/browser-models').ExporterDescriptor} ExporterDescriptor */
/** @typedef {import('../../../server/types/browser-models').WorkPackageSummary} WorkPackageSummary */
/** @typedef {import('../../../server/types/browser-models').SearchRecord} SearchRecord */

/** @param {User} user @param {() => Promise<void>} render */
export async function homeView(user, render) {
  const packagePromise = /** @type {Promise<WorkPackageSummary[]>} */ (api('/work-packages'));
  const exporterPromise = /** @type {Promise<ExporterDescriptor[]>} */ (api('/plugin-exporters'));
  const sitePromise = /** @type {Promise<Site[]>} */ (api('/sites'));
  const [packages, exporters, synchronization, sites] = await Promise.all([packagePromise, exporterPromise, offlineStatus(render), sitePromise]);
  const search = el('input', { type: 'search', placeholder: 'Search packages, sites, racks, devices, and endpoints', 'aria-label': 'Search records' });
  const list = el('div', { class: 'grid' });
  /** @param {readonly SearchRecord[]} rows */
  const show = (rows) => list.replaceChildren(...rows.map((record) => {
    if (record.entityType && record.entityType !== 'work_package') return el('article', { class: 'card' }, el('span', { class: 'badge' }, record.entityType.replaceAll('_', ' ')), el('h2', {}, record.reference || record.title), el('p', { class: 'muted' }, [record.siteCode, record.siteName].filter(Boolean).join(' — ')));
    if (!record.publicId) return el('article', { class: 'card' }, el('p', { class: 'error' }, 'Record identity unavailable'));
    const publicId = record.publicId;
    const links = [
      el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(publicId)}/export?format=json` }, 'JSON'),
      el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(publicId)}/export?format=csv` }, 'CSV'),
      ...exporters.map((exporter) => el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(publicId)}/plugin-exports/${encodeURIComponent(exporter.id)}` }, exporter.label))
    ];
    return el('article', { class: 'card' }, el('span', { class: 'badge' }, record.status), el('h2', {}, el('a', { href: `#package/${record.publicId}` }, record.packageReference)), el('p', {}, record.title), el('p', { class: 'muted' }, `${record.siteCode} — ${record.siteName}`), el('p', { class: 'muted' }, record.externalReference || record.projectReference || 'No external reference'), el('div', { class: 'actions' }, links));
  }));
  show(packages);
  /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => show(search.value.trim() ? await api(`/search?scope=all&q=${encodeURIComponent(search.value.trim())}`) : packages), 180);
  });
  /** @type {HTMLFormElement | null} */ let create = null;
  if (user.role !== 'viewer') {
    create = el('form', { class: 'panel stack' }, el('h2', {}, 'Add work package'),
      selectField('Site', 'sitePublicId', sites.map((site) => ({ value: site.publicId, label: `${site.code} — ${site.name}` }))),
      field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true),
      field('Project reference (optional)', 'projectReference'), el('button', { type: 'submit', disabled: sites.length ? null : '' }, 'Add work package'),
      ...(!sites.length ? [el('p', { class: 'muted' }, 'Create a site before adding a work package.')] : []));
    const createForm = create;
    createForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const values = Object.fromEntries(new FormData(createForm));
        const created = /** @type {{ publicId: string }} */ (await api('/work-packages', { method: 'POST', body: { ...values, status: 'planned', assignees: [], workItems: [], circuits: [], consumableRequirements: [] } }));
        location.hash = `#package/${created.publicId}`;
      } catch (error) { notify(errorMessage(error)); }
    });
  }
  app.replaceChildren(el('section', { class: 'stack' }, ...(synchronization ? [synchronization] : []), el('div', { class: 'toolbar' }, el('label', {}, 'Search', search)), packages.length ? list : el('div', { class: 'panel' }, el('h1', {}, 'Work Packages'), el('p', { class: 'muted' }, 'No work packages have been created yet. Generic records remain available without import plugins.')), ...(create ? [create] : [])));
}
