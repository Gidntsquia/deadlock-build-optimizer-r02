// T24: registers public/sw.js (cache-first for shop images, offline
// visuals on a repeat visit). No-op when the browser has no serviceWorker
// API (e.g. jsdom in tests) — registration is best-effort, never blocking.
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Best-effort: the app works fully without a service worker.
    })
  })
}
