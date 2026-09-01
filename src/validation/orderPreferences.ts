import { matchWeight } from './coreSet'
import type { ZergMatch } from './types'

// Win-weighted pairwise buy-order preference among core-set items, keyed
// "minId|maxId". Positive = the lower-id item tends to be bought first
// across the sample; negative = the higher-id item does; ~0 = no signal.
export function buildOrderPreferences(matches: ZergMatch[], coreItemIds: Set<number>): Map<string, number> {
  const preferences = new Map<string, number>()

  for (const match of matches) {
    const weight = matchWeight(match)
    // First purchase time per core item in this match (a re-buy/upgrade of
    // the same item shouldn't shift its place in the order).
    const firstTime = new Map<number, number>()
    for (const purchase of match.purchases) {
      if (!coreItemIds.has(purchase.item_id)) continue
      const existing = firstTime.get(purchase.item_id)
      if (existing == null || purchase.game_time_s < existing) {
        firstTime.set(purchase.item_id, purchase.game_time_s)
      }
    }

    const ids = [...firstTime.keys()]
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const x = ids[i]
        const y = ids[j]
        const a = Math.min(x, y)
        const b = Math.max(x, y)
        const key = `${a}|${b}`
        const xBeforeY = firstTime.get(x)! < firstTime.get(y)!
        const aBeforeB = (a === x) === xBeforeY
        const delta = aBeforeB ? weight : -weight
        preferences.set(key, (preferences.get(key) ?? 0) + delta)
      }
    }
  }

  return preferences
}
