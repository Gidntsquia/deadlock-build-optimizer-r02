#!/usr/bin/env node
// T19: deterministic offline sweep of the generator's scoring constants,
// argmax against Zergggy agreement (Zergggy is now the TUNING set — see
// GOALS.md's HELD-OUT RULE). This script itself, and its bundled entry
// (tune-entry.ts), may read public/data/zergggy/** — the mechanical
// isolation rule only binds src/generator/, which stays parameter-driven
// (score.ts's DEFAULT_SCORE_CONSTANTS) and never imports this file or
// src/validation/.
//
// HARD LIMIT: this script must NEVER read or reference public/data/heldout-ctc/
// — that is the held-out set reserved for T20's one-time report.
//
// Approach: build scripts/tune-entry.ts ONCE via vite's Node build() API
// (already an explicit devDependency — no new package added) into a temp
// ESM file, so every combo in the sweep calls the REAL generateBuilds +
// validateBuildAgainstMatches, not a reimplementation of the scoring
// formula. Constants are a runtime parameter (see score.ts's optional
// `constants` arg, defaulting to DEFAULT_SCORE_CONSTANTS for every other
// caller), so the 243-combo sweep itself is pure in-process JS — fast,
// no rebuilding per combo.
import { build } from 'vite'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const DATA_DIR = join(ROOT, 'public/data')
const TMP_DIR = join(ROOT, '.tune-tmp')

function readJson(...parts) {
  return JSON.parse(readFileSync(join(DATA_DIR, ...parts), 'utf8'))
}

async function buildEntry() {
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      lib: { entry: 'scripts/tune-entry.ts', formats: ['es'], fileName: () => 'tune-entry.mjs' },
      outDir: '.tune-tmp',
      emptyOutDir: true,
      minify: false,
      write: true,
    },
  })
  const modUrl = pathToFileURL(join(TMP_DIR, 'tune-entry.mjs')).href
  // Cache-bust: a re-run in the same process (unlikely for this CLI, but
  // keeps the loader honest) must not reuse a stale prior build.
  return import(`${modUrl}?t=${Date.now()}`)
}

// --- Grid definition -------------------------------------------------
// Every dimension here is a constant that actually exists in score.ts's
// ScoreConstants (see DEFAULT_SCORE_CONSTANTS) — nothing invented. Two
// groups (the composite score weights, and the archetype-bias pair) are
// swept as named PROFILES rather than independently, both because they're
// semantically one decision each and to keep the grid bounded.
//
// T23: two new dimensions (affinityWeight, pairSynergyWeight) join the
// sweep, and weightsProfile gains two "heavier" usage/win-rate options per
// the user's explicit request. Sweeping all seven dimensions as one
// cross product (3*3*3*5*3*3*3 = 3645) would blow the ticket's ~1500-combo
// bound, so this is a coarse-then-fine two-stage sweep instead (see main()):
// stage 1 is exactly the T19 grid shape (405 combos, affinity/pairSynergy
// held at 0 = no effect) to pick the base profile; stage 2 fixes that
// winner and sweeps affinityWeight x pairSynergyWeight (9 combos) on top of
// it. Total: 414 combos.
const GRID = {
  confidenceK: [50, 25, 75],
  highBadgeMinSample: [100, 50, 150],
  highBadgeWeight: [0.75, 0.6, 0.9],
  weightsProfile: [
    { name: 'default', winWeight: 0.35, useWeight: 0.25, valueWeight: 0.25, biasWeight: 0.15 },
    { name: 'winHeavy', winWeight: 0.45, useWeight: 0.2, valueWeight: 0.2, biasWeight: 0.15 },
    { name: 'useHeavy', winWeight: 0.3, useWeight: 0.35, valueWeight: 0.2, biasWeight: 0.15 },
    // T23 "heavier usage/win-rate" options: usage+win rate together carry
    // 80% of the composite, value/bias squeezed to a thin tie-break each.
    { name: 'winUseHeavy', winWeight: 0.4, useWeight: 0.4, valueWeight: 0.1, biasWeight: 0.1 },
    { name: 'useMax', winWeight: 0.3, useWeight: 0.5, valueWeight: 0.1, biasWeight: 0.1 },
  ],
  archetypeBiasProfile: [
    { name: 'default', vitalityBias: 0.6, offArchetypeBias: 0.2 },
    { name: 'looser', vitalityBias: 0.7, offArchetypeBias: 0.3 },
    { name: 'tighter', vitalityBias: 0.5, offArchetypeBias: 0.1 },
  ],
  // T23: hero-affinity multiplier and item-pair synergy bonus strengths —
  // swept in stage 2 only (see comment above).
  affinityWeight: [0, 0.15, 0.3],
  pairSynergyWeight: [0, 0.1, 0.2],
}
// Canonical parameter order for tie-breaking (also the grid's own key
// order above) and each dimension's baseline (index 0 in every list above
// is deliberately the current DEFAULT_SCORE_CONSTANTS value).
const DIMENSION_ORDER = ['confidenceK', 'highBadgeMinSample', 'highBadgeWeight', 'weightsProfile', 'archetypeBiasProfile']

