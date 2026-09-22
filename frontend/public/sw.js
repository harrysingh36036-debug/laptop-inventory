/* Universal CRM service worker — free self-hosted Web Push.
 * Shows a system notification (with sound) even when the app is closed.
 * NOTE: a custom MP3 cannot play while the app is closed — the OS plays the
 * default notification sound. The in-app transfer-sound.mp3 plays while open.
 */

// Activate new versions immediately so devices don't sit on a stale app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Universal CRM';
  const options = {
    body: data.body || '',
    tag: data.tag || 'laptop-inventory',
    renotify: true,
    silent: false,
    icon: './icon.svg',
    badge: './icon.svg',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
