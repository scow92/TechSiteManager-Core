import { el, field } from '../dom.js';

/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').DescriptorField} DescriptorField */

/** @param {ProviderDescriptor} descriptor */
export function inputControl(descriptor) {
  if (descriptor.input.type === 'file') return el('label', {}, 'Source file', el('input', { name: 'sourceFile', type: 'file', required: '', accept: descriptor.input.mediaTypes.join(',') }));
  if (descriptor.input.type === 'pasted-text') return el('label', {}, 'Source content', el('textarea', { name: 'sourceText', required: '' }));
  return el('label', {}, 'External source reference', el('input', { name: 'externalReference', required: '' }));
}

/** @param {DescriptorField} descriptor */
export function descriptorField(descriptor) {
  const attributes = { name: `providerField:${descriptor.id}`, 'data-provider-field': descriptor.id, 'data-provider-type': descriptor.type, required: descriptor.required ? '' : null };
  let control;
  if (descriptor.type === 'multiline') control = el('textarea', { ...attributes, maxlength: descriptor.maxLength || 20000 });
  else if (descriptor.type === 'boolean') control = el('input', { ...attributes, type: 'checkbox', required: null });
  else if (descriptor.type === 'enum') control = el('select', attributes, el('option', { value: '' }, 'Select…'), ...(descriptor.options || []).map((option) => el('option', { value: option }, option)));
  else control = el('input', { ...attributes, type: descriptor.type === 'integer' ? 'number' : 'text', maxlength: descriptor.maxLength || null });
  return el('label', {}, descriptor.label, control);
}

/** @param {HTMLFormElement} form @returns {Record<string, string | number | boolean>} */
export function providerFields(form) {
  /** @type {Record<string, string | number | boolean>} */
  const result = {};
  for (const control of form.querySelectorAll('[data-provider-field]')) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) continue;
    const fieldId = control.getAttribute('data-provider-field');
    if (!fieldId) continue;
    const type = control.getAttribute('data-provider-type');
    if (type === 'boolean' && control instanceof HTMLInputElement) result[fieldId] = control.checked;
    else if (control.value !== '') result[fieldId] = type === 'integer' ? Number(control.value) : control.value;
  }
  return result;
}

/** @param {ProviderDescriptor} provider @param {HTMLElement} dynamic */
export function renderDescriptorInputs(provider, dynamic) {
  dynamic.replaceChildren(inputControl(provider), ...provider.input.fields.map(descriptorField), ...(provider.input.type === 'external-reference' ? [] : [field('Stable source reference (optional)', 'externalReference')]));
}