function* enumerateCombos() {
  for (const confidenceK of GRID.confidenceK) {
    for (const highBadgeMinSample of GRID.highBadgeMinSample) {
      for (const highBadgeWeight of GRID.highBadgeWeight) {
        for (const weightsProfile of GRID.weightsProfile) {
          for (const archetypeBiasProfile of GRID.archetypeBiasProfile) {
            yield { confidenceK, highBadgeMinSample, highBadgeWeight, weightsProfile, archetypeBiasProfile }
          }
        }
      }
    }
  }
}

function comboToConstants(combo, defaults) {
  return {
    ...defaults,
    confidenceK: combo.confidenceK,
    highBadgeMinSample: combo.highBadgeMinSample,
    highBadgeWeight: combo.highBadgeWeight,
    winWeight: combo.weightsProfile.winWeight,
    useWeight: combo.weightsProfile.useWeight,
    valueWeight: combo.weightsProfile.valueWeight,
    biasWeight: combo.weightsProfile.biasWeight,
    vitalityBias: combo.archetypeBiasProfile.vitalityBias,
    offArchetypeBias: combo.archetypeBiasProfile.offArchetypeBias,
  }
}

// Number of dimensions in `combo` that differ from the grid's baseline
// (index 0 of every dimension's candidate list) — used as the primary
// tie-break so the winner stays close to the hand-derived defaults when
// several combos tie on agreement.
function changesFromBaseline(combo) {
  let changes = 0
  if (combo.confidenceK !== GRID.confidenceK[0]) changes++
  if (combo.highBadgeMinSample !== GRID.highBadgeMinSample[0]) changes++
  if (combo.highBadgeWeight !== GRID.highBadgeWeight[0]) changes++
  if (combo.weightsProfile.name !== GRID.weightsProfile[0].name) changes++
  if (combo.archetypeBiasProfile.name !== GRID.archetypeBiasProfile[0].name) changes++
  return changes
}

// Lexicographic order over DIMENSION_ORDER, comparing each dimension's
// index within its own candidate list (so it's a total order independent
// of the raw numeric/profile values).
function lexicographicKey(combo) {
  return DIMENSION_ORDER.map((dim) => {
    if (dim === 'weightsProfile') return GRID.weightsProfile.findIndex((p) => p.name === combo.weightsProfile.name)
    if (dim === 'archetypeBiasProfile') return GRID.archetypeBiasProfile.findIndex((p) => p.name === combo.archetypeBiasProfile.name)
    return GRID[dim].indexOf(combo[dim])
  })
}

function compareLexicographic(a, b) {
  const ka = lexicographicKey(a)
  const kb = lexicographicKey(b)
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i]
  }
  return 0
}

