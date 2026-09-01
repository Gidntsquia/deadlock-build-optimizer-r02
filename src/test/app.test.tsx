import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../App'

const hasSnapshots = existsSync(join(process.cwd(), 'public/data/meta.json'))

// T5 acceptance: boots the real <App/> against the committed snapshots.
// Skip cleanly (same convention as generator.test.ts / snapshots.test.ts)
// when snapshots aren't present, rather than fail.
describe.skipIf(!hasSnapshots)('App', () => {
  it('shows Infernus by default with >=2 builds of >=12 items, badges, and agreement %', async () => {
    render(<App />)

    const heroSelect = await screen.findByLabelText<HTMLSelectElement>(/hero/i)
    expect(heroSelect.value).toBe('1') // Infernus hero id

    const agreementBadges = await screen.findAllByText(/% agreement/)
    expect(agreementBadges.length).toBeGreaterThanOrEqual(2)

    const buildCards = document.querySelectorAll('.build-card')
    expect(buildCards.length).toBeGreaterThanOrEqual(2)
    for (const card of Array.from(buildCards)) {
      const itemRows = card.querySelectorAll('.item-row')
      expect(itemRows.length).toBeGreaterThanOrEqual(12)
      const badges = card.querySelectorAll('.badge')
      expect(badges.length).toBe(itemRows.length)
    }
  })

  it('tapping an item opens its detail card with cost/tier/slot', async () => {
    render(<App />)

    await screen.findAllByText(/% agreement/)
    const firstItemButton = document.querySelector<HTMLButtonElement>('.item-row__button')
    expect(firstItemButton).not.toBeNull()
    fireEvent.click(firstItemButton!)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Cost')).toBeInTheDocument()
    expect(within(dialog).getByText('Tier')).toBeInTheDocument()
    expect(within(dialog).getByText('Slot')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByLabelText('Close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders builds and ability orders without errors for 3 other heroes', async () => {
    render(<App />)

    const heroSelect = await screen.findByLabelText<HTMLSelectElement>(/hero/i)
    const otherOptions = Array.from(heroSelect.options)
      .filter((option) => option.value !== '1')
      .slice(0, 3)
    expect(otherOptions.length).toBe(3)

    for (const option of otherOptions) {
      const heroName = option.textContent ?? ''
      fireEvent.change(heroSelect, { target: { value: option.value } })
      await screen.findAllByRole('heading', { level: 2, name: new RegExp(`^${heroName} `) })

      const buildCards = document.querySelectorAll('.build-card')
      expect(buildCards.length).toBeGreaterThanOrEqual(2)
      for (const card of Array.from(buildCards)) {
        expect(card.querySelectorAll('.item-row').length).toBeGreaterThanOrEqual(12)
        expect(card.querySelectorAll('.ability-order__step').length).toBeGreaterThan(0)
        // Non-Infernus heroes render without a validation report.
        expect(card.querySelectorAll('.badge').length).toBe(0)
        expect(card.querySelector('.build-card__agreement')).toBeNull()
      }
    }
  })
})
