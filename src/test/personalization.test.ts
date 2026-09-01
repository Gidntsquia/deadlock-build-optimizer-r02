import { describe, expect, it } from 'vitest'
import { computeDurationInsight } from '../personalization'
import type { PersonalMatch } from '../personalization'

function match(duration_s: number): PersonalMatch {
  return { hero_id: 1, won: true, duration_s, start_time: 0 }
}

describe('personalization: duration insight', () => {
  it('returns null when there are no matches', () => {
    expect(computeDurationInsight([])).toBeNull()
  })

  it('computes the median duration (odd count) and labels it', () => {
    const insight = computeDurationInsight([match(1200), match(1800), match(2400)])
    expect(insight?.median_duration_s).toBe(1800)
    expect(insight?.median_duration_minutes).toBe(30)
    expect(insight?.label).toBe('average')
    expect(insight?.annotation).toContain('30 min')
  })

  it('computes the median duration (even count) and is order-independent', () => {
    const a = computeDurationInsight([match(600), match(1200), match(1800), match(2400)])
    const b = computeDurationInsight([match(2400), match(600), match(1800), match(1200)])
    expect(a).toEqual(b)
    expect(a?.median_duration_s).toBe(1500)
  })

  it('labels short and long games', () => {
    expect(computeDurationInsight([match(600)])?.label).toBe('short')
    expect(computeDurationInsight([match(3000)])?.label).toBe('long')
  })
})
