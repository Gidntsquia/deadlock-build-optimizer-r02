import type { Hero } from '../generator'

interface HeroPickerProps {
  heroes: Hero[]
  selectedHeroId: number | null
  onSelect: (heroId: number) => void
}

export default function HeroPicker({ heroes, selectedHeroId, onSelect }: HeroPickerProps) {
  return (
    <div className="hero-picker">
      <label htmlFor="hero-select">Hero</label>
      <select
        id="hero-select"
        className="hero-picker__select"
        value={selectedHeroId ?? ''}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {heroes.map((hero) => (
          <option key={hero.id} value={hero.id}>
            {hero.name}
          </option>
        ))}
      </select>
    </div>
  )
}
