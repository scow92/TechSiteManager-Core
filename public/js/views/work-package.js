import { api } from '../api.js';
import { app, el, errorMessage, field, multilineField, notify, pageHead, selectField } from '../dom.js';
import { renderPresentation } from '../presentation.js';
import { discardPackageChanges, flushAll, mergeLivePackage, mutatePackage, observePackage, openPackage, rebasePackageChanges } from '../work-package-store.js';
import { cableScheduleView } from './cable-schedule.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').WorkPackage} WorkPackage */
/** @typedef {import('../../../server/types/browser-models').WorkItem} WorkItem */
/** @typedef {import('../../../server/types/browser-models').PhotoRecord} PhotoRecord */
/** @typedef {import('../../../server/types/browser-models').ExporterDescriptor} ExporterDescriptor */
/** @typedef {import('../../../server/types/browser-models').PresentationProfile} PresentationProfile */

let stopObserving = () => {};

/** @param {string} title @param {string} hint @param {...Node} children */
function detailSection(title, hint, ...children) { return el('section', { class: 'details-section' }, el('div', { class: 'details-section-head' }, el('span', {}, title), el('span', { class: 'details-hint' }, hint)), el('div', { class: 'wb-body' }, ...children)); }

/** @param {HTMLFormElement} form @param {object} values */
function setValues(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) control.value = value === null || value === undefined ? '' : String(value);
  }
}

/** @param {HTMLFormElement} form @param {boolean} enabled @param {(values: Record<string, FormDataEntryValue>) => void} update */
function autosave(form, enabled, update) {
  form.addEventListener('submit', (event) => event.preventDefault());
  for (const control of form.querySelectorAll('input, textarea, select, button')) if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement || control instanceof HTMLButtonElement) control.disabled = !enabled;
  if (!enabled) return;
  const changed = async () => {
    try { const values = /** @type {Record<string, FormDataEntryValue>} */ (Object.fromEntries(new FormData(form))); await mutatePackage(() => update(values)); }
    catch (error) { notify(errorMessage(error)); }
  };
  form.addEventListener('input', changed); form.addEventListener('change', changed);
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function detailsView(pack, user, rerender) {
  const editable = user.role !== 'viewer' && pack.status !== 'complete';
  const description = multilineField('Description', 'description', pack.description); description.classList.add('field-wide');
  const saveNow = el('button', { type: 'button', onclick: async () => { try { await flushAll(); notify('Work package saved'); } catch (error) { notify(errorMessage(error)); } } }, 'Save work package');
  const statusOptions = pack.status === 'complete' ? ['complete'] : ['planned', 'active', 'blocked', 'cancelled'];
  const form = el('form', { class: 'stack pack-editor-form', 'aria-label': 'Work package details editor' }, el('div', { class: 'form-grid' }, field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true), selectField('Status', 'status', statusOptions, pack.status), field('External reference', 'externalReference'), field('Project reference', 'projectReference'), field('Lead assignee', 'leadAssignee'), field('Assignees (comma separated)', 'assignees'), description), ...(editable ? [el('div', { class: 'form-actions' }, saveNow)] : []));
  setValues(form, { packageReference: pack.packageReference, title: pack.title, externalReference: pack.externalReference, projectReference: pack.projectReference, leadAssignee: pack.leadAssignee, assignees: pack.assignees.join(', ') });
  autosave(form, editable, (values) => {
    pack.packageReference = String(values.packageReference); pack.title = String(values.title); pack.description = String(values.description || ''); pack.status = String(values.status); pack.externalReference = String(values.externalReference || '') || null; pack.projectReference = String(values.projectReference || '') || null; pack.leadAssignee = String(values.leadAssignee || '') || null; pack.assignees = String(values.assignees || '').split(',').map((value) => value.trim()).filter(Boolean);
  });
  const lock = pack.status === 'complete' ? el('div', { class: 'notice notice-warn', role: 'status' }, `Completed ${pack.completedAt || ''}${pack.completedBy ? ` by ${pack.completedBy.displayName}` : ''}. Reopen before editing.`) : user.role === 'viewer' ? el('div', { class: 'notice', role: 'status' }, 'Viewer access is read-only.') : null;
  return el('div', { class: 'stack' }, ...(lock ? [lock] : []), detailSection('Work package details', 'Changes save together after a short pause', form), detailSection('Record overview', 'Current canonical references', el('div', { class: 'overview-grid' },
    el('div', {}, el('span', { class: 'eyebrow' }, 'Site'), el('strong', {}, `${pack.site.code} — ${pack.site.name}`)),
    el('div', {}, el('span', { class: 'eyebrow' }, 'External reference'), el('strong', {}, pack.externalReference || 'Not recorded')),
    el('div', {}, el('span', { class: 'eyebrow' }, 'Project reference'), el('strong', {}, pack.projectReference || 'Not recorded')),
    el('div', {}, el('span', { class: 'eyebrow' }, 'Assignees'), el('strong', {}, pack.assignees.join(', ') || 'Unassigned')))), completionControls(pack, user, rerender));
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function completionControls(pack, user, rerender) {
  if (user.role !== 'admin') return el('div');
  if (pack.status === 'complete') return detailSection('Package completion', 'Administrator controlled', el('button', { type: 'button', class: 'secondary', onclick: async () => {
    try { const result = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(pack.publicId)}/completion`, { method: 'DELETE', body: { _baseVersion: pack.version, status: 'active' } })); mergeLivePackage(pack, result); notify('Work package reopened'); await rerender(); } catch (error) { notify(errorMessage(error)); }
  } }, 'Reopen work package'));
  const incomplete = pack.workItems.filter((item) => !['complete', 'cancelled'].includes(item.status));
  return detailSection('Package completion', 'Locks package, child, handover and offline mutations', el('p', { class: 'muted' }, incomplete.length ? `${incomplete.length} work item${incomplete.length === 1 ? '' : 's'} must be completed or removed first.` : 'All work items are complete. The package is ready to lock.'), el('button', { type: 'button', disabled: incomplete.length ? '' : null, onclick: async () => {
    try { await flushAll(); const result = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(pack.publicId)}/completion`, { method: 'POST', body: { _baseVersion: pack.version } })); mergeLivePackage(pack, result); notify('Work package completed'); await rerender(); } catch (error) { notify(errorMessage(error)); }
  } }, 'Complete and lock package'));
}

