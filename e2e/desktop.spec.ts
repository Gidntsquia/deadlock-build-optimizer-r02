import { expect, test } from '@playwright/test'

// T17: at/above the 1024px breakpoint the app fills the viewport (fluid up
// to a 1440px max-width) instead of staying a phone column pinned to
// center. This spec runs at 1440x900 — its own viewport override, separate
// from playwright.config.ts's default 390x844 mobile-first viewport.
test.use({ viewport: { width: 1440, height: 900 } })

test.describe('desktop viewport (1440x900)', () => {
  test('content fills the viewport with no page-level horizontal scroll', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    const appWidth = await page.locator('.app').evaluate((el) => el.getBoundingClientRect().width)
    expect(appWidth).toBeGreaterThanOrEqual(900 * 0.85)
    expect(appWidth).toBeLessThanOrEqual(1440)
  })

  test('phase panels sit side by side', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })

    const panels = page.locator('.phase-panel')
    await expect(panels).toHaveCount(2)
    const [first, second] = await Promise.all([
      panels.nth(0).boundingBox(),
      panels.nth(1).boundingBox(),
    ])
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    // Side by side means roughly the same vertical position, not stacked.
    expect(Math.abs((first?.y ?? 0) - (second?.y ?? 0))).toBeLessThan(10)
    expect((first?.x ?? 0) + (first?.width ?? 0)).toBeLessThanOrEqual((second?.x ?? 0) + 1)
  })

  test('Ability Point Order panel spans the full content width', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.ability-order-panel')).toHaveCount(1, { timeout: 15_000 })

    const [appBox, panelBox] = await Promise.all([
      page.locator('.app').boundingBox(),
      page.locator('.ability-order-panel').boundingBox(),
    ])
    expect(appBox).not.toBeNull()
    expect(panelBox).not.toBeNull()
    expect(panelBox!.width).toBeGreaterThanOrEqual(appBox!.width * 0.85)
  })
})
