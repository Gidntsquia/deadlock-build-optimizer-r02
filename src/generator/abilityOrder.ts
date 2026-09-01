import type { Ability, AbilityLevelStep } from './types'

// Deterministic sensible fallback level-up sequence: unlock all 4 abilities
// in hero-listed order (steps 1-4), then upgrade them round-robin twice more
// (steps 5-12). Used for every hero: the snapshot's ability_order_stats rows
// carry a null `sequence` field for the whole roster (an unresolved upstream
// field-name gap — see PROGRESS.md), so there is no real per-hero order to
// prefer over this fallback.
export function buildAbilityOrder(abilities: Ability[]): AbilityLevelStep[] {
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