/** @param {WorkPackage} pack @param {WorkItem} item @param {boolean} editable @param {() => Promise<void>} rerender */
function workItemPanel(pack, item, editable, rerender) {
  const itemEditable = editable && item.status !== 'complete';
  const form = el('form', { class: 'stack child-editor', 'aria-label': `${item.itemReference} editor` }, el('div', { class: 'form-grid' }, field('Item reference', 'itemReference', 'text', true), field('Title', 'title', 'text', true), selectField('Status', 'status', ['planned', 'active', 'blocked', 'cancelled'], item.status), field('Lead assignee', 'leadAssignee'), field('Assignees (comma separated)', 'assignees'), multilineField('Work description', 'description', item.description)));
  setValues(form, { itemReference: item.itemReference, title: item.title, leadAssignee: item.leadAssignee, assignees: item.assignees.join(', ') });
  autosave(form, itemEditable, (values) => { item.itemReference = String(values.itemReference); item.title = String(values.title); item.status = String(values.status); item.description = String(values.description || ''); item.leadAssignee = String(values.leadAssignee || '') || null; item.assignees = String(values.assignees || '').split(',').map((value) => value.trim()).filter(Boolean); });
  const actions = [];
  if (editable && item.status !== 'complete') actions.push(el('button', { type: 'button', onclick: async () => {
    try { await flushAll(); const result = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(pack.publicId)}/work-items/${encodeURIComponent(item.publicId)}/completion`, { method: 'POST', body: { _baseVersion: item.version } })); mergeLivePackage(pack, result); notify('Work item completed'); await rerender(); } catch (error) { notify(errorMessage(error)); }
  } }, 'Complete work item'), el('button', { type: 'button', class: 'danger', onclick: async () => { await mutatePackage(() => pack.workItems.splice(pack.workItems.indexOf(item), 1)); await rerender(); } }, 'Remove work item'));
  if (editable && item.status === 'complete') actions.push(el('button', { type: 'button', class: 'secondary', onclick: async () => {
    try { const result = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(pack.publicId)}/work-items/${encodeURIComponent(item.publicId)}/completion`, { method: 'DELETE', body: { _baseVersion: item.version, status: 'active' } })); mergeLivePackage(pack, result); notify('Work-item completion cleared'); await rerender(); } catch (error) { notify(errorMessage(error)); }
  } }, 'Clear completion'));
  return detailSection(item.itemReference, item.status === 'complete' ? `Completed${item.completedBy ? ` by ${item.completedBy.displayName}` : ''}` : item.status, form, ...(actions.length ? [el('div', { class: 'form-actions' }, ...actions)] : []));
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function workItemsView(pack, user, rerender) {
  const editable = user.role !== 'viewer' && pack.status !== 'complete';
  const panels = pack.workItems.map((item, index) => { const panel = workItemPanel(pack, item, editable, rerender); panel.hidden = index !== 0; return panel; });
  const tabs = el('div', { class: 'work-item-tabs', role: 'tablist', 'aria-label': 'Work items' }, ...pack.workItems.map((item, index) => {
    const tab = el('button', { class: `work-item-tab${index ? '' : ' active'}`, type: 'button', role: 'tab', 'aria-selected': String(index === 0) }, item.itemReference);
    tab.addEventListener('click', () => { panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== index; }); [...tabs.children].forEach((candidate) => { candidate.classList.toggle('active', candidate === tab); candidate.setAttribute('aria-selected', String(candidate === tab)); }); }); return tab;
  }));
  const empty = pack.workItems.length ? null : el('div', { class: 'empty-state' }, el('h2', {}, 'No work items recorded'), el('p', {}, 'Add the first work item to begin assignment and completion tracking.'));
  const add = editable ? el('button', { type: 'button', class: 'secondary', onclick: async () => { await mutatePackage(() => pack.workItems.push({ publicId: crypto.randomUUID(), itemReference: `ITEM-${pack.workItems.length + 1}`, title: 'New work item', description: '', status: 'planned', sequence: pack.workItems.length, leadAssignee: null, assignees: [], completedAt: null, completedBy: null, handoverPhotos: [], version: 0, extensions: {} })); await rerender(); } }, 'Add work item') : null;
  return el('div', { class: 'stack' }, ...(add ? [el('div', { class: 'form-actions' }, add)] : []), tabs, ...(empty ? [empty] : panels));
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function consumablesView(pack, user, rerender) {
  const editable = user.role !== 'viewer' && pack.status !== 'complete';
  const rows = pack.consumableRequirements.map((requirement) => {
    const row = el('tr', {}, ...[['description', requirement.description, 'text'], ['quantityRequired', requirement.quantityRequired, 'number'], ['unit', requirement.unit || '', 'text']].map(([name, value, type]) => el('td', {}, el('input', { name, value, type, disabled: editable ? null : '', 'aria-label': name }))));
    for (const input of row.querySelectorAll('input')) input.addEventListener('input', async () => { await mutatePackage(() => { requirement.description = /** @type {HTMLInputElement} */ (row.querySelector('[name="description"]')).value; requirement.quantityRequired = Number(/** @type {HTMLInputElement} */ (row.querySelector('[name="quantityRequired"]')).value); requirement.unit = /** @type {HTMLInputElement} */ (row.querySelector('[name="unit"]')).value; }); });
    if (editable) row.append(el('td', {}, el('button', { type: 'button', class: 'danger compact-button', onclick: async () => { await mutatePackage(() => pack.consumableRequirements.splice(pack.consumableRequirements.indexOf(requirement), 1)); await rerender(); } }, 'Remove'))); return row;
  });
  const add = editable ? el('button', { type: 'button', class: 'secondary', onclick: async () => { await mutatePackage(() => pack.consumableRequirements.push({ publicId: crypto.randomUUID(), cataloguePublicId: null, description: 'New requirement', quantityRequired: 1, unit: 'each', version: 0, extensions: {} })); await rerender(); } }, 'Add consumable requirement') : null;
  return el('div', { class: 'stack' }, ...(add ? [el('div', { class: 'form-actions' }, add)] : []), pack.consumableRequirements.length ? el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...['Description', 'Quantity', 'Unit', ...(editable ? [''] : [])].map((heading) => el('th', {}, heading)))), el('tbody', {}, ...rows))) : el('div', { class: 'empty-state' }, el('h2', {}, 'No package requirements recorded'), el('p', {}, 'Requirements are transactional children of this package.')));
}

