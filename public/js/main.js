import { api } from './api.js';
import { authView } from './auth.js';
import { app, nav, el, errorMessage, notify } from './dom.js';
import { recoverPendingLogout, replayQueue } from './offline-ui.js';
import { homeView } from './views/home.js';
import { importView } from './views/import.js';
import { settingsView } from './views/settings.js';
import { sitesView, siteView } from './views/sites.js';
import { packageView } from './views/work-package.js';
import { flushAll } from './work-package-store.js';

/** @typedef {import('../../server/types/browser-models').User} User */
/** @typedef {import('../../server/types/browser-models').Site} Site */
/** @typedef {import('../../server/types/browser-models').WorkPackageSummary} WorkPackageSummary */
/** @type {User | null} */
let user = null;
let packageInitialView = 'details';
let renderedRoute = '';

/** @param {string} id @returns {HTMLElement} */
function shellElement(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Required shell control is missing: ${id}`);
  return node;
}
const shell = shellElement('shell');
const connectionStatus = shellElement('connection-status');
const mobileStatus = shellElement('mobile-status');
const userSummary = shellElement('user-summary');
const themeToggle = shellElement('theme-toggle');
const navCollapse = shellElement('nav-collapse');
const navExpand = shellElement('nav-expand');
const navScrim = shellElement('nav-scrim');
const context = shellElement('context');
const siteNav = shellElement('site-nav');
const packageNav = shellElement('package-nav');
const brandContext = shellElement('brand-context');
const siteContext = /** @type {HTMLSelectElement} */ (shellElement('site-context'));
const packageContext = /** @type {HTMLSelectElement} */ (shellElement('package-context'));
const packageContextLabel = shellElement('package-context-label');
if (!(siteContext instanceof HTMLSelectElement) || !(packageContext instanceof HTMLSelectElement)) throw new Error('Context selectors are invalid');

const themeColours = { dark: '#0f1419', light: '#f2f5f8' };
function storedTheme() { try { return localStorage.getItem('tsm-theme'); } catch { return null; } }
function systemTheme() { return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
function applyTheme() {
  const preference = storedTheme();
  const resolved = preference === 'light' || preference === 'dark' ? preference : systemTheme();
  document.documentElement.dataset.theme = resolved;
  themeToggle.textContent = `Theme: ${preference || 'system'}`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themeColours[resolved]);
}
function cycleTheme() {
  const preference = storedTheme();
  const next = preference === null ? 'light' : preference === 'light' ? 'dark' : null;
  try { if (next) localStorage.setItem('tsm-theme', next); else localStorage.removeItem('tsm-theme'); } catch { /* Preference storage is optional. */ }
  applyTheme();
  notify(`Theme: ${next || 'system'}`);
}
/** @param {boolean} collapsed */
function setNavigationCollapsed(collapsed) {
  shell.classList.toggle('nav-collapsed', collapsed);
  navCollapse.setAttribute('aria-expanded', String(!collapsed));
  navExpand.setAttribute('aria-expanded', String(!collapsed));
}
function updateConnectionStatus() {
  const text = navigator.onLine ? 'Online' : 'Offline — changes remain on this device';
  connectionStatus.textContent = text;
  connectionStatus.classList.toggle('offline', !navigator.onLine);
  mobileStatus.textContent = navigator.onLine ? '' : 'Offline';
}
/** @param {string} route */
function updateActiveNavigation(route) {
  for (const link of nav.querySelectorAll('.nav-item')) link.classList.remove('active');
  const [kind, , section] = route.split('/');
  const selected = kind === 'site' ? nav.querySelector(`[data-site-view="${section || 'overview'}"]`)
    : kind === 'package' ? nav.querySelector(`[data-package-view="${section || 'details'}"]`)
      : nav.querySelector(`[data-route="${kind}"]`);
  if (selected) selected.classList.add('active');
}

/** @param {import('../../server/types/browser-models').PresentationProfile | null} presentation @param {string} packageId */
function renderPackageNavigation(presentation, packageId) {
  const defaultViews = [
    { id: 'details', label: 'Details', icon: '▤' },
    { id: 'work-items', label: 'Work items', icon: '▥' },
    { id: 'connections', label: 'Fibre', icon: '◉' },
    { id: 'copper', label: 'Copper', icon: '◉' },
    { id: 'dac', label: 'DAC', icon: '◉' },
    { id: 'consumables', label: 'Consumables', icon: '▣' }
  ];
  const profileViews = presentation?.views || defaultViews;
  const mandatoryCableViews = defaultViews.filter((view) => ['connections', 'copper', 'dac'].includes(view.id) && !profileViews.some((candidate) => candidate.id === view.id));
  const views = [...profileViews, ...mandatoryCableViews];
  const navigationViews = views.some((view) => view.id === 'handover') ? views : [...views, { id: 'handover', label: 'Handover', icon: '▧' }];
  packageContextLabel.textContent = presentation?.terms.singular || 'Work package';
  packageInitialView = views[0]?.id || 'details';
  packageContext.setAttribute('aria-label', `${presentation?.terms.singular || 'Work package'} context`);
  packageNav.replaceChildren(
    el('p', { class: 'nav-label' }, presentation?.terms.singular || 'Work package'),
    ...navigationViews.map((view) => el('a', { class: 'nav-item', href: `#package/${encodeURIComponent(packageId)}/${view.id}`, 'data-package-view': view.id }, el('span', { 'aria-hidden': 'true' }, view.icon || '▤'), view.label)),
    el('a', { class: 'nav-item', href: '#import', 'data-route': 'import' }, el('span', { 'aria-hidden': 'true' }, '▩'), 'Import')
  );
}

