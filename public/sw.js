const CACHE_NAME = 'dtomate-static-v2';
const APP_SHELL = ['/manifest.webmanifest', '/logo-dtomate.png', '/favicon.ico'];
const isStatic = (url) => url.origin === self.location.origin && (url.pathname.startsWith('/build/assets/') || APP_SHELL.includes(url.pathname));

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((names) => Promise.all(names
        .filter((name) => name.startsWith('dtomate-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
    if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;
    const urls = event.data.urls.filter((url) => typeof url === 'string' && isStatic(new URL(url, self.location.origin)));
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urls)));
});
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET' || request.mode === 'navigate' || !isStatic(new URL(request.url))) return;
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
    })));
});
