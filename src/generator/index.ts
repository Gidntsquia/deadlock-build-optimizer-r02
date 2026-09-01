import { buildAbilityOrder } from './abilityOrder'
import { buildItemChainGroups } from './itemChains'
import { DEFAULT_SCORE_CONSTANTS, heroMeanWinRate, maxHighBadgeItemMatches, maxItemMatches, pairLift, scoreItem } from './score'
import type { ScoreConstants } from './score'
import { isActiveItem, statValuePerSoul } from './statUtils'
import type { Archetype, Build, BuildItemEntry, BuildPhase, Hero, HeroAnalytics, Item, ItemPairStat, ItemStat } from './types'

export type {
  Ability,
  AbilityLevelStep,
  Archetype,
  Build,
  BuildItemEntry,
  BuildPhase,
  Hero,
  HeroAnalytics,
  Item,
  ItemPairStat,
  ItemStat,
  StatSection,
  StatSectionStat,
} from './types'
export type { ScoreConstants } from './score'
export { DEFAULT_SCORE_CONSTANTS } from './score'
export { buildItemChainGroups } from './itemChains'

// Tier -> shopping phase. Tiers map to fixed soul costs in this snapshot
// (1: 800, 2: 1600, 3: 3200, 4: 6400, 5: 9999), so gating by tier is the same
// as gating by the phase's soul budget.
function tierPhase(tier: number): BuildPhase {
  if (tier <= 2) return 'early'
  if (tier === 3) return 'mid'
  return 'late'
}

// Canonical, order-independent key for a pair of item ids (T23).
function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

// Mean pair-synergy lift (T23) between a candidate item and everything
// already selected in the build so far — 0 with nothing selected yet or
// with pairSynergyWeight at its default 0 (no effect on ordinary callers).
function pairSynergyBonus(
  candidateId: number,
  selectedIds: Set<number>,
  pairStatsByKey: Map<string, ItemPairStat>,
  meanWinRate: number,
  constants: ScoreConstants,
): number {
  if (selectedIds.size === 0 || constants.pairSynergyWeight === 0) return 0
  let sum = 0
  for (const id of selectedIds) {
    sum += pairLift(pairStatsByKey.get(pairKey(candidateId, id)), meanWinRate, constants)
  }
  return constants.pairSynergyWeight * (sum / selectedIds.size)
}

const PHASE_TARGET_COUNTS: Record<BuildPhase, number> = { early: 4, mid: 4, late: 5 }
const MIN_TOTAL_ITEMS = 12
// A build carries at most this many activated-ability items (see
// statUtils.isActiveItem) so it isn't dominated by actives on a limited cooldown.
const ACTIVE_ITEM_CAP = 2

export interface ScoredCandidate {
  archetype: Archetype
  totalScore: number
  build: Build
}

// Picks the single best build across archetype candidates: highest total
// composite score wins, ties broken by ascending archetype name then by
// ascending item ids (lexicographic over the build's item-id sequence) so
// the pick is fully deterministic. Uses ONLY the candidates' own scores —
// never the held-out agreement score (see HELD-OUT RULE in GOALS.md T13).
export function pickBestBuild(candidates: ScoredCandidate[]): Build {
  const sorted = [...candidates].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    if (a.archetype !== b.archetype) return a.archetype < b.archetype ? -1 : 1
    const aIds = a.build.items.map((entry) => entry.item_id)
    const bIds = b.build.items.map((entry) => entry.item_id)
    const len = Math.min(aIds.length, bIds.length)
    for (let i = 0; i < len; i++) {
      if (aIds[i] !== bIds[i]) return aIds[i] - bIds[i]
    }
    return aIds.length - bIds.length
  })
  return sorted[0].build
}

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
  abilityOrder: Build['ability_order'],
  chainGroups: Map<number, Set<number>>,
  pairStatsByKey: Map<string, ItemPairStat>,
  constants: ScoreConstants,
): { build: Build; totalScore: number } {
  const scored = items
    .map((item) => {
      const stat = itemStatsById.get(item.id)
      const highStat = highBadgeStatsById.get(item.id)
      const score = scoreItem(
        {
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
        },
        constants,
      )
      return { item, score }
    })
    // Stable rank: highest static score first, ascending item id breaks
    // ties — this order is also what makes the incremental pick below fully
    // deterministic (see runGreedyPass).
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)

  const phaseBuckets: Record<BuildPhase, Item[]> = { early: [], mid: [], late: [] }
  const selectedIds = new Set<number>()
  // Once a chain member is picked, every other member of its upgrade chain
  // (components, followed transitively both ways — see itemChains.ts) is
  // blocked: in-game, buying an upgrade consumes/obsoletes the rest of its
  // chain, so a build may contain at most one item per chain (T18).
  const blockedByChain = new Set<number>()
  let activeCount = 0

  const tryTake = (item: Item, phase: BuildPhase) => {
    phaseBuckets[phase].push(item)
    selectedIds.add(item.id)
    if (isActiveItem(item)) activeCount++
    const chain = chainGroups.get(item.id)
    if (chain) for (const chainId of chain) if (chainId !== item.id) blockedByChain.add(chainId)
  }

  const total = () => phaseBuckets.early.length + phaseBuckets.mid.length + phaseBuckets.late.length

  const isEligible = (item: Item, respectQuota: boolean): boolean => {
    if (selectedIds.has(item.id) || blockedByChain.has(item.id)) return false
    if (isActiveItem(item) && activeCount >= ACTIVE_ITEM_CAP) return false
    if (respectQuota) {
      const phase = tierPhase(item.item_tier)
      if (phaseBuckets[phase].length >= PHASE_TARGET_COUNTS[phase]) return false
    }
    return true
  }

  // Incremental greedy fill (T23): pair-synergy bonus depends on what's
  // already picked, so — unlike a plain static sort-then-fill — each pick
  // rescans every remaining eligible candidate and re-scores it as
  // staticScore + pairSynergyBonus(candidate, already-picked). `scored` is
  // iterated in its stable static order, and a candidate only replaces the
  // running best on a strictly higher effective score, so ties fall back to
  // the original highest-static-score/lowest-id ordering — determinism is
  // unchanged when pairSynergyWeight is 0 (bonus is always 0, so the
  // effective order collapses to the static order).
  const runGreedyPass = (respectQuota: boolean, targetTotal: number) => {
    while (total() < targetTotal) {
      let best: { item: Item; phase: BuildPhase; effectiveScore: number } | null = null
      for (const { item, score } of scored) {
        if (!isEligible(item, respectQuota)) continue
        const bonus = pairSynergyBonus(item.id, selectedIds, pairStatsByKey, meanWinRate, constants)
        const effectiveScore = score + bonus
        if (best === null || effectiveScore > best.effectiveScore) {
          best = { item, phase: tierPhase(item.item_tier), effectiveScore }
        }
      }
      if (best === null) break
      tryTake(best.item, best.phase)
    }
  }

  const quotaTotal = PHASE_TARGET_COUNTS.early + PHASE_TARGET_COUNTS.mid + PHASE_TARGET_COUNTS.late
  runGreedyPass(true, quotaTotal)
  // Backfill (any tier, quota ignored) if the phase quotas above didn't reach
  // the required minimum — not expected with this snapshot's item counts,
  // but keeps the ≥12-item guarantee robust regardless of pool size.
  runGreedyPass(false, MIN_TOTAL_ITEMS)

  const orderedItems = [...phaseBuckets.early, ...phaseBuckets.mid, ...phaseBuckets.late]
  let runningTotal = 0
  const buildItems: BuildItemEntry[] = orderedItems.map((item) => {
    runningTotal += item.cost
    return { item_id: item.id, phase: tierPhase(item.item_tier), cost: item.cost, running_total: runningTotal }
  })

  const scoreById = new Map(scored.map(({ item, score }) => [item.id, score]))
  const totalScore = orderedItems.reduce((sum, item) => sum + (scoreById.get(item.id) ?? 0), 0)

  const build: Build = {
    name: `${hero.name} Build`,
    archetype,
    items: buildItems,
    ability_order: abilityOrder,
  }
  return { build, totalScore }
}

