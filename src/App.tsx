import { useEffect, useMemo, useState } from 'react'
import BuildCard from './components/BuildCard'
import HeroPicker from './components/HeroPicker'
import ItemDetailSheet from './components/ItemDetailSheet'
import { DRIFTER_HERO_ID, INFERNUS_HERO_ID } from './constants'
import { loadHeroAnalytics, loadHeroes, loadItems } from './data/loaders'
import type { Build, Hero, Item } from './generator'
import { generateBuilds } from './generator'
import './styles.css'
import type { ValidationReport } from './validation'
import { validateBuildsAgainstCtc, validateBuildsAgainstHeldOut } from './validation'

type LoadState = 'loading' | 'ready' | 'error'

function App() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [heroes, setHeroes] = useState<Hero[] | null>(null)
  const [baseState, setBaseState] = useState<LoadState>('loading')

  const [selectedHeroId, setSelectedHeroId] = useState<number | null>(null)
  const [build, setBuild] = useState<Build | null>(null)
  const [buildState, setBuildState] = useState<LoadState>('loading')
  const [validation, setValidation] = useState<ValidationReport | null>(null)
  // Player name to suffix onto the agreement chip (e.g. "ctc") — null keeps
  // Infernus's existing unlabeled tuning-set chip exactly as it was (T20).
  const [validationLabel, setValidationLabel] = useState<string | null>(null)

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadItems(), loadHeroes()])
      .then(([loadedItems, loadedHeroes]) => {
        if (cancelled) return
        setItems(loadedItems)
        setHeroes(loadedHeroes)
        const infernus = loadedHeroes.find((hero) => hero.id === INFERNUS_HERO_ID)
        setSelectedHeroId(infernus ? infernus.id : (loadedHeroes[0]?.id ?? null))
        setBaseState('ready')
      })
      .catch(() => {
        if (!cancelled) setBaseState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!items || !heroes || selectedHeroId === null) return
    const hero = heroes.find((h) => h.id === selectedHeroId)
    if (!hero) return

    let cancelled = false
    setBuildState('loading')
    setValidation(null)
    setValidationLabel(null)

    loadHeroAnalytics(hero.id)
      .then((analytics) => {
        if (cancelled) return
        const generated = generateBuilds(hero, items, analytics)
        setBuild(generated)
        setBuildState('ready')
        if (hero.id === INFERNUS_HERO_ID) {
          validateBuildsAgainstHeldOut([generated])
            .then((reports) => {
              if (!cancelled) setValidation(reports.get(generated.name) ?? null)
            })
            .catch(() => {
              // Validation is best-effort UI polish; the build still renders without it.
            })
        } else if (hero.id === DRIFTER_HERO_ID) {
          // T20: ctc's Drifter matches are the held-out test set — display
          // only, a one-time PROGRESS.md finding, never tuned toward.
          validateBuildsAgainstCtc([generated])
            .then((reports) => {
              if (cancelled) return
              setValidation(reports.get(generated.name) ?? null)
              setValidationLabel('ctc')
            })
            .catch(() => {
              // Validation is best-effort UI polish; the build still renders without it.
            })
        }
      })
      .catch(() => {
        if (!cancelled) setBuildState('error')
      })

    return () => {
      cancelled = true
    }
  }, [items, heroes, selectedHeroId])

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>()
    for (const item of items ?? []) map.set(item.id, item)
    return map
  }, [items])

  const selectedItem = selectedItemId !== null ? (itemsById.get(selectedItemId) ?? null) : null
  const selectedHero = heroes?.find((hero) => hero.id === selectedHeroId) ?? null

  return (
    <main className="app">
      <h1>Deadlock Build Optimizer</h1>

      {baseState === 'error' && <p role="alert">Couldn't load build data. Try reloading.</p>}
      {baseState === 'loading' && <p>Loading heroes…</p>}

      {baseState === 'ready' && heroes && (
        <>
          <HeroPicker heroes={heroes} selectedHeroId={selectedHeroId} onSelect={setSelectedHeroId} />

          {buildState === 'error' && (
            <p role="alert">Couldn't load builds for {selectedHero?.name ?? 'this hero'}.</p>
          )}
          {buildState === 'loading' && <p>Loading builds…</p>}

          {buildState === 'ready' && build && itemsById.size > 0 && (
            <div className="build-list">
              <BuildCard
                build={build}
                itemsById={itemsById}
                abilities={selectedHero?.abilities ?? []}
                validation={validation}
                validationLabel={validationLabel}
                onSelectItem={setSelectedItemId}
              />
            </div>
          )}
        </>
      )}

      {selectedItem && <ItemDetailSheet item={selectedItem} onClose={() => setSelectedItemId(null)} />}
    </main>
  )
}

export default App
