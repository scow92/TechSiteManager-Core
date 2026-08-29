import { api } from '../api.js';
import { app, el, emptyState, errorMessage, notify, pageHead } from '../dom.js';
import { providerFields, renderDescriptorInputs } from '../import/descriptors.js';
import { approvalFromPreview, reconciliationPreview } from '../import/reconciliation.js';

/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').ReconciliationProposal} ReconciliationProposal */

export async function importView() {
  const providers = /** @type {ProviderDescriptor[]} */ (await api('/import-providers'));
  if (!providers.length) {
    app.replaceChildren(el('section', { class: 'stack' }, pageHead('Import', 'Review source data before applying it to core records.'),
      emptyState('No import providers are installed.', 'Core records can still be created, searched, edited, exported, backed up, and restored.')));
    return;
  }
  const select = el('select', { name: 'provider' }, ...providers.map((provider) => el('option', { value: provider.id }, provider.label)));
  const dynamic = el('div', { class: 'stack' });
  const preview = el('aside', { class: 'preview-panel' }, el('div', { class: 'empty-state' }, el('span', { class: 'empty-icon', 'aria-hidden': 'true' }, '⇥'), el('h2', {}, 'Preview'), el('p', {}, 'Choose a provider and validate the source to review proposed changes.')));
  const form = el('form', { class: 'panel stack' },
    el('div', { class: 'provider-heading' }, el('span', { class: 'provider-icon', 'aria-hidden': 'true' }, '⇥'), el('div', {}, el('h2', {}, 'Import provider'), el('p', { class: 'muted' }, 'Source interpretation runs on the server.'))),
    el('label', {}, 'Provider', select), dynamic, el('div', { class: 'form-actions' }, el('button', { type: 'submit' }, 'Validate and preview')));
  /** @returns {ProviderDescriptor} */
  function selectedProvider() {
    const provider = providers.find((entry) => entry.id === select.value);
    if (!provider) throw new Error('Selected provider is unavailable');
    return provider;
  }
  function renderInput() { renderDescriptorInputs(selectedProvider(), dynamic); }
  select.addEventListener('change', renderInput);
  renderInput();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    preview.replaceChildren(el('div', { class: 'panel' }, el('p', { class: 'loading' }, 'Validating…')));
    try {
      const provider = selectedProvider();
      const data = new FormData(form);
      const fields = providerFields(form);
      let body;
      if (provider.input.type === 'external-reference') body = { externalReference: data.get('externalReference'), fields };
      else if (provider.input.type === 'file') {
        const file = data.get('sourceFile');
        if (!(file instanceof File)) throw new Error('A source file is required');
        if (file.size > provider.input.maxBytes) throw new Error('Source file exceeds the provider limit');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        body = { content: btoa(binary), contentEncoding: 'base64', mediaType: file.type || 'application/octet-stream', externalReference: data.get('externalReference'), fields };
      } else body = { content: data.get('sourceText'), contentEncoding: 'utf8', mediaType: 'text/plain', externalReference: data.get('externalReference'), fields };
      const proposal = /** @type {ReconciliationProposal} */ (await api(`/import-providers/${encodeURIComponent(provider.id)}/drafts`, { method: 'POST', body }));
      const reconciliation = reconciliationPreview(proposal);
      const apply = el('button', { type: 'button' }, 'Approve import');
      apply.addEventListener('click', async () => {
        try {
          const result = await api(`/import-drafts/${proposal.draftId}/apply`, { method: 'POST', body: approvalFromPreview(proposal, reconciliation) });
          preview.replaceChildren(el('div', { class: 'panel' }, el('h2', {}, 'Import applied'), el('pre', {}, JSON.stringify(result, null, 2))));
        } catch (error) { notify(errorMessage(error)); }
      });
      preview.replaceChildren(el('div', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Normalized preview')), reconciliation, apply));
    } catch (error) { preview.replaceChildren(el('div', { class: 'panel' }, el('p', { class: 'error' }, errorMessage(error)))); }
  });
  app.replaceChildren(el('section', { class: 'stack' }, pageHead('Import', 'Select an installed provider, validate the source, review reconciliation and approve atomically.'), el('div', { class: 'import-provider-grid' }, form, preview)));
}
