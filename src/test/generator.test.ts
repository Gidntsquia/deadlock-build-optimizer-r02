import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateBuilds } from '../generator'
import type { Hero, HeroAnalytics, Item } from '../generator'

const DATA_DIR = join(process.cwd(), 'public/data')
const META_PATH = join(DATA_DIR, 'meta.json')
const hasSnapshots = existsSync(META_PATH)

function readJson<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(DATA_DIR, ...parts), 'utf8'))
}

// Generator tests need T2b's committed snapshots (see GOALS.md T3). Skip
// cleanly rather than fail when they're absent, same as snapshots.test.ts.
describe.skipIf(!hasSnapshots)('generator', () => {
  const items = readJson<Item[]>('items.json')
  const heroes = readJson<Hero[]>('heroes.json')
  const analyticsByHero = new Map(heroes.map((h) => [h.id, readJson<HeroAnalytics>('analytics', `hero-${h.id}.json`)]))

  function heroByName(name: string): Hero {
    const hero = heroes.find((h) => h.name === name)
    if (!hero) throw new Error(`fixture hero not found: ${name}`)
    return hero
  }

  it('is deterministic: two runs on the same snapshot are deep-equal', () => {
    const hero = heroByName('Infernus')
    const analytics = analyticsByHero.get(hero.id)!
    const first = generateBuilds(hero, items, analytics)
    const second = generateBuilds(hero, items, analytics)
    expect(second).toEqual(first)
  })

  const sampleHeroNames = ['Infernus', 'Seven', 'Vindicta', 'Lady Geist']

  it.each(sampleHeroNames)('generates >=2 valid builds for %s', (name) => {
    const hero = heroByName(name)
    const analytics = analyticsByHero.get(hero.id)!
    const builds = generateBuilds(hero, items, analytics)

    expect(builds.length).toBeGreaterThanOrEqual(2)

    for (const build of builds) {
      expect(build.name).toContain(hero.name)
      expect(build.items.length).toBeGreaterThanOrEqual(12)

      let previousTotal = 0
      const seenIds = new Set<number>()
      for (const entry of build.items) {
        expect(entry.running_total).toBeGreaterThanOrEqual(previousTotal)
        expect(entry.cost).toBeGreaterThan(0)
        expect(seenIds.has(entry.item_id)).toBe(false)
        seenIds.add(entry.item_id)
        previousTotal = entry.running_total
      }

      expect(build.ability_order.length).toBeGreaterThan(0)
      const namedAbilityIds = new Set(build.ability_order.map((step) => step.ability_id))
      expect(namedAbilityIds.size).toBe(4)
      for (const step of build.ability_order) {
        expect(step.ability_name).toBeTruthy()
      }
    }
  })

  it('caps activated-ability items at 2 per build', () => {
    for (const name of sampleHeroNames) {
      const hero = heroByName(name)
      const analytics = analyticsByHero.get(hero.id)!
      const builds = generateBuilds(hero, items, analytics)
      const itemById = new Map(items.map((i) => [i.id, i]))
      for (const build of builds) {
        const activeCount = build.items.filter((entry) => {
          const item = itemById.get(entry.item_id)!
          return item.stat_lines.some((s) => s.key === 'AbilityCooldown' && Number(s.value) !== 0)
        }).length
        expect(activeCount).toBeLessThanOrEqual(2)
      }
    }
  })

  it('gate:heldout passes against the current src/generator/', () => {
    expect(() => execFileSync('node', ['scripts/gate-heldout.mjs'], { cwd: process.cwd() })).not.toThrow()
  })
})

describe.skipIf(hasSnapshots)('generator (no data yet)', () => {
  it('skips cleanly when public/data/meta.json is absent', () => {
    expect(hasSnapshots).toBe(false)
  })
})
