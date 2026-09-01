import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from '../registerServiceWorker'

afterEach(() => {
  // @ts-expect-error test-only cleanup of a jsdom navigator property we defined
  delete navigator.serviceWorker
  vi.restoreAllMocks()
})

describe('registerServiceWorker', () => {
  it('does nothing when the browser has no serviceWorker API', () => {
    expect(() => registerServiceWorker()).not.toThrow()
  })

  it('registers public/sw.js on window load when serviceWorker is available', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true })

    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()

    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0]).toMatch(/sw\.js$/)
  })
})
