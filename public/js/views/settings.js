import { api } from '../api.js';
import { app, el, errorMessage, field, notify, pageHead, selectField } from '../dom.js';
import { enableNotifications, notificationState, unsubscribeNotifications } from '../pwa.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').ExporterDescriptor} ExporterDescriptor */
/** @typedef {import('../../../server/types/browser-models').ConsumableCatalogueRecord} ConsumableCatalogueRecord */
/** @typedef {import('../../../server/types/browser-models').FibreSku} FibreSku */

/** @param {HTMLFormElement} form @param {(values:Record<string,FormDataEntryValue>, event:SubmitEvent)=>Promise<void>} action */
function submit(form, action) {
  const error = el('p', { class: 'form-error', role: 'alert' }); form.append(error);
  form.addEventListener('submit', async (rawEvent) => {
    rawEvent.preventDefault(); error.textContent = '';
    try { await action(Object.fromEntries(new FormData(form)), /** @type {SubmitEvent} */ (rawEvent)); } catch (caught) { error.textContent = errorMessage(caught); }
  });
  return form;
}

/** @param {HTMLFormElement} form @param {Record<string,unknown>} values */
function setInputs(form, values) {
  for (const [name, value] of Object.entries(values)) {
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement && control.type !== 'checkbox') control.value = value === null || value === undefined ? '' : String(value);
  }
}

/** @param {string} path @param {(records:any[])=>any[]} update */
async function updateCachedList(path, update) {
  const cached = await OfflineStore.get('reference-cache', path);
  if (Array.isArray(cached)) await OfflineStore.put('reference-cache', update(cached), path);
}

/** @param {'consumable'|'fibre-sku'} kind @param {'POST'|'PUT'|'DELETE'} method @param {string} path @param {Record<string,unknown>} body @param {string|null} recordId */
async function queuedCatalogueMutation(kind, method, path, body, recordId) {
  const collection = kind === 'consumable' ? '/catalogue/consumables' : '/catalogue/fibre-skus';
  const temporaryId = method === 'POST' ? `urn:offline:${crypto.randomUUID()}` : null;
  const publicId = recordId || temporaryId;
  const requiredTemporaryIds = recordId?.startsWith('urn:offline:') ? [recordId] : [];
  const operations = requiredTemporaryIds.length ? await OfflineStore.all('operation-queue') : [];
  const result = /** @type {{queued?:boolean,publicId?:string}|null} */ (await api(path, {
    method, body: method === 'DELETE' ? undefined : body, queueable: true,
    queueMetadata: { temporaryId, requiredTemporaryIds, dependsOn: operations.filter((operation) => requiredTemporaryIds.includes(operation.temporaryId || '')).map((operation) => operation.id), operationKey: `catalogue:${kind}:${publicId}:${method}`, entityType: kind, entityPublicId: publicId, label: String(body.catalogueReference || body.sku || '') }
  }));
  if (result?.queued) await updateCachedList(collection, (records) => method === 'POST' ? [...records, { publicId: temporaryId, version: 0, active: true, ...body }] : method === 'DELETE' ? records.filter((record) => record.publicId !== publicId) : records.map((record) => record.publicId === publicId ? { ...record, ...body } : record));
  notify(result?.queued ? 'Catalogue change queued for synchronization' : 'Catalogue saved');
}

