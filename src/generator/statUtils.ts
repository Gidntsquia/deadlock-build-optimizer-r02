import type { Item, StatLine } from './types'

// These stat-line keys are ability/cast-mechanics boilerplate present on every
// item in the snapshot (mostly "0" for items with no activated ability) rather
// than a power stat — excluded from the value-per-soul sum. AbilityCooldown is
// handled separately (see isActiveItem) as the activated-ability signal.
const NON_VALUE_STAT_KEYS = new Set([
  'AbilityCooldown',
  'AbilityDuration',
  'AbilityCastRange',
  'AbilityUnitTargetLimit',
  'AbilityCastDelay',
  'AbilityChannelTime',
  'AbilityPostCastDuration',
  'AbilityCharges',
  'AbilityCooldownBetweenCharge',
  'ChannelMoveSpeed',
  'AbilityResourceCost',
])

function numericValue(statLine: StatLine): number {
  const n = Number(statLine.value)
  return Number.isFinite(n) ? n : 0
}

// An item "has an active" when its AbilityCooldown stat line is nonzero —
// the only per-item signal in this snapshot for an activated (vs. passive)
// effect (active_description/passive_description came back null for every
// item; see PROGRESS.md for the T2/T3 handoff note on this data gap).
export function isActiveItem(item: Item): boolean {
  const cooldown = item.stat_lines.find((s) => s.key === 'AbilityCooldown')
  return cooldown != null && numericValue(cooldown) !== 0
}

// Sum of |value| across an item's real power/utility stat lines (excludes the
// ability-mechanics boilerplate above), used as the numerator of value-per-soul.
export function statValueScore(item: Item): number {
  let total = 0
  for (const line of item.stat_lines) {
    if (NON_VALUE_STAT_KEYS.has(line.key)) continue
    total += Math.abs(numericValue(line))
  }
  return total
}

export function statValuePerSoul(item: Item): number {
  return statValueScore(item) / Math.max(item.cost, 1)
}
