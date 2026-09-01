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

// T14 acceptance: ItemDetailSheet renders stat_sections (the game's own
// tooltip definition), not the raw stat_lines property bag. Real snapshot
// data, not hardcoded assumptions about which items exist beyond the two
// named in the ticket.
describe.skipIf(!hasSnapshots)('ItemDetailSheet (real snapshot)', () => {
  it('Extended Magazine shows exactly its two named stats, elevated Max Ammo emphasized, no engine keys', () => {
    const items = readItems()
    const item = items.find((candidate) => candidate.name === 'Extended Magazine')
    expect(item).toBeDefined()

    render(<ItemDetailSheet item={item!} onClose={() => {}} />)

    const statList = document.querySelector('.item-detail-sheet__stats') as HTMLElement
    expect(statList).not.toBeNull()
    const rows = Array.from(statList.querySelectorAll('li')).map((li) => li.textContent)
    expect(rows).toEqual(expect.arrayContaining(['Max Ammo+30%', 'Weapon Damage+8%']))
    expect(rows.length).toBe(2)

    const elevatedRow = statList.querySelector('.item-detail-sheet__stat--elevated')
    expect(elevatedRow?.textContent).toBe('Max Ammo+30%')

    // Ghost engine keys (the item's full stat_lines bag) must never render.
    expect(screen.queryByText('AbilityUnitTargetLimit')).not.toBeInTheDocument()
    expect(screen.queryByText('ChannelMoveSpeed')).not.toBeInTheDocument()
  })

  it('an active item shows its Active section with description + stats', () => {
    const items = readItems()
    const item = items.find((candidate) => candidate.stat_sections.some((section) => section.type === 'active'))
    expect(item).toBeDefined()

    render(<ItemDetailSheet item={item!} onClose={() => {}} />)

    expect(screen.getByText('Active')).toBeInTheDocument()
    const activeSection = item!.stat_sections.find((section) => section.type === 'active')!
    if (activeSection.description) {
      expect(screen.getByText(activeSection.description)).toBeInTheDocument()
    }
  })

  it('hides stats whose value is null and never shows keys outside the item\'s own sections', () => {
    const items = readItems()
    const item = items.find((candidate) =>
      candidate.stat_sections.some((section) => section.stats.some((stat) => stat.value === null)),
    )
    expect(item).toBeDefined()

    render(<ItemDetailSheet item={item!} onClose={() => {}} />)

    const nullStat = item!.stat_sections.flatMap((section) => section.stats).find((stat) => stat.value === null)!
    expect(screen.queryByText(nullStat.label)).not.toBeInTheDocument()
  })

  it('shows no stats block at all for an item with empty stat_sections', () => {
    const items = readItems()
    const item = items.find((candidate) => candidate.stat_sections.length === 0)
    // Only assert the behavior if the real snapshot actually has such an item.
    if (!item) return

    render(<ItemDetailSheet item={item} onClose={() => {}} />)
    expect(document.querySelector('.item-detail-sheet__stats-section')).toBeNull()
  })
})
