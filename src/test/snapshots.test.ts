import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DATA_DIR = join(process.cwd(), 'public/data')
const META_PATH = join(DATA_DIR, 'meta.json')
const hasSnapshots = existsSync(META_PATH)

function readJson(...parts: string[]) {
  return JSON.parse(readFileSync(join(DATA_DIR, ...parts), 'utf8'))
}

// Snapshots are only committed by the orchestrator (GOALS.md T2b) — the
// sandbox that writes this test cannot reach the fetch APIs. Skip cleanly
// rather than fail when public/data/meta.json is absent.
describe.skipIf(!hasSnapshots)('data snapshots', () => {
  it('items.json has >=150 shopable items with required fields', () => {
    // Catalog is filtered to real shop items (shopable && !disabled) — 173 as of
    // 2026-09-01; the old >=200 floor counted disabled entries.
    const items = readJson('items.json')
    expect(items.length).toBeGreaterThanOrEqual(150)
    for (const item of items) {
      expect(item.id).toBeDefined()
      expect(item.class_name).toBeDefined()
      expect(item.name).toBeDefined()
      expect(item.cost).not.toBeNull()
      expect(item.item_tier).not.toBeNull()
      expect(item.item_slot_type).not.toBeNull()
    }
  })

  it('heroes.json has active heroes with base stats, growth, and 4 named abilities', () => {
    const heroes = readJson('heroes.json')
    expect(heroes.length).toBeGreaterThan(0)
    for (const hero of heroes) {
      expect(hero.id).toBeDefined()
      expect(hero.name).toBeDefined()
      expect(hero.base_stats).toBeTruthy()
      expect(hero.stat_growth).toBeTruthy()
      expect(hero.abilities).toHaveLength(4)
      for (const ability of hero.abilities) {
        expect(ability.id).toBeDefined()
        expect(ability.name).toBeDefined()
      }
    }
  })

  it('has an analytics snapshot for every active hero', () => {
    const heroes = readJson('heroes.json')
    for (const hero of heroes) {
      const analytics = readJson('analytics', `hero-${hero.id}.json`)
      expect(analytics.hero_id).toBe(hero.id)
      expect(Array.isArray(analytics.item_stats)).toBe(true)
      expect(Array.isArray(analytics.ability_order_stats)).toBe(true)
      expect(Array.isArray(analytics.high_badge_ability_order_stats)).toBe(true)
    }
  })

  it('has infernus item-permutation-stats', () => {
    const permutations = readJson('analytics', 'infernus-permutations.json')
    expect(Array.isArray(permutations)).toBe(true)
  })

  it('personal/matches.json is pruned to the required fields', () => {
    const matches = readJson('personal', 'matches.json')
    expect(Array.isArray(matches)).toBe(true)
    for (const match of matches) {
      expect(match.hero_id).toBeDefined()
      expect(typeof match.won).toBe('boolean')
      expect(match.duration_s).toBeDefined()
      expect(match.start_time).toBeDefined()
    }
  })

  it('zergggy/matches.json has >=20 matches with purchase data', () => {
    const matches = readJson('zergggy', 'matches.json')
    const withPurchases = matches.filter((m: { purchases: unknown[] }) => m.purchases.length > 0)
    expect(withPurchases.length).toBeGreaterThanOrEqual(20)
    for (const match of matches) {
      expect(match.match_id).toBeDefined()
      expect(typeof match.won).toBe('boolean')
      for (const purchase of match.purchases) {
        expect(purchase.item_id).toBeDefined()
        expect(purchase.game_time_s).toBeDefined()
      }
    }
  })

  it('meta.json reports fetched_at and counts', () => {
    const meta = readJson('meta.json')
    expect(meta.fetched_at).toBeDefined()
    expect(meta.counts).toBeTruthy()
  })
})

describe.skipIf(hasSnapshots)('data snapshots (no data yet)', () => {
  it('skips cleanly when public/data/meta.json is absent', () => {
    expect(hasSnapshots).toBe(false)
  })
})
