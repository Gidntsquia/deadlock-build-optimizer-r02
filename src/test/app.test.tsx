import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../App'
import ItemDetailSheet, { isMeaningfulStatLine } from '../components/ItemDetailSheet'
import type { Item } from '../generator'

const hasSnapshots = existsSync(join(process.cwd(), 'public/data/meta.json'))

function readItems(): Item[] {
  return JSON.parse(readFileSync(join(process.cwd(), 'public/data/items.json'), 'utf8'))
}

// T5 acceptance: boots the real <App/> against the committed snapshots.
// Skip cleanly (same convention as generator.test.ts / snapshots.test.ts)
// when snapshots aren't present, rather than fail.
describe.skipIf(!hasSnapshots)('App', () => {
  it('shows Infernus by default with exactly 1 build of >=12 items, badges, and agreement %', async () => {
    render(<App />)

    const heroSelect = await screen.findByLabelText<HTMLSelectElement>(/hero/i)
    expect(heroSelect.value).toBe('1') // Infernus hero id

    const agreementBadges = await screen.findAllByText(/% agreement/)
    expect(agreementBadges.length).toBe(1)

    const buildCards = document.querySelectorAll('.build-card')
    expect(buildCards.length).toBe(1)
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
      expect(buildCards.length).toBe(1)
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

describe('isMeaningfulStatLine', () => {
  it('hides zero-valued numbers and strings, including unit-suffixed ones', () => {
    expect(isMeaningfulStatLine(0)).toBe(false)
    expect(isMeaningfulStatLine('0')).toBe(false)
    expect(isMeaningfulStatLine('0m')).toBe(false)
  })

  it('keeps nonzero numbers and unit-suffixed strings', () => {
    expect(isMeaningfulStatLine(30)).toBe(true)
    expect(isMeaningfulStatLine('-1.0')).toBe(true)
    expect(isMeaningfulStatLine('7m')).toBe(true)
  })

  it('hides unparseable junk strings with no usable label', () => {
    expect(isMeaningfulStatLine('asdasd')).toBe(false)
  })

  it('keeps a non-numeric display-metadata object with a usable label', () => {
    expect(isMeaningfulStatLine({ label: 'Max Ammo', prefix: '{s:sign}' })).toBe(true)
    expect(isMeaningfulStatLine({ label: '' })).toBe(false)
  })
})

// T8 acceptance: real snapshot data, not hardcoded assumptions.
describe.skipIf(!hasSnapshots)('ItemDetailSheet (real snapshot)', () => {
  it('shows only nonzero stat lines for a real item mixing zero and nonzero values, keeps Cost/Tier/Slot', () => {
    const items = readItems()
    const item = items.find(
      (candidate) =>
        candidate.stat_lines.some((line) => !isMeaningfulStatLine(line.value)) &&
        candidate.stat_lines.some((line) => isMeaningfulStatLine(line.value))
    )
    expect(item).toBeDefined()

    render(<ItemDetailSheet item={item!} onClose={() => {}} />)

    expect(screen.getByText('Cost')).toBeInTheDocument()
    expect(screen.getByText('Tier')).toBeInTheDocument()
    expect(screen.getByText('Slot')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()

    const hiddenKeys = item!.stat_lines.filter((line) => !isMeaningfulStatLine(line.value)).map((line) => line.key)
    const shownKeys = item!.stat_lines.filter((line) => isMeaningfulStatLine(line.value)).map((line) => line.key)
    const statList = document.querySelector('.item-detail-sheet__stats')!
    for (const key of shownKeys) {
      expect(within(statList as HTMLElement).getByText(key)).toBeInTheDocument()
    }
    for (const key of hiddenKeys) {
      if (shownKeys.includes(key)) continue
      expect(within(statList as HTMLElement).queryByText(key)).not.toBeInTheDocument()
    }
  })

  it('hides the Stats section entirely when an item has no meaningful stat lines', () => {
    const items = readItems()
    const item = items.find((candidate) => candidate.stat_lines.every((line) => !isMeaningfulStatLine(line.value)))
    // Only assert the behavior if the real snapshot actually has such an item.
    if (!item) return

    render(<ItemDetailSheet item={item} onClose={() => {}} />)
    expect(screen.queryByText('Stats')).not.toBeInTheDocument()
    expect(document.querySelector('.item-detail-sheet__stats')).toBeNull()
  })
})
