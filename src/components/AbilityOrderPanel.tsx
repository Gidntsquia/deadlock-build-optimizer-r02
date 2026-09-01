import { useState } from 'react'
import type { Ability, AbilityLevelStep } from '../generator'

interface AbilityOrderPanelProps {
  abilities: Ability[]
  abilityOrder: AbilityLevelStep[]
}

// T21: shrunk from 26/2 so a full 15-step sequence (the real observed max
// across all 38 heroes, Infernus included) fits at 390px with no horizontal
// scrollbar — see styles.css's matching `.ability-order-panel__track` gap.
const COLUMN_WIDTH = 16
const COLUMN_GAP = 1

// In-game AP cost by upgrade index (0-based) for a given ability, derived
// from position rather than hardcoded to however many upgrades exist today —
// our generator currently emits exactly 2 upgrades/ability (abilityOrder.ts),
// so the 3rd (◆5) never renders yet, but this scales if that changes.
const UPGRADE_AP_COST = [1, 2, 5]

function AbilityIcon({ ability }: { ability: Ability }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = ability.image !== null && !imageFailed

  return (
    <div className="ability-order-panel__icon">
      {showImage ? (
        <img
          className="ability-order-panel__icon-image"
          src={ability.image!}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="ability-order-panel__icon-fallback">{ability.name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}

export default function AbilityOrderPanel({ abilities, abilityOrder }: AbilityOrderPanelProps) {
  const totalSteps = abilityOrder.length

  return (
    <section className="ability-order-panel">
      <h3 className="ability-order-panel__title">Ability Point Order</h3>
      <div className="ability-order-panel__scroll">
        {abilities.map((ability) => {
          const steps = abilityOrder.filter((step) => step.ability_id === ability.id)
          let upgradeIndex = 0
          return (
            <div key={ability.id} className="ability-order-panel__row">
              <AbilityIcon ability={ability} />
              <div
                className="ability-order-panel__track"
                style={{
                  gridTemplateColumns: `repeat(${totalSteps}, ${COLUMN_WIDTH}px)`,
                  width: totalSteps * COLUMN_WIDTH + (totalSteps - 1) * COLUMN_GAP,
                }}
              >
                {steps.map((step) => {
                  if (step.kind === 'unlock') {
                    return (
                      <span
                        key={step.step}
                        className="ability-order-panel__marker ability-order-panel__marker--unlock"
                        style={{ gridColumn: step.step }}
                        data-column={step.step}
                        aria-hidden="true"
                      />
                    )
                  }
                  const apCost = UPGRADE_AP_COST[upgradeIndex] ?? UPGRADE_AP_COST[UPGRADE_AP_COST.length - 1]
                  upgradeIndex += 1
                  return (
                    <span
                      key={step.step}
                      className="ability-order-panel__marker ability-order-panel__marker--upgrade"
                      style={{ gridColumn: step.step }}
                      data-column={step.step}
                      aria-hidden="true"
                    >
                      {`◆${apCost}`}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