// Deterministic build generator: pure function of the three snapshot inputs
// (no randomness, no clock reads), so identical inputs always produce a deep-
// equal result. Builds one candidate per archetype (weapon-leaning and
// spirit-leaning — see score.ts for the per-item scoring formula and
// abilityOrder.ts for the level-up sequence fallback) and exports only the
// single highest-scoring one (see pickBestBuild) — the app shows exactly one
// recommended build per hero (T13).
// `constants` (T19) overrides the default scoring weights (score.ts's
// DEFAULT_SCORE_CONSTANTS) — ordinary callers (App.tsx) never pass it; only
// scripts/tune-generator.mjs's offline sweep does, via this same real
// generator code, never a reimplementation.
export function generateBuilds(hero: Hero, items: Item[], analytics: HeroAnalytics, constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS): Build {
  // T18: any analytics row for an item id outside the catalog is skipped
  // everywhere (score, buy order) — the catalog (items.json, ONLY real,
  // currently-shopable items) is the sole source of what's pickable.
  const catalogIds = new Set(items.map((item) => item.id))
  const catalogAnalytics: HeroAnalytics = {
    ...analytics,
    item_stats: analytics.item_stats.filter((s) => catalogIds.has(s.item_id)),
    high_badge_item_stats: analytics.high_badge_item_stats.filter((s) => catalogIds.has(s.item_id)),
    item_pair_stats: analytics.item_pair_stats.filter((s) => catalogIds.has(s.items[0]) && catalogIds.has(s.items[1])),
  }
  const itemStatsById = new Map(catalogAnalytics.item_stats.map((s) => [s.item_id, s]))
  const highBadgeStatsById = new Map(catalogAnalytics.high_badge_item_stats.map((s) => [s.item_id, s]))
  const pairStatsByKey = new Map(catalogAnalytics.item_pair_stats.map((s) => [pairKey(s.items[0], s.items[1]), s]))
  const meanWinRate = heroMeanWinRate(catalogAnalytics)
  const maxMatches = maxItemMatches(catalogAnalytics)
  const maxHighMatches = maxHighBadgeItemMatches(catalogAnalytics)
  const maxValuePerSoul = items.reduce((max, item) => Math.max(max, statValuePerSoul(item)), 0)
  const abilityOrder = buildAbilityOrder(hero.abilities, analytics.ability_order_stats, analytics.high_badge_ability_order_stats)
  const chainGroups = buildItemChainGroups(items)

  const candidates: ScoredCandidate[] = (['weapon', 'spirit'] as const).map((archetype) => {
    const { build, totalScore } = buildForArchetype(
      hero,
      items,
      itemStatsById,
      highBadgeStatsById,
      meanWinRate,
      maxMatches,
      maxHighMatches,
      maxValuePerSoul,
      archetype,
      abilityOrder,
      chainGroups,
      pairStatsByKey,
      constants,
    )
    return { archetype, totalScore, build }
  })

  return pickBestBuild(candidates)
}
