import type { Build } from '../generator'
import { computeCoreSet } from './coreSet'
import { fetchZergMatches } from './loadMatches'
import { buildOrderPreferences } from './orderPreferences'
import type { CoreSetResult, ValidationReport, ZergMatch } from './types'

export { computeCoreSet, CORE_SET_THRESHOLD, matchWeight } from './coreSet'
export { buildOrderPreferences } from './orderPreferences'
export type { CoreSetItem, CoreSetResult, ValidationItemFlag, ValidationReport, ZergMatch, ZergPurchase } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Agreement % = how well a generated build matches Zergggy's known play,
// blended 60/40 from two signals (both computed only over core-set items):
//   coreSetOverlap  = |build items in core set| / |core set|
//   buyOrderAgreement = weighted pairwise buy-order concordance among the
//     build's shared core items (1.0 = every comparable pair matches
//     Zergggy's majority order, 0.0 = every pair is reversed, 0.5 = no
//     signal for a pair, or no comparable pairs at all)
// This is a score OF the generator's output, never a recommendation to
// copy Zergggy's items — see ValidationReport's doc comment.
export function validateBuild(
  build: Build,
  coreSet: CoreSetResult,
  orderPreferences: Map<string, number>,
): ValidationReport {
  const buildItemIds = build.items.map((entry) => entry.item_id)
  const coreSetSize = coreSet.items.size

  const sharedCoreInBuildOrder = buildItemIds.filter((id) => coreSet.items.has(id))
  const coreSetOverlap = coreSetSize > 0 ? sharedCoreInBuildOrder.length / coreSetSize : 0

  let comparablePairs = 0
  let creditSum = 0
  for (let i = 0; i < sharedCoreInBuildOrder.length; i++) {
    for (let j = i + 1; j < sharedCoreInBuildOrder.length; j++) {
      const x = sharedCoreInBuildOrder[i]
      const y = sharedCoreInBuildOrder[j]
      const a = Math.min(x, y)
      const b = Math.max(x, y)
      const preference = orderPreferences.get(`${a}|${b}`) ?? 0
      comparablePairs++
      if (preference === 0) {
        creditSum += 0.5
      } else {
        const buildSaysAFirst = x === a
        const preferenceSaysAFirst = preference > 0
        creditSum += buildSaysAFirst === preferenceSaysAFirst ? 1 : 0
      }
    }
  }
  const buyOrderAgreement = comparablePairs > 0 ? creditSum / comparablePairs : 0.5

  const agreementPercent = clamp(Math.round(100 * (0.6 * coreSetOverlap + 0.4 * buyOrderAgreement)), 0, 100)

  const items = buildItemIds.map((itemId) => ({ item_id: itemId, core: coreSet.items.has(itemId) }))

  return { agreement_percent: agreementPercent, items }
}

// Convenience one-shot: computes the core set + order preferences from raw
// Zergggy matches and validates a build against them.
export function validateBuildAgainstMatches(build: Build, matches: ZergMatch[]): ValidationReport {
  const coreSet = computeCoreSet(matches)
  const coreItemIds = new Set(coreSet.items.keys())
  const orderPreferences = buildOrderPreferences(matches, coreItemIds)
  return validateBuild(build, coreSet, orderPreferences)
}

// UI entry point (T5): fetches the held-out matches and validates every
// build in one call, keyed by build name, so callers outside this directory
// never need to know the held-out data's source.
export async function validateBuildsAgainstHeldOut(builds: Build[]): Promise<Map<string, ValidationReport>> {
  const matches = await fetchZergMatches()
  const coreSet = computeCoreSet(matches)
  const coreItemIds = new Set(coreSet.items.keys())
  const orderPreferences = buildOrderPreferences(matches, coreItemIds)
  return new Map(builds.map((build) => [build.name, validateBuild(build, coreSet, orderPreferences)]))
}
