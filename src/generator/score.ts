import type { Archetype, HeroAnalytics, Item, ItemPairStat, ItemStat } from './types'
import { statValuePerSoul } from './statUtils'

// All tunable scoring constants in one named block (T19: a deterministic
// offline sweep — scripts/tune-generator.mjs — grid-searches this exact
// shape against the tuning-set agreement score and reports a winner; the
// values below ARE that winner, applied as plain numbers, never computed
// at runtime).
// Every scoring function below takes an optional trailing `constants`
// parameter defaulting to this object, so ordinary callers (index.ts,
// App.tsx) are unaffected and only the tuning harness ever passes a
// different set.
export interface ScoreConstants {
  // Confidence-damping pseudo-match count: an item's raw win rate is shrunk
  // toward the hero's mean win rate by treating it as if it had confidenceK
  // extra matches played at that mean. Low-sample items (a handful of buys)
  // end up close to the hero mean; high-sample items keep their real rate.
  confidenceK: number
  // High-elo (Phantom+) blend sample floor and weight — see
  // highBadgeBlendWeight's doc comment for the exact ramp behavior.
  highBadgeMinSample: number
  highBadgeWeight: number
  // Composite scoreItem weights (must sum to 1): win rate, usage, item
  // value-per-soul, archetype-slot bias.
  winWeight: number
  useWeight: number
  valueWeight: number
  biasWeight: number
  // archetypeBias's off-own-slot scores: vitality items (mid bonus in both
  // archetypes) and everything else (low but nonzero).
  vitalityBias: number
  offArchetypeBias: number
  // Hero-affinity multiplier strength (T23) — see heroAffinityMultiplier.
  // 0 = no effect (multiplier is always 1).
  affinityWeight: number
  // Item-pair synergy bonus strength in build assembly (T23) — see
  // index.ts's buildForArchetype / score.ts's pairLift. 0 = no effect.
  pairSynergyWeight: number
  // Usage-floor eligibility (T25): an item whose blended hero usage share
  // (blendHighBadgeStat's usageRatio — 0 when the hero has no stats row for
  // it at all) is below this floor is INELIGIBLE for build assembly, not
  // merely down-scored. Fixes items with zero recorded matches (e.g.
  // Lightning Scroll on Kelvin) scoring like an average-win-rate pick once
  // dampedWinRate shrinks them fully to the hero mean. See index.ts's
  // buildForArchetype for the starvation fallback when a phase runs short.
  minUsageShare: number
  // Usage-scaled win-rate confidence (T26): an item's win-rate DEVIATION
  // from the hero mean (dampedWinRate - meanWinRate) is scaled by
  // min(1, usageShare / usageConfidenceShare) before entering the
  // composite — a thin-usage item riding a hot win rate gets pulled back
  // toward the mean, so it can't outrank a mass-usage staple on WR alone.
  // 0 disables the scale entirely (factor always 1, T25-era behavior). See
  // usageConfidenceScale below.
  usageConfidenceShare: number
  // T26: when a chain group wins a build slot, display the chain member
  // with the highest hero usage share instead of the item that won the
  // score competition (see index.ts's chainStage). Grid-searched rather
  // than hardwired on: measured against the tuning-set agreement (see
  // scripts/tune-generator.mjs / PROGRESS.md), this consistently regresses
  // agreement because hero-wide usage share is confounded by chain
  // position — an early, cheap component is reached by far more matches
  // than its own top-tier upgrade regardless of which one players actually
  // settle on, so "highest usage" skews toward "cheapest," not "actually
  // bought." Left in as an option (and in the tune grid) rather than
  // deleted, since a future re-tune against a different snapshot may find
  // it helps.
  chainStageByUsage: boolean
}

export const DEFAULT_SCORE_CONSTANTS: ScoreConstants = {
  confidenceK: 50,
  highBadgeMinSample: 100,
  highBadgeWeight: 0.75,
  winWeight: 0.35,
  useWeight: 0.25,
  valueWeight: 0.25,
  biasWeight: 0.15,
  vitalityBias: 0.7,
  offArchetypeBias: 0.3,
  // T23 tuning sweep winner (see PROGRESS.md): affinityWeight 0.3 raised the
  // tuning-set agreement score 46% -> 48%; pairSynergyWeight found no
  // improvement at 0.3's affinity level, so it stays off (0 = no effect).
  affinityWeight: 0.3,
  pairSynergyWeight: 0,
  // T25: 0.01 keeps 89/156 items eligible on Kelvin (checked against the
  // committed snapshot) — comfortably above the 12-item minimum build size,
  // so the starvation fallback is not expected to trigger in practice.
  minUsageShare: 0.01,
  // T26: 0 (off) until the re-tune below picks a winner — see PROGRESS.md.
  usageConfidenceShare: 0,
  // T26 re-tune winner (see PROGRESS.md): displaying the highest-usage chain
  // stage measured worse than the score-winning endpoint on every grid combo
  // tried, so it stays off.
  chainStageByUsage: false,
}

// Back-compat named exports (a few call sites/tests referenced these
// directly before T19 consolidated everything into ScoreConstants).
export const HIGH_BADGE_MIN_SAMPLE = DEFAULT_SCORE_CONSTANTS.highBadgeMinSample
export const HIGH_BADGE_WEIGHT = DEFAULT_SCORE_CONSTANTS.highBadgeWeight

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