/** @param {User} user @param {()=>Promise<void>} rerender */
function profilePanel(user, rerender) {
  if (user.role === 'viewer') return el('section', { class: 'panel stack' }, el('h2', {}, 'Engineer profile'), el('p', { class: 'muted' }, 'Viewer accounts do not participate in assignment workload.'));
  const profile = user.profile;
  const form = submit(el('form', { class: 'panel stack' }, el('h2', {}, 'Engineer profile'), el('p', { class: 'muted' }, 'The assignment name is matched as one complete value, never as a substring.'), el('div', { class: 'form-grid' }, field('Exact assignment name', 'assignmentName', 'text', true), field('Job title', 'jobTitle'), field('Weekly capacity hours', 'weeklyCapacityHours', 'number', true)), el('button', { type: 'submit' }, profile ? 'Update profile' : 'Create profile')), async (values) => {
    const result = /** @type {{queued?:boolean}} */ (await api('/auth/profile', { method: 'PUT', body: { assignmentName: values.assignmentName, jobTitle: values.jobTitle, weeklyCapacityHours: Number(values.weeklyCapacityHours), ...(profile ? { _baseVersion: profile.version } : {}) }, queueable: true, queueMetadata: { operationKey: `engineer-profile:${user.publicId}`, entityType: 'engineer-profile', entityPublicId: user.publicId, label: String(values.assignmentName) } }));
    notify(result.queued ? 'Engineer profile queued' : 'Engineer profile saved'); if (!result.queued) await rerender();
  });
  setInputs(form, { assignmentName: profile?.assignmentName || user.username, jobTitle: profile?.jobTitle || '', weeklyCapacityHours: profile?.weeklyCapacityHours ?? 40 });
  return form;
}

