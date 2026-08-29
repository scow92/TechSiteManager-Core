import { api } from '../api.js';
import { app, el, errorMessage, field, selectField, notify } from '../dom.js';
import { offlineStatus } from '../offline-ui.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').Site} Site */
/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').WorkPackageSummary} WorkPackageSummary */
/** @typedef {import('../../../server/types/browser-models').SearchRecord} SearchRecord */

/** @param {WorkPackageSummary | SearchRecord} record */
function packageResult(record) {
  if (!record.publicId) return el('div', { class: 'notice notice-warn' }, 'Record identity unavailable');
  const reference = record.packageReference || record.title || 'Untitled work package';
  return el('a', { class: 'start-job', href: `#package/${encodeURIComponent(record.publicId)}/details`, 'aria-label': reference },
    el('span', { class: 'start-result-copy' },
      el('span', { class: 'start-job-ref' }, reference),
      el('span', { class: 'start-job-sub' }, [record.siteName, record.projectReference || record.externalReference].filter(Boolean).join(' · ') || 'Work package record')),
    el('span', { class: 'start-result-arrow', 'aria-hidden': 'true' }, '→'));
}

/** @param {string} icon @param {string} title @param {string} description @param {string} label */
function searchPanel(icon, title, description, label) {
  const input = el('input', { class: 'start-site-search-input', type: 'search', placeholder: title === 'Find a site' ? 'ID, prefix, code, or name…' : 'ID, reference, project, or site…', 'aria-label': label });
  const results = el('div', { class: 'start-site-results', role: 'status', 'aria-live': 'polite' });
  const node = el('section', { class: 'start-site-search' },
    el('div', { class: 'start-search-heading' }, el('span', { class: 'start-search-icon', 'aria-hidden': 'true' }, icon), el('div', {}, el('h2', {}, title), el('p', {}, description))), input, results);
  return { node, input, results };
}

