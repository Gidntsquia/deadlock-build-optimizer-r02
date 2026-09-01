import { expect, test } from '@playwright/test'

// Item/hero shop images are the app's only external runtime host.
const ASSET_HOST_GLOB = '**/assets-bucket.deadlock-api.com/**'

test.describe('mobile viewport (390x844)', () => {
  test('Infernus default screen has no horizontal overflow and shows exactly 1 build', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('open item detail card has no horizontal overflow', async ({ page }) => {
    await page.goto('/')
    await page.locator('.item-row__button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('a non-Infernus hero has no horizontal overflow', async ({ page }) => {
    await page.goto('/')
    const select = page.locator('#hero-select')
    await expect(select.locator('option')).not.toHaveCount(0)
    const otherValue = await select.locator('option').nth(1).getAttribute('value')
    await select.selectOption(otherValue!)
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('key tap targets are >=40px in both dimensions', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })

    const selectBox = await page.locator('#hero-select').boundingBox()
    expect(selectBox?.height).toBeGreaterThanOrEqual(40)

    const itemButton = page.locator('.item-row__button').first()
    const itemBox = await itemButton.boundingBox()
    expect(itemBox?.height).toBeGreaterThanOrEqual(40)

    await itemButton.click()
    const closeButton = page.getByRole('button', { name: 'Close' })
    const closeBox = await closeButton.boundingBox()
    expect(closeBox?.width).toBeGreaterThanOrEqual(40)
    expect(closeBox?.height).toBeGreaterThanOrEqual(40)
  })
})

test.describe('offline resilience', () => {
  test('app boots with the external image host blocked (404s are acceptable)', async ({ page }) => {
    await page.route(ASSET_HOST_GLOB, (route) => route.abort())
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/')
    await expect(page.locator('.build-card')).toHaveCount(1, { timeout: 15_000 })
    await page.locator('.item-row__button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
