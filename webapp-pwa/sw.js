const CACHE_NAME = 'ghostlink-pwa-v8';
const STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './ghost_ava.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // РќРµ РєСЌС€РёСЂСѓРµРј API/РґРёРЅР°РјРёРєСѓ/POST вЂ” С‡С‚РѕР±С‹ РЅРµ С…СЂР°РЅРёС‚СЊ С‡СѓРІСЃС‚РІРёС‚РµР»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ Р»РѕРєР°Р»СЊРЅРѕ.
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isCriticalAsset =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.destination === 'manifest';

  // Р”Р»СЏ HTML/JS/CSS: СЃРµС‚СЊ СЃРЅР°С‡Р°Р»Р°, С‡С‚РѕР±С‹ РѕР±РЅРѕРІР»РµРЅРёСЏ РїСЂРёР»РµС‚Р°Р»Рё Р±РµР· РїРµСЂРµСѓСЃС‚Р°РЅРѕРІРєРё PWA.
  if (isSameOrigin && isCriticalAsset) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return resp;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Р”Р»СЏ РѕСЃС‚Р°Р»СЊРЅС‹С… Р°СЃСЃРµС‚РѕРІ: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (!resp || resp.status !== 200 || resp.type !== 'basic') return resp;
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return resp;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', function (event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.body || 'РќРѕРІРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ',
        icon: 'ghost_ava.png',
        badge: 'ghost_ava.png',
        vibrate: [100, 50, 100],
        data: {
          url: data.url || '/'
        }
      };
      event.waitUntil(
        self.registration.showNotification(data.title || 'GhostLink', options)
      );
    } catch (e) {
      event.waitUntil(
        self.registration.showNotification('GhostLink', {
          body: event.data.text(),
          icon: 'ghost_ava.png'
        })
      );
    }
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  } else {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