// Better = higher agreement; tie -> fewer changes from baseline; tie ->
// lexicographically earlier combo. Returns true if `a` should be preferred
// over the current best `b`.
function isBetter(a, b) {
  if (a.agreement !== b.agreement) return a.agreement > b.agreement
  const changesA = changesFromBaseline(a.combo)
  const changesB = changesFromBaseline(b.combo)
  if (changesA !== changesB) return changesA < changesB
  return compareLexicographic(a.combo, b.combo) < 0
}

// Stage 2 (T23): sweeps only affinityWeight x pairSynergyWeight, holding
// everything else at stage 1's winning constants.
function* enumerateAffinityCombos() {
  for (const affinityWeight of GRID.affinityWeight) {
    for (const pairSynergyWeight of GRID.pairSynergyWeight) {
      yield { affinityWeight, pairSynergyWeight }
    }
  }
}

function isBetterStage2(a, b) {
  if (a.agreement !== b.agreement) return a.agreement > b.agreement
  const changesA = (a.combo.affinityWeight !== GRID.affinityWeight[0] ? 1 : 0) + (a.combo.pairSynergyWeight !== GRID.pairSynergyWeight[0] ? 1 : 0)
  const changesB = (b.combo.affinityWeight !== GRID.affinityWeight[0] ? 1 : 0) + (b.combo.pairSynergyWeight !== GRID.pairSynergyWeight[0] ? 1 : 0)
  if (changesA !== changesB) return changesA < changesB
  const ka = [GRID.affinityWeight.indexOf(a.combo.affinityWeight), GRID.pairSynergyWeight.indexOf(a.combo.pairSynergyWeight)]
  const kb = [GRID.affinityWeight.indexOf(b.combo.affinityWeight), GRID.pairSynergyWeight.indexOf(b.combo.pairSynergyWeight)]
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i]
  }
  return 0
}

function sanityCheckAllHeroes(heroes, items, analyticsByHeroId, generateBuilds, buildItemChainGroups, constants) {
  const chainGroups = buildItemChainGroups(items)
  for (const hero of heroes) {
    const analytics = analyticsByHeroId.get(hero.id)
    if (!analytics) continue
    const build = generateBuilds(hero, items, analytics, constants)
    if (build.items.length < 12) return { ok: false, reason: `${hero.name}: only ${build.items.length} items` }
    const namedAbilityIds = new Set(build.ability_order.map((step) => step.ability_id))
    if (namedAbilityIds.size !== 4) return { ok: false, reason: `${hero.name}: ${namedAbilityIds.size} abilities, want 4` }
    const seen = new Set()
    for (const entry of build.items) {
      if (seen.has(entry.item_id)) return { ok: false, reason: `${hero.name}: duplicate item ${entry.item_id}` }
      seen.add(entry.item_id)
      const chain = chainGroups.get(entry.item_id)
      if (chain) {
        for (const chainMate of chain) {
          if (chainMate !== entry.item_id && seen.has(chainMate)) {
            return { ok: false, reason: `${hero.name}: chain-mates ${entry.item_id} and ${chainMate} both picked` }
          }
        }
      }
    }
  }
  return { ok: true }
}

