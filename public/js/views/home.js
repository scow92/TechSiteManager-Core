import { api } from '../api.js';
import { app, el, errorMessage, field, selectField, notify } from '../dom.js';
import { offlineStatus } from '../offline-ui.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').Site} Site */
/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').WorkPackageSummary} WorkPackageSummary */
/** @typedef {import('../../../server/types/browser-models').SearchRecord} SearchRecord */
/** @typedef {import('../../../server/types/browser-models').PresentationProfile} PresentationProfile */

/** @param {WorkPackageSummary | SearchRecord} record @param {{ singular: string, plural: string }} terms @param {string} initialView */
function packageResult(record, terms, initialView) {
  if (!record.publicId) return el('div', { class: 'notice notice-warn' }, 'Record identity unavailable');
  const reference = record.packageReference || record.title || 'Untitled work package';
  return el('a', { class: 'start-job', href: `#package/${encodeURIComponent(record.publicId)}/${initialView}`, 'aria-label': reference },
    el('span', { class: 'start-result-copy' },
      el('span', { class: 'start-job-ref' }, reference),
      el('span', { class: 'start-job-sub' }, [record.siteName, record.projectReference || record.externalReference].filter(Boolean).join(' · ') || `${terms.singular} record`)),
    el('span', { class: 'start-result-arrow', 'aria-hidden': 'true' }, '→'));
}

/** @param {string} title @param {string} description */
function searchPanel(title, description) {
  const input = el('input', { class: 'start-site-search-input', type: 'search', placeholder: 'ID, reference, site, rack, device, endpoint…', 'aria-label': 'Search all records' });
  const results = el('div', { class: 'start-site-results', role: 'status', 'aria-live': 'polite' });
  const node = el('section', { class: 'start-site-search' },
    el('div', { class: 'start-search-heading' }, el('span', { class: 'start-search-icon', 'aria-hidden': 'true' }, '⌕'), el('div', {}, el('h2', {}, title), el('p', {}, description))), input, results);
  return { node, input, results };
}

/** @param {SearchRecord} record @param {{ singular: string, plural: string }} terms @param {string} initialView */
function searchResult(record, terms, initialView) {
  const definitions = {
    work_package: { label: terms.singular, section: '' },
    site: { label: 'Site', section: 'overview' },
    room: { label: 'Room', section: 'rooms' },
    rack: { label: 'Rack', section: 'racks' },
    termination_point: { label: 'Termination point', section: 'termination-points' },
    device: { label: 'Device', section: 'devices' },
    distance: { label: 'Distance', section: 'distances' }
  };
  const entityType = record.entityType || 'work_package';
  const definition = definitions[entityType];
  if (!definition || !record.publicId) return null;
  const title = entityType === 'work_package' ? record.packageReference || record.title || `Untitled ${terms.singular.toLowerCase()}`
    : entityType === 'site' ? record.title || record.reference || 'Untitled site'
      : record.title || 'Untitled record';
  const href = entityType === 'work_package' ? `#package/${encodeURIComponent(record.publicId)}/${initialView}`
    : entityType === 'site' ? `#site/${encodeURIComponent(record.publicId)}/overview`
      : record.sitePublicId ? `#site/${encodeURIComponent(record.sitePublicId)}/${definition.section}` : '';
  if (!href) return null;
  const context = entityType === 'work_package'
    ? [record.siteName, record.projectReference || record.externalReference, record.matchedWorkItems?.length ? `Work items: ${record.matchedWorkItems.map((item) => item.itemReference).join(', ')}` : null].filter(Boolean).join(' · ')
    : entityType === 'site' ? [record.reference || record.siteCode, record.description].filter(Boolean).join(' · ')
      : [record.siteCode, record.siteName].filter(Boolean).join(' — ');
  return el('a', { class: 'start-job', href, 'aria-label': title },
    el('span', { class: 'start-result-copy' },
      el('span', { class: 'start-result-heading' }, el('span', { class: 'start-job-ref' }, title), el('span', { class: 'search-result-type' }, definition.label)),
      el('span', { class: 'start-job-sub' }, context || `${definition.label} record`)),
    el('span', { class: 'start-result-arrow', 'aria-hidden': 'true' }, '→'));
}

