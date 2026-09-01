import type { Archetype, HeroAnalytics, Item, ItemStat } from './types'
import { statValuePerSoul } from './statUtils'

// Confidence-damping pseudo-match count: an item's raw win rate is shrunk
// toward the hero's mean win rate by treating it as if it had CONFIDENCE_K
// extra matches played at that mean. Low-sample items (a handful of buys)
// end up close to the hero mean; high-sample items keep their real rate.
const CONFIDENCE_K = 50

// High-elo (Phantom+, see HeroAnalytics.high_badge_min) blend, applied BEFORE
// confidence damping (see blendHighBadgeStat / dampedWinRate below):
// - At or above HIGH_BADGE_MIN_SAMPLE high-badge matches, an item's win rate
//   and usage are a HIGH_BADGE_WEIGHT/(1-HIGH_BADGE_WEIGHT) blend of its
//   high-badge and overall stats (0.75/0.25 by default — >=70% toward high-elo
//   evidence per T9's spec).
// - Below that sample size the high-badge weight ramps down linearly to 0 as
//   high-badge matches -> 0, so a handful of high-elo matches nudges the
//   blend only a little and a total absence of them falls back to pure
//   overall stats — a smooth degrade rather than a hard cutoff.
export const HIGH_BADGE_MIN_SAMPLE = 100
export const HIGH_BADGE_WEIGHT = 0.75

export function heroMeanWinRate(analytics: HeroAnalytics): number {
  let wins = 0
  let matches = 0
  for (const row of analytics.item_stats) {
    if (row.matches == null || row.wins == null) continue
    wins += row.wins
    matches += row.matches
  }
  return matches > 0 ? wins / matches : 0.5
}

export function maxItemMatches(analytics: HeroAnalytics): number {
  let max = 0
  for (const row of analytics.item_stats) {
    if (row.matches != null && row.matches > max) max = row.matches
  }
  return max
}

export function maxHighBadgeItemMatches(analytics: HeroAnalytics): number {
  let max = 0
  for (const row of analytics.high_badge_item_stats) {
    if (row.matches != null && row.matches > max) max = row.matches
  }
  return max
}

function safeRate(wins: number | null, matches: number | null): number {
  if (matches == null || matches <= 0) return 0
  return (wins ?? 0) / matches
}

// weight in [0, HIGH_BADGE_WEIGHT]: 0 with no high-badge matches at all,
// ramping linearly to HIGH_BADGE_WEIGHT at HIGH_BADGE_MIN_SAMPLE and above.
export function highBadgeBlendWeight(highMatches: number | null): number {
  const m = highMatches ?? 0
  if (m <= 0) return 0
  return HIGH_BADGE_WEIGHT * Math.min(m / HIGH_BADGE_MIN_SAMPLE, 1)
}

export interface BlendedItemStat {
  winRate: number
  effectiveMatches: number
  usageRatio: number
}

// Blends an item's overall and high-badge stats (see the constants above) for
// both win rate and usage, before any confidence damping is applied.
// effectiveMatches is a confidence proxy for dampedWinRate below — it is NOT
// a real match count, just the same weighted blend applied to the two sample
// sizes, so a high-weight blend leans on the (typically smaller) high-badge
// sample size for how much to trust the blended rate.
export function blendHighBadgeStat(
  overall: Pick<ItemStat, 'wins' | 'matches'>,
  high: Pick<ItemStat, 'wins' | 'matches'>,
  maxOverallMatches: number,
  maxHighMatches: number,
): BlendedItemStat {
  const weight = highBadgeBlendWeight(high.matches)
  const overallMatches = overall.matches ?? 0
  const highMatches = high.matches ?? 0

  const winRate = weight * safeRate(high.wins, high.matches) + (1 - weight) * safeRate(overall.wins, overall.matches)
  const effectiveMatches = weight * highMatches + (1 - weight) * overallMatches

  const overallUsage = maxOverallMatches > 0 ? overallMatches / maxOverallMatches : 0
  const highUsage = maxHighMatches > 0 ? highMatches / maxHighMatches : 0
  const usageRatio = Math.min(weight * highUsage + (1 - weight) * overallUsage, 1)

  return { winRate, effectiveMatches, usageRatio }
}

// Confidence damping (unchanged K=50 shrink-to-hero-mean formula), now taking
// an already-blended rate + effective match count rather than raw wins.
export function dampedWinRate(winRate: number, effectiveMatches: number, meanWinRate: number): number {
  return (winRate * effectiveMatches + CONFIDENCE_K * meanWinRate) / (effectiveMatches + CONFIDENCE_K)
}

// Archetype bias: items in the archetype's own slot type score highest,
// vitality (survivability) items get a flat mid bonus in both archetypes
// since staying alive matters regardless of damage type, and off-archetype
// items score low but not zero (a strong off-slot item can still make it in).
export function archetypeBias(item: Item, archetype: Archetype): number {
  if (item.item_slot_type === archetype) return 1
  if (item.item_slot_type === 'vitality') return 0.6
  return 0.2
}

export interface ItemScoreInputs {
  item: Item
  overallWins: number | null
  overallMatches: number | null
  highWins: number | null
  highMatches: number | null
  meanWinRate: number
  maxOverallMatches: number
  maxHighMatches: number
  maxValuePerSoul: number
  archetype: Archetype
}

// Composite item score in [0, ~1]: blends real per-hero performance
// (win rate + usage, high-elo-weighted per blendHighBadgeStat/dampedWinRate
// above) with the item's own stat payload (value-per-soul, normalized
// against the pool's max) and an archetype slot-type bias.
export function scoreItem({
  item,
  overallWins,
  overallMatches,
  highWins,
  highMatches,
  meanWinRate,
  maxOverallMatches,
  maxHighMatches,
  maxValuePerSoul,
  archetype,
}: ItemScoreInputs): number {
  const blended = blendHighBadgeStat(
    { wins: overallWins, matches: overallMatches },
    { wins: highWins, matches: highMatches },
    maxOverallMatches,
    maxHighMatches,
  )
  const winScore = dampedWinRate(blended.winRate, blended.effectiveMatches, meanWinRate)
  const useScore = blended.usageRatio
  const valueScore = maxValuePerSoul > 0 ? statValuePerSoul(item) / maxValuePerSoul : 0
  const biasScore = archetypeBias(item, archetype)
  return 0.35 * winScore + 0.25 * useScore + 0.25 * valueScore + 0.15 * biasScore
}
