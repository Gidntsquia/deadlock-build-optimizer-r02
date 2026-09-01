// T24: cache-first for shop images (item/hero art) so a repeat visit still
// shows real artwork offline, instead of falling back to colored tiles.
// Everything else (the app shell, /data/** snapshots) is left to the normal
// browser HTTP cache — this worker only touches image requests.
const CACHE_NAME = 'deadlock-images-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || request.destination !== 'image') return

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request)
          .then((response) => {
            // Cross-origin image requests resolve as opaque responses
            // (status 0, ok: false) even on a genuine 200, since none of
            // the <img> tags set crossorigin. Cache anything that came
            // back at all; only a network failure should skip caching.
            cache.put(request, response.clone())
            return response
          })
          .catch(() => cached)
      }),
    ),
  )
})
