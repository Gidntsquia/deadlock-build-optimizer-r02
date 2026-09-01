import type { Item } from '../generator'

interface ItemDetailSheetProps {
  item: Item
  onClose: () => void
}

// Most stat_lines values are numeric strings, but some are a display-metadata
// object (e.g. { label, prefix, postfix }) instead of a raw value — render
// something readable either way rather than crashing (see StatLine's type doc).
function formatStatValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'label' in value && typeof (value as { label: unknown }).label === 'string') {
    return (value as { label: string }).label
  }
  return '—'
}

// A stat line carries real information only if it's a nonzero number (numeric
// strings, and unit-suffixed ones like "7m", both parse via parseFloat) or a
// non-numeric display-metadata object with a usable label. Everything else —
// zero values, "0m", unparseable junk strings with no label — is noise the
// item-detail sheet shouldn't show (see T8).
export function isMeaningfulStatLine(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) && parsed !== 0
  }
  if (value && typeof value === 'object' && 'label' in value && typeof (value as { label: unknown }).label === 'string') {
    return (value as { label: string }).label.trim() !== ''
  }
  return false
}

export default function ItemDetailSheet({ item, onClose }: ItemDetailSheetProps) {
  return (
    <div className="item-detail-overlay" onClick={onClose}>
      <div
        className="item-detail-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.name} details`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="item-detail-sheet__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {item.image && <img className="item-detail-sheet__image" src={item.image} alt="" />}
        <h2>{item.name}</h2>
        <dl className="item-detail-sheet__meta">
          <div>
            <dt>Cost</dt>
            <dd>{item.cost} souls</dd>
          </div>
          <div>
            <dt>Tier</dt>
            <dd>{item.item_tier}</dd>
          </div>
          <div>
            <dt>Slot</dt>
            <dd>{item.item_slot_type}</dd>
          </div>
        </dl>
        {item.active_description && <p className="item-detail-sheet__text">{item.active_description}</p>}
        {item.passive_description && <p className="item-detail-sheet__text">{item.passive_description}</p>}
        {(() => {
          const meaningfulLines = item.stat_lines.filter((line) => isMeaningfulStatLine(line.value))
          if (meaningfulLines.length === 0) return null
          return (
            <div className="item-detail-sheet__stats-section">
              <h3>Stats</h3>
              <ul className="item-detail-sheet__stats">
                {meaningfulLines.map((line) => (
                  <li key={line.key}>
                    <span>{line.key}</span>
                    <span>{formatStatValue(line.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
