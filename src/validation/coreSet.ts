import type { CoreSetResult, ZergMatch } from './types'

export const CORE_SET_THRESHOLD = 0.3

// Win-weighted match weight: a win counts for more than a loss when deciding
// whether an item is a real staple of the played-out build vs. a one-off try.
export function matchWeight(match: ZergMatch): number {
  return match.won ? 1.5 : 1.0
}

// Core set = items purchased in >= threshold of Zergggy's win-weighted sample:
//   share(item) = (Σ weight(m) for matches m where item was bought)
//               / (Σ weight(m) for all sampled matches)
// Items below the threshold are "experiments" — excluded entirely from the
// core set (not scored, not counted against a generated build).
export function computeCoreSet(matches: ZergMatch[], threshold = CORE_SET_THRESHOLD): CoreSetResult {
  const totalWeight = matches.reduce((sum, m) => sum + matchWeight(m), 0)
  const presenceWeight = new Map<number, number>()

  for (const match of matches) {
    const weight = matchWeight(match)
    const itemsInMatch = new Set(match.purchases.map((p) => p.item_id))
    for (const itemId of itemsInMatch) {
      presenceWeight.set(itemId, (presenceWeight.get(itemId) ?? 0) + weight)
    }
  }

  const items = new Map<number, { item_id: number; share: number }>()
  const experiments: number[] = []
  for (const [itemId, weight] of presenceWeight) {
    const share = totalWeight > 0 ? weight / totalWeight : 0
    if (share >= threshold) {
      items.set(itemId, { item_id: itemId, share })
    } else {
      experiments.push(itemId)
    }
  }
  experiments.sort((a, b) => a - b)

  return { threshold, items, experiments }
}
