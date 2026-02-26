const CACHE_VERSION = 'akiva-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const API_CACHE = `${CACHE_VERSION}-api`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/akiva-icon.svg',
];

function canCacheResponse(response) {
  return Boolean(
    response &&
      (response.ok || response.type === 'opaque') &&
      (response.type === 'basic' || response.type === 'cors' || response.type === 'opaque')
  );
}

function isApiRequest(url) {
  return url.pathname.includes('/api/');
}

function isDevAssetRequest(url) {
  return (
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/.vite/') ||
    url.pathname.startsWith('/@react-refresh')
  );
}

function isStaticAssetRequest(request, url) {
  if (url.pathname.startsWith('/assets/')) return true;
  return ['script', 'style', 'font', 'image', 'manifest', 'worker'].includes(request.destination);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await Promise.all(
        APP_SHELL_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch {
            // Do not fail install if one URL fails.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function networkFirst(request, cacheName, fallbackResponse) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (canCacheResponse(networkResponse)) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackResponse) return fallbackResponse;
    return new Response('Offline and no cached response found.', {
      status: 503,
      statusText: 'Offline',
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const networkResponse = await fetch(request);
  if (canCacheResponse(networkResponse)) {
    await cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then(async (response) => {
      if (canCacheResponse(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) return cached;
  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;
  return new Response('Offline and no cached response available.', {
    status: 503,
    statusText: 'Offline',
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;
  if (url.origin.startsWith('chrome-extension://')) return;

  const isNavigation = request.mode === 'navigate';
  const sameOrigin = url.origin === self.location.origin;

  if (isNavigation) {
    event.respondWith(
      (async () => {
        const offlineFallback = await caches.match('/offline.html');
        const indexFallback = await caches.match('/index.html');
        return networkFirst(request, APP_SHELL_CACHE, indexFallback || offlineFallback);
      })()
    );
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (sameOrigin && isDevAssetRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  if (sameOrigin && isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
});
