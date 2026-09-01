// Personal match-history insight (public/data/personal/matches.json, account
// 267836488 — see scripts/fetch-data.mjs). Not held-out data: any module may
// read it. Produces one displayed insight: a label for how long this
// player's games tend to run, meant to annotate a build's late-game budget
// line (T5) rather than change the generator's scoring.

export interface PersonalMatch {
  hero_id: number
  won: boolean
  duration_s: number
  start_time: number
}

export type DurationLabel = 'short' | 'average' | 'long'

export interface DurationInsight {
  median_duration_s: number
  median_duration_minutes: number
  label: DurationLabel
  annotation: string
}

const SHORT_THRESHOLD_MIN = 25
const LONG_THRESHOLD_MIN = 40

function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2)
  return sortedValues.length % 2 !== 0
    ? sortedValues[mid]
    : (sortedValues[mid - 1] + sortedValues[mid]) / 2
}

export function computeDurationInsight(matches: PersonalMatch[]): DurationInsight | null {
  const durations = matches
    .map((m) => m.duration_s)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d))
    .sort((a, b) => a - b)

  if (durations.length === 0) return null

  const medianSeconds = median(durations)
  const medianMinutes = Math.round(medianSeconds / 60)
  const label: DurationLabel =
    medianMinutes < SHORT_THRESHOLD_MIN ? 'short' : medianMinutes > LONG_THRESHOLD_MIN ? 'long' : 'average'

  const annotation = `Your typical match runs ~${medianMinutes} min (${label}) — the late-game budget below assumes a game this length.`

  return { median_duration_s: medianSeconds, median_duration_minutes: medianMinutes, label, annotation }
}