/** @param {User} user @param {() => Promise<void>} render */
export async function homeView(user, render) {
  const [packages, providers, synchronization, sites] = await Promise.all([
    /** @type {Promise<WorkPackageSummary[]>} */ (api('/work-packages')),
    /** @type {Promise<ProviderDescriptor[]>} */ (api('/import-providers')),
    offlineStatus(render),
    /** @type {Promise<Site[]>} */ (api('/sites'))
  ]);
  const siteSearch = searchPanel('▤', 'Find a site', 'Search canonical locations and records.', 'Site Search');
  siteSearch.input.addEventListener('input', () => {
    const query = siteSearch.input.value.trim().toLowerCase();
    siteSearch.results.classList.toggle('has-results', Boolean(query));
    if (!query) return siteSearch.results.replaceChildren();
    const matches = sites.filter((site) => [site.publicId, site.code, site.name, site.description].some((value) => String(value || '').toLowerCase().includes(query)));
    siteSearch.results.replaceChildren(...(matches.length ? [
      el('p', { class: 'search-result-count' }, `${matches.length} site${matches.length === 1 ? '' : 's'} found`),
      ...matches.map((site) => el('a', { class: 'start-job', href: `#site/${encodeURIComponent(site.publicId)}/overview` },
        el('span', { class: 'start-result-copy' }, el('span', { class: 'start-job-ref' }, site.name), el('span', { class: 'start-job-sub' }, site.code)), el('span', { class: 'start-result-arrow', 'aria-hidden': 'true' }, '→')))
    ] : [el('p', { class: 'empty-inline' }, `No sites match “${siteSearch.input.value.trim()}”.`)]));
  });

  const packageSearch = searchPanel('☷', 'Find a work package', 'Search references, projects, sites, and child records.', 'Work Package Search');
  /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
  packageSearch.input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = packageSearch.input.value.trim();
    packageSearch.results.classList.toggle('has-results', Boolean(query));
    if (!query) return packageSearch.results.replaceChildren();
    packageSearch.results.replaceChildren(el('p', { class: 'loading' }, 'Searching…'));
    timer = setTimeout(async () => {
      try {
        const rows = /** @type {SearchRecord[]} */ (await api(`/search?scope=all&q=${encodeURIComponent(query)}`));
        const workPackages = rows.filter((row) => !row.entityType || row.entityType === 'work_package');
        packageSearch.results.replaceChildren(...(workPackages.length ? [el('p', { class: 'search-result-count' }, `${workPackages.length} work package${workPackages.length === 1 ? '' : 's'} found`), ...workPackages.map(packageResult)] : [el('p', { class: 'empty-inline' }, `No work packages match “${query}”.`)]));
      } catch (error) { packageSearch.results.replaceChildren(el('p', { class: 'error' }, errorMessage(error))); }
    }, 180);
  });

  const create = el('form', { class: 'panel stack create-package', hidden: '' }, el('div', { class: 'section-head' }, el('h2', {}, 'Add work package')),
    el('div', { class: 'form-grid' }, selectField('Site', 'sitePublicId', sites.map((site) => ({ value: site.publicId, label: `${site.code} — ${site.name}` }))), field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true), field('Project reference (optional)', 'projectReference')),
    el('div', { class: 'form-actions' }, el('button', { type: 'button', class: 'secondary', onclick: () => { create.hidden = true; } }, 'Cancel'), el('button', { type: 'submit', disabled: sites.length ? null : '' }, 'Add work package')));
  create.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(create));
      const created = /** @type {{ publicId: string }} */ (await api('/work-packages', { method: 'POST', body: { ...values, status: 'planned', assignees: [], workItems: [], circuits: [], consumableRequirements: [] } }));
      location.hash = `#package/${created.publicId}/details`;
    } catch (error) { notify(errorMessage(error)); }
  });

  const importCards = providers.length ? providers.map((provider) => el('a', { class: 'start-card', href: `#import/${encodeURIComponent(provider.id)}` }, el('span', { class: 'start-card-ico', 'aria-hidden': 'true' }, '▩'), el('span', { class: 'start-card-title' }, provider.label), el('span', { class: 'start-card-desc' }, 'Validate the source, review normalized changes, and apply atomically.'))) : [el('a', { class: 'start-card', href: '#import' }, el('span', { class: 'start-card-ico', 'aria-hidden': 'true' }, '▩'), el('span', { class: 'start-card-title' }, 'Import providers'), el('span', { class: 'start-card-desc' }, 'No providers are installed; generic records remain fully available.'))];
  const active = packages.filter((entry) => !['complete', 'cancelled'].includes(entry.status));
  const completed = packages.filter((entry) => entry.status === 'complete');
  const add = user.role !== 'viewer' ? el('button', { type: 'button', class: 'secondary', onclick: () => { create.hidden = false; create.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, 'Add work package') : null;

  app.replaceChildren(el('section', { class: 'view start-view' }, ...(synchronization ? [synchronization] : []),
    el('header', { class: 'start-hero page-head' }, el('div', {}, el('h1', {}, 'Home'), el('p', { class: 'page-subtitle' }, 'Find a site to view its infrastructure and records, or open a work package.')), ...(add ? [el('div', { class: 'page-actions' }, add)] : [])),
    el('div', { class: 'start-search-grid' }, siteSearch.node, packageSearch.node), el('div', { class: 'start-cards' }, ...importCards), create,
    el('h2', { class: 'start-sub' }, 'Recent work packages'), el('div', { class: 'start-jobs' }, ...(active.length ? active.slice(0, 12).map(packageResult) : [el('div', { class: 'empty-state compact' }, el('p', {}, 'No active work packages yet.'))])),
    el('h2', { class: 'start-sub' }, 'Recently completed work packages'), el('div', { class: 'start-jobs' }, ...(completed.length ? completed.slice(0, 12).map(packageResult) : [el('div', { class: 'empty-state compact' }, el('p', {}, 'No completed work packages yet.'))]))));
}
