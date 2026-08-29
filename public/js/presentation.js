import { api } from './api.js';
import { el, errorMessage, notify } from './dom.js';

/** @typedef {import('../../server/types/browser-models').WorkPackage} WorkPackage */
/** @typedef {import('../../server/types/browser-models').PresentationProfile} PresentationProfile */
/** @typedef {import('../../server/types/browser-models').PresentationField} PresentationField */
/** @typedef {import('../../server/types/browser-models').PresentationView} PresentationView */
/** @typedef {import('../../server/types/browser-models').User} User */
/** @typedef {WorkPackage | WorkPackage['workItems'][number] | WorkPackage['circuits'][number] | WorkPackage['circuits'][number]['segments'][number] | WorkPackage['consumableRequirements'][number]} PresentedRecord */

/** @param {PresentationProfile} profile @returns {Map<string, PresentationField>} */
function fieldMap(profile) { return new Map(profile.fields.map((field) => [field.id, field])); }

/** @param {PresentedRecord} record @param {PresentationField} field @returns {unknown} */
function valueFor(record, field) {
  if (field.binding.startsWith('core.')) {
    const key = field.binding.slice(5);
    const value = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (record))[key];
    return key === 'assignees' && Array.isArray(value) ? value.join(', ') : value;
  }
  return record.extensions[field.binding]?.value ?? null;
}

/** @param {PresentationField} field @param {unknown} value @returns {HTMLElement} */
function fieldControl(field, value) {
  const attributes = { name: field.id, required: field.required ? '' : null, maxlength: field.maxLength, 'data-binding': field.binding };
  let input;
  if (field.type === 'multiline') input = el('textarea', { ...attributes, rows: 4 });
  else if (field.type === 'enum') input = el('select', attributes, el('option', { value: '' }, 'Select…'), ...field.options.map((option) => el('option', { value: option }, option)));
  else if (field.type === 'boolean') input = el('input', { ...attributes, type: 'checkbox' });
  else input = el('input', { ...attributes, type: field.type === 'date' ? 'date' : ['integer', 'decimal'].includes(field.type) ? 'number' : 'text', step: field.type === 'decimal' ? 'any' : field.type === 'integer' ? '1' : null });
  if (input instanceof HTMLInputElement && field.type === 'boolean') input.checked = value === true;
  else if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) input.value = value === null || value === undefined ? '' : String(value);
  return el('label', { class: `field${field.wide ? ' field-wide' : ''}` }, el('span', {}, field.label), input);
}

/** @param {HTMLFormElement} form @param {PresentationField[]} fields @returns {Map<string, unknown>} */
function formValues(form, fields) {
  const values = new Map();
  for (const field of fields) {
    const control = form.elements.namedItem(field.id);
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
    /** @type {unknown} */
    let value = field.type === 'boolean' && control instanceof HTMLInputElement ? control.checked : control.value;
    if (['integer', 'decimal'].includes(field.type)) value = control.value === '' ? null : Number(control.value);
    values.set(field.id, value === '' && !field.required ? null : value);
  }
  return values;
}

/** @param {string} entityType @param {PresentedRecord} record @param {Map<string, unknown>} values @param {PresentationField[]} fields */
function corePayload(entityType, record, values, fields) {
  /** @type {Record<string, unknown>} */
  const payload = {};
  const data = /** @type {Record<string, any>} */ (/** @type {unknown} */ (record));
  for (const field of fields.filter((candidate) => candidate.binding.startsWith('core.'))) {
    const key = field.binding.slice(5);
    let value = values.get(field.id);
    if (key === 'assignees') value = String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    payload[key] = value;
  }
  if (entityType === 'work-package') return { packageReference: data.packageReference, externalReference: data.externalReference, projectReference: data.projectReference, title: data.title, description: data.description, status: data.status, leadAssignee: data.leadAssignee, assignees: data.assignees, ...payload, _baseVersion: data.version };
  if (entityType === 'work-item') return { itemReference: data.itemReference, title: data.title, description: data.description, status: data.status, sequence: data.sequence, ...payload, _baseVersion: data.version };
  if (entityType === 'circuit') return { circuitReference: data.circuitReference, description: data.description, media: data.media, status: data.status, ...payload, _baseVersion: data.version };
  if (entityType === 'segment') return { segmentReference: data.segmentReference, fromEndpoint: data.fromEndpoint, toEndpoint: data.toEndpoint, lengthMetres: data.lengthMetres, notes: data.notes, sequence: data.sequence, ...payload, _baseVersion: data.version };
  if (entityType === 'consumable-requirement') return { cataloguePublicId: data.cataloguePublicId, description: data.description, quantityRequired: data.quantityRequired, unit: data.unit, ...payload, _baseVersion: data.version };
  return payload;
}

