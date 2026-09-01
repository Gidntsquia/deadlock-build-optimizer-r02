import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildOrderPreferences, computeCoreSet, validateBuild } from '../validation'
import type { ZergMatch } from '../validation'
import type { Build } from '../generator'

const DATA_DIR = join(process.cwd(), 'public/data')
const hasSnapshots = existsSync(join(DATA_DIR, 'meta.json'))

// Small fixture, independent of the committed snapshot: 4 matches, win-weight
// 1.5 / loss-weight 1.0, total weight 5.0.
//   item 100: bought in all 4 matches -> weight 4.0 -> share 0.80 (core)
//   item 200: bought only in match 1 (a win) -> weight 1.5 -> share 0.30 (core, exactly at threshold)
//   item 300: bought only in match 4 (a loss) -> weight 1.0 -> share 0.20 (experiment)
const fixtureMatches: ZergMatch[] = [
  { match_id: 1, won: true, purchases: [{ item_id: 100, game_time_s: 60 }, { item_id: 200, game_time_s: 120 }] },
  { match_id: 2, won: true, purchases: [{ item_id: 100, game_time_s: 50 }] },
  { match_id: 3, won: false, purchases: [{ item_id: 100, game_time_s: 70 }] },
  { match_id: 4, won: false, purchases: [{ item_id: 300, game_time_s: 80 }] },
]

function buildWithItems(itemIds: number[]): Build {
  let runningTotal = 0
  return {
    name: 'Fixture Build',
    archetype: 'weapon',
    items: itemIds.map((item_id) => {
      runningTotal += 100
      return { item_id, phase: 'early', cost: 100, running_total: runningTotal }
    }),
    ability_order: [],
  }
}

describe('core-set math (fixture)', () => {
  it('includes items at/above the 0.30 win-weighted share threshold', () => {
    const coreSet = computeCoreSet(fixtureMatches)
    expect(coreSet.items.has(100)).toBe(true)
    expect(coreSet.items.get(100)?.share).toBeCloseTo(0.8, 5)
    expect(coreSet.items.has(200)).toBe(true)
    expect(coreSet.items.get(200)?.share).toBeCloseTo(0.3, 5)
  })

  it('excludes items below threshold as experiments, entirely', () => {
    const coreSet = computeCoreSet(fixtureMatches)
    expect(coreSet.items.has(300)).toBe(false)
    expect(coreSet.experiments).toEqual([300])
  })
})

describe('agreement scoring (fixture)', () => {
  const coreSet = computeCoreSet(fixtureMatches)
  const coreItemIds = new Set(coreSet.items.keys())
  const orderPreferences = buildOrderPreferences(fixtureMatches, coreItemIds)

  it('scores a build that matches core items and Zergggy buy order highest', () => {
    const build = buildWithItems([100, 200])
    const report = validateBuild(build, coreSet, orderPreferences)
    expect(report.agreement_percent).toBe(100)
    expect(report.items).toEqual([
      { item_id: 100, core: true },
      { item_id: 200, core: true },
    ])
  })

  it('scores a build with the same core items but reversed buy order lower', () => {
    const forward = validateBuild(buildWithItems([100, 200]), coreSet, orderPreferences)
    const reversed = validateBuild(buildWithItems([200, 100]), coreSet, orderPreferences)
    expect(reversed.agreement_percent).toBeLessThan(forward.agreement_percent)
  })

  it('flags a non-core item as not-core and keeps agreement in [0, 100]', () => {
    const build = buildWithItems([300, 100])
    const report = validateBuild(build, coreSet, orderPreferences)
    expect(report.items.find((i) => i.item_id === 300)?.core).toBe(false)
    expect(report.agreement_percent).toBeGreaterThanOrEqual(0)
    expect(report.agreement_percent).toBeLessThanOrEqual(100)
  })

  it('stays in [0, 100] for a build with no shared items at all', () => {
    const report = validateBuild(buildWithItems([999]), coreSet, orderPreferences)
    expect(report.agreement_percent).toBeGreaterThanOrEqual(0)
    expect(report.agreement_percent).toBeLessThanOrEqual(100)
  })
})

// HELD-OUT RULE: only src/validation/ may reference the zergggy path/string,
// among the app's production modules. src/test/ is exempt — snapshots.test.ts
// (T2a) already asserts public/data/zergggy/matches.json's own shape, which
// is snapshot-integrity testing, not generator/scoring logic reading it.
describe('held-out isolation', () => {
  function walk(dir: string): string[] {
    let files: string[] = []
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return files
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        files = files.concat(walk(full))
      } else {
        files.push(full)
      }
    }
    return files
  }

  it('no production module outside src/validation/ references "zergggy"', () => {
    const srcDir = join(process.cwd(), 'src')
    const exemptDirs = [join(process.cwd(), 'src/validation'), join(process.cwd(), 'src/test')]
    const offenders: string[] = []
    for (const file of walk(srcDir)) {
      if (exemptDirs.some((dir) => file.startsWith(dir))) continue
      if (/zergggy/i.test(readFileSync(file, 'utf8'))) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

describe.skipIf(!hasSnapshots)('agreement scoring (real snapshot)', () => {
  function readJson<T>(...parts: string[]): T {
    return JSON.parse(readFileSync(join(DATA_DIR, ...parts), 'utf8'))
  }

  it('produces a bounded agreement % for a real generated Infernus build', async () => {
    const { generateBuilds } = await import('../generator')
    const items = readJson<import('../generator').Item[]>('items.json')
    const heroes = readJson<import('../generator').Hero[]>('heroes.json')
    const infernus = heroes.find((h) => h.name === 'Infernus')!
    const analytics = readJson<import('../generator').HeroAnalytics>('analytics', `hero-${infernus.id}.json`)
    const zergMatches = readJson<ZergMatch[]>('zergggy', 'matches.json')

    const build = generateBuilds(infernus, items, analytics)
    const coreSet = computeCoreSet(zergMatches)
    const orderPreferences = buildOrderPreferences(zergMatches, new Set(coreSet.items.keys()))
    const report = validateBuild(build, coreSet, orderPreferences)

    expect(report.agreement_percent).toBeGreaterThanOrEqual(0)
    expect(report.agreement_percent).toBeLessThanOrEqual(100)
    expect(report.items).toHaveLength(build.items.length)
  })
})
