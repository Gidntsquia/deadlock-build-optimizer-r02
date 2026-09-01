import type { Ability, Build, BuildPhase, Item } from '../generator'
import type { ValidationReport } from '../validation'
import AbilityOrderPanel from './AbilityOrderPanel'
import ItemRow from './ItemRow'

interface BuildCardProps {
  build: Build
  itemsById: Map<number, Item>
  abilities: Ability[]
  // null when this hero has no validation report (only Infernus does).
  validation: ValidationReport | null
  onSelectItem: (itemId: number) => void
}

// In-game the build browser shows two shopping-phase panels, not three (see
// DESIGN.md's layout concept) — the generator's internal early/mid/late
// phase split (still used for scoring/ordering) collapses to that pairing
// for display: mid and late buy phases share one "Mid to Late Game" panel.
// A third "Testing"/optional panel exists in-game for experimental items,
// but nothing in this snapshot identifies leftover/near-miss candidates to
// show there, so it's omitted rather than inventing data for it (T10).
const DISPLAY_SECTIONS: { key: string; label: string; phases: BuildPhase[] }[] = [
  { key: 'early', label: 'Early Game', phases: ['early'] },
  { key: 'mid-late', label: 'Mid to Late Game', phases: ['mid', 'late'] },
]
const ARCHETYPE_LABELS: Record<Build['archetype'], string> = { weapon: 'Weapon build', spirit: 'Spirit build' }

export default function BuildCard({ build, itemsById, abilities, validation, onSelectItem }: BuildCardProps) {
  const coreByItemId = new Map(validation?.items.map((flag) => [flag.item_id, flag.core]) ?? [])

  return (
    <section className="build-card">
      <header className="build-card__header">
        <h2>{build.name}</h2>
        <p className="build-card__archetype">{ARCHETYPE_LABELS[build.archetype]}</p>
        {validation && <span className="build-card__agreement">{validation.agreement_percent}% agreement</span>}
      </header>

      {/* Wrapper lets desktop (>=1024px, T17) lay the phase panels side by
          side as equal-width columns while mobile keeps them stacked. */}
      <div className="build-card__phases">
        {DISPLAY_SECTIONS.map((section) => {
          const entries = build.items.filter((entry) => section.phases.includes(entry.phase))
          if (entries.length === 0) return null
          return (
            <div key={section.key} className="phase-panel">
              <h3 className="phase-panel__title">{section.label}</h3>
              <div className="phase-panel__strip">
                <ul className="item-list">
                  {entries.map((entry) => {
                    const item = itemsById.get(entry.item_id)
                    if (!item) return null
                    return (
                      <ItemRow
                        key={entry.item_id}
                        item={item}
                        runningTotal={entry.running_total}
                        core={validation ? coreByItemId.get(entry.item_id) ?? false : null}
                        onSelect={onSelectItem}
                      />
                    )
                  })}
                </ul>
              </div>
            </div>
          )
        })}
      </div>

      <AbilityOrderPanel abilities={abilities} abilityOrder={build.ability_order} />
    </section>
  )
}
