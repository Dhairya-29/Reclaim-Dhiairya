// Offline-first: app files network-first with cache fallback, fonts cache-first.
const CACHE = 'reclaim-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'ideas.json', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const cacheable = url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  const put = res => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(request, copy)); } return res; };
  // App files: network first so updates arrive, cache when offline. Fonts: cache first.
  e.respondWith(url.origin === location.origin
    ? fetch(request).then(put).catch(() => caches.match(request, { ignoreSearch: true }).then(hit => hit || caches.match('index.html')))
    : caches.match(request).then(hit => hit || fetch(request).then(put)));
});
