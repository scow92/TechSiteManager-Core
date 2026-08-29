import { api } from '../api.js';
import { app, el, errorMessage, field, multilineField, notify, recordList, selectField } from '../dom.js';

/** @typedef {import('../../../server/types/browser-models').User} User */
/** @typedef {import('../../../server/types/browser-models').WorkPackage} WorkPackage */

/** @param {string} publicId @param {User} user */
export async function packageView(publicId, user) {
  let pack = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(publicId)}`));
  const details = el('form', { class: 'panel stack' }, el('h1', {}, pack.packageReference), field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true), multilineField('Description', 'description', pack.description), selectField('Status', 'status', ['planned', 'active', 'blocked', 'complete', 'cancelled'], pack.status), field('External reference', 'externalReference'), field('Project reference', 'projectReference'), field('Lead assignee', 'leadAssignee'), field('Assignees (comma separated)', 'assignees'), ...(user.role !== 'viewer' ? [el('button', { type: 'submit' }, 'Save work package')] : []));
  for (const [name, value] of Object.entries({ packageReference: pack.packageReference, title: pack.title, externalReference: pack.externalReference || '', projectReference: pack.projectReference || '', leadAssignee: pack.leadAssignee || '', assignees: pack.assignees.join(', ') })) {
    const control = details.elements.namedItem(name);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) control.value = value;
  }
  details.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(details));
      pack = /** @type {WorkPackage} */ (await api(`/work-packages/${encodeURIComponent(pack.publicId)}`, { method: 'PUT', body: { ...values, assignees: String(values.assignees || '').split(',').map((value) => value.trim()).filter(Boolean), _baseVersion: pack.version } }));
      notify('Work package saved');
      await packageView(pack.publicId, user);
    } catch (error) { notify(errorMessage(error)); }
  });
  const items = recordList('Work items', pack.workItems, (item) => `${item.itemReference} — ${item.title} (${item.status})`);
  const circuits = recordList('Circuits and segments', pack.circuits, (circuit) => `${circuit.circuitReference} — ${circuit.media}; ${circuit.segments.map((segment) => `${segment.fromEndpoint} → ${segment.toEndpoint}`).join(', ') || 'no segments'}`);
  const requirements = recordList('Consumable requirements', pack.consumableRequirements, (requirement) => `${requirement.description}: ${requirement.quantityRequired} ${requirement.unit}`);
  app.replaceChildren(el('section', { class: 'stack' }, el('a', { href: '#home' }, '← Work packages'), details, items, circuits, requirements));
}
