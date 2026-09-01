import type { Build, BuildPhase, Item } from '../generator'
import type { ValidationReport } from '../validation'
import ItemRow from './ItemRow'

interface BuildCardProps {
  build: Build
  itemsById: Map<number, Item>
  // null when this hero has no validation report (only Infernus does).
  validation: ValidationReport | null
  onSelectItem: (itemId: number) => void
}

const PHASES: BuildPhase[] = ['early', 'mid', 'late']
const PHASE_LABELS: Record<BuildPhase, string> = { early: 'Early game', mid: 'Mid game', late: 'Late game' }
const ARCHETYPE_LABELS: Record<Build['archetype'], string> = { weapon: 'Weapon build', spirit: 'Spirit build' }

export default function BuildCard({ build, itemsById, validation, onSelectItem }: BuildCardProps) {
  const coreByItemId = new Map(validation?.items.map((flag) => [flag.item_id, flag.core]) ?? [])

  return (
    <section className="build-card">
      <header className="build-card__header">
        <h2>{build.name}</h2>
        <p className="build-card__archetype">{ARCHETYPE_LABELS[build.archetype]}</p>
        {validation && <span className="build-card__agreement">{validation.agreement_percent}% agreement</span>}
      </header>

      {PHASES.map((phase) => {
        const entries = build.items.filter((entry) => entry.phase === phase)
        if (entries.length === 0) return null
        return (
          <div key={phase} className="build-card__phase">
            <h3>{PHASE_LABELS[phase]}</h3>
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
        )
      })}

      <div className="build-card__abilities">
        <h3>Ability level-up order</h3>
        <ol className="ability-order">
          {build.ability_order.map((step) => (
            <li key={step.step} className={`ability-order__step ability-order__step--${step.kind}`}>
              {step.ability_name}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
