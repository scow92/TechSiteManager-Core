'use strict';

(function () {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const toast = document.getElementById('toast');
  let user = null;

  function el(name, attributes, ...children) {
    const node = document.createElement(name);
    for (const [key, value] of Object.entries(attributes || {})) {
      if (key === 'class') node.className = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== null && value !== undefined) node.setAttribute(key, value);
    }
    for (const child of children.flat()) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }

  async function api(path, options = {}) {
    const { queueable = false, queueMetadata = {}, ...requestOptions } = options;
    const method = requestOptions.method || 'GET';
    const body = requestOptions.body && typeof requestOptions.body !== 'string' ? JSON.stringify(requestOptions.body) : requestOptions.body;
    const headers = { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) };
    let response;
    try { response = await fetch(`/api${path}`, { credentials: 'same-origin', ...requestOptions, method, headers, body }); }
    catch (error) {
      if (method === 'GET') {
        const cached = await OfflineStore.get('reference-cache', path);
        if (cached !== undefined) return cached;
      }
      if (queueable) {
        const operation = { id: crypto.randomUUID(), path, method, headers, body, createdAt: Date.now(), attempts: 0, dependsOn: queueMetadata.dependsOn || [], temporaryId: queueMetadata.temporaryId || null, requiredTemporaryIds: queueMetadata.requiredTemporaryIds || [] };
        await OfflineStore.put('operation-queue', operation);
        return { queued: true, operationId: operation.id, publicId: operation.temporaryId };
      }
      error.offline = true;
      throw error;
    }
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    if (method === 'GET') await OfflineStore.put('reference-cache', data, path);
    return data;
  }

  async function replayQueue() {
    return OfflineSync.replay(OfflineStore, fetch);
  }

  async function recoverPendingLogout() {
    const pending = await OfflineStore.get('pending-logout', 'current');
    if (!pending) return false;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
      if (response.status === 204 || response.status === 401) { await OfflineStore.delete('pending-logout', 'current'); return false; }
    } catch { /* Keep the durable marker until the server session is revoked. */ }
    return true;
  }

  function notify(message) {
    toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function field(label, name, type = 'text', required = false) {
    return el('label', {}, label, el('input', { name, type, required: required ? '' : null }));
  }

  function selectField(label, name, options, selected) {
    return el('label', {}, label, el('select', { name }, ...options.map((option) => {
      const value = typeof option === 'string' ? option : option.value; const text = typeof option === 'string' ? option : option.label;
      return el('option', { value, selected: value === selected ? '' : null }, text);
    })));
  }

  function multilineField(label, name, value = '') {
    return el('label', {}, label, el('textarea', { name }, value));
  }

  async function offlineStatus() {
    const [queued, rejected] = await Promise.all([OfflineStore.all('operation-queue'), OfflineStore.all('dead-letters')]);
    if (!queued.length && !rejected.length) return null;
    const retryButtons = rejected.map((operation) => el('button', { type: 'button', class: 'secondary', onclick: async () => {
      await OfflineStore.retryDeadLetter(operation.id); await replayQueue(); await render();
    } }, `Retry rejected ${operation.method} ${operation.path}`));
    return el('aside', { class: 'panel stack', 'aria-label': 'Offline synchronization status' },
      el('h2', {}, 'Offline synchronization'),
      el('p', {}, `${queued.length} queued, ${rejected.length} rejected`),
      ...retryButtons
    );
  }

  function authView(setupNeeded) {
    const form = el('form', { class: 'panel stack' },
      el('h1', {}, setupNeeded ? 'Create the first administrator' : 'Sign in'),
      field('Username', 'username', 'text', true), field('Password', 'password', 'password', true),
      ...(setupNeeded ? [field('Display name', 'displayName', 'text', true), field('Email (optional)', 'email', 'email')] : []),
      el('button', { type: 'submit' }, setupNeeded ? 'Create account' : 'Sign in'), el('p', { class: 'error', id: 'auth-error' })
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      try { user = await api(setupNeeded ? '/auth/setup' : '/auth/login', { method: 'POST', body: values }); nav.hidden = false; location.hash = '#home'; await render(); }
      catch (error) { form.querySelector('#auth-error').textContent = error.message; }
    });
    app.replaceChildren(form);
  }

  async function homeView() {
    const [packages, exporters, synchronization, sites] = await Promise.all([api('/work-packages'), api('/plugin-exporters'), offlineStatus(), api('/sites')]);
    const search = el('input', { type: 'search', placeholder: 'Search packages, sites, racks, devices, and endpoints', 'aria-label': 'Search records' });
    const list = el('div', { class: 'grid' });
    const show = (rows) => list.replaceChildren(...rows.map((record) => {
      if (record.entityType && record.entityType !== 'work_package') return el('article', { class: 'card' }, el('span', { class: 'badge' }, record.entityType.replaceAll('_', ' ')), el('h2', {}, record.reference || record.title), el('p', { class: 'muted' }, [record.siteCode, record.siteName].filter(Boolean).join(' — ')));
      const links = [
        el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(record.publicId)}/export?format=json` }, 'JSON'),
        el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(record.publicId)}/export?format=csv` }, 'CSV'),
        ...exporters.map((exporter) => el('a', { class: 'button secondary', href: `/api/work-packages/${encodeURIComponent(record.publicId)}/plugin-exports/${encodeURIComponent(exporter.id)}` }, exporter.label))
      ];
      return el('article', { class: 'card' }, el('span', { class: 'badge' }, record.status), el('h2', {}, el('a', { href: `#package/${record.publicId}` }, record.packageReference)), el('p', {}, record.title), el('p', { class: 'muted' }, `${record.siteCode} — ${record.siteName}`), el('p', { class: 'muted' }, record.externalReference || record.projectReference || 'No external reference'), el('div', { class: 'actions' }, links));
    }));
    show(packages);
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => show(search.value.trim() ? await api(`/search?scope=all&q=${encodeURIComponent(search.value.trim())}`) : packages), 180); });
    let create = null;
    if (user.role !== 'viewer') {
      create = el('form', { class: 'panel stack' }, el('h2', {}, 'Add work package'),
        selectField('Site', 'sitePublicId', sites.map((site) => ({ value: site.publicId, label: `${site.code} — ${site.name}` }))),
        field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true),
        field('Project reference (optional)', 'projectReference'), el('button', { type: 'submit', disabled: sites.length ? null : '' }, 'Add work package'),
        ...(!sites.length ? [el('p', { class: 'muted' }, 'Create a site before adding a work package.')] : [])
      );
      create.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          const values = Object.fromEntries(new FormData(create));
          const created = await api('/work-packages', { method: 'POST', body: { ...values, status: 'planned', assignees: [], workItems: [], circuits: [], consumableRequirements: [] } });
          location.hash = `#package/${created.publicId}`;
        } catch (error) { notify(error.message); }
      });
    }
    app.replaceChildren(el('section', { class: 'stack' }, ...(synchronization ? [synchronization] : []), el('div', { class: 'toolbar' }, el('label', {}, 'Search', search)), packages.length ? list : el('div', { class: 'panel' }, el('h1', {}, 'Work Packages'), el('p', { class: 'muted' }, 'No work packages have been created yet. Generic records remain available without import plugins.')), ...(create ? [create] : [])));
  }

  async function sitesView() {
    const sites = await api('/sites');
    const form = el('form', { class: 'panel stack' }, el('h2', {}, 'Add site'), field('Code', 'code', 'text', true), field('Name', 'name', 'text', true), field('Description', 'description'), el('button', { type: 'submit' }, 'Add site'));
    form.addEventListener('submit', async (event) => { event.preventDefault(); try { const temporaryId = `urn:offline:${crypto.randomUUID()}`; const result = await api('/sites', { method: 'POST', body: Object.fromEntries(new FormData(form)), queueable: true, queueMetadata: { temporaryId } }); notify(result.queued ? 'Site queued for sync' : 'Site created'); await sitesView(); } catch (error) { notify(error.message); } });
    const cards = el('div', { class: 'grid' }, ...sites.map((site) => el('article', { class: 'card' },
      el('h2', {}, el('a', { href: `#site/${site.publicId}` }, site.code)), el('p', {}, site.name), el('p', { class: 'muted' }, site.description)
    )));
    app.replaceChildren(el('section', { class: 'stack' }, el('h1', {}, 'Sites'), cards,
      user.role !== 'viewer' ? form : el('p', { class: 'muted' }, 'Read-only access')));
  }

  async function siteView(publicId) {
    const sites = await api('/sites'); const site = sites.find((entry) => entry.publicId === publicId);
    if (!site) throw new Error('Site not found');
    const kinds = [['rooms', 'Rooms'], ['racks', 'Racks'], ['termination-points', 'Termination points'], ['devices', 'Devices'], ['distances', 'Distance samples']];
    const records = await Promise.all(kinds.map(([kind]) => api(`/sites/${encodeURIComponent(publicId)}/${kind}`)));
    const sections = kinds.map(([, label], index) => el('section', { class: 'panel' }, el('h2', {}, label), records[index].length
      ? el('ul', {}, ...records[index].map((record) => el('li', {}, record.name || record.label || record.hostname || `${record.endpointA} → ${record.endpointB}`)))
      : el('p', { class: 'muted' }, `No ${label.toLowerCase()} recorded.`)));
    app.replaceChildren(el('section', { class: 'stack' }, el('a', { href: '#sites' }, '← Sites'), el('div', { class: 'panel' }, el('h1', {}, `${site.code} — ${site.name}`), el('p', {}, site.description)), ...sections));
  }

  function recordList(title, records, render) {
    return el('section', { class: 'panel' }, el('h2', {}, title), records.length ? el('ul', {}, ...records.map((record) => el('li', {}, render(record)))) : el('p', { class: 'muted' }, `No ${title.toLowerCase()} recorded.`));
  }

  async function packageView(publicId) {
    let pack = await api(`/work-packages/${encodeURIComponent(publicId)}`);
    const details = el('form', { class: 'panel stack' }, el('h1', {}, pack.packageReference), field('Package reference', 'packageReference', 'text', true), field('Title', 'title', 'text', true), multilineField('Description', 'description', pack.description), selectField('Status', 'status', ['planned', 'active', 'blocked', 'complete', 'cancelled'], pack.status), field('External reference', 'externalReference'), field('Project reference', 'projectReference'), field('Lead assignee', 'leadAssignee'), field('Assignees (comma separated)', 'assignees'), ...(user.role !== 'viewer' ? [el('button', { type: 'submit' }, 'Save work package')] : []));
    for (const [name, value] of Object.entries({ packageReference: pack.packageReference, title: pack.title, externalReference: pack.externalReference || '', projectReference: pack.projectReference || '', leadAssignee: pack.leadAssignee || '', assignees: pack.assignees.join(', ') })) details.elements[name].value = value;
    details.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const values = Object.fromEntries(new FormData(details));
        pack = await api(`/work-packages/${encodeURIComponent(pack.publicId)}`, { method: 'PUT', body: { ...values, assignees: values.assignees.split(',').map((value) => value.trim()).filter(Boolean), _baseVersion: pack.version } });
        notify('Work package saved'); await packageView(pack.publicId);
      } catch (error) { notify(error.message); }
    });
    const items = recordList('Work items', pack.workItems, (item) => `${item.itemReference} — ${item.title} (${item.status})`);
    const circuits = recordList('Circuits and segments', pack.circuits, (circuit) => `${circuit.circuitReference} — ${circuit.media}; ${circuit.segments.map((segment) => `${segment.fromEndpoint} → ${segment.toEndpoint}`).join(', ') || 'no segments'}`);
    const requirements = recordList('Consumable requirements', pack.consumableRequirements, (requirement) => `${requirement.description}: ${requirement.quantityRequired} ${requirement.unit}`);
    app.replaceChildren(el('section', { class: 'stack' }, el('a', { href: '#home' }, '← Work packages'), details, items, circuits, requirements));
  }

  function inputControl(descriptor) {
    if (descriptor.input.type === 'file') return el('label', {}, 'Source file', el('input', { name: 'sourceFile', type: 'file', required: '', accept: descriptor.input.mediaTypes.join(',') }));
    if (descriptor.input.type === 'pasted-text') return el('label', {}, 'Source content', el('textarea', { name: 'sourceText', required: '' }));
    return el('label', {}, 'External source reference', el('input', { name: 'externalReference', required: '' }));
  }

  function descriptorField(descriptor) {
    const attributes = { name: `providerField:${descriptor.id}`, 'data-provider-field': descriptor.id, 'data-provider-type': descriptor.type, required: descriptor.required ? '' : null };
    let control;
    if (descriptor.type === 'multiline') control = el('textarea', { ...attributes, maxlength: descriptor.maxLength || 20000 });
    else if (descriptor.type === 'boolean') control = el('input', { ...attributes, type: 'checkbox', required: null });
    else if (descriptor.type === 'enum') control = el('select', attributes, el('option', { value: '' }, 'Select…'), ...descriptor.options.map((option) => el('option', { value: option }, option)));
    else control = el('input', { ...attributes, type: descriptor.type === 'integer' ? 'number' : 'text', maxlength: descriptor.maxLength || null });
    return el('label', {}, descriptor.label, control);
  }

  function providerFields(form) {
    const result = {};
    for (const control of form.querySelectorAll('[data-provider-field]')) {
      const type = control.getAttribute('data-provider-type');
      if (type === 'boolean') result[control.getAttribute('data-provider-field')] = control.checked;
      else if (control.value !== '') result[control.getAttribute('data-provider-field')] = type === 'integer' ? Number(control.value) : control.value;
    }
    return result;
  }

  function choice(options, selected, attributes) {
    return el('select', attributes, ...options.map((option) => el('option', { value: option, selected: option === selected ? '' : null }, option.replaceAll('-', ' '))));
  }

  function reconciliationPreview(proposal) {
    const entities = proposal.entityProposals.map((entity) => el('article', { class: 'card stack' },
      el('h3', {}, `${entity.entityType.replaceAll('_', ' ')} — ${entity.action}`),
      el('p', { class: 'muted' }, entity.sourceRecordKey),
      ...entity.fields.filter((fieldEntry) => fieldEntry.changed || fieldEntry.conflict || fieldEntry.ownership === 'review-required').map((fieldEntry) => el('label', { class: fieldEntry.conflict ? 'conflict' : '' },
        `${fieldEntry.fieldPath}: current ${JSON.stringify(fieldEntry.currentValue)} → source ${JSON.stringify(fieldEntry.sourceValue)}`,
        choice(['accept-source', 'keep-current', 'make-user-owned', 'return-to-source', 'defer'], fieldEntry.recommended, { 'data-field-decision': `${entity.proposalId}.${fieldEntry.fieldPath}` })
      ))
    ));
    const absences = proposal.absences.map((absence) => el('label', { class: 'card' }, `${absence.entityType.replaceAll('_', ' ')} ${absence.sourceRecordKey} is absent from the source`, choice(absence.choices, 'defer', { 'data-absence-decision': absence.proposalId })));
    const warnings = proposal.warnings.map((warning) => el('label', { class: warning.severity === 'blocking' ? 'conflict' : '' },
      el('input', { type: 'checkbox', 'data-warning-code': warning.code, disabled: warning.severity === 'blocking' ? null : '' }),
      `${warning.severity}: ${warning.code}${warning.count === null ? '' : ` (${warning.count})`}`
    ));
    return el('div', { class: 'stack' }, ...warnings, ...entities, ...absences);
  }

  async function importView() {
    const providers = await api('/import-providers');
    if (!providers.length) {
      app.replaceChildren(el('section', { class: 'panel' }, el('h1', {}, 'Import'),
        el('p', {}, 'No import providers are installed.'),
        el('p', { class: 'muted' }, 'Core records can still be created, searched, edited, exported, backed up, and restored.')));
      return;
    }
    const select = el('select', { name: 'provider' }, ...providers.map((provider) => el('option', { value: provider.id }, provider.label)));
    const dynamic = el('div', { class: 'stack' });
    const preview = el('div');
    const form = el('form', { class: 'panel stack' }, el('h1', {}, 'Import'), el('label', {}, 'Provider', select), dynamic, el('button', { type: 'submit' }, 'Validate and preview'));
    function renderInput() {
      const provider = providers.find((entry) => entry.id === select.value);
      dynamic.replaceChildren(inputControl(provider), ...provider.input.fields.map(descriptorField), ...(provider.input.type === 'external-reference' ? [] : [field('Stable source reference (optional)', 'externalReference')]));
    }
    select.addEventListener('change', renderInput); renderInput();
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); preview.replaceChildren(el('p', { class: 'loading' }, 'Validating…'));
      try {
        const provider = providers.find((entry) => entry.id === select.value);
        const data = new FormData(form); const fields = providerFields(form); let body;
        if (provider.input.type === 'external-reference') body = { externalReference: data.get('externalReference'), fields };
        else if (provider.input.type === 'file') {
          const file = data.get('sourceFile');
          if (file.size > provider.input.maxBytes) throw new Error('Source file exceeds the provider limit');
          const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
          body = { content: btoa(binary), contentEncoding: 'base64', mediaType: file.type || 'application/octet-stream', externalReference: data.get('externalReference'), fields };
        } else body = { content: data.get('sourceText'), contentEncoding: 'utf8', mediaType: 'text/plain', externalReference: data.get('externalReference'), fields };
        const proposal = await api(`/import-providers/${encodeURIComponent(provider.id)}/drafts`, { method: 'POST', body });
        const reconciliation = reconciliationPreview(proposal);
        const apply = el('button', { type: 'button' }, 'Approve import');
        apply.addEventListener('click', async () => {
          try {
            const fieldDecisions = Object.fromEntries([...reconciliation.querySelectorAll('[data-field-decision]')].map((control) => [control.getAttribute('data-field-decision'), control.value]));
            const absenceDecisions = Object.fromEntries([...reconciliation.querySelectorAll('[data-absence-decision]')].map((control) => [control.getAttribute('data-absence-decision'), control.value]));
            const acknowledgeWarnings = [...reconciliation.querySelectorAll('[data-warning-code]:checked')].map((control) => control.getAttribute('data-warning-code'));
            const result = await api(`/import-drafts/${proposal.draftId}/apply`, { method: 'POST', body: { schemaVersion: 'techsitemanager.io/import-approval/v1', draftHash: proposal.draftHash, targetVersions: proposal.targetVersions, fieldDecisions, absenceDecisions, acknowledgeWarnings } });
            preview.replaceChildren(el('div', { class: 'panel' }, el('h2', {}, 'Import applied'), el('pre', {}, JSON.stringify(result, null, 2))));
          } catch (error) { notify(error.message); }
        });
        preview.replaceChildren(el('div', { class: 'panel stack' }, el('h2', {}, 'Normalized preview'), reconciliation, apply));
      } catch (error) { preview.replaceChildren(el('p', { class: 'error' }, error.message)); }
    });
    app.replaceChildren(el('section', { class: 'stack' }, form, preview));
  }

  async function render() {
    const status = await api('/auth/status'); user = status.user;
    if (!user) { nav.hidden = true; authView(status.setupNeeded); return; }
    nav.hidden = false;
    const route = (location.hash || '#home').slice(1);
    if (route === 'sites') await sitesView();
    else if (route.startsWith('site/')) await siteView(route.slice(5));
    else if (route.startsWith('package/')) await packageView(route.slice(8));
    else if (route === 'import') await importView(); else await homeView();
  }

  document.getElementById('logout').addEventListener('click', async () => {
    await OfflineStore.put('pending-logout', { pending: true, createdAt: Date.now() }, 'current');
    try { await api('/auth/logout', { method: 'POST' }); await OfflineStore.delete('pending-logout', 'current'); }
    finally { user = null; location.hash = ''; authView(false); }
  });
  window.addEventListener('hashchange', () => render().catch((error) => notify(error.message)));
  window.addEventListener('online', () => { recoverPendingLogout().then((pending) => pending ? authView(false) : replayQueue().then(() => render())).then(() => notify('Back online')).catch((error) => notify(error.message)); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  recoverPendingLogout().then((pending) => {
    if (pending) { nav.hidden = true; authView(false); return; }
    return replayQueue().finally(() => render().catch((error) => app.replaceChildren(el('p', { class: 'error' }, error.message))));
  }).catch((error) => app.replaceChildren(el('p', { class: 'error' }, error.message)));
}());
