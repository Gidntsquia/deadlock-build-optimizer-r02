import { buildAbilityOrder } from './abilityOrder'
import { buildItemChainGroups } from './itemChains'
import { DEFAULT_SCORE_CONSTANTS, blendHighBadgeStat, heroMeanWinRate, maxHighBadgeItemMatches, maxItemMatches, pairLift, scoreItem } from './score'
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
      // T25: same blended usage share scoreItem folds into its composite —
      // recomputed here (rather than widening scoreItem's return) purely for
      // the eligibility floor below.
      const { usageRatio } = blendHighBadgeStat(
        { wins: stat?.wins ?? null, matches: stat?.matches ?? null },
        { wins: highStat?.wins ?? null, matches: highStat?.matches ?? null },
        maxMatches,
        maxHighMatches,
        constants,
      )
      return { item, score, usageRatio }
    })
    // Stable rank: highest static score first, ascending item id breaks
    // ties — this order is also what makes the incremental pick below fully
    // deterministic (see runGreedyPass).
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)
  const usageRatioById = new Map(scored.map(({ item, usageRatio }) => [item.id, usageRatio]))
  const itemsById = new Map(items.map((item) => [item.id, item]))
  // Below-floor-priority order (T26 fallback fix): usage share descending,
  // ascending item id tie-break — used ONLY by the starvation-fallback pass
  // below, so a 1%-usage item is the last resort, never the first fallback.
  const usageOrder = [...scored].sort(
    (a, b) => (usageRatioById.get(b.item.id) ?? 0) - (usageRatioById.get(a.item.id) ?? 0) || a.item.id - b.item.id,
  )

  const phaseBuckets: Record<BuildPhase, Item[]> = { early: [], mid: [], late: [] }
  const selectedIds = new Set<number>()
  // Once a chain member is picked, every other member of its upgrade chain
  // (components, followed transitively both ways — see itemChains.ts) is
  // blocked: in-game, buying an upgrade consumes/obsoletes the rest of its
  // chain, so a build may contain at most one item per chain (T18).
  const blockedByChain = new Set<number>()
  let activeCount = 0

  // T26: when a chain group wins a slot, the STAGE actually added to the
  // build is the chain member with the highest hero usage share (stable
  // tie: ascending item id) — not necessarily `item`, which only decides
  // WHETHER the chain group wins the slot (via the greedy score pass
  // below). An early-tier component that's a mass-usage staple can lose the
  // score competition to its own top-tier upgrade, whose thin high-elo
  // sample lets it post a hotter raw win rate — showing the endpoint
  // instead of the actually-bought stage is exactly the diagnosed T26 bug.
  const chainStage = (item: Item): Item => {
    if (!constants.chainStageByUsage) return item
    const chain = chainGroups.get(item.id)
    if (!chain || chain.size <= 1) return item
    let best = item
    let bestUsage = usageRatioById.get(item.id) ?? 0
    for (const chainId of chain) {
      if (chainId === item.id) continue
      const candidate = itemsById.get(chainId)
      if (!candidate) continue
      const usage = usageRatioById.get(chainId) ?? 0
      if (usage > bestUsage || (usage === bestUsage && chainId < best.id)) {
        best = candidate
        bestUsage = usage
      }
    }
    return best
  }

  // T26: the winning candidate's OWN tier decides which phase bucket/quota
  // slot it consumes (unchanged from pre-T26 behavior) — only the item
  // actually pushed into that bucket (and so shown in the build) is
  // swapped to its chain's highest-usage stage. A cheap early component
  // filling a "late slot" this way is intentional: the composite score that
  // won the slot came from the (often thin-sample) endpoint, but the
  // hero-tier phase grouping still reflects when that slot was earned.
  const tryTake = (item: Item) => {
    const phase = tierPhase(item.item_tier)
    const chosen = chainStage(item)
    phaseBuckets[phase].push(chosen)
    selectedIds.add(chosen.id)
    // Track the active-item cap against the WINNING candidate `item`, not
    // the displayed `chosen` stage — isEligible's cap check below gates on
    // `item`'s own active status, so the increment has to match that same
    // item or the cap silently drifts as chain swaps change which item
    // "counts" between the two checks.
    if (isActiveItem(item)) activeCount++
    const chain = chainGroups.get(chosen.id)
    if (chain) for (const chainId of chain) if (chainId !== chosen.id) blockedByChain.add(chainId)
  }

  const total = () => phaseBuckets.early.length + phaseBuckets.mid.length + phaseBuckets.late.length

  // allowBelowFloor (T25): false in the normal passes below, which enforce
  // the minUsageShare eligibility floor; true only in the starvation-fallback
  // passes, so a phase that the floor would otherwise leave short still
  // fills from the existing stable score order rather than coming up short.
  const isEligible = (item: Item, respectQuota: boolean, allowBelowFloor: boolean): boolean => {
    if (selectedIds.has(item.id) || blockedByChain.has(item.id)) return false
    // T26: also guard the chain stage tryTake would actually add — a
    // different original candidate can resolve to the same already-taken
    // stage (see chainStage/tryTake above).
    const chosen = chainStage(item)
    if (chosen.id !== item.id && (selectedIds.has(chosen.id) || blockedByChain.has(chosen.id))) return false
    if (isActiveItem(item) && activeCount >= ACTIVE_ITEM_CAP) return false
    if (!allowBelowFloor && (usageRatioById.get(item.id) ?? 0) < constants.minUsageShare) return false
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
      let best: { item: Item; effectiveScore: number } | null = null
      for (const { item, score } of scored) {
        if (!isEligible(item, respectQuota, false)) continue
        const bonus = pairSynergyBonus(item.id, selectedIds, pairStatsByKey, meanWinRate, constants)
        const effectiveScore = score + bonus
        if (best === null || effectiveScore > best.effectiveScore) {
          best = { item, effectiveScore }
        }
      }
      if (best === null) break
      tryTake(best.item)
    }
  }

  // T26 starvation fallback: only reached if the floor left a phase (or the
  // overall minimum) short of eligible items. Unlike the score-driven pass
  // above, this iterates usageOrder (highest usage share first, ascending id
  // tie-break) rather than the composite-score order — a 1%-usage item must
  // be the last resort, not the first fallback picked. No pair-synergy bonus
  // here: this is a pure starvation backstop, not a competitive ranking.
  const runFallbackPass = (respectQuota: boolean, targetTotal: number) => {
    while (total() < targetTotal) {
      let picked: Item | null = null
      for (const { item } of usageOrder) {
        if (!isEligible(item, respectQuota, true)) continue
        picked = item
        break
      }
      if (picked === null) break
      tryTake(picked)
    }
  }

  const quotaTotal = PHASE_TARGET_COUNTS.early + PHASE_TARGET_COUNTS.mid + PHASE_TARGET_COUNTS.late
  runGreedyPass(true, quotaTotal)
  // Backfill (any tier, quota ignored) if the phase quotas above didn't reach
  // the required minimum — not expected with this snapshot's item counts,
  // but keeps the ≥12-item guarantee robust regardless of pool size.
  runGreedyPass(false, MIN_TOTAL_ITEMS)
  runFallbackPass(true, quotaTotal)
  runFallbackPass(false, MIN_TOTAL_ITEMS)

  // T26: phase here is the bucket the item's slot was WON in (see tryTake),
  // not necessarily tierPhase(item.item_tier) — a chain-stage swap can land
  // an earlier-tier item in a later bucket. Reading it off the bucket keeps
  // the displayed sequence's phase grouping and running_total consistent
  // with each other regardless of the swap.
  const orderedEntries: Array<{ item: Item; phase: BuildPhase }> = [
    ...phaseBuckets.early.map((item) => ({ item, phase: 'early' as const })),
    ...phaseBuckets.mid.map((item) => ({ item, phase: 'mid' as const })),
    ...phaseBuckets.late.map((item) => ({ item, phase: 'late' as const })),
  ]
  let runningTotal = 0
  const buildItems: BuildItemEntry[] = orderedEntries.map(({ item, phase }) => {
    runningTotal += item.cost
    return { item_id: item.id, phase, cost: item.cost, running_total: runningTotal }
  })

  const scoreById = new Map(scored.map(({ item, score }) => [item.id, score]))
  const totalScore = orderedEntries.reduce((sum, { item }) => sum + (scoreById.get(item.id) ?? 0), 0)

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
