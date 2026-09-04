'use strict';

const CACHE = 'techsitemanager-shell-v15';
const SHELL = [
  '/', '/index.html', '/css/styles.css', '/manifest.json',
  '/js/idb.js', '/js/offline.js', '/js/api.js', '/js/auth.js', '/js/dom.js', '/js/main.js', '/js/offline-ui.js', '/js/pwa.js', '/js/work-package-store.js',
  '/js/presentation.js',
  '/js/import/descriptors.js', '/js/import/reconciliation.js',
  '/js/views/cable-schedule.js', '/js/views/home.js', '/js/views/import.js', '/js/views/infrastructure.js', '/js/views/settings.js', '/js/views/sites.js', '/js/views/work-package.js'
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && event.request.method === 'GET') caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html'))));
});
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* Only bounded generic fields are used. */ }
  const title = typeof data.title === 'string' && data.title.length <= 120 ? data.title : 'TechSiteManager update';
  const body = typeof data.body === 'string' && data.body.length <= 240 ? data.body : 'Open TechSiteManager to review the latest status.';
  const route = typeof data.route === 'string' && /^(home|site\/[0-9a-f-]{36}\/[a-z-]+|package\/[0-9a-f-]{36}\/[a-z-]+)$/.test(data.route) ? data.route : 'home';
  event.waitUntil(self.registration.showNotification(title, { body, tag: 'techsitemanager-update', data: { route } }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route || 'home';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients[0];
    if (existing) { existing.navigate(`/#${route}`); return existing.focus(); }
    return self.clients.openWindow(`/#${route}`);
  }));
});