async function main() {
  const { generateBuilds, DEFAULT_SCORE_CONSTANTS, buildItemChainGroups, validateBuildAgainstMatches } = await buildEntry()

  const heroes = readJson('heroes.json')
  const items = readJson('items.json')
  const infernus = heroes.find((h) => h.name === 'Infernus')
  if (!infernus) throw new Error('Infernus not found in heroes.json')
  const infernusAnalytics = readJson('analytics', `hero-${infernus.id}.json`)
  const zergMatches = readJson('zergggy', 'matches.json')
  const analyticsByHeroId = new Map(heroes.map((h) => [h.id, readJson('analytics', `hero-${h.id}.json`)]))

  const baselineConstants = DEFAULT_SCORE_CONSTANTS
  const baselineBuild = generateBuilds(infernus, items, infernusAnalytics, baselineConstants)
  const baselineAgreement = validateBuildAgainstMatches(baselineBuild, zergMatches).agreement_percent

  let combosSearched = 0
  const results = []
  for (const combo of enumerateCombos()) {
    combosSearched++
    const constants = comboToConstants(combo, baselineConstants)
    const build_ = generateBuilds(infernus, items, infernusAnalytics, constants)
    const agreement = validateBuildAgainstMatches(build_, zergMatches).agreement_percent
    results.push({ combo, constants, agreement })
  }

  results.sort((a, b) => (isBetter(a, b) ? -1 : isBetter(b, a) ? 1 : 0))

  let winner = null
  for (const candidate of results) {
    const sanity = sanityCheckAllHeroes(heroes, items, analyticsByHeroId, generateBuilds, buildItemChainGroups, candidate.constants)
    if (sanity.ok) {
      winner = candidate
      break
    }
    console.warn(`Skipping combo (failed sanity: ${sanity.reason})`)
  }
  if (!winner) throw new Error('No combo in the grid passed the sanity floor')

  // Stage 2 (T23): fix stage 1's winning base constants, sweep the new
  // affinity/pair-synergy dimensions on top of it.
  const stage1Constants = winner.constants
  let stage2CombosSearched = 0
  const stage2Results = []
  for (const combo of enumerateAffinityCombos()) {
    stage2CombosSearched++
    const constants = { ...stage1Constants, affinityWeight: combo.affinityWeight, pairSynergyWeight: combo.pairSynergyWeight }
    const build_ = generateBuilds(infernus, items, infernusAnalytics, constants)
    const agreement = validateBuildAgainstMatches(build_, zergMatches).agreement_percent
    stage2Results.push({ combo, constants, agreement })
  }
  stage2Results.sort((a, b) => (isBetterStage2(a, b) ? -1 : isBetterStage2(b, a) ? 1 : 0))

  let stage2Winner = null
  for (const candidate of stage2Results) {
    const sanity = sanityCheckAllHeroes(heroes, items, analyticsByHeroId, generateBuilds, buildItemChainGroups, candidate.constants)
    if (sanity.ok) {
      stage2Winner = candidate
      break
    }
    console.warn(`Skipping stage-2 combo (failed sanity: ${sanity.reason})`)
  }
  if (!stage2Winner) throw new Error('No stage-2 combo passed the sanity floor')

  const totalCombosSearched = combosSearched + stage2CombosSearched

  console.log('--- T19/T23 tuning sweep ---')
  console.log(`Stage 1 grid: ${combosSearched} combos over dimensions ${JSON.stringify(DIMENSION_ORDER)}`)
  console.log(`Stage 2 grid: ${stage2CombosSearched} combos over dimensions ["affinityWeight","pairSynergyWeight"]`)
  console.log(`Total combos searched: ${totalCombosSearched}`)
  console.log(`Baseline (current DEFAULT_SCORE_CONSTANTS) agreement: ${baselineAgreement}%`)
  console.log(`Stage 1 winning agreement: ${winner.agreement}% (changes from baseline: ${changesFromBaseline(winner.combo)})`)
  console.log(`Stage 2 winning agreement: ${stage2Winner.agreement}% (affinityWeight=${stage2Winner.combo.affinityWeight}, pairSynergyWeight=${stage2Winner.combo.pairSynergyWeight})`)
  console.log('Winning constants:')
  console.log(JSON.stringify(stage2Winner.constants, null, 2))
  if (stage2Winner.agreement < baselineAgreement) {
    console.warn('WARNING: winning agreement is below baseline — grid found no improvement; keeping current constants.')
  }

  rmSync(TMP_DIR, { recursive: true, force: true })
}

main().catch((err) => {
  rmSync(TMP_DIR, { recursive: true, force: true })
  console.error(err)
  process.exit(1)
})
