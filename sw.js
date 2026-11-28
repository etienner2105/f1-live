const CACHE = 'f1-live-v3';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'js/main.js', 'js/api.js', 'js/model.js', 'js/util.js', 'js/charts.js',
  'js/views/common.js', 'js/views/evolution.js', 'js/views/dashboard.js', 'js/views/standings.js', 'js/views/quali.js',
  'js/views/gp.js', 'js/views/openf1.js', 'js/views/live.js', 'js/views/drivers.js', 'js/views/teams.js',
  'js/views/weather.js', 'js/views/news.js', 'js/views/compare.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for the app's own files, so updates arrive; cache as offline fallback.
// Requests to the F1 API (another origin) are left to the page itself.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('index.html')))
  );
});
