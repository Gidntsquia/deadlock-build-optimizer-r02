import type { Archetype, HeroAnalytics, Item } from './types'
import { statValuePerSoul } from './statUtils'

// Confidence-damping pseudo-match count: an item's raw win rate is shrunk
// toward the hero's mean win rate by treating it as if it had CONFIDENCE_K
// extra matches played at that mean. Low-sample items (a handful of buys)
// end up close to the hero mean; high-sample items keep their real rate.
const CONFIDENCE_K = 50

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

export function confidenceDampedWinRate(
  wins: number | null,
  matches: number | null,
  meanWinRate: number,
): number {
  const w = wins ?? 0
  const m = matches ?? 0
  return (w + CONFIDENCE_K * meanWinRate) / (m + CONFIDENCE_K)
}

export function usageRate(matches: number | null, maxMatches: number): number {
  if (matches == null || maxMatches <= 0) return 0
  return Math.min(matches / maxMatches, 1)
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
  wins: number | null
  matches: number | null
  meanWinRate: number
  maxMatches: number
  maxValuePerSoul: number
  archetype: Archetype
}

// Composite item score in [0, ~1]: blends real per-hero performance
// (win rate + usage) with the item's own stat payload (value-per-soul,
// normalized against the pool's max) and an archetype slot-type bias.
export function scoreItem({
  item,
  wins,
  matches,
  meanWinRate,
  maxMatches,
  maxValuePerSoul,
  archetype,
}: ItemScoreInputs): number {
  const winScore = confidenceDampedWinRate(wins, matches, meanWinRate)
  const useScore = usageRate(matches, maxMatches)
  const valueScore = maxValuePerSoul > 0 ? statValuePerSoul(item) / maxValuePerSoul : 0
  const biasScore = archetypeBias(item, archetype)
  return 0.35 * winScore + 0.25 * useScore + 0.25 * valueScore + 0.15 * biasScore
}
