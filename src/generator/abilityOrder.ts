import type { Ability, AbilityLevelStep, AbilityOrderStat } from './types'

// Minimum matches the high-badge (Phantom+) source's top row needs before
// it's preferred over the full-population source — below that the sample
// is too thin to trust over the larger pool (see T15).
const HIGH_BADGE_ABILITY_ORDER_MIN_MATCHES = 100

// Deterministic sensible fallback level-up sequence: unlock all 4 abilities
// in hero-listed order (steps 1-4), then upgrade them round-robin twice more
// (steps 5-12). Used when a hero has no usable real sequence (missing/empty
// stats, or a sequence referencing an ability id outside the hero's own 4).
function fallbackAbilityOrder(abilities: Ability[]): AbilityLevelStep[] {
  const steps: AbilityLevelStep[] = []
  let step = 1
  for (const ability of abilities) {
    steps.push({ step: step++, ability_id: ability.id, ability_name: ability.name, kind: 'unlock' })
  }
  for (let round = 0; round < 2; round++) {
    for (const ability of abilities) {
      steps.push({ step: step++, ability_id: ability.id, ability_name: ability.name, kind: 'upgrade' })
    }
  }
  return steps
}

// Picks the best row from an ability-order-stats table: highest matches,
// tie-break highest wins, tie-break ascending joined sequence — the data
// arrives pre-sorted (matches desc, wins desc) but we re-sort defensively
// rather than trust upstream ordering.
function pickBestRow(rows: AbilityOrderStat[]): AbilityOrderStat | null {
  const usable = rows.filter((row) => Array.isArray(row.sequence) && row.sequence.length > 0)
  if (usable.length === 0) return null
  const sorted = [...usable].sort((a, b) => {
    const matchesDiff = (b.matches ?? 0) - (a.matches ?? 0)
    if (matchesDiff !== 0) return matchesDiff
    const winsDiff = (b.wins ?? 0) - (a.wins ?? 0)
    if (winsDiff !== 0) return winsDiff
    const aKey = a.sequence!.join(',')
    const bKey = b.sequence!.join(',')
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
  })
  return sorted[0]
}

// Builds a hero's ability-order steps from its own analytics data. Source
// pick: high_badge_ability_order_stats if its best row has matches >= 100,
// else ability_order_stats. Falls back to the deterministic round-robin
// sequence when no usable row exists, or the chosen row references an
// ability id outside the hero's own 4 (held-out rule: pick is by
// matches/wins only, never by held-out agreement — see GOALS.md T15).
export function buildAbilityOrder(
  abilities: Ability[],
  abilityOrderStats: AbilityOrderStat[],
  highBadgeAbilityOrderStats: AbilityOrderStat[],
): AbilityLevelStep[] {
  const highBadgeBest = pickBestRow(highBadgeAbilityOrderStats)
  const overallBest = pickBestRow(abilityOrderStats)
  const chosen =
    highBadgeBest && (highBadgeBest.matches ?? 0) >= HIGH_BADGE_ABILITY_ORDER_MIN_MATCHES ? highBadgeBest : overallBest

  if (!chosen) return fallbackAbilityOrder(abilities)

  const abilityById = new Map(abilities.map((ability) => [ability.id, ability]))
  const sequence = chosen.sequence!
  if (!sequence.every((id) => abilityById.has(id))) return fallbackAbilityOrder(abilities)

  const seen = new Set<number>()
  return sequence.map((id, index) => {
    const ability = abilityById.get(id)!
    const kind = seen.has(id) ? 'upgrade' : 'unlock'
    seen.add(id)
    return { step: index + 1, ability_id: ability.id, ability_name: ability.name, kind }
  })
}
