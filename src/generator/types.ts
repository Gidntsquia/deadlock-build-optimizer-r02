// Shape of the committed snapshot JSON (public/data/**) as consumed by the generator.
// Kept structurally loose (no brand types) since these mirror plain fetch() JSON.

export interface StatLine {
  key: string
  // Usually a numeric string, but the snapshot's `properties` extraction
  // sometimes hands back a display-metadata object instead of a raw value
  // (see PROGRESS.md) — kept loose so callers must handle both.
  value: unknown
}

export interface Item {
  id: number
  class_name: string
  name: string
  cost: number
  item_tier: number
  item_slot_type: 'weapon' | 'vitality' | 'spirit'
  image: string | null
  stat_lines: StatLine[]
  active_description: string | null
  passive_description: string | null
}

export interface Ability {
  id: number | string
  name: string
}

export interface Hero {
  id: number
  name: string
  image: string | null
  base_stats: Record<string, { value: number; display_stat_name: string }>
  stat_growth: Record<string, unknown>
  abilities: Ability[]
}

export interface ItemStat {
  item_id: number
  wins: number | null
  matches: number | null
}

export interface AbilityOrderStat {
  sequence: unknown
  wins: number | null
  matches: number | null
}

export interface HeroAnalytics {
  hero_id: number
  item_stats: ItemStat[]
  // Same shape as item_stats, pre-filtered upstream (fetch-data.mjs) to
  // matches with average badge >= high_badge_min (Phantom+; see T9/README).
  high_badge_item_stats: ItemStat[]
  high_badge_min: number
  ability_order_stats: AbilityOrderStat[]
}

// Generator output.

export type BuildPhase = 'early' | 'mid' | 'late'
export type Archetype = 'weapon' | 'spirit'

export interface BuildItemEntry {
  item_id: number
  phase: BuildPhase
  cost: number
  running_total: number
}

export interface AbilityLevelStep {
  step: number
  ability_id: number | string
  ability_name: string
  kind: 'unlock' | 'upgrade'
}

export interface Build {
  name: string
  archetype: Archetype
  items: BuildItemEntry[]
  ability_order: AbilityLevelStep[]
}
