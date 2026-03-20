/* This service worker intentionally unregisters itself.
   A previous version injected COOP headers that broke Firebase Auth popups.
   Keeping this file ensures the browser fetches it, detects the change,
   and activates the self-destruct version for anyone who still has the
   old SW cached. */
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll({ type: 'window' });
    }).then(clients => {
      for (const client of clients) client.navigate(client.url);
    })
  );
});
