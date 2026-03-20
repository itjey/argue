/* coi-serviceworker — adds COOP/COEP headers so SharedArrayBuffer works on GitHub Pages */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
  if (e.request.url.startsWith('chrome-extension://')) return;

  e.respondWith(
    fetch(e.request).then(res => {
      if (!res || res.status === 0 || !res.url.startsWith('http')) return res;
      const h = new Headers(res.headers);
      // Use restrict-properties instead of same-origin so Firebase Auth
      // popups (signInWithPopup) can still postMessage back to the opener
      // while keeping crossOriginIsolated enabled for SharedArrayBuffer.
      h.set('Cross-Origin-Opener-Policy', 'restrict-properties');
      h.set('Cross-Origin-Embedder-Policy', 'credentialless');
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    }).catch(() => fetch(e.request))
  );
});