// weight in [0, constants.highBadgeWeight]: 0 with no high-badge matches at
// all, ramping linearly to highBadgeWeight at highBadgeMinSample and above.
export function highBadgeBlendWeight(highMatches: number | null, constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS): number {
  const m = highMatches ?? 0
  if (m <= 0) return 0
  return constants.highBadgeWeight * Math.min(m / constants.highBadgeMinSample, 1)
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
  constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS,
): BlendedItemStat {
  const weight = highBadgeBlendWeight(high.matches, constants)
  const overallMatches = overall.matches ?? 0
  const highMatches = high.matches ?? 0

  const winRate = weight * safeRate(high.wins, high.matches) + (1 - weight) * safeRate(overall.wins, overall.matches)
  const effectiveMatches = weight * highMatches + (1 - weight) * overallMatches

  const overallUsage = maxOverallMatches > 0 ? overallMatches / maxOverallMatches : 0
  const highUsage = maxHighMatches > 0 ? highMatches / maxHighMatches : 0
  const usageRatio = Math.min(weight * highUsage + (1 - weight) * overallUsage, 1)

  return { winRate, effectiveMatches, usageRatio }
}

// Confidence damping (shrink-to-hero-mean formula, K = constants.confidenceK),
// now taking an already-blended rate + effective match count rather than raw wins.
export function dampedWinRate(
  winRate: number,
  effectiveMatches: number,
  meanWinRate: number,
  constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS,
): number {
  return (winRate * effectiveMatches + constants.confidenceK * meanWinRate) / (effectiveMatches + constants.confidenceK)
}

// Archetype bias: items in the archetype's own slot type score highest,
// vitality (survivability) items get a flat mid bonus in both archetypes
// since staying alive matters regardless of damage type, and off-archetype
// items score low but not zero (a strong off-slot item can still make it in).
export function archetypeBias(item: Item, archetype: Archetype, constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS): number {
  if (item.item_slot_type === archetype) return 1
  if (item.item_slot_type === 'vitality') return constants.vitalityBias
  return constants.offArchetypeBias
}

// Hero-affinity multiplier (T23): compares this hero's own usage share for
// an item (heroUsageShare, the same blended usageRatio scoreItem already
// computes) against the item's roster-average usage share — an item that's
// used far more on this hero than average over-indexes on this hero's kit
// (play style / ability synergy, empirically, since we don't model abilities
// directly), and vice versa. Clamped to [0.5, 3] so a thin-sample outlier
// can't swing the multiplier too far; affinityWeight (0 = no effect) scales
// how much that ratio actually moves the final composite score.
export function heroAffinityMultiplier(
  heroUsageShare: number,
  rosterUsageShare: number | null,
  constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS,
): number {
  const baseline = Math.max(rosterUsageShare ?? 0.01, 0.01)
  const affinity = Math.min(Math.max(heroUsageShare / baseline, 0.5), 3)
  return 1 + constants.affinityWeight * (affinity - 1)
}

// Item-pair synergy (T23): how much better (or worse) a pair of items does
// together than this hero's mean win rate, shrunk toward 0 as pair matches
// run thin — reuses dampedWinRate's shrink-to-mean formula (damping toward
// meanWinRate is exactly damping the RATE-minus-mean toward 0, algebraically)
// rather than a second damping formula. An unseen/statless pair scores 0
// (neither a bonus nor a penalty), not a guess.
export function pairLift(
  pairStat: Pick<ItemPairStat, 'wins' | 'matches'> | null | undefined,
  meanWinRate: number,
  constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS,
): number {
  if (!pairStat || pairStat.matches == null || pairStat.matches <= 0) return 0
  const rate = safeRate(pairStat.wins, pairStat.matches)
  return dampedWinRate(rate, pairStat.matches, meanWinRate, constants) - meanWinRate
}

// Usage-scaled win-rate confidence (T26): how much of a damped win rate's
// deviation from the hero mean should count, given this item's usage share.
// A 5%-usage item scaled against a 0.3 usageConfidenceShare keeps only
// 1/6 of its WR deviation; a mass-usage staple (share >= usageConfidenceShare)
// keeps all of it. usageConfidenceShare <= 0 disables the scale (always 1).
export function usageConfidenceScale(usageShare: number, constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS): number {
  if (constants.usageConfidenceShare <= 0) return 1
  return Math.min(1, usageShare / constants.usageConfidenceShare)
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
export function scoreItem(
  {
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
  }: ItemScoreInputs,
  constants: ScoreConstants = DEFAULT_SCORE_CONSTANTS,
): number {
  const blended = blendHighBadgeStat(
    { wins: overallWins, matches: overallMatches },
    { wins: highWins, matches: highMatches },
    maxOverallMatches,
    maxHighMatches,
    constants,
  )
  const useScore = blended.usageRatio
  const damped = dampedWinRate(blended.winRate, blended.effectiveMatches, meanWinRate, constants)
  // T26: scale the WR deviation from mean by usage confidence — a thin-usage
  // item can't ride a hot win rate past mass-usage staples.
  const winScore = meanWinRate + (damped - meanWinRate) * usageConfidenceScale(useScore, constants)
  const valueScore = maxValuePerSoul > 0 ? statValuePerSoul(item) / maxValuePerSoul : 0
  const biasScore = archetypeBias(item, archetype, constants)
  const composite =
    constants.winWeight * winScore + constants.useWeight * useScore + constants.valueWeight * valueScore + constants.biasWeight * biasScore
  const affinityMultiplier = heroAffinityMultiplier(useScore, item.roster_usage_share, constants)
  return composite * affinityMultiplier
}
