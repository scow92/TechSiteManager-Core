import { api } from '../api.js';
import { app, el, emptyState, errorMessage, notify, pageHead } from '../dom.js';
import { providerFields, renderDescriptorInputs } from '../import/descriptors.js';
import { approvalFromPreview, approvalFromProposal, importOverview, reconciliationPreview } from '../import/reconciliation.js';

/** @typedef {import('../../../server/types/browser-models').ProviderDescriptor} ProviderDescriptor */
/** @typedef {import('../../../server/types/browser-models').ReconciliationProposal} ReconciliationProposal */
/** @typedef {import('../../../server/types/browser-models').ImportResult} ImportResult */
/** @typedef {import('../../../server/types/browser-models').WorkPackage} WorkPackage */

/** @param {ImportResult} result */
async function appliedResult(result) {
  const heading = result.status === 'applied' ? 'Import applied' : 'Import complete';
  const presentation = /** @type {import('../../../server/types/browser-models').PresentationProfile | null} */ (await api('/presentation-profiles/work-package'));
  const terms = presentation?.terms || { singular: 'Work package', plural: 'Work packages' };
  const initialView = presentation?.views[0]?.id || 'details';
  if (!result.workPackagePublicId) {
    return el('div', { class: 'panel stack import-result' }, el('h2', {}, heading),
      el('p', { class: 'error' }, `The import completed without a ${terms.singular.toLowerCase()} target. Return to ${terms.plural} and confirm the record before continuing.`),
      el('div', { class: 'form-actions' }, el('a', { class: 'button secondary', href: '#home' }, `Return to ${terms.plural}`)));
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
        el('a', { class: 'button', href: `#package/${encodeURIComponent(publicId)}/${initialView}` }, `Open ${terms.singular.toLowerCase()}`),
        el('a', { class: 'button secondary', href: '#home' }, `Return to ${terms.plural}`)));
  } catch (error) {
    return el('div', { class: 'panel stack import-result' }, el('h2', {}, heading),
      el('p', { class: 'error' }, `The imported ${terms.singular.toLowerCase()} is not currently available: ${errorMessage(error)}`),
      el('div', { class: 'form-actions' }, el('a', { class: 'button secondary', href: '#home' }, `Return to ${terms.plural}`)));
  }
}

/** @param {string} [initialProviderId] */
export async function importView(initialProviderId) {
  const [providers, presentation] = await Promise.all([
    /** @type {Promise<ProviderDescriptor[]>} */ (api('/import-providers')),
    /** @type {Promise<import('../../../server/types/browser-models').PresentationProfile | null>} */ (api('/presentation-profiles/work-package'))
  ]);
  const terms = presentation?.terms || { singular: 'Work package', plural: 'Work packages', childSingular: 'Work item', childPlural: 'Work items' };
  if (!providers.length) {
    app.replaceChildren(el('section', { class: 'stack' }, pageHead('Import', 'Review source data before applying it to core records.'),
      emptyState('No import providers are installed.', 'Core records can still be created, searched, edited, exported, backed up, and restored.')));
    return;
  }
  const select = el('select', { name: 'provider' }, ...providers.map((provider) => el('option', { value: provider.id }, provider.label)));
  if (initialProviderId && providers.some((provider) => provider.id === initialProviderId)) select.value = initialProviderId;
  const dynamic = el('div', { class: 'stack' });
  const previewTitle = el('h2', {}, 'Preview');
  const previewCopy = el('p', {}, 'Choose a provider and validate the source to review proposed changes.');
  const preview = el('aside', { class: 'preview-panel' }, el('div', { class: 'empty-state' }, el('span', { class: 'empty-icon', 'aria-hidden': 'true' }, '⇥'), previewTitle, previewCopy));
  const providerLabel = el('label', {}, 'Provider', select);
  const submit = el('button', { type: 'submit' }, 'Validate and preview');
  const formTitle = el('h2', {}, 'Import provider');
  const formCopy = el('p', { class: 'muted' }, 'Source interpretation runs on the server.');
  const form = el('form', { class: 'panel stack' },
    el('div', { class: 'provider-heading' }, el('span', { class: 'provider-icon', 'aria-hidden': 'true' }, '⇥'), el('div', {}, formTitle, formCopy)),
    providerLabel, dynamic, el('div', { class: 'form-actions' }, submit));
  /** @returns {ProviderDescriptor} */
  function selectedProvider() {
    const provider = providers.find((entry) => entry.id === select.value);
    if (!provider) throw new Error('Selected provider is unavailable');
    return provider;
  }
  function renderInput() {
    const provider = selectedProvider();
    renderDescriptorInputs(provider, dynamic);
    const fileInput = dynamic.querySelector('input[type="file"]');
    submit.hidden = provider.input.type === 'file';
    if (fileInput) fileInput.addEventListener('change', () => { if (fileInput instanceof HTMLInputElement && fileInput.files?.length) form.requestSubmit(); });
  }
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
      const fileImport = provider.input.type === 'file';
      const reconciliation = fileImport ? null : reconciliationPreview(proposal);
      const apply = el('button', { type: 'button' }, fileImport ? `Import ${terms.singular}` : 'Approve import');
      const hasBlockingWarning = proposal.warnings.some((warning) => warning.severity === 'blocking');
      if (fileImport && hasBlockingWarning) apply.disabled = true;
      apply.addEventListener('click', async () => {
        try {
          apply.disabled = true;
          apply.textContent = 'Applying…';
          const approval = fileImport ? approvalFromProposal(proposal) : approvalFromPreview(proposal, /** @type {HTMLElement} */ (reconciliation));
          const result = /** @type {ImportResult} */ (await api(`/import-drafts/${proposal.draftId}/apply`, { method: 'POST', body: approval }));
          preview.replaceChildren(await appliedResult(result));
          notify('Import applied');
        } catch (error) {
          apply.disabled = false;
          apply.textContent = fileImport ? `Import ${terms.singular}` : 'Approve import';
          notify(errorMessage(error));
        }
      });
      const content = fileImport ? importOverview(proposal, terms) : reconciliation;
      preview.replaceChildren(el('div', { class: 'panel stack' }, el('div', { class: 'section-head' }, el('h2', {}, fileImport ? `${terms.singular} overview` : 'Normalized preview')), /** @type {HTMLElement} */ (content), ...(hasBlockingWarning && fileImport ? [el('p', { class: 'error' }, 'This file contains a blocking import issue and cannot be imported.')] : []), apply));
    } catch (error) { preview.replaceChildren(el('div', { class: 'panel' }, el('p', { class: 'error' }, errorMessage(error)))); }
  });
  const directProvider = initialProviderId && providers.some((provider) => provider.id === initialProviderId);
  providerLabel.hidden = Boolean(directProvider);
  if (directProvider && selectedProvider().input.type === 'file') {
    formTitle.textContent = 'Upload spreadsheet';
    formCopy.textContent = 'Choose a file or drag it onto the area below.';
    previewTitle.textContent = `${terms.singular} overview`;
    previewCopy.textContent = `A summary of what will be imported will appear here before you import the ${terms.singular}.`;
  }
  const heading = directProvider ? selectedProvider().label : 'Import';
  app.replaceChildren(el('section', { class: 'stack' }, pageHead(heading, directProvider && selectedProvider().input.type === 'file' ? 'Upload a spreadsheet to review what will be imported.' : 'Select an installed provider and review the source before importing.'), el('div', { class: 'import-provider-grid' }, form, preview)));
}
