import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')
const mainTsx = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8')

// T12 acceptance checks, encoded as regression tests rather than one-off
// manual greps so a future edit can't silently regress the cohesion pass.
describe('styles.css token discipline (T12)', () => {
  it('has zero hex colors outside the :root token block', () => {
    const rootBlock = css.match(/:root\s*{[^}]*}/)?.[0] ?? ''
    expect(rootBlock).not.toBe('')
    const outsideRoot = css.replace(rootBlock, '')
    expect(outsideRoot.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
  })

  it('respects prefers-reduced-motion by killing transition/animation durations', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('vendors fonts via @fontsource instead of any external font host', () => {
    expect(mainTsx).toMatch(/@fontsource\/baloo-2/)
    expect(mainTsx).toMatch(/@fontsource\/nunito-sans/)
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
  })

  it('defines a visible keyboard focus outline', () => {
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*2px solid var\(--header-teal\)/)
  })
})
