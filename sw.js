
const CACHE_NAME = 'lifejiu-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'lifejiu-reminder-check') {
    event.waitUntil(
      self.registration.showNotification('Life Jiu', {
        body: 'Hora de checar seu treino de hoje no Life Jiu!',
        icon: undefined,
      })
    );
  }
});
