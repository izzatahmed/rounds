/* RoundNotes web edition — offline cache. Files are served from the phone after the first visit. */
const CACHE = 'roundnotes-0.8.3-1df021a4';
const FILES = ["./", "advice.js", "app.css", "app.js", "calcs.js", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "index.html", "lists.js", "manifest.webmanifest", "web-bridge.js", "zxing.min.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('roundnotes-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'update') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
