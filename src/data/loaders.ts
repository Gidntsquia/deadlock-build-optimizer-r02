// Runtime loaders for the committed snapshots under public/data/ (served as
// static files at /data/**). No other external data source at runtime.
import type { Hero, HeroAnalytics, Item } from '../generator'
import type { PersonalMatch } from '../personalization'

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`/data/${path}`)
  if (!response.ok) throw new Error(`fetch failed for /data/${path}: ${response.status}`)
  return (await response.json()) as T
}

export function loadItems(): Promise<Item[]> {
  return fetchJson<Item[]>('items.json')
}

export function loadHeroes(): Promise<Hero[]> {
  return fetchJson<Hero[]>('heroes.json')
}

export function loadHeroAnalytics(heroId: number): Promise<HeroAnalytics> {
  return fetchJson<HeroAnalytics>(`analytics/hero-${heroId}.json`)
}

export function loadPersonalMatches(): Promise<PersonalMatch[]> {
  return fetchJson<PersonalMatch[]>('personal/matches.json')
}
