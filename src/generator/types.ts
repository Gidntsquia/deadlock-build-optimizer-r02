// Shape of the committed snapshot JSON (public/data/**) as consumed by the generator.
// Kept structurally loose (no brand types) since these mirror plain fetch() JSON.

export interface StatLine {
  key: string
  // Usually a numeric string, but the snapshot's `properties` extraction
  // sometimes hands back a display-metadata object instead of a raw value
  // (see PROGRESS.md) — kept loose so callers must handle both.
  value: unknown
}

// A single displayed stat row within a StatSection, matching the game's own
// tooltip definition (see fetch-data.mjs's extractStatSections / T14).
// `value: null` means the stat has no real value in this snapshot and must
// not be rendered. `prefix: '{s:sign}'` is a template token, not literal text
// — see ItemDetailSheet's formatSectionStatValue for how it's rendered.
export interface StatSectionStat {
  key: string
  label: string
  value: string | number | null
  prefix: string | null
  postfix: string | null
  elevated: boolean
}

// One tooltip block as the game itself groups it (innate stats have no type
// heading; active/passive get one). Stats are pre-ordered elevated-first.
export interface StatSection {
  type: 'innate' | 'active' | 'passive' | null
  description: string | null
  stats: StatSectionStat[]
}

export interface Item {
  id: number
  class_name: string
  name: string
  // Catalog ids of the items this one upgrades from. Buying this item
  // consumes each component (which becomes unpurchasable in-game) — see
  // itemChains.ts / T18.
  components: number[]
  cost: number
  item_tier: number
  item_slot_type: 'weapon' | 'vitality' | 'spirit'
  image: string | null
  stat_lines: StatLine[]
  stat_sections: StatSection[]
  is_active_item: boolean
  active_description: string | null
  passive_description: string | null
}

export interface Ability {
  id: number | string
  name: string
  image: string | null
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
  // Ability ids in AP-spend order, ~15 entries long. `null` for rows the
  // upstream pipeline couldn't resolve (see T15) — callers must skip those.
  sequence: number[] | null
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
  // Same shape as ability_order_stats, pre-filtered upstream to average
  // badge >= high_badge_min (Phantom+; see T15). Preferred source when its
  // top row has enough matches.
  high_badge_ability_order_stats: AbilityOrderStat[]
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
