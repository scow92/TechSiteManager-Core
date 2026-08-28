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
    const method = options.method || 'GET';
    const body = options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    let response;
    try { response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, method, headers, body }); }
    catch (error) {
      if (method === 'GET') {
        const cached = await OfflineStore.get('reference-cache', path);
        if (cached !== undefined) return cached;
      }
      if (options.queueable) {
        const operation = { id: crypto.randomUUID(), path, method, headers, body, createdAt: Date.now(), attempts: 0 };
        await OfflineStore.put('operation-queue', operation);
        return { queued: true, operationId: operation.id };
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
    const operations = (await OfflineStore.all('operation-queue')).sort((a, b) => a.createdAt - b.createdAt);
    for (const operation of operations) {
      let response;
      try { response = await fetch(`/api${operation.path}`, { method: operation.method, headers: operation.headers, body: operation.body, credentials: 'same-origin' }); }
      catch { return; }
      if (response.ok) { await OfflineStore.delete('operation-queue', operation.id); continue; }
      if (response.status >= 500 || response.status === 429) return;
      await OfflineStore.delete('operation-queue', operation.id);
      await OfflineStore.put('dead-letters', { ...operation, rejectedAt: Date.now(), status: response.status });
    }
  }

  function notify(message) {
    toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function field(label, name, type = 'text', required = false) {
    return el('label', {}, label, el('input', { name, type, required: required ? '' : null }));
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
    const packages = await api('/work-packages');
    const search = el('input', { type: 'search', placeholder: 'Search references, projects, sites, and descriptions', 'aria-label': 'Search work packages' });
    const list = el('div', { class: 'grid' });
    const show = (rows) => list.replaceChildren(...rows.map((pack) => el('article', { class: 'card' }, el('span', { class: 'badge' }, pack.status), el('h2', {}, pack.packageReference), el('p', {}, pack.title), el('p', { class: 'muted' }, `${pack.siteCode} — ${pack.siteName}`), el('p', { class: 'muted' }, pack.externalReference || pack.projectReference || 'No external reference'))));
    show(packages);
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(async () => show(search.value.trim() ? await api(`/search?q=${encodeURIComponent(search.value.trim())}`) : packages), 180); });
    app.replaceChildren(el('section', {}, el('div', { class: 'toolbar' }, el('label', {}, 'Search', search)), packages.length ? list : el('div', { class: 'panel' }, el('h1', {}, 'Work Packages'), el('p', { class: 'muted' }, 'No work packages have been created yet. Generic records remain available without import plugins.'))));
  }

  async function sitesView() {
    const sites = await api('/sites');
    const form = el('form', { class: 'panel stack' }, el('h2', {}, 'Add site'), field('Code', 'code', 'text', true), field('Name', 'name', 'text', true), field('Description', 'description'), el('button', { type: 'submit' }, 'Add site'));
    form.addEventListener('submit', async (event) => { event.preventDefault(); try { const result = await api('/sites', { method: 'POST', body: Object.fromEntries(new FormData(form)), queueable: true }); notify(result.queued ? 'Site queued for sync' : 'Site created'); await sitesView(); } catch (error) { notify(error.message); } });
    const cards = el('div', { class: 'grid' }, ...sites.map((site) => el('article', { class: 'card' },
      el('h2', {}, site.code), el('p', {}, site.name), el('p', { class: 'muted' }, site.description)
    )));
    app.replaceChildren(el('section', { class: 'stack' }, el('h1', {}, 'Sites'), cards,
      user.role !== 'viewer' ? form : el('p', { class: 'muted' }, 'Read-only access')));
  }

  function inputControl(descriptor) {
    if (descriptor.input.type === 'file') return el('label', {}, 'Source file', el('input', { name: 'sourceFile', type: 'file', required: '' }));
    if (descriptor.input.type === 'pasted-text') return el('label', {}, 'Source content', el('textarea', { name: 'sourceText', required: '' }));
    return el('label', {}, 'External source reference', el('input', { name: 'sourceText', required: '' }));
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
    const form = el('form', { class: 'panel stack' }, el('h1', {}, 'Import'), el('label', {}, 'Provider', select), dynamic, field('Stable source reference', 'externalReference', 'text', true), el('button', { type: 'submit' }, 'Validate and preview'));
    function renderInput() { const provider = providers.find((entry) => entry.id === select.value); dynamic.replaceChildren(inputControl(provider)); }
    select.addEventListener('change', renderInput); renderInput();
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); preview.replaceChildren(el('p', { class: 'loading' }, 'Validating…'));
      try {
        const provider = providers.find((entry) => entry.id === select.value);
        const data = new FormData(form); let content; let mediaType; let contentEncoding = 'utf8';
        if (provider.input.type === 'file') { const file = data.get('sourceFile'); const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); content = btoa(binary); contentEncoding = 'base64'; mediaType = file.type || 'application/octet-stream'; }
        else { content = data.get('sourceText'); mediaType = provider.input.type === 'pasted-text' ? 'text/plain' : 'text/plain'; }
        const proposal = await api(`/import-providers/${encodeURIComponent(provider.id)}/drafts`, { method: 'POST', body: { content, contentEncoding, mediaType, externalReference: data.get('externalReference'), fields: {} } });
        const summary = el('pre', {}, JSON.stringify({ warnings: proposal.warnings, entities: proposal.entityProposals.map((entry) => ({ type: entry.entityType, action: entry.action, reference: entry.sourceRecordKey, conflicts: entry.fields.filter((field) => field.conflict).length })), absences: proposal.absences }, null, 2));
        const apply = el('button', { type: 'button' }, 'Approve import');
        apply.addEventListener('click', async () => { try { const result = await api(`/import-drafts/${proposal.draftId}/apply`, { method: 'POST', body: { schemaVersion: 'techsitemanager.io/import-approval/v1', draftHash: proposal.draftHash, targetVersions: proposal.targetVersions, fieldDecisions: {}, absenceDecisions: {}, acknowledgeWarnings: proposal.warnings.filter((warning) => warning.severity === 'blocking').map((warning) => warning.code) } }); preview.replaceChildren(el('div', { class: 'panel' }, el('h2', {}, 'Import applied'), el('pre', {}, JSON.stringify(result, null, 2)))); } catch (error) { notify(error.message); } });
        preview.replaceChildren(el('div', { class: 'panel stack' }, el('h2', {}, 'Normalized preview'), summary, apply));
      } catch (error) { preview.replaceChildren(el('p', { class: 'error' }, error.message)); }
    });
    app.replaceChildren(el('section', { class: 'stack' }, form, preview));
  }

  async function render() {
    const status = await api('/auth/status'); user = status.user;
    if (!user) { nav.hidden = true; authView(status.setupNeeded); return; }
    nav.hidden = false;
    const route = (location.hash || '#home').slice(1);
    if (route === 'sites') await sitesView(); else if (route === 'import') await importView(); else await homeView();
  }

  document.getElementById('logout').addEventListener('click', async () => {
    await OfflineStore.put('pending-logout', { pending: true, createdAt: Date.now() }, 'current');
    try { await api('/auth/logout', { method: 'POST' }); await OfflineStore.delete('pending-logout', 'current'); }
    finally { user = null; location.hash = ''; authView(false); }
  });
  window.addEventListener('hashchange', () => render().catch((error) => notify(error.message)));
  window.addEventListener('online', () => { replayQueue().then(() => notify('Back online')); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  replayQueue().finally(() => render().catch((error) => app.replaceChildren(el('p', { class: 'error' }, error.message))));
}());
