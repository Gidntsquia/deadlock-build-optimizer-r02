import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateBuilds, pickBestBuild } from '../generator'
import type { Build, Hero, HeroAnalytics, Item, ScoredCandidate } from '../generator'
import { HIGH_BADGE_MIN_SAMPLE, HIGH_BADGE_WEIGHT, blendHighBadgeStat, dampedWinRate, highBadgeBlendWeight, scoreItem } from '../generator/score'

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

  it.each(sampleHeroNames)('generates exactly 1 valid build for %s', (name) => {
    const hero = heroByName(name)
    const analytics = analyticsByHero.get(hero.id)!
    const build = generateBuilds(hero, items, analytics)

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
  })

  it('caps activated-ability items at 2 per build', () => {
    for (const name of sampleHeroNames) {
      const hero = heroByName(name)
      const analytics = analyticsByHero.get(hero.id)!
      const build = generateBuilds(hero, items, analytics)
      const itemById = new Map(items.map((i) => [i.id, i]))
      const activeCount = build.items.filter((entry) => {
        const item = itemById.get(entry.item_id)!
        return item.stat_lines.some((s) => s.key === 'AbilityCooldown' && Number(s.value) !== 0)
      }).length
      expect(activeCount).toBeLessThanOrEqual(2)
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

// T9: high-elo (Phantom+) weighting of win-rate/usage. Pure fixtures, not
// snapshot-dependent, so these always run.
describe('scoreItem high-elo blend', () => {
  const fixtureItem: Item = {
    id: 1,
    class_name: 'fixture_item',
    name: 'Fixture Item',
    cost: 1000,
    item_tier: 2,
    item_slot_type: 'weapon',
    image: null,
    stat_lines: [],
    stat_sections: [],
    is_active_item: false,
    active_description: null,
    passive_description: null,
  }

  const baseInputs = {
    item: fixtureItem,
    meanWinRate: 0.5,
    maxOverallMatches: 1000,
    maxHighMatches: 1000,
    maxValuePerSoul: 0, // 0 disables the value-per-soul term so only win-rate/usage differ
    archetype: 'weapon' as const,
  }

  it('an item whose high-elo win rate beats its overall win rate outscores the reverse case (adequate sample)', () => {
    // Item A: strong overall (90%), weak at high elo (10%).
    const scoreA = scoreItem({
      ...baseInputs,
      overallWins: 900,
      overallMatches: 1000,
      highWins: 100,
      highMatches: 1000, // >= HIGH_BADGE_MIN_SAMPLE
    })
    // Item B: the mirror image — weak overall (10%), strong at high elo (90%).
    const scoreB = scoreItem({
      ...baseInputs,
      overallWins: 100,
      overallMatches: 1000,
      highWins: 900,
      highMatches: 1000,
    })
    expect(scoreB).toBeGreaterThan(scoreA)
  })

  it('below HIGH_BADGE_MIN_SAMPLE, the blend degrades smoothly toward overall-only stats', () => {
    const overall = { wins: 100, matches: 1000 } // overall win rate 10%
    const high = { wins: 4, matches: 5 } // high-elo win rate 80%, tiny sample

    const weight = highBadgeBlendWeight(high.matches)
    const expectedWeight = HIGH_BADGE_WEIGHT * (high.matches / HIGH_BADGE_MIN_SAMPLE)
    expect(weight).toBeCloseTo(expectedWeight, 10)
    expect(weight).toBeGreaterThan(0)
    expect(weight).toBeLessThan(HIGH_BADGE_WEIGHT)

    const blended = blendHighBadgeStat(overall, high, 1000, 1000)
    const overallOnlyRate = overall.wins / overall.matches
    // Nudged toward the high-elo rate but still close to the overall rate.
    expect(blended.winRate).toBeGreaterThan(overallOnlyRate)
    expect(blended.winRate).toBeLessThan(overallOnlyRate + 0.05)

    // No high-elo evidence at all => exactly the overall rate (full fallback).
    const noHighEvidence = blendHighBadgeStat(overall, { wins: 0, matches: 0 }, 1000, 1000)
    expect(noHighEvidence.winRate).toBeCloseTo(overallOnlyRate, 10)
  })

  it('dampedWinRate shrinks low-sample blended rates toward the hero mean, same as before blending existed', () => {
    const meanWinRate = 0.5
    const damped = dampedWinRate(0.9, 1, meanWinRate) // 1 effective match, near-mean K=50 damping
    expect(damped).toBeGreaterThan(meanWinRate)
    expect(damped).toBeLessThan(0.6)
  })
})

// T13: single-build pick. Pure fixtures over pickBestBuild, not snapshot-dependent.
describe('pickBestBuild', () => {
  function candidate(archetype: 'weapon' | 'spirit', totalScore: number, itemIds: number[]): ScoredCandidate {
    const build: Build = {
      name: 'Fixture Build',
      archetype,
      items: itemIds.map((id, i) => ({ item_id: id, phase: 'early', cost: 100, running_total: 100 * (i + 1) })),
      ability_order: [],
    }
    return { archetype, totalScore, build }
  }

  it('the candidate with the higher total score wins', () => {
    const weaker = candidate('weapon', 5, [10, 20])
    const stronger = candidate('spirit', 7, [30, 40])
    expect(pickBestBuild([weaker, stronger])).toBe(stronger.build)
    expect(pickBestBuild([stronger, weaker])).toBe(stronger.build)
  })

  it('ties break by ascending archetype name', () => {
    const weapon = candidate('weapon', 5, [10, 20])
    const spirit = candidate('spirit', 5, [10, 20])
    expect(pickBestBuild([weapon, spirit])).toBe(spirit.build) // 'spirit' < 'weapon'
    expect(pickBestBuild([spirit, weapon])).toBe(spirit.build)
  })
})
