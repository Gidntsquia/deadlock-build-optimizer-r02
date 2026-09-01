import type { Item } from '../generator'

interface ItemRowProps {
  item: Item
  runningTotal: number
  // null when this hero has no validation report (only Infernus does).
  core: boolean | null
  onSelect: (itemId: number) => void
}

export default function ItemRow({ item, runningTotal, core, onSelect }: ItemRowProps) {
  return (
    <li className="item-row">
      <button type="button" className="item-row__button" onClick={() => onSelect(item.id)}>
        {item.image ? (
          <img className="item-row__image" src={item.image} alt="" width={40} height={40} loading="lazy" />
        ) : (
          <span className="item-row__image item-row__image--placeholder" aria-hidden="true" />
        )}
        <span className="item-row__name">{item.name}</span>
        {core !== null && (
          <span className={`badge badge--${core ? 'core' : 'not-core'}`}>{core ? 'Core' : 'Not core'}</span>
        )}
        <span className="item-row__cost">{item.cost}s</span>
      </button>
      <span className="item-row__running-total">Total: {runningTotal}s</span>
    </li>
  )
}