/** @param {WorkPackage} pack */
async function refreshPhotos(pack) { const refreshed = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(pack.publicId)}?refresh=${Date.now()}`)); mergeLivePackage(pack, refreshed); }

/** @param {WorkPackage} pack @param {string} label @param {'work_package' | 'work_item'} entityType @param {string} entityId @param {PhotoRecord[]} photos @param {boolean} editable @param {() => Promise<void>} rerender */
function handoverGallery(pack, label, entityType, entityId, photos, editable, rerender) {
  const cards = photos.map((photo) => {
    const metadata = el('form', { class: 'stack photo-metadata' }, field('Name', 'name', 'text', true), multilineField('Comment', 'description', photo.description)); setValues(metadata, photo);
    metadata.addEventListener('submit', async (event) => { event.preventDefault(); try { const values = Object.fromEntries(new FormData(metadata)); await api(`/photos/${encodeURIComponent(photo.publicId)}`, { method: 'PUT', body: { name: values.name, description: values.description, _baseVersion: photo.version } }); await refreshPhotos(pack); notify('Handover photo updated'); await rerender(); } catch (error) { notify(errorMessage(error)); } });
    for (const control of metadata.querySelectorAll('input, textarea')) if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) control.disabled = !editable;
    return el('article', { class: 'photo-card' }, el('h3', {}, photo.name), el('a', { href: `/api/photos/${encodeURIComponent(photo.publicId)}/content`, target: '_blank', rel: 'noopener' }, el('img', { src: `/api/photos/${encodeURIComponent(photo.publicId)}/content`, alt: photo.name, loading: 'lazy' })), metadata, ...(editable ? [el('div', { class: 'form-actions' }, el('button', { type: 'submit', onclick: () => metadata.requestSubmit() }, 'Save comment'), el('button', { type: 'button', class: 'danger', onclick: async () => { try { await api(`/photos/${encodeURIComponent(photo.publicId)}?baseVersion=${photo.version}`, { method: 'DELETE' }); await refreshPhotos(pack); notify('Handover photo deleted'); await rerender(); } catch (error) { notify(errorMessage(error)); } } }, 'Delete'))] : []));
  });
  const upload = editable ? el('form', { class: 'inline-record-form handover-upload' }, field('Photo', 'photo', 'file', true), field('Name', 'name', 'text', true), field('Comment', 'description'), el('button', { type: 'submit' }, 'Upload')) : null;
  if (upload) upload.addEventListener('submit', async (event) => { event.preventDefault(); try { await flushAll(); const values = new FormData(upload); const file = values.get('photo'); if (!(file instanceof File) || !file.size) throw new Error('Choose a JPEG, PNG, or WebP photo'); const response = await fetch(`/api/photos/${entityType}/${encodeURIComponent(entityId)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'X-Photo-Name': encodeURIComponent(String(values.get('name') || file.name)), 'X-Photo-Description': encodeURIComponent(String(values.get('description') || '')) }, body: file }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Upload failed'); await refreshPhotos(pack); notify('Handover photo uploaded'); await rerender(); } catch (error) { notify(errorMessage(error)); } });
  return detailSection(label, `${photos.length} handover photo${photos.length === 1 ? '' : 's'}`, ...(upload ? [upload] : []), cards.length ? el('div', { class: 'photo-grid' }, ...cards) : el('p', { class: 'empty-inline' }, 'No handover evidence recorded.'));
}