/** @param {User} user @param {() => Promise<void>} render */
export async function homeView(user, render) {
  const [packages, providers, synchronization, sites, presentation] = await Promise.all([
    /** @type {Promise<WorkPackageSummary[]>} */ (api('/work-packages')),
    /** @type {Promise<ProviderDescriptor[]>} */ (api('/import-providers')),
    offlineStatus(render),
    /** @type {Promise<Site[]>} */ (api('/sites')),
    /** @type {Promise<PresentationProfile | null>} */ (api('/presentation-profiles/work-package'))
  ]);
  const terms = presentation?.terms || { singular: 'Work package', plural: 'Work packages' };
  const initialView = presentation?.views[0]?.id || 'details';
  const recordSearch = searchPanel('Search everything', `Find sites, ${terms.plural.toLowerCase()}, rooms, racks, termination points, devices, and distances.`);
  /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
  let requestVersion = 0;
  recordSearch.input.addEventListener('input', () => {
    clearTimeout(timer);
    requestVersion += 1;
    const version = requestVersion;
    const query = recordSearch.input.value.trim();
    recordSearch.results.classList.toggle('has-results', Boolean(query));
    if (!query) return recordSearch.results.replaceChildren();
    recordSearch.results.replaceChildren(el('p', { class: 'loading' }, 'Searching…'));
    timer = setTimeout(async () => {
      try {
        const rows = /** @type {SearchRecord[]} */ (await api(`/search?scope=all&q=${encodeURIComponent(query)}`));
        if (version !== requestVersion) return;
        /** @type {HTMLElement[]} */ const results = [];
        let resultCount = 0;
        const groups = [
          { label: `Active ${terms.plural.toLowerCase()}`, rows: rows.filter((record) => record.entityType === 'work_package' && record.group === 'active') },
          { label: `Completed ${terms.plural.toLowerCase()}`, rows: rows.filter((record) => record.entityType === 'work_package' && record.group === 'completed') },
          { label: 'Sites and infrastructure', rows: rows.filter((record) => record.entityType !== 'work_package') }
        ];
        for (const group of groups) if (group.rows.length) {
          results.push(el('h3', { class: 'search-group-heading' }, group.label));
          for (const record of group.rows) { const result = searchResult(record, terms, initialView); if (result) { results.push(result); resultCount += 1; } }
        }
        recordSearch.results.replaceChildren(...(results.length ? [el('p', { class: 'search-result-count' }, `${resultCount} record${resultCount === 1 ? '' : 's'} found`), ...results] : [el('p', { class: 'empty-inline' }, `No records match “${query}”.`)]));
      } catch (error) { if (version === requestVersion) recordSearch.results.replaceChildren(el('p', { class: 'error' }, errorMessage(error))); }
    }, 180);
  });

  const create = el('form', { class: 'panel stack create-package', hidden: '' }, el('div', { class: 'section-head' }, el('h2', {}, `Add ${terms.singular.toLowerCase()}`)),
    el('div', { class: 'form-grid' }, selectField('Site', 'sitePublicId', sites.map((site) => ({ value: site.publicId, label: `${site.code} — ${site.name}` }))), field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true), field('Project reference (optional)', 'projectReference')),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'secondary', onclick: () => { create.hidden = true; } }, 'Cancel'), el('button', { type: 'submit', disabled: sites.length ? null : '' }, `Add ${terms.singular.toLowerCase()}`)));
  create.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(create));
      const created = /** @type {{ publicId: string }} */ (await api('/work-packages', { method: 'POST', body: { ...values, status: 'planned', assignees: [], workItems: [], circuits: [], consumableRequirements: [] } }));
      location.hash = `#package/${created.publicId}/${initialView}`;
    } catch (error) { notify(errorMessage(error)); }
  });

  const importCards = providers.length ? providers.map((provider) => el('a', { class: 'start-card', href: `#import/${encodeURIComponent(provider.id)}` }, el('span', { class: 'start-card-ico', 'aria-hidden': 'true' }, '▩'), el('span', { class: 'start-card-title' }, provider.label), el('span', { class: 'start-card-desc' }, 'Validate the source, review normalized changes, and apply atomically.'))) : [el('a', { class: 'start-card', href: '#import' }, el('span', { class: 'start-card-ico', 'aria-hidden': 'true' }, '▩'), el('span', { class: 'start-card-title' }, 'Import providers'), el('span', { class: 'start-card-desc' }, 'No providers are installed; generic records remain fully available.'))];
  const active = packages.filter((entry) => entry.status !== 'complete');
  const completed = packages.filter((entry) => entry.status === 'complete');
  const add = user.role !== 'viewer' ? el('button', { type: 'button', class: 'secondary', onclick: () => { create.hidden = false; create.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, `Add ${terms.singular.toLowerCase()}`) : null;

  app.replaceChildren(el('section', { class: 'view start-view' }, ...(synchronization ? [synchronization] : []),
    el('header', { class: 'start-hero page-head' }, el('div', {}, el('h1', {}, 'Home'), el('p', { class: 'page-subtitle' }, `Search ${terms.plural.toLowerCase()}, sites, and infrastructure from one place.`)), ...(add ? [el('div', { class: 'page-actions' }, add)] : [])),
    el('div', { class: 'start-search-grid' }, recordSearch.node), el('div', { class: 'start-cards' }, ...importCards), create,
    el('h2', { class: 'start-sub' }, `Recent ${terms.plural.toLowerCase()}`), el('div', { class: 'start-jobs' }, ...(active.length ? active.slice(0, 12).map((record) => packageResult(record, terms, initialView)) : [el('div', { class: 'empty-state compact' }, el('p', {}, `No active ${terms.plural.toLowerCase()} yet.`))])),
    el('h2', { class: 'start-sub' }, `Recently completed ${terms.plural.toLowerCase()}`), el('div', { class: 'start-jobs' }, ...(completed.length ? completed.slice(0, 12).map((record) => packageResult(record, terms, initialView)) : [el('div', { class: 'empty-state compact' }, el('p', {}, `No completed ${terms.plural.toLowerCase()} yet.`))]))));
}
