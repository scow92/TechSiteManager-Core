import { api } from '../api.js';
import { app, el, errorMessage, field, multilineField, notify, pageHead, selectField } from '../dom.js';
import { renderPresentation } from '../presentation.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').WorkPackage} WorkPackage */
/** @typedef {import('../../../server/types/browser-models').ExporterDescriptor} ExporterDescriptor */
/** @typedef {import('../../../server/types/browser-models').PresentationProfile} PresentationProfile */
/** @typedef {import('../../../server/types/browser-models').SiteRecord} SiteRecord */

/** @param {string} title @param {string} hint @param {...Node} children */
function detailSection(title, hint, ...children) {
  return el('section', { class: 'details-section' }, el('div', { class: 'details-section-head' }, el('span', {}, title), el('span', { class: 'details-hint' }, hint)), el('div', { class: 'wb-body' }, ...children));
}

/** @param {HTMLFormElement} form @param {string} path @param {Record<string, unknown>} defaults @param {() => Promise<void>} rerender */
function createHandler(form, path, defaults, rerender) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const values = /** @type {Record<string, unknown>} */ (Object.fromEntries(new FormData(form)));
      for (const input of form.querySelectorAll('input[type="number"]')) {
        if (!(input instanceof HTMLInputElement)) continue;
        if (input.name && input.value !== '') values[input.name] = Number(input.value);
        else if (input.name) delete values[input.name];
      }
      await api(path, { method: 'POST', body: { ...defaults, ...values } });
      notify('Record added');
      await rerender();
    } catch (error) { notify(errorMessage(error)); }
  });
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function detailsView(pack, user, rerender) {
  const description = multilineField('Description', 'description', pack.description);
  description.classList.add('field-wide');
  const form = el('form', { class: 'stack' }, el('div', { class: 'form-grid' }, field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true), selectField('Status', 'status', ['planned', 'active', 'blocked', 'complete', 'cancelled'], pack.status), field('External reference', 'externalReference'), field('Project reference', 'projectReference'), field('Lead assignee', 'leadAssignee'), field('Assignees (comma separated)', 'assignees'), description), ...(user.role !== 'viewer' ? [el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Save work package'))] : []));
  for (const [name, value] of Object.entries({ packageReference: pack.packageReference, title: pack.title, externalReference: pack.externalReference || '', projectReference: pack.projectReference || '', leadAssignee: pack.leadAssignee || '', assignees: pack.assignees.join(', ') })) {
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) control.value = value;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(form));
      await api(`/work-packages/${encodeURIComponent(pack.publicId)}`, { method: 'PUT', body: { ...values, assignees: String(values.assignees || '').split(',').map((value) => value.trim()).filter(Boolean), _baseVersion: pack.version } });
      notify('Work package saved');
      await rerender();
    } catch (error) { notify(errorMessage(error)); }
  });
  return el('div', { class: 'stack' }, detailSection('Work package details', 'Shared metadata and assignment', form),
    detailSection('Record overview', 'Current canonical references', el('div', { class: 'overview-grid' },
      el('div', {}, el('span', { class: 'eyebrow' }, 'Site'), el('strong', {}, `${pack.site.code} — ${pack.site.name}`)),
      el('div', {}, el('span', { class: 'eyebrow' }, 'External reference'), el('strong', {}, pack.externalReference || 'Not recorded')),
      el('div', {}, el('span', { class: 'eyebrow' }, 'Project reference'), el('strong', {}, pack.projectReference || 'Not recorded')),
      el('div', {}, el('span', { class: 'eyebrow' }, 'Assignees'), el('strong', {}, pack.assignees.join(', ') || 'Unassigned')))));
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function workItemsView(pack, user, rerender) {
  const panels = pack.workItems.map((item, index) => {
    const panel = detailSection(item.itemReference, item.status,
      el('h2', { class: 'work-item-title' }, item.title), el('p', { class: 'muted' }, item.description || 'No work description recorded.'));
    panel.hidden = index !== 0;
    return panel;
  });
  const tabs = el('div', { class: 'work-item-tabs', role: 'tablist', 'aria-label': 'Work items' }, ...pack.workItems.map((item, index) => {
    const tab = el('button', { class: `work-item-tab${index === 0 ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(index === 0) }, item.itemReference);
    tab.addEventListener('click', () => {
      for (const [panelIndex, panel] of panels.entries()) panel.hidden = panelIndex !== index;
      for (const candidate of tabs.querySelectorAll('[role="tab"]')) {
        const selected = candidate === tab;
        candidate.classList.toggle('active', selected);
        candidate.setAttribute('aria-selected', String(selected));
      }
    });
    return tab;
  }));
  const records = pack.workItems.length
    ? el('div', { class: 'work-item-grid' }, ...panels)
    : el('div', { class: 'empty-state' }, el('h2', {}, 'No work items recorded'), el('p', {}, 'Add the first generic work item to this package.'));
  if (user.role === 'viewer') return el('div', { class: 'stack' }, tabs, records);
  const create = el('form', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Add work item')),
    el('div', { class: 'form-grid' }, field('Item reference', 'itemReference', 'text', true), field('Title', 'title', 'text', true), selectField('Status', 'status', ['planned', 'active', 'blocked', 'complete', 'cancelled'], 'planned'), multilineField('Work description', 'description')),
    el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Add work item')));
  createHandler(create, `/work-packages/${encodeURIComponent(pack.publicId)}/work-items`, { sequence: pack.workItems.length }, rerender);
  return el('div', { class: 'stack' }, tabs, records, create);
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function connectionsView(pack, user, rerender) {
  const circuits = pack.circuits.length ? pack.circuits.map((circuit) => {
    const segmentRows = circuit.segments.map((segment) => el('tr', {}, el('td', {}, segment.segmentReference), el('td', {}, segment.fromEndpoint), el('td', {}, segment.toEndpoint), el('td', {}, segment.lengthMetres === null ? '—' : `${segment.lengthMetres} m`), el('td', {}, segment.notes || '')));
    const segmentTable = circuit.segments.length
      ? el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...['Segment reference', 'From endpoint', 'To endpoint', 'Length', 'Notes'].map((heading) => el('th', {}, heading)))), el('tbody', {}, ...segmentRows)))
      : el('p', { class: 'empty-inline' }, 'No physical segments recorded.');
    return detailSection(circuit.circuitReference, `${circuit.media} · ${circuit.status}`,
      el('p', { class: 'muted' }, circuit.description || 'No circuit description recorded.'), segmentTable,
    ...(user.role !== 'viewer' ? [(() => {
      const form = el('form', { class: 'inline-record-form' }, field('Segment reference', 'segmentReference', 'text', true), field('From endpoint', 'fromEndpoint', 'text', true), field('To endpoint', 'toEndpoint', 'text', true), field('Length (m)', 'lengthMetres', 'number'), field('Notes', 'notes'), el('button', { type: 'submit' }, 'Add segment'));
      createHandler(form, `/work-packages/${encodeURIComponent(pack.publicId)}/circuits/${encodeURIComponent(circuit.publicId)}/segments`, { sequence: circuit.segments.length }, rerender);
      return form;
    })()] : []));
  }) : [el('div', { class: 'empty-state' }, el('h2', {}, 'No circuits recorded'), el('p', {}, 'Connections are logical circuits containing one or more physical segments.'))];
  if (user.role === 'viewer') return el('div', { class: 'stack' }, ...circuits);
  const create = el('form', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Add circuit')),
    el('div', { class: 'form-grid' }, field('Circuit reference', 'circuitReference', 'text', true), field('Media', 'media', 'text', true), selectField('Status', 'status', ['planned', 'active', 'blocked', 'complete', 'cancelled'], 'planned'), field('Description', 'description')),
    el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Add circuit')));
  createHandler(create, `/work-packages/${encodeURIComponent(pack.publicId)}/circuits`, {}, rerender);
  return el('div', { class: 'stack' }, ...circuits, create);
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function consumablesView(pack, user, rerender) {
  const rows = pack.consumableRequirements.map((requirement) => el('tr', {}, el('td', {}, requirement.description), el('td', {}, requirement.quantityRequired), el('td', {}, requirement.unit || '')));
  const table = pack.consumableRequirements.length
    ? el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...['Description', 'Quantity required', 'Unit'].map((heading) => el('th', {}, heading)))), el('tbody', {}, ...rows)))
    : el('div', { class: 'empty-state' }, el('h2', {}, 'No consumable requirements recorded'), el('p', {}, 'Requirements belong to this work package, not the shared catalogue.'));
  if (user.role === 'viewer') return table;
  const create = el('form', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Add consumable requirement')),
    el('div', { class: 'form-grid' }, field('Description', 'description', 'text', true), field('Quantity required', 'quantityRequired', 'number', true), field('Unit', 'unit', 'text', true)), el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Add requirement')));
  createHandler(create, `/work-packages/${encodeURIComponent(pack.publicId)}/consumable-requirements`, {}, rerender);
  return el('div', { class: 'stack' }, table, create);
}

/** @param {string} publicId @param {User} user @param {string} [section] */
export async function packageView(publicId, user, section = 'details') {
  const [pack, exporters, presentation] = await Promise.all([
    /** @type {Promise<WorkPackage>} */ (api(`/work-packages/${encodeURIComponent(publicId)}`)),
    /** @type {Promise<ExporterDescriptor[]>} */ (api('/plugin-exporters')),
    /** @type {Promise<PresentationProfile | null>} */ (api('/presentation-profiles/work-package'))
  ]);
  const rerender = () => packageView(publicId, user, section);
  const siteDevices = /** @type {SiteRecord[]} */ (await api(`/sites/${encodeURIComponent(pack.site.publicId)}/devices`));
  const selectedView = presentation && (presentation.views.find((view) => view.id === section) || presentation.views[0]);
  const content = presentation && selectedView ? renderPresentation(presentation, selectedView, pack, user, rerender) : section === 'work-items' ? workItemsView(pack, user, rerender) : section === 'connections' ? connectionsView(pack, user, rerender) : section === 'consumables' ? consumablesView(pack, user, rerender) : detailsView(pack, user, rerender);
  const deviceListId = 'canonical-site-devices';
  for (const control of content.querySelectorAll('input[name="fromEndpoint"], input[name="toEndpoint"]')) control.setAttribute('list', deviceListId);
  content.append(el('datalist', { id: deviceListId }, ...siteDevices.map((device) => el('option', { value: device.hostname || '', label: device.rackPublicId ? `Rack device · ${device.label || device.hostname}` : `Site device · ${device.label || device.hostname}` }))));
  const exports = el('div', { class: 'page-actions' }, el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(pack.publicId)}/export?format=json` }, 'JSON'), el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(pack.publicId)}/export?format=csv` }, 'CSV'), ...exporters.map((exporter) => el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(pack.publicId)}/plugin-exports/${encodeURIComponent(exporter.id)}` }, exporter.label)));
  app.replaceChildren(el('section', { class: 'view stack' }, el('p', { class: 'breadcrumb' }, el('a', { href: '#home' }, 'Home'), ' / ', pack.packageReference), pageHead(pack.packageReference, selectedView?.description || pack.title, el('span', { class: 'badge', 'data-status': pack.status }, pack.status), exports), content));
}