/** @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function handoverView(pack, user, rerender) { const editable = user.role !== 'viewer' && pack.status !== 'complete'; return el('div', { class: 'stack' }, handoverGallery(pack, 'Package handover', 'work_package', pack.publicId, pack.handoverPhotos, editable, rerender), ...pack.workItems.map((item) => handoverGallery(pack, item.itemReference, 'work_item', item.publicId, item.handoverPhotos, editable, rerender))); }

/** @param {string} publicId @param {User} user @param {string} [section] */
export async function packageView(publicId, user, section = 'details') {
  const pack = await openPackage(publicId);
  const [exporters, presentation, cableReferences] = await Promise.all([/** @type {Promise<ExporterDescriptor[]>} */ (api('/plugin-exporters')), /** @type {Promise<PresentationProfile | null>} */ (api('/presentation-profiles/work-package')), /** @type {Promise<import('../../../server/types/browser-models').CableReferenceData>} */ (api(`/sites/${encodeURIComponent(pack.site.publicId)}/cable-reference-data`))]);
  const rerender = () => packageView(publicId, user, section);
  const selectedView = presentation?.views.find((view) => view.id === section);
  const scheduleMedia = section === 'connections' || section === 'fibre' ? 'fibre' : section === 'copper' ? 'copper' : section === 'dac' ? 'dac' : null;
  const content = section === 'work-items' ? workItemsView(pack, user, rerender) : scheduleMedia ? cableScheduleView(pack, user, scheduleMedia, cableReferences, rerender) : section === 'consumables' ? consumablesView(pack, user, rerender) : section === 'handover' ? handoverView(pack, user, rerender) : selectedView ? renderPresentation(/** @type {PresentationProfile} */ (presentation), selectedView, pack, user, async () => { await refreshPhotos(pack); await rerender(); }) : detailsView(pack, user, rerender);
  const deviceListId = 'canonical-site-devices'; for (const control of content.querySelectorAll('input[name="fromEndpoint"], input[name="toEndpoint"]')) control.setAttribute('list', deviceListId);
  content.append(el('datalist', { id: deviceListId }, ...cableReferences.devices.map((device) => el('option', { value: device.hostname || '', label: device.rackPublicId ? `Rack device · ${device.label || device.hostname}` : `Site device · ${device.label || device.hostname}` }))));
  const saveStatus = el('span', { class: 'save-status', role: 'status', 'aria-live': 'polite', 'data-state': 'saved' }, 'All changes saved');
  const conflict = el('aside', { class: 'notice notice-warn conflict-panel', hidden: '', role: 'alert' }, el('strong', {}, 'This package changed elsewhere.'), el('p', {}, 'Keep this draft and reapply it to the latest version, or discard the local draft.'), el('div', { class: 'form-actions' }, el('button', { type: 'button', onclick: async () => { try { await rebasePackageChanges(); conflict.hidden = true; notify('Draft reapplied'); await rerender(); } catch (error) { notify(errorMessage(error)); } } }, 'Reapply draft'), el('button', { type: 'button', class: 'secondary', onclick: async () => { try { await discardPackageChanges(); conflict.hidden = true; notify('Local draft discarded'); await rerender(); } catch (error) { notify(errorMessage(error)); } } }, 'Discard draft')));
  stopObserving(); stopObserving = observePackage((status) => { const labels = /** @type {Record<string, string>} */ ({ changed: 'Unsaved changes', saving: 'Saving…', queued: 'Saved on this device · waiting for connection', saved: 'All changes saved', conflict: 'Save conflict', error: 'Save failed · draft retained' }); saveStatus.textContent = labels[status] || status; saveStatus.dataset.state = status; if (status === 'conflict') conflict.hidden = false; });
  const exports = [el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(pack.publicId)}/export?format=json` }, 'JSON'), el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(pack.publicId)}/export?format=csv` }, 'CSV'), el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(pack.publicId)}/export?format=print`, target: '_blank', rel: 'noopener' }, 'Print / PDF'), ...exporters.map((exporter) => el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(pack.publicId)}/plugin-exports/${encodeURIComponent(exporter.id)}` }, exporter.label))];
  app.replaceChildren(el('section', { class: `view stack package-view${pack.status === 'complete' ? ' completed-record' : ''}` }, el('p', { class: 'breadcrumb' }, el('a', { href: '#home' }, 'Home'), ' / ', pack.packageReference), pageHead(pack.packageReference, selectedView?.description || pack.title, el('span', { class: 'badge', 'data-status': pack.status }, pack.status), saveStatus, ...exports), conflict, content));
}
