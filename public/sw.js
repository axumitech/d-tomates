const CACHE_NAME = 'dtomate-shell-v1';
const APP_SHELL = ['/', '/carnet', '/manifest.webmanifest', '/logo-dtomate.png', '/favicon.ico'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(names
            .filter((name) => name.startsWith('dtomate-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;

    const urls = event.data.urls.filter((url) => typeof url === 'string' && new URL(url, self.location.origin).origin === self.location.origin);
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urls)));
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request).then((cached) => cached || caches.match('/carnet'))),
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request).then((response) => {
            if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            return response;
        })),
    );
});
