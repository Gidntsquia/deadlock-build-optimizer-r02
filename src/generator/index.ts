import { buildAbilityOrder } from './abilityOrder'
import { heroMeanWinRate, maxHighBadgeItemMatches, maxItemMatches, scoreItem } from './score'
import { isActiveItem, statValuePerSoul } from './statUtils'
import type { Archetype, Build, BuildItemEntry, BuildPhase, Hero, HeroAnalytics, Item, ItemStat } from './types'

export type { Archetype, Build, BuildItemEntry, BuildPhase, Hero, HeroAnalytics, Item, ItemStat } from './types'

// Tier -> shopping phase. Tiers map to fixed soul costs in this snapshot
// (1: 800, 2: 1600, 3: 3200, 4: 6400, 5: 9999), so gating by tier is the same
// as gating by the phase's soul budget.
function tierPhase(tier: number): BuildPhase {
  if (tier <= 2) return 'early'
  if (tier === 3) return 'mid'
  return 'late'
}

const PHASE_TARGET_COUNTS: Record<BuildPhase, number> = { early: 4, mid: 4, late: 5 }
const MIN_TOTAL_ITEMS = 12
// A build carries at most this many activated-ability items (see
// statUtils.isActiveItem) so it isn't dominated by actives on a limited cooldown.
const ACTIVE_ITEM_CAP = 2

function buildForArchetype(
  hero: Hero,
  items: Item[],
  itemStatsById: Map<number, ItemStat>,
  highBadgeStatsById: Map<number, ItemStat>,
  meanWinRate: number,
  maxMatches: number,
  maxHighMatches: number,
  maxValuePerSoul: number,
  archetype: Archetype,
): Build {
  const scored = items
    .map((item) => {
      const stat = itemStatsById.get(item.id)
      const highStat = highBadgeStatsById.get(item.id)
      const score = scoreItem({
        item,
        overallWins: stat?.wins ?? null,
        overallMatches: stat?.matches ?? null,
        highWins: highStat?.wins ?? null,
        highMatches: highStat?.matches ?? null,
        meanWinRate,
        maxOverallMatches: maxMatches,
        maxHighMatches,
        maxValuePerSoul,
        archetype,
      })
      return { item, score }
    })
    // Stable rank: highest score first, ascending item id breaks ties.
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)

  const phaseBuckets: Record<BuildPhase, Item[]> = { early: [], mid: [], late: [] }
  const selectedIds = new Set<number>()
  let activeCount = 0

  const tryTake = (item: Item, phase: BuildPhase) => {
    phaseBuckets[phase].push(item)
    selectedIds.add(item.id)
    if (isActiveItem(item)) activeCount++
  }

  for (const { item } of scored) {
    const phase = tierPhase(item.item_tier)
    if (phaseBuckets[phase].length >= PHASE_TARGET_COUNTS[phase]) continue
    if (isActiveItem(item) && activeCount >= ACTIVE_ITEM_CAP) continue
    tryTake(item, phase)
  }

  // Backfill (any tier, quota ignored) if the phase quotas above didn't reach
  // the required minimum — not expected with this snapshot's item counts,
  // but keeps the ≥12-item guarantee robust regardless of pool size.
  const total = () => phaseBuckets.early.length + phaseBuckets.mid.length + phaseBuckets.late.length
  if (total() < MIN_TOTAL_ITEMS) {
    for (const { item } of scored) {
      if (total() >= MIN_TOTAL_ITEMS) break
      if (selectedIds.has(item.id)) continue
      if (isActiveItem(item) && activeCount >= ACTIVE_ITEM_CAP) continue
      tryTake(item, tierPhase(item.item_tier))
    }
  }

  const orderedItems = [...phaseBuckets.early, ...phaseBuckets.mid, ...phaseBuckets.late]
  let runningTotal = 0
  const buildItems: BuildItemEntry[] = orderedItems.map((item) => {
    runningTotal += item.cost
    return { item_id: item.id, phase: tierPhase(item.item_tier), cost: item.cost, running_total: runningTotal }
  })

  const archetypeLabel = archetype === 'weapon' ? 'Weapon' : 'Spirit'
  return {
    name: `${hero.name} ${archetypeLabel} Build`,
    archetype,
    items: buildItems,
    ability_order: buildAbilityOrder(hero.abilities),
  }
}

// Deterministic build generator: pure function of the three snapshot inputs
// (no randomness, no clock reads), so identical inputs always produce a deep-
// equal result. Produces one build per archetype (weapon-leaning and
// spirit-leaning) — see score.ts for the per-item scoring formula and
// abilityOrder.ts for the level-up sequence fallback.
export function generateBuilds(hero: Hero, items: Item[], analytics: HeroAnalytics): Build[] {
  const itemStatsById = new Map(analytics.item_stats.map((s) => [s.item_id, s]))
  const highBadgeStatsById = new Map(analytics.high_badge_item_stats.map((s) => [s.item_id, s]))
  const meanWinRate = heroMeanWinRate(analytics)
  const maxMatches = maxItemMatches(analytics)
  const maxHighMatches = maxHighBadgeItemMatches(analytics)
  const maxValuePerSoul = items.reduce((max, item) => Math.max(max, statValuePerSoul(item)), 0)

  return (['weapon', 'spirit'] as const).map((archetype) =>
    buildForArchetype(
      hero,
      items,
      itemStatsById,
      highBadgeStatsById,
      meanWinRate,
      maxMatches,
      maxHighMatches,
      maxValuePerSoul,
      archetype,
    ),
  )
}
