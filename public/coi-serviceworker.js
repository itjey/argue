/* coi-serviceworker — adds COEP header for cross-origin resource loading */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
  if (e.request.url.startsWith('chrome-extension://')) return;

  e.respondWith(
    fetch(e.request).then(res => {
      if (!res || res.status === 0 || !res.url.startsWith('http')) return res;
      const h = new Headers(res.headers);
      // Only set COEP; intentionally omit COOP so that Firebase Auth
      // signInWithPopup can communicate across the popup boundary.
      // SharedArrayBuffer (crossOriginIsolated) requires COOP too, but
      // GitHub Pages cannot serve real HTTP headers and injecting COOP
      // via a service worker breaks popup-based OAuth flows.  The Python
      // runner already falls back to main-thread Pyodide when
      // crossOriginIsolated is false.
      h.set('Cross-Origin-Embedder-Policy', 'credentialless');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }).catch(() => fetch(e.request))
  );
});
