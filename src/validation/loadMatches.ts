// Held-out data fetch. Per CLAUDE.md / GOALS.md HELD-OUT RULE, only this
// directory (src/validation/) may reference the zergggy snapshot path.
import type { ZergMatch } from './types'

export function fetchZergMatches(): Promise<ZergMatch[]> {
  return fetch('/data/zergggy/matches.json').then((response) => {
    if (!response.ok) throw new Error(`fetch failed for zergggy matches: ${response.status}`)
    return response.json() as Promise<ZergMatch[]>
  })
}