/** @param {string} route */
async function updateContext(route) {
  const [sites, packages, presentation] = await Promise.all([
    /** @type {Promise<Site[]>} */ (api('/sites')),
    /** @type {Promise<WorkPackageSummary[]>} */ (api('/work-packages')),
    /** @type {Promise<import('../../server/types/browser-models').PresentationProfile | null>} */ (api('/presentation-profiles/work-package'))
  ]);
  const [kind, rawId] = route.split('/');
  const routeId = rawId ? decodeURIComponent(rawId) : '';
  const activePackage = kind === 'package' ? packages.find((entry) => entry.publicId === routeId) : null;
  const activeSiteId = kind === 'site' ? routeId : activePackage?.sitePublicId || '';
  const siteOptions = [el('option', { value: '' }, 'Select site…'), ...sites.map((site) => el('option', { value: site.publicId }, `${site.code} — ${site.name}`))];
  siteContext.replaceChildren(...siteOptions);
  siteContext.value = activeSiteId;
  const visiblePackages = activeSiteId ? packages.filter((entry) => entry.sitePublicId === activeSiteId) : packages;
  packageContext.replaceChildren(el('option', { value: '' }, `Select ${(presentation?.terms.singular || 'work package').toLowerCase()}…`), ...visiblePackages.map((entry) => el('option', { value: entry.publicId }, entry.packageReference)));
  packageContext.value = activePackage?.publicId || '';
  siteNav.hidden = !activeSiteId;
  packageNav.hidden = !activePackage;
  for (const link of siteNav.querySelectorAll('[data-site-view]')) link.setAttribute('href', `#site/${encodeURIComponent(activeSiteId)}/${link.getAttribute('data-site-view')}`);
  renderPackageNavigation(presentation, activePackage?.publicId || '');
  brandContext.textContent = activePackage?.packageReference || sites.find((site) => site.publicId === activeSiteId)?.code || 'No site';
}

/** @param {User} nextUser */
async function authenticated(nextUser) {
  user = nextUser;
  document.body.classList.remove('auth-active');
  nav.hidden = false;
  await renderSafely();
}

function currentRoute() { return (location.hash || '#home').slice(1); }

/** @param {string} route @param {unknown} error */
function renderRouteFailure(route, error) {
  const packageRoute = route.startsWith('package/');
  const message = errorMessage(error);
  app.replaceChildren(el('section', { class: 'stack' },
    el('header', { class: 'page-head' }, el('div', {}, el('h1', {}, packageRoute ? 'Work package unavailable' : 'Unable to open page'), el('p', { class: 'page-subtitle' }, 'The requested record could not be loaded safely.'))),
    el('div', { class: 'panel stack error-state', role: 'alert' }, el('p', { class: 'error' }, message),
      el('div', { class: 'form-actions' }, el('a', { class: 'button secondary', href: packageRoute ? '#home' : '#home' }, 'Return to Work Packages')))));
}

