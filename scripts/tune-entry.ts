// Bundle entry for scripts/tune-generator.mjs (T19). Not part of the app
// build — vite's Node build() API compiles this once into a temp ESM file
// so the harness can call the REAL generator + validation code in-process
// for every grid combo, instead of reimplementing the scoring formula.
export { generateBuilds, DEFAULT_SCORE_CONSTANTS, buildItemChainGroups } from '../src/generator'
export type { ScoreConstants } from '../src/generator'
export { validateBuildAgainstMatches } from '../src/validation'
