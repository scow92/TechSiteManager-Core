import { api } from '../api.js';
import { app, el, emptyState, errorMessage, notify, pageHead } from '../dom.js';
import { providerFields, renderDescriptorInputs } from '../import/descriptors.js';
import { approvalFromPreview, reconciliationPreview } from '../import/reconciliation.js';

/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').ReconciliationProposal} ReconciliationProposal */
/** @typedef {import('../../../server/types/browser-models').ImportResult} ImportResult */
/** @typedef {import('../../../server/types/browser-models').WorkPackage} WorkPackage */

/** @param {ImportResult} result */
async function appliedResult(result) {
  const heading = result.status === 'applied' ? 'Import applied' : 'Import complete';
  if (!result.workPackagePublicId) {
    return el('div', { class: 'panel stack import-result' }, el('h2', {}, heading),
      el('p', { class: 'error' }, 'The import completed without a work package target. Return to Work Packages and confirm the record before continuing.'),
      el('div', { class: 'form-actions' }, el('a', { class: 'button secondary', href: '#home' }, 'Return to Work Packages')));
  }

  const publicId = result.workPackagePublicId;
  try {
    const [pack] = await Promise.all([
      /** @type {Promise<WorkPackage>} */ (api(`/work-packages/${encodeURIComponent(publicId)}`)),
      api('/work-packages')
    ]);
    const counts = result.counts;
    const summary = [
      `${counts.created} created`, `${counts.updated} updated`, `${counts.unchanged} unchanged`,
      `${counts.absent} absent`, `${counts.conflicted} conflicted`
    ].join(' · ');
    return el('div', { class: 'panel stack import-result' },
      el('div', { class: 'section-head' }, el('div', {}, el('p', { class: 'eyebrow' }, 'Import result'), el('h2', {}, heading)), el('span', { class: 'badge', 'data-status': pack.status }, pack.status)),
      el('div', { class: 'result-record' }, el('strong', {}, pack.packageReference), el('span', {}, pack.title), el('span', { class: 'muted' }, `${pack.site.code} — ${pack.site.name}`)),
      el('p', { class: 'muted' }, summary),
      el('div', { class: 'form-actions' },
        el('a', { class: 'button', href: `#package/${encodeURIComponent(publicId)}` }, 'Open work package'),
        el('a', { class: 'button secondary', href: '#home' }, 'Return to Work Packages')));
  } catch (error) {
    return el('div', { class: 'panel stack import-result' }, el('h2', {}, heading),
      el('p', { class: 'error' }, `The imported work package is not currently available: ${errorMessage(error)}`),
      el('div', { class: 'form-actions' }, el('a', { class: 'button secondary', href: '#home' }, 'Return to Work Packages')));
  }
}

/** @param {string} [initialProviderId] */
export async function importView(initialProviderId) {
  const providers = /** @type {ProviderDescriptor[]} */ (await api('/import-providers'));
  if (!providers.length) {
    app.replaceChildren(el('section', { class: 'stack' }, pageHead('Import', 'Review source data before applying it to core records.'),
      emptyState('No import providers are installed.', 'Core records can still be created, searched, edited, exported, backed up, and restored.')));
    return;
  }
  const select = el('select', { name: 'provider' }, ...providers.map((provider) => el('option', { value: provider.id }, provider.label)));
  if (initialProviderId && providers.some((provider) => provider.id === initialProviderId)) select.value = initialProviderId;
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
          apply.disabled = true;
          apply.textContent = 'Applying…';
          const result = /** @type {ImportResult} */ (await api(`/import-drafts/${proposal.draftId}/apply`, { method: 'POST', body: approvalFromPreview(proposal, reconciliation) }));
          preview.replaceChildren(await appliedResult(result));
          notify('Import applied');
        } catch (error) {
          apply.disabled = false;
          apply.textContent = 'Approve import';
          notify(errorMessage(error));
        }
      });
      preview.replaceChildren(el('div', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, 'Normalized preview')), reconciliation, apply));
    } catch (error) { preview.replaceChildren(el('div', { class: 'panel' }, el('p', { class: 'error' }, errorMessage(error)))); }
  });
  app.replaceChildren(el('section', { class: 'stack' }, pageHead('Import', 'Select an installed provider, validate the source, review reconciliation and approve atomically.'), el('div', { class: 'import-provider-grid' }, form, preview)));
}
