import type { Item, StatSection, StatSectionStat } from '../generator'

interface ItemDetailSheetProps {
  item: Item
  onClose: () => void
}

// A stat line carries real information only if it's a nonzero number (numeric
// strings, and unit-suffixed ones like "7m", both parse via parseFloat) or a
// non-numeric display-metadata object with a usable label. Everything else —
// zero values, "0m", null, unparseable junk strings with no label — is noise
// the item-detail sheet shouldn't show (see T8; reused for stat_sections
// rows in T14, where it also correctly hides `value: null` stats).
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

const SECTION_HEADINGS: Partial<Record<NonNullable<StatSection['type']>, string>> = {
  active: 'Active',
  passive: 'Passive',
}

// Renders a stat_sections row's <prefix><value><postfix>. `{s:sign}` is a
// template token (not literal text): it means "show +, only for a positive
// value" — a negative value already carries its own "-", so nothing is added.
// Literal "+"/"-" prefixes render as-is. Some snapshot values already have
// their unit baked in (e.g. value "10m" with postfix "m", an upstream
// extraction quirk) — the postfix is skipped in that case to avoid "10mm".
function formatSectionStatValue(stat: StatSectionStat): string {
  const valueStr = String(stat.value)
  let prefix = ''
  if (stat.prefix === '{s:sign}') {
    const numeric = typeof stat.value === 'number' ? stat.value : parseFloat(valueStr)
    prefix = Number.isFinite(numeric) && numeric > 0 ? '+' : ''
  } else if (stat.prefix) {
    prefix = stat.prefix
  }
  const postfixTrimmed = stat.postfix ? stat.postfix.trim() : ''
  const postfix = postfixTrimmed && !valueStr.toLowerCase().endsWith(postfixTrimmed.toLowerCase()) ? postfixTrimmed : ''
  return `${prefix}${valueStr}${postfix}`
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
        {item.stat_sections.map((section, sectionIndex) => {
          const meaningfulStats = section.stats.filter((stat) => isMeaningfulStatLine(stat.value))
          if (meaningfulStats.length === 0 && !section.description) return null
          const heading = section.type ? SECTION_HEADINGS[section.type] : undefined
          return (
            <div key={sectionIndex} className="item-detail-sheet__stats-section">
              {heading && <h3>{heading}</h3>}
              {section.description && <p className="item-detail-sheet__text">{section.description}</p>}
              {meaningfulStats.length > 0 && (
                <ul className="item-detail-sheet__stats">
                  {meaningfulStats.map((stat) => (
                    <li
                      key={stat.key}
                      className={stat.elevated ? 'item-detail-sheet__stat--elevated' : undefined}
                    >
                      <span>{stat.label}</span>
                      <span>{formatSectionStatValue(stat)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
