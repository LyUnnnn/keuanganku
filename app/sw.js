// ─── sw.js — Service Worker ───────────────────────────────
const CACHE   = 'keuanganku-v6';
const ASSETS  = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './css/style.css',
  './lib/idb.js',
  './js/db.js',
  './js/api.js',
  './js/saldo.js',
  './js/ui.js',
  './js/auth.js',
  './js/init.js',
  './components/panel-input.html',
  './components/panel-saldo.html',
  './components/panel-history.html',
  './components/panel-utang.html',
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
  const url = new URL(e.request.url);

  // Route sensitif selalu lewat network
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api')) {
    return;
  }

  // Jangan cache POST request (ke Apps Script)
  if (e.request.method === 'POST') return;

  // Network-first: coba jaringan dulu, fallback ke cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
