import { expect, test } from '@playwright/test'

// Item/hero shop images are the app's only external runtime host. Mocked
// here (not fetched for real) so the test is deterministic in any sandbox,
// this one included — its egress proxy already blocks the real host outright
// (see CLAUDE.md's SANDBOX EGRESS note), which would make a real-network
// version of this test fail for the wrong reason.
const ASSET_HOST_GLOB = '**/assets-bucket.deadlock-api.com/**'
// Minimal valid 1x1 PNG.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function firstImageLoaded(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const img = document.querySelector('.item-card__image')
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0
  })
}

// T24: public/sw.js cache-first-caches shop images once a page load is
// controlled by it, so a repeat visit shows real artwork even with the
// image host unreachable. Three navigations, matching how a service worker
// actually takes effect: (1) install — this load's own image requests are
// NOT intercepted, since the page isn't controlled yet; (2) reload — now
// controlled (activate calls clients.claim()), so its image fetches pass
// through the worker and get cached; (3) reload with the image host
// blocked — the cached image must still render, served straight from the
// worker's cache with no network request at all.
// Routing is context-level (not page-level): a service worker's own fetches
// aren't attributed to any page/frame, so only context.route() sees them.
test.describe('offline image caching (T24 service worker)', () => {
  test('a cached item image still renders once the external image host is blocked', async ({ page, context }) => {
    await context.route(ASSET_HOST_GLOB, (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }))

    await page.goto('/')
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })
    await firstImageLoaded(page)
    await page.evaluate(() => navigator.serviceWorker.ready)

    await page.reload()
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })
    await firstImageLoaded(page)

    await context.unroute(ASSET_HOST_GLOB)
    await context.route(ASSET_HOST_GLOB, (route) => route.abort())
    await page.reload()
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })
    await firstImageLoaded(page)
  })
})
