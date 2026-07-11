const CACHE_NAME = 'lifejiu-cache-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first para o HTML principal (pra sempre pegar a versão mais nova quando online),
// cache-first pros assets estáticos (ícones, manifest) e fallback pro cache quando offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || req.url.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./lj_10.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      return res;
    }).catch(() => cached))
  );
});

// Verificação periódica de lembrete de treino (usada pelo periodicSync registrado no app).
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'lifejiu-reminder-check') {
    event.waitUntil(
      self.registration.showNotification('Life Jiu', {
        body: 'Bora registrar o treino de hoje?',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png'
      })
    );
  }
});
