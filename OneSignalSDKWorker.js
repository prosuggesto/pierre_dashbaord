importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

const APP_VERSION = '1.0.2'; // Change this to force update
const CACHE_NAME = 'gestion-menage-' + APP_VERSION;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypasser COMPLÈTEMENT tout ce qui n'est pas sur notre propre domaine
  // Cela empêche de casser OneSignal (qui fait des appels à onesignal.com) et Supabase
  if (url.origin !== self.location.origin) {
    return;
  }

  // Ne pas cacher nos propres routes /api/ dynamiques
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      // Try network first, fall back to cache
      return fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, use cache
          return cached || new Response('Offline', { status: 503 });
        });
    })
  );
});

// Listener pour forcer l'activation immédiate via un message
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// PWA DEEP LINKING: Handle notification click
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const targetUrl = notification.data && notification.data.url;

  if (targetUrl) {
    event.notification.close();
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Si une fenêtre est déjà ouverte sur cette URL, on lui donne le focus
        for (const client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon on ouvre une nouvelle fenêtre dans la PWA
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  }
});
