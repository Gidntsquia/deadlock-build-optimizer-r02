// Tuning/held-out data fetch. Per CLAUDE.md / GOALS.md HELD-OUT RULE, only
// this directory (src/validation/) may reference the zergggy/heldout-ctc
// snapshot paths.
import type { ZergMatch } from './types'

function fetchMatches(path: string): Promise<ZergMatch[]> {
  return fetch(`${import.meta.env.BASE_URL}data/${path}`).then((response) => {
    if (!response.ok) throw new Error(`fetch failed for ${path}: ${response.status}`)
    return response.json() as Promise<ZergMatch[]>
  })
}

export function fetchZergMatches(): Promise<ZergMatch[]> {
  return fetchMatches('zergggy/matches.json')
}

// T20: ctc's Drifter matches — the held-out test set (never tuned toward).
export function fetchCtcMatches(): Promise<ZergMatch[]> {
  return fetchMatches('heldout-ctc/matches.json')
}