/** @param {User[]} users @param {()=>Promise<void>} rerender */
function userAdministration(users, rerender) {
  const cards = users.map((record) => {
    const form = submit(el('form', { class: 'card stack' }, el('div', { class: 'section-head' }, el('h3', {}, record.displayName), el('span', { class: 'count-badge' }, record.accountStatus)), el('p', { class: 'muted' }, `@${record.username}${record.requestedAt ? ` · requested ${new Date(record.requestedAt).toLocaleString()}` : ''}`), el('div', { class: 'form-grid' }, field('Display name', 'displayName', 'text', true), field('Email', 'email', 'email'), selectField('Role', 'role', ['admin', 'manager', 'engineer', 'viewer'], record.role), el('label', { class: 'field checkbox' }, el('input', { type: 'checkbox', name: 'active', checked: record.active ? '' : null }), el('span', {}, 'Active'))), el('div', { class: 'form-actions' }, ...(record.accountStatus === 'requested' ? [el('button', { type: 'submit', value: 'approved' }, 'Approve request'), el('button', { type: 'submit', class: 'danger', value: 'rejected' }, 'Reject request')] : [el('button', { type: 'submit', value: '' }, 'Save account')]))), async (values, event) => {
      const decision = event.submitter instanceof HTMLButtonElement ? event.submitter.value : '';
      await api(`/auth/users/${encodeURIComponent(record.publicId)}`, { method: 'PUT', body: { displayName: values.displayName, email: values.email, role: values.role, active: decision === 'approved' ? true : decision === 'rejected' ? false : values.active === 'on', ...(decision ? { accountStatus: decision } : {}), _baseVersion: record.version } });
      notify(decision === 'approved' ? 'Account approved' : decision === 'rejected' ? 'Account rejected' : 'Account saved'); await rerender();
    });
    setInputs(form, { displayName: record.displayName, email: record.email });
    return form;
  });
  return el('section', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Accounts and approvals'), el('span', { class: 'count-badge' }, users.length)), el('div', { class: 'card-grid' }, ...cards));
}

/** @param {ConsumableCatalogueRecord[]} records @param {()=>Promise<void>} rerender */
function consumableCatalogue(records, rerender) {
  const rows = records.map((record) => {
    const form = submit(el('form', { class: 'inline-record catalogue-row' }, field('Reference', 'catalogueReference', 'text', true), field('Description', 'description', 'text', true), field('Unit', 'unit', 'text', true), field('Estimated unit price', 'estimatedUnitPrice', 'number'), el('label', { class: 'field checkbox' }, el('input', { type: 'checkbox', name: 'active', checked: record.active ? '' : null }), el('span', {}, 'Active')), el('button', { type: 'submit' }, 'Save'), el('button', { type: 'button', class: 'danger', onclick: async () => { await queuedCatalogueMutation('consumable', 'DELETE', `/catalogue/consumables/${encodeURIComponent(record.publicId)}?baseVersion=${record.version}`, {}, record.publicId); await rerender(); } }, 'Delete')), async (values) => { await queuedCatalogueMutation('consumable', 'PUT', `/catalogue/consumables/${encodeURIComponent(record.publicId)}`, { catalogueReference: values.catalogueReference, description: values.description, unit: values.unit, estimatedUnitPrice: values.estimatedUnitPrice === '' ? null : Number(values.estimatedUnitPrice), active: values.active === 'on', _baseVersion: record.version }, record.publicId); await rerender(); });
    setInputs(form, { ...record }); return form;
  });
  const add = submit(el('form', { class: 'inline-record' }, field('Reference', 'catalogueReference', 'text', true), field('Description', 'description', 'text', true), field('Unit', 'unit', 'text', true), field('Estimated unit price', 'estimatedUnitPrice', 'number'), el('button', { type: 'submit' }, 'Add consumable')), async (values) => { await queuedCatalogueMutation('consumable', 'POST', '/catalogue/consumables', { catalogueReference: values.catalogueReference, description: values.description, unit: values.unit, estimatedUnitPrice: values.estimatedUnitPrice === '' ? null : Number(values.estimatedUnitPrice) }, null); await rerender(); });
  setInputs(add, { unit: 'each' });
  return el('section', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Shared consumables catalogue'), el('span', { class: 'count-badge' }, records.length)), el('p', { class: 'muted' }, 'Reusable definitions remain separate from quantities required by an individual work package.'), ...rows, add);
}

const connectorOptions = ['lc', 'sc', 'mpo', 'mtp', 'fc', 'st', 'none'];
/** @param {FibreSku[]} records @param {()=>Promise<void>} rerender */
function fibreCatalogue(records, rerender) {
  /** @param {FibreSku|null} record */
  const skuForm = (record) => {
    const form = submit(el('form', { class: 'card stack' }, el('div', { class: 'form-grid' }, field('SKU', 'sku', 'text', true), field('Description', 'description', 'text', true), selectField('Item type', 'itemType', ['patch-lead', 'trunk', 'pigtail', 'other'], record?.itemType || 'patch-lead'), field('Fibre type', 'fibreType', 'text', true), selectField('Fibre mode', 'fibreMode', ['singlemode', 'multimode'], record?.fibreMode || 'singlemode'), selectField('From connector', 'fromConnector', connectorOptions, record?.fromConnector || 'lc'), selectField('To connector', 'toConnector', connectorOptions, record?.toConnector || 'lc'), field('Length (m)', 'lengthMetres', 'number', true), field('Unit price', 'unitPrice', 'number', true), el('label', { class: 'field checkbox' }, el('input', { type: 'checkbox', name: 'simplex', checked: record?.simplex ? '' : null }), el('span', {}, 'Simplex')), ...(record ? [el('label', { class: 'field checkbox' }, el('input', { type: 'checkbox', name: 'active', checked: record.active ? '' : null }), el('span', {}, 'Active'))] : [])), el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, record ? 'Save SKU' : 'Add SKU'), ...(record ? [el('button', { type: 'button', class: 'danger', onclick: async () => { await queuedCatalogueMutation('fibre-sku', 'DELETE', `/catalogue/fibre-skus/${encodeURIComponent(record.publicId)}?baseVersion=${record.version}`, {}, record.publicId); await rerender(); } }, 'Delete')] : []))), async (values) => {
      const body = { sku: values.sku, description: values.description, itemType: values.itemType, fibreType: values.fibreType, fibreMode: values.fibreMode, fromConnector: values.fromConnector, toConnector: values.toConnector, simplex: values.simplex === 'on', lengthMetres: Number(values.lengthMetres), unitPrice: Number(values.unitPrice), ...(record ? { active: values.active === 'on', _baseVersion: record.version } : {}) };
      await queuedCatalogueMutation('fibre-sku', record ? 'PUT' : 'POST', record ? `/catalogue/fibre-skus/${encodeURIComponent(record.publicId)}` : '/catalogue/fibre-skus', body, record?.publicId || null); await rerender();
    });
    setInputs(form, record ? { ...record } : { fibreType: 'OS2', lengthMetres: '', unitPrice: 0 }); return form;
  };
  return el('section', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Fibre SKU catalogue'), el('span', { class: 'count-badge' }, records.length)), el('p', { class: 'muted' }, 'BOM matching uses the complete media tuple, connector pair, simplex mode and shortest sufficient stocked length.'), el('div', { class: 'card-grid' }, ...records.map(skuForm)), skuForm(null));
}

/** @param {()=>Promise<void>} rerender */
async function notificationsPanel(rerender) {
  const state = await notificationState();
  const action = state.subscribed ? el('button', { type: 'button', class: 'secondary', onclick: async () => { try { await unsubscribeNotifications(); notify('Notifications disabled on this browser'); await rerender(); } catch (error) { notify(errorMessage(error)); } } }, 'Disable notifications') : el('button', { type: 'button', disabled: state.supported ? null : '', onclick: async () => { try { await enableNotifications(); notify('Notifications enabled'); await rerender(); } catch (error) { notify(errorMessage(error)); } } }, 'Enable notifications');
  return el('section', { class: 'panel stack' }, el('h2', {}, 'Notifications'), el('p', { class: 'muted' }, state.supported ? `Permission: ${state.permission}. Subscription: ${state.subscribed ? 'active' : 'not active'}. Signing out removes the server subscription and unsubscribes this browser.` : 'Push notifications are not configured for this installation.'), action);
}

/** @param {User} user @param {() => void} cycleTheme */
export async function settingsView(user, cycleTheme) {
  const rerender = async () => { const status = /** @type {{user:User}} */ (await api('/auth/status')); await settingsView(status.user, cycleTheme); };
  const [providers, exporters, consumables, skus, users, notifications] = await Promise.all([
    /** @type {Promise<ProviderDescriptor[]>} */ (api('/import-providers')),
    /** @type {Promise<ExporterDescriptor[]>} */ (api('/plugin-exporters')),
    user.role === 'admin' ? /** @type {Promise<ConsumableCatalogueRecord[]>} */ (api('/catalogue/consumables')) : Promise.resolve([]),
    user.role === 'admin' ? /** @type {Promise<FibreSku[]>} */ (api('/catalogue/fibre-skus')) : Promise.resolve([]),
    user.role === 'admin' ? /** @type {Promise<User[]>} */ (api('/auth/users')) : Promise.resolve([]), notificationsPanel(rerender)
  ]);
  const appearance = el('section', { class: 'panel stack' }, el('h2', {}, 'Appearance'), el('p', { class: 'muted' }, 'Follow the device theme or choose a light or dark appearance for this browser.'), el('button', { type: 'button', class: 'secondary', onclick: cycleTheme }, 'Change theme'));
  const account = el('section', { class: 'panel stack' }, el('h2', {}, 'Current account'), el('dl', { class: 'settings-list' }, el('div', {}, el('dt', {}, 'Display name'), el('dd', {}, user.displayName || user.username)), el('div', {}, el('dt', {}, 'Username'), el('dd', {}, user.username)), el('div', {}, el('dt', {}, 'Role'), el('dd', {}, user.role))));
  const capabilities = el('section', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Import capabilities'), el('span', { class: 'count-badge' }, providers.length)), providers.length ? el('ul', { class: 'record-list' }, ...providers.map((provider) => el('li', {}, provider.label))) : el('p', { class: 'empty-inline' }, 'No import providers are configured. All generic core features remain available.'), el('p', { class: 'muted' }, exporters.length ? `${exporters.length} provider exporter${exporters.length === 1 ? '' : 's'} available.` : 'Generic JSON, CSV, BOM spreadsheet and print exports remain available.'));
  app.replaceChildren(el('section', { class: 'stack' }, pageHead('Settings', 'Accounts, reusable catalogues, notifications and browser preferences.'), el('div', { class: 'section-grid' }, appearance, account), profilePanel(user, rerender), notifications, ...(user.role === 'admin' ? [userAdministration(users, rerender), consumableCatalogue(consumables, rerender), fibreCatalogue(skus, rerender)] : []), capabilities));
}
