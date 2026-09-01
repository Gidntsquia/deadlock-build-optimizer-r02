import { useState } from 'react'
import type { Item } from '../generator'

interface ItemRowProps {
  item: Item
  runningTotal: number
  // null when this hero has no validation report (only Infernus does).
  core: boolean | null
  onSelect: (itemId: number) => void
}

// In-game item tiers are I-IV (see DESIGN.md). A handful of items in this
// snapshot carry item_tier 5 (ability-upgrade-style items priced at a flat
// 9999-soul sentinel, not a real 5th shop tier) — render the plain number
// rather than inventing a "V" the game doesn't use.
const TIER_ROMAN: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }
function tierLabel(tier: number): string {
  return TIER_ROMAN[tier] ?? String(tier)
}

export default function ItemRow({ item, runningTotal, core, onSelect }: ItemRowProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = item.image !== null && !imageFailed

  return (
    <li className="item-row">
      <button type="button" className="item-row__button item-card" onClick={() => onSelect(item.id)}>
        <div className={`item-card__tile item-card__tile--${item.item_slot_type}`}>
          {item.is_active_item && <span className="item-card__active-chip">Active</span>}
          <span className="item-card__tier">{tierLabel(item.item_tier)}</span>
          {showImage && (
            <img
              className="item-card__image"
              src={item.image!}
              alt=""
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          )}
        </div>
        <span className="item-card__label">{item.name}</span>
        <span className="item-card__cost">{item.cost}s</span>
        {core !== null && (
          <span className={`badge badge--${core ? 'core' : 'not-core'}`}>{core ? 'Core' : 'Not core'}</span>
        )}
      </button>
      <span className="item-row__running-total">Total: {runningTotal}s</span>
    </li>
  )
}