async function renderSafely() {
  const route = currentRoute();
  if (renderedRoute && route !== renderedRoute) {
    try { await flushAll(); }
    catch (error) { history.replaceState(null, '', `#${renderedRoute}`); notify(`Navigation paused: ${errorMessage(error)}`); return; }
  }
  try { await render(); }
  catch (error) {
    renderRouteFailure(route, error);
    notify(errorMessage(error));
  }
  renderedRoute = currentRoute();
}

async function render() {
  const status = await api('/auth/status');
  if (!status || typeof status !== 'object' || !('user' in status) || !('setupNeeded' in status)) throw new Error('Authentication status response is invalid');
  user = /** @type {User | null} */ (status.user);
  if (!user) {
    nav.hidden = true;
    context.hidden = true;
    authView(status.setupNeeded, authenticated);
    return;
  }
  document.body.classList.remove('auth-active');
  nav.hidden = false;
  context.hidden = false;
  const route = currentRoute();
  await updateContext(route);
  updateActiveNavigation(route);
  userSummary.textContent = `${user.displayName || user.username} · ${user.role}`;
  const [kind, rawId, section] = route.split('/');
  if (route === 'sites') await sitesView(user);
  else if (kind === 'site' && rawId) await siteView(decodeURIComponent(rawId), user, section || 'overview');
  else if (kind === 'package' && rawId) await packageView(decodeURIComponent(rawId), user, section || 'details');
  else if (kind === 'import') await importView(rawId ? decodeURIComponent(rawId) : undefined);
  else if (route === 'settings') await settingsView(user, cycleTheme);
  else await homeView(user, render);
}

const logout = document.getElementById('logout');
if (!logout) throw new Error('Required shell element is missing: logout');
logout.addEventListener('click', async () => {
  try { await flushAll(); } catch (error) { notify(`Sign out paused: ${errorMessage(error)}`); return; }
  await OfflineStore.put('pending-logout', { pending: true, createdAt: Date.now() }, 'current');
  try {
    await api('/auth/logout', { method: 'POST' });
    await OfflineStore.delete('pending-logout', 'current');
  } finally {
    user = null;
    location.hash = '';
    authView(false, authenticated);
  }
});

siteContext.addEventListener('change', () => {
  location.hash = siteContext.value ? `#site/${encodeURIComponent(siteContext.value)}/overview` : '#home';
});
packageContext.addEventListener('change', () => {
  location.hash = packageContext.value ? `#package/${encodeURIComponent(packageContext.value)}/${packageInitialView}` : siteContext.value ? `#site/${encodeURIComponent(siteContext.value)}/overview` : '#home';
});

window.addEventListener('hashchange', () => { renderSafely(); });
themeToggle.addEventListener('click', cycleTheme);
navCollapse.addEventListener('click', () => setNavigationCollapsed(true));
navExpand.addEventListener('click', () => setNavigationCollapsed(false));
navScrim.addEventListener('click', () => setNavigationCollapsed(true));
nav.addEventListener('click', () => { if (matchMedia('(max-width: 700px)').matches) setNavigationCollapsed(true); });
window.addEventListener('offline', updateConnectionStatus);
window.addEventListener('online', () => {
  updateConnectionStatus();
  recoverPendingLogout()
    .then((pending) => pending ? authView(false, authenticated) : replayQueue().then(() => renderSafely()))
    .then(() => notify('Back online'))
    .catch((error) => notify(errorMessage(error)));
});

applyTheme();
updateConnectionStatus();
setNavigationCollapsed(matchMedia('(max-width: 700px)').matches);
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (!storedTheme()) applyTheme(); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
recoverPendingLogout().then((pending) => {
  if (pending) {
    nav.hidden = true;
    authView(false, authenticated);
    return;
  }
  return replayQueue().finally(() => renderSafely());
}).catch((error) => app.replaceChildren(el('p', { class: 'error' }, errorMessage(error))));