/** @param {string} packageId @param {string} entityType @param {PresentedRecord} record @param {string} [parentPublicId] */
function corePath(packageId, entityType, record, parentPublicId) {
  if (entityType === 'work-package') return `/work-packages/${encodeURIComponent(packageId)}`;
  const plural = { 'work-item': 'work-items', circuit: 'circuits', 'consumable-requirement': 'consumable-requirements' }[entityType];
  if (plural) return `/work-packages/${encodeURIComponent(packageId)}/${plural}/${encodeURIComponent(record.publicId)}`;
  if (entityType === 'segment' && parentPublicId) return `/work-packages/${encodeURIComponent(packageId)}/circuits/${encodeURIComponent(parentPublicId)}/segments/${encodeURIComponent(record.publicId)}`;
  throw new Error('The presented core field cannot be saved from this view.');
}

/** @param {PresentationProfile} profile @param {string} packageId @param {string} entityType @param {PresentedRecord} record @param {PresentationField[]} fields @param {Map<string, unknown>} values @param {string} [parentPublicId] */
async function saveRecord(profile, packageId, entityType, record, fields, values, parentPublicId) {
  if (fields.some((field) => field.binding.startsWith('core.'))) await api(corePath(packageId, entityType, record, parentPublicId), { method: 'PUT', body: corePayload(entityType, record, values, fields) });
  for (const field of fields.filter((candidate) => candidate.binding.startsWith('extension.'))) {
    const value = values.get(field.id);
    const current = record.extensions[field.binding];
    if (JSON.stringify(current?.value ?? null) === JSON.stringify(value ?? null)) continue;
    await api(`/extension-values/${encodeURIComponent(entityType)}/${encodeURIComponent(record.publicId)}/${encodeURIComponent(field.id)}`, { method: 'PUT', body: { presentationId: profile.id, value, _baseVersion: current?.version || 0 } });
  }
}

/** @param {PresentationProfile} profile @param {string} packageId @param {string} entityType @param {PresentedRecord} record @param {PresentationField[]} fields @param {User} user @param {() => Promise<void>} rerender @param {string} buttonLabel */
function editableForm(profile, packageId, entityType, record, fields, user, rerender, buttonLabel) {
  const form = el('form', { class: 'stack' }, el('div', { class: 'form-grid' }, ...fields.map((field) => fieldControl(field, valueFor(record, field)))), ...(user.role === 'viewer' ? [] : [el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, buttonLabel))]));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveRecord(profile, packageId, entityType, record, fields, formValues(form, fields));
      notify(`${profile.terms.singular} saved`);
      await rerender();
    } catch (error) { notify(errorMessage(error)); }
  });
  return form;
}

/** @param {string} label @param {string} hint @param {...Node} children */
function section(label, hint, ...children) {
  return el('section', { class: 'details-section' }, el('div', { class: 'details-section-head' }, el('span', {}, label), ...(hint ? [el('span', { class: 'details-hint' }, hint)] : [])), el('div', { class: 'wb-body' }, ...children));
}

/** @param {PresentationProfile} profile @param {PresentationView} view @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function recordForm(profile, view, pack, user, rerender) {
  const fields = fieldMap(profile);
  return el('div', { class: 'stack' }, ...view.sections.map((definition) => {
    const selected = definition.fields.map((id) => fields.get(id)).filter((field) => field && field.entityType === 'work-package');
    return section(definition.label, definition.hint, editableForm(profile, pack.publicId, 'work-package', pack, /** @type {PresentationField[]} */ (selected), user, rerender, `Save ${profile.terms.singular}`));
  }));
}

