import { api } from './api.js';
import { authView } from './auth.js';
import { app, nav, el, errorMessage, notify } from './dom.js';
import { recoverPendingLogout, replayQueue } from './offline-ui.js';
import { homeView } from './views/home.js';
import { importView } from './views/import.js';
import { settingsView } from './views/settings.js';
import { sitesView, siteView } from './views/sites.js';
import { packageView } from './views/work-package.js';

/** @typedef {import('../../server/types/browser-models').User} User */
/** @type {User | null} */
let user = null;

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
  const active = route.startsWith('site/') ? 'sites' : route.startsWith('package/') ? 'home' : route;
  for (const link of nav.querySelectorAll('[data-route]')) link.classList.toggle('active', link.getAttribute('data-route') === active);
}

/** @param {User} nextUser */
async function authenticated(nextUser) {
  user = nextUser;
  document.body.classList.remove('auth-active');
  nav.hidden = false;
  await render();
}

async function render() {
  const status = await api('/auth/status');
  if (!status || typeof status !== 'object' || !('user' in status) || !('setupNeeded' in status)) throw new Error('Authentication status response is invalid');
  user = /** @type {User | null} */ (status.user);
  if (!user) {
    nav.hidden = true;
    authView(status.setupNeeded, authenticated);
    return;
  }
  document.body.classList.remove('auth-active');
  nav.hidden = false;
  const route = (location.hash || '#home').slice(1);
  updateActiveNavigation(route);
  userSummary.textContent = `${user.displayName || user.username} · ${user.role}`;
  if (route === 'sites') await sitesView(user);
  else if (route.startsWith('site/')) await siteView(route.slice(5));
  else if (route.startsWith('package/')) await packageView(route.slice(8), user);
  else if (route === 'import') await importView();
  else if (route === 'settings') await settingsView(user, cycleTheme);
  else await homeView(user, render);
}

const logout = document.getElementById('logout');
if (!logout) throw new Error('Required shell element is missing: logout');
logout.addEventListener('click', async () => {
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

window.addEventListener('hashchange', () => render().catch((error) => notify(errorMessage(error))));
themeToggle.addEventListener('click', cycleTheme);
navCollapse.addEventListener('click', () => setNavigationCollapsed(true));
navExpand.addEventListener('click', () => setNavigationCollapsed(false));
navScrim.addEventListener('click', () => setNavigationCollapsed(true));
nav.addEventListener('click', () => { if (matchMedia('(max-width: 700px)').matches) setNavigationCollapsed(true); });
window.addEventListener('offline', updateConnectionStatus);
window.addEventListener('online', () => {
  updateConnectionStatus();
  recoverPendingLogout()
    .then((pending) => pending ? authView(false, authenticated) : replayQueue().then(() => render()))
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
  return replayQueue().finally(() => render().catch((error) => app.replaceChildren(el('p', { class: 'error' }, errorMessage(error)))));
}).catch((error) => app.replaceChildren(el('p', { class: 'error' }, errorMessage(error))));
