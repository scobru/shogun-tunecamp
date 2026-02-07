const CACHE_NAME = 'tunecamp-v2';

// Clean logic for caching
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Cache Cover Images (Cache First)
    if (url.pathname.match(/\/api\/(albums|artists)\/.*\/cover$/) || url.pathname.match(/\/api\/uploads\/covers\//)) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    if (response) return response;
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse.ok && networkResponse.type === 'basic') {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // 2. Audio Files (Range requests are tricky, usually browser handles cache, but we can try caching)
    // For now, let's leave audio to browser cache / network to avoid seeking issues with simple SW cache.

    // 3. Static Assets (Stale While Revalidate)
    if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.svg')) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    const fetchPromise = fetch(event.request).then((networkResponse) => {
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // 4. Navigation (Network First, fall back to offline page if we had one)
    // For SPA, we might want to return index.html for navigation requests if offline?
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match('/index.html');
            })
        );
        return;
    }

    // Default: Network 
});
