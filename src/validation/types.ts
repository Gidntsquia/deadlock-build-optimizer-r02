// Zergggy held-out data shape (public/data/zergggy/matches.json). This module
// is the ONLY place in the app allowed to read it (see CLAUDE.md / GOALS.md
// HELD-OUT RULE) — never import these types from src/generator.

export interface ZergPurchase {
  item_id: number
  game_time_s: number
}

export interface ZergMatch {
  match_id: number
  won: boolean
  purchases: ZergPurchase[]
}

export interface CoreSetItem {
  item_id: number
  share: number
}

export interface CoreSetResult {
  threshold: number
  // core-set items only (share >= threshold), keyed by item_id
  items: Map<number, CoreSetItem>
  // items seen at least once but below threshold — excluded from scoring entirely
  experiments: number[]
}

export interface ValidationItemFlag {
  item_id: number
  core: boolean
}

// "How well the generator's build agrees with Zergggy's known play" — a
// score of the generator, never a suggestion to copy Zergggy's items.
export interface ValidationReport {
  agreement_percent: number
  items: ValidationItemFlag[]
}
