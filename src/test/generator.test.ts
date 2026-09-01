import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateBuilds, pickBestBuild } from '../generator'
import type { Build, Hero, HeroAnalytics, Item, ScoredCandidate } from '../generator'
import { buildAbilityOrder } from '../generator/abilityOrder'
import { buildItemChainGroups } from '../generator/itemChains'
import { HIGH_BADGE_MIN_SAMPLE, HIGH_BADGE_WEIGHT, blendHighBadgeStat, dampedWinRate, highBadgeBlendWeight, scoreItem } from '../generator/score'
import type { Ability, AbilityOrderStat } from '../generator/types'

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

  // T15: real per-hero ability order, sourced from the snapshot's
  // ability_order_stats / high_badge_ability_order_stats (see abilityOrder.ts).
  it('generates pairwise-different ability-order step sequences per hero', () => {
    // GOALS.md's T15 ticket text names "Infernus, hero_id 15" — the snapshot
    // itself says Infernus is hero_id 1 (hero_id 15 is Bebop); using the
    // correct id here per the guardrail to make a documented judgment call
    // when a ticket is ambiguous/wrong rather than block on it.
    const names = ['Infernus', 'Seven', 'Vindicta']
    const idSequences = names.map((name) => {
      const hero = heroByName(name)
      const analytics = analyticsByHero.get(hero.id)!
      const build = generateBuilds(hero, items, analytics)
      return build.ability_order.map((step) => step.ability_id).join(',')
    })
    expect(new Set(idSequences).size).toBe(idSequences.length)
  })

  it("Infernus's rendered ability order equals its top-row sequence from the chosen source", () => {
    const hero = heroByName('Infernus')
    const analytics = analyticsByHero.get(hero.id)!
    const build = generateBuilds(hero, items, analytics)

    const highTop = analytics.high_badge_ability_order_stats[0]
    const expectedSequence = (highTop?.matches ?? 0) >= 100 ? highTop.sequence! : analytics.ability_order_stats[0].sequence!

    expect(build.ability_order.map((step) => step.ability_id)).toEqual(expectedSequence)
  })

  // T18: builds must be buyable in-game — catalog-only item ids, at most one
  // item per upgrade chain.
  it('every hero build contains only catalog item ids, and never an item alongside a chain-mate', () => {
    const catalogIds = new Set(items.map((item) => item.id))
    const chainGroups = buildItemChainGroups(items)

    for (const hero of heroes) {
      const analytics = analyticsByHero.get(hero.id)!
      const build = generateBuilds(hero, items, analytics)
      const pickedIds = new Set(build.items.map((entry) => entry.item_id))

      for (const id of pickedIds) {
        expect(catalogIds.has(id)).toBe(true)
        const chain = chainGroups.get(id)
        if (!chain) continue
        for (const chainMateId of chain) {
          if (chainMateId === id) continue
          expect(pickedIds.has(chainMateId)).toBe(false)
        }
      }
    }
  })

  it("Infernus's build contains at most one item from the Extra/Improved/Boundless Spirit chain", () => {
    // Reported bug: the build bought Extra Spirit after Improved Spirit,
    // an upgrade chain (Extra Spirit -> Improved Spirit -> Boundless Spirit).
    const hero = heroByName('Infernus')
    const analytics = analyticsByHero.get(hero.id)!
    const build = generateBuilds(hero, items, analytics)
    const pickedIds = new Set(build.items.map((entry) => entry.item_id))

    const spiritChain = items.find((item) => item.name === 'Boundless Spirit')!
    const chainGroups = buildItemChainGroups(items)
    const group = chainGroups.get(spiritChain.id)!
    const pickedFromChain = [...group].filter((id) => pickedIds.has(id))
    expect(pickedFromChain.length).toBeLessThanOrEqual(1)
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
    components: [],
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

// T15: real per-hero ability order. Pure fixtures, not snapshot-dependent.
describe('buildAbilityOrder', () => {
  const abilities: Ability[] = [
    { id: 1, name: 'Alpha', image: null },
    { id: 2, name: 'Bravo', image: null },
    { id: 3, name: 'Charlie', image: null },
    { id: 4, name: 'Delta', image: null },
  ]

  function statRow(sequence: number[] | null, matches: number, wins = matches): AbilityOrderStat {
    return { sequence, wins, matches }
  }

  it('derives unlock/upgrade kind from first-vs-later occurrence, in sequence order', () => {
    const sequence = [1, 2, 1, 3, 4, 2]
    const steps = buildAbilityOrder(abilities, [statRow(sequence, 500)], [])
    expect(steps.map((s) => [s.ability_id, s.kind])).toEqual([
      [1, 'unlock'],
      [2, 'unlock'],
      [1, 'upgrade'],
      [3, 'unlock'],
      [4, 'unlock'],
      [2, 'upgrade'],
    ])
  })

  it('falls back to round-robin when the chosen sequence contains an unknown ability id', () => {
    const sequence = [1, 2, 3, 4, 999] // 999 isn't one of this hero's 4 abilities
    const steps = buildAbilityOrder(abilities, [statRow(sequence, 500)], [])
    expect(steps).toEqual(buildAbilityOrder(abilities, [], []))
    expect(steps.length).toBe(12) // fallback: 4 unlocks + 2 round-robin upgrade rounds
  })

  it('falls back to round-robin when both stats tables are empty or all-null', () => {
    expect(buildAbilityOrder(abilities, [], [])).toEqual(buildAbilityOrder(abilities, [statRow(null, 0)], [statRow(null, 0)]))
  })

  it('prefers the high-badge source only once its top row clears the matches floor', () => {
    const overallSeq = [1, 1, 2, 2, 3, 3, 4, 4]
    const thinHighBadgeSeq = [4, 4, 3, 3, 2, 2, 1, 1]
    const thin = buildAbilityOrder(abilities, [statRow(overallSeq, 500)], [statRow(thinHighBadgeSeq, 99)])
    expect(thin.map((s) => s.ability_id)).toEqual(overallSeq)

    const thick = buildAbilityOrder(abilities, [statRow(overallSeq, 500)], [statRow(thinHighBadgeSeq, 100)])
    expect(thick.map((s) => s.ability_id)).toEqual(thinHighBadgeSeq)
  })

  it('picks the highest-matches row, tie-broken by wins then ascending sequence', () => {
    const rows = [
      statRow([1, 2, 3, 4], 100, 50),
      statRow([2, 1, 3, 4], 200, 60), // highest matches
      statRow([3, 2, 1, 4], 200, 60), // same matches+wins, higher joined sequence
    ]
    const steps = buildAbilityOrder(abilities, rows, [])
    expect(steps.map((s) => s.ability_id)).toEqual([2, 1, 3, 4])
  })
})

// T18: builds must be buyable in-game. Pure fixtures, not snapshot-dependent.
describe('buildItemChainGroups', () => {
  function fixtureItem(id: number, components: number[] = []): Item {
    return {
      id,
      class_name: 'fixture_item',
      name: `Item ${id}`,
      components,
      cost: 1000,
      item_tier: 1,
      item_slot_type: 'vitality',
      image: null,
      stat_lines: [],
      stat_sections: [],
      is_active_item: false,
      active_description: null,
      passive_description: null,
    }
  }

  it('groups a 3-tier chain (base -> mid -> top) into one set', () => {
    const base = fixtureItem(1)
    const mid = fixtureItem(2, [1])
    const top = fixtureItem(3, [2])
    const unrelated = fixtureItem(4)
    const groups = buildItemChainGroups([base, mid, top, unrelated])
    expect(groups.get(1)).toEqual(new Set([1, 2, 3]))
    expect(groups.get(2)).toEqual(new Set([1, 2, 3]))
    expect(groups.get(3)).toEqual(new Set([1, 2, 3]))
    expect(groups.get(4)).toEqual(new Set([4]))
  })

  it('groups an item with multiple direct components into one set', () => {
    const compA = fixtureItem(10)
    const compB = fixtureItem(11)
    const merged = fixtureItem(12, [10, 11])
    const groups = buildItemChainGroups([compA, compB, merged])
    expect(groups.get(10)).toEqual(new Set([10, 11, 12]))
  })

  it('ignores a component id absent from the catalog', () => {
    const item = fixtureItem(1, [999]) // 999 isn't in the catalog passed in
    const groups = buildItemChainGroups([item])
    expect(groups.get(1)).toEqual(new Set([1]))
  })
})

describe('generateBuilds: upgrade-chain exclusivity (T18)', () => {
  function fixtureItem(id: number, tier: number, components: number[] = []): Item {
    return {
      id,
      class_name: 'fixture_item',
      name: `Item ${id}`,
      components,
      cost: tier * 1000,
      item_tier: tier,
      item_slot_type: 'vitality', // same archetype bias for weapon/spirit builds, keeps ranking predictable
      image: null,
      stat_lines: [],
      stat_sections: [],
      is_active_item: false,
      active_description: null,
      passive_description: null,
    }
  }

  const hero: Hero = {
    id: 999,
    name: 'Fixture Hero',
    image: null,
    base_stats: {},
    stat_growth: {},
    abilities: [
      { id: 1, name: 'A', image: null },
      { id: 2, name: 'B', image: null },
      { id: 3, name: 'C', image: null },
      { id: 4, name: 'D', image: null },
    ],
  }

  it('drops the lower-scoring chain-mate and refills from the next-best candidate', () => {
    // 5 early-tier (tier 1) candidates ranked by matches (descending score):
    // B(200) > A(201) > C(202) > D(203) > E(204). B is the upgrade of A
    // (components: [201]) — without the chain rule the top 4 would be
    // B, A, C, D; with it, A is dropped and E refills the 4th slot.
    const early = [
      fixtureItem(200, 1, [201]),
      fixtureItem(201, 1),
      fixtureItem(202, 1),
      fixtureItem(203, 1),
      fixtureItem(204, 1),
    ]
    const mid = [300, 301, 302, 303].map((id) => fixtureItem(id, 3))
    const late = [400, 401, 402, 403, 404].map((id) => fixtureItem(id, 4))
    const items = [...early, ...mid, ...late]

    // Each item's score is driven entirely by its matches count here (see
    // fixtureItem: identical cost-per-tier, no stat_lines, uniform vitality
    // slot bias) — descending within each phase group, so item order below
    // is exactly the expected pre-chain-rule ranking.
    const matchesById = new Map<number, number>([
      [200, 1000],
      [201, 900],
      [202, 800],
      [203, 700],
      [204, 600],
      ...mid.map((item, i): [number, number] => [item.id, 500 - i * 20]),
      ...late.map((item, i): [number, number] => [item.id, 400 - i * 20]),
    ])

    const analytics: HeroAnalytics = {
      hero_id: hero.id,
      item_stats: items.map((item) => {
        const matches = matchesById.get(item.id)!
        return { item_id: item.id, wins: Math.round(matches * 0.6), matches }
      }),
      high_badge_min: 81,
      high_badge_item_stats: [],
      ability_order_stats: [],
      high_badge_ability_order_stats: [],
    }

    const build = generateBuilds(hero, items, analytics)
    const earlyIds = build.items.filter((entry) => entry.phase === 'early').map((entry) => entry.item_id)

    expect(earlyIds).toEqual([200, 202, 203, 204]) // 201 dropped (chain-mate of 200), 204 refills
  })
})
