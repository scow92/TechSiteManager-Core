import { api } from './api.js';
import { authView } from './auth.js';
import { app, nav, el, errorMessage, notify } from './dom.js';
import { recoverPendingLogout, replayQueue } from './offline-ui.js';
import { homeView } from './views/home.js';
import { importView } from './views/import.js';
import { sitesView, siteView } from './views/sites.js';
import { packageView } from './views/work-package.js';

/** @typedef {import('../../server/types/browser-models').User} User */
/** @type {User | null} */
let user = null;

/** @param {User} nextUser */
async function authenticated(nextUser) {
  user = nextUser;
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
  nav.hidden = false;
  const route = (location.hash || '#home').slice(1);
  if (route === 'sites') await sitesView(user);
  else if (route.startsWith('site/')) await siteView(route.slice(5));
  else if (route.startsWith('package/')) await packageView(route.slice(8), user);
  else if (route === 'import') await importView();
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
window.addEventListener('online', () => {
  recoverPendingLogout()
    .then((pending) => pending ? authView(false, authenticated) : replayQueue().then(() => render()))
    .then(() => notify('Back online'))
    .catch((error) => notify(errorMessage(error)));
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
recoverPendingLogout().then((pending) => {
  if (pending) {
    nav.hidden = true;
    authView(false, authenticated);
    return;
  }
  return replayQueue().finally(() => render().catch((error) => app.replaceChildren(el('p', { class: 'error' }, errorMessage(error)))));
}).catch((error) => app.replaceChildren(el('p', { class: 'error' }, errorMessage(error))));
