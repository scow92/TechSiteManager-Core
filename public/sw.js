'use strict';

const CACHE = 'techsitemanager-shell-v7';
const SHELL = [
  '/', '/index.html', '/css/styles.css', '/manifest.json',
  '/js/idb.js', '/js/offline.js', '/js/api.js', '/js/auth.js', '/js/dom.js', '/js/main.js', '/js/offline-ui.js',
  '/js/presentation.js',
  '/js/import/descriptors.js', '/js/import/reconciliation.js',
  '/js/views/home.js', '/js/views/import.js', '/js/views/settings.js', '/js/views/sites.js', '/js/views/work-package.js'
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