/** @param {PresentationProfile} profile @param {PresentationView} view @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function childTabs(profile, view, pack, user, rerender) {
  const fields = fieldMap(profile);
  const selected = /** @type {PresentationField[]} */ (view.fields.map((id) => fields.get(id)).filter((field) => field && field.entityType === 'work-item'));
  const panels = pack.workItems.map((item, index) => {
    const panel = section(item.itemReference, item.status, editableForm(profile, pack.publicId, 'work-item', item, selected, user, rerender, `Save ${profile.terms.childSingular}`));
    panel.hidden = index !== 0;
    return panel;
  });
  if (!pack.workItems.length) return el('div', { class: 'empty-state' }, el('h2', {}, view.emptyTitle || `No ${profile.terms.childPlural.toLowerCase()} recorded`), el('p', {}, view.emptyDescription || 'Import or add a child record to continue.'));
  const tabs = el('div', { class: 'work-item-tabs', role: 'tablist', 'aria-label': profile.terms.childPlural }, ...pack.workItems.map((item, index) => {
    const tab = el('button', { class: `work-item-tab${index ? '' : ' active'}`, type: 'button', role: 'tab', 'aria-selected': String(index === 0) }, item.itemReference);
    tab.addEventListener('click', () => {
      panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== index; });
      [...tabs.children].forEach((candidate) => { candidate.classList.toggle('active', candidate === tab); candidate.setAttribute('aria-selected', String(candidate === tab)); });
    });
    return tab;
  }));
  return el('div', { class: 'stack' }, tabs, ...panels);
}

/** @param {PresentedRecord} record @param {PresentationField} field */
function displayValue(record, field) {
  const value = valueFor(record, field);
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** @param {PresentationProfile} profile @param {PresentationView} view @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function connectionSchedule(profile, view, pack, user, rerender) {
  const fields = fieldMap(profile);
  const circuitFields = /** @type {PresentationField[]} */ (view.circuitFields.map((id) => fields.get(id)).filter(Boolean));
  const segmentFields = /** @type {PresentationField[]} */ (view.segmentFields.map((id) => fields.get(id)).filter(Boolean));
  const circuits = pack.circuits.filter((circuit) => !view.media.length || view.media.includes(circuit.media.toLowerCase()));
  if (!circuits.length) return el('div', { class: 'empty-state' }, el('h2', {}, view.emptyTitle || 'No matching connections'), el('p', {}, view.emptyDescription || 'No connections match this presentation view.'));
  const rows = circuits.flatMap((circuit) => circuit.segments.map((segment) => {
    const values = new Map();
    const cells = segmentFields.map((field) => {
      if (user.role === 'viewer') return el('td', {}, displayValue(segment, field));
      const labelled = fieldControl(field, valueFor(segment, field));
      const control = labelled.querySelector('[name]');
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) return el('td', {}, displayValue(segment, field));
      control.classList.add('cell-input'); control.setAttribute('aria-label', field.label);
      if (control instanceof HTMLInputElement && field.type === 'boolean') values.set(field.id, control.checked);
      else if (['integer', 'decimal'].includes(field.type)) values.set(field.id, control.value === '' ? null : Number(control.value));
      else values.set(field.id, control.value);
      control.addEventListener('input', () => { values.set(field.id, ['integer', 'decimal'].includes(field.type) ? (control.value === '' ? null : Number(control.value)) : field.type === 'boolean' && control instanceof HTMLInputElement ? control.checked : control.value); });
      return el('td', {}, control);
    });
    const action = user.role === 'viewer' ? [] : [el('td', { class: 'col-act' }, el('button', { type: 'button', class: 'secondary', onclick: async () => {
      try { await saveRecord(profile, pack.publicId, 'segment', segment, segmentFields, values, circuit.publicId); notify('Connection saved'); await rerender(); } catch (error) { notify(errorMessage(error)); }
    } }, 'Save'))];
    return el('tr', {}, ...circuitFields.map((field) => el('td', {}, displayValue(circuit, field))), ...cells, ...action);
  }));
  return el('div', { class: 'table-wrap presentation-schedule' }, el('table', {}, el('thead', {}, el('tr', {}, ...[...circuitFields, ...segmentFields].map((field) => el('th', {}, field.label)), ...(user.role === 'viewer' ? [] : [el('th', {}, '')]))), el('tbody', {}, ...rows)));
}

