// ─── sw.js — Service Worker ───────────────────────────────
const CACHE   = 'keuanganku-v3';
const ASSETS  = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/api.js',
  './js/saldo.js',
  './js/ui.js',
  './components/panel-input.html',
  './components/panel-saldo.html',
  './components/panel-history.html',
  './components/panel-settings.html',
  './components/panel-about.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Jangan cache POST request (ke Apps Script)
  if (e.request.method === 'POST') return;

  // Network-first: coba jaringan dulu, fallback ke cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