/** @param {PresentationProfile} profile @param {PresentationView} view @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
function requirementTable(profile, view, pack, user, rerender) {
  const fields = fieldMap(profile);
  const selected = /** @type {PresentationField[]} */ (view.fields.map((id) => fields.get(id)).filter(Boolean));
  if (!pack.consumableRequirements.length) return el('div', { class: 'empty-state' }, el('h2', {}, view.emptyTitle || 'No requirements recorded'), el('p', {}, view.emptyDescription || 'No material requirements have been added.'));
  const head = el('thead', {}, el('tr', {}, ...selected.map((field) => el('th', {}, field.label)), ...(user.role === 'viewer' ? [] : [el('th', {}, '')])));
  const body = el('tbody', {}, ...pack.consumableRequirements.map((record) => {
    const values = new Map();
    const cells = selected.map((field) => {
      if (user.role === 'viewer') return el('td', {}, displayValue(record, field));
      const control = fieldControl(field, valueFor(record, field)).querySelector('[name]');
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) return el('td', {}, displayValue(record, field));
      control.classList.add('cell-input'); control.setAttribute('aria-label', field.label);
      const read = () => field.type === 'boolean' && control instanceof HTMLInputElement ? control.checked : ['integer', 'decimal'].includes(field.type) ? (control.value === '' ? null : Number(control.value)) : control.value;
      values.set(field.id, read()); control.addEventListener('input', () => values.set(field.id, read()));
      return el('td', {}, control);
    });
    const action = user.role === 'viewer' ? [] : [el('td', { class: 'col-act' }, el('button', { type: 'button', class: 'secondary', onclick: async () => {
      try { await saveRecord(profile, pack.publicId, 'consumable-requirement', record, selected, values); notify('Requirement saved'); await rerender(); } catch (error) { notify(errorMessage(error)); }
    } }, 'Save'))];
    return el('tr', {}, ...cells, ...action);
  }));
  return el('div', { class: 'table-wrap' }, el('table', {}, head, body));
}

/** @param {PresentationProfile} profile @param {PresentationView} view @param {WorkPackage} pack */
function materialSummary(profile, view, pack) {
  const fields = fieldMap(profile);
  const selected = /** @type {PresentationField[]} */ (view.fields.map((id) => fields.get(id)).filter(Boolean));
  if (!pack.consumableRequirements.length) return el('div', { class: 'empty-state' }, el('h2', {}, view.emptyTitle || 'No material summary available'), el('p', {}, view.emptyDescription || 'Add requirements to calculate a summary.'));
  const visible = selected.length ? selected : profile.fields.filter((field) => field.entityType === 'consumable-requirement' && ['core.description', 'core.quantityRequired', 'core.unit'].includes(field.binding));
  const head = el('thead', {}, el('tr', {}, ...visible.map((field) => el('th', {}, field.label))));
  const body = el('tbody', {}, ...pack.consumableRequirements.map((record) => el('tr', {}, ...visible.map((field) => el('td', {}, displayValue(record, field))))));
  return el('div', { class: 'table-wrap' }, el('table', {}, head, body));
}

/** @param {PresentationProfile} profile @param {PresentationView} view @param {WorkPackage} pack @param {User} user @param {() => Promise<void>} rerender */
export function renderPresentation(profile, view, pack, user, rerender) {
  if (view.component === 'record-form') return recordForm(profile, view, pack, user, rerender);
  if (view.component === 'child-record-tabs') return childTabs(profile, view, pack, user, rerender);
  if (view.component === 'connection-schedule') return connectionSchedule(profile, view, pack, user, rerender);
  if (view.component === 'requirement-table') return requirementTable(profile, view, pack, user, rerender);
  return materialSummary(profile, view, pack);
}
