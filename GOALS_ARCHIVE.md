# GOALS ARCHIVE — finished ticket blocks, verbatim, newest last

- [x] **T1 — App scaffold + toolchain**
  Goal: Vite + React 18 + TypeScript scaffold that builds and tests clean.
  Files: package.json, vite.config.ts, tsconfig*.json, index.html, src/main.tsx, src/App.tsx, src/test/smoke.test.tsx, scripts/gate-heldout.mjs (stub), scripts/fetch-data.mjs (stub).
  Do FIRST — API probe from this sandbox, result recorded in PROGRESS.md:
  `curl -s -o /dev/null -w "%{http_code}" "https://api.deadlock-api.com/v1/analytics/item-stats?hero_id=1"` and `curl -s -o /dev/null -w "%{http_code}" "https://assets.deadlock-api.com/v2/heroes"`. If either is unreachable, say so LOUDLY in PROGRESS.md — T2 depends on it.
  Acceptance: `npm install` clean on Node ≥20; `npm run build` succeeds; `npm test` runs a jsdom smoke test mounting `<App/>` (vitest + jsdom + @testing-library/react); `npm run gate:heldout` exists (trivially passes while src/generator is empty); `npm run fetch-data` exists as stub exiting 1 with "not implemented".
  Verify: `npm run build && npm test && npm run gate:heldout`

- [x] **T2a — Data pipeline script (`npm run fetch-data`) — code only, no network**
  Goal: fully implement scripts/fetch-data.mjs per the Outputs list below, plus src/test/snapshots.test.ts. The sandbox cannot reach the APIs (see SANDBOX EGRESS above) — do NOT run the real fetch; the orchestrator runs it locally in T2b.
  Files: scripts/fetch-data.mjs, src/test/snapshots.test.ts.
  Requirements: rerunnable; sequential requests with ≥300 ms sleep; one retry after 5 s on HTTP 429; prune fields per the Outputs list; write `public/data/meta.json` last (fetched_at + counts). snapshots.test.ts asserts the counts/required fields below against committed snapshots, but SKIPS cleanly (vitest skipIf) when `public/data/meta.json` is absent.
  Acceptance: `node --check scripts/fetch-data.mjs` clean; gates green with snapshots absent (tests skip, not fail). Real-data verification happens in T2b.
  Verify: `node --check scripts/fetch-data.mjs && npm run build && npm test && npm run gate:heldout`
  Outputs:
  - `public/data/items.json` — all upgrade items from `https://assets.deadlock-api.com/v2/items/by-type/upgrade`: id, class_name, name, cost, item_tier, item_slot_type, image webp URL, and the properties/tooltip fields needed for the detail card (stat lines + active/passive descriptions). ≥200 shopable items.
  - `public/data/heroes.json` — ACTIVE heroes only (exclude disabled/in-development): id, name, card image URL, base stats + per-level stat growth, and the hero's 4 ability ids + real names.
  - `public/data/analytics/hero-<id>.json` — for EVERY active hero: item-stats and ability-order-stats from `https://api.deadlock-api.com/v1/analytics/...?hero_id=N`, pruned to scoring fields (item_id, wins, matches/usage; ability sequences with wins/matches).
  - `public/data/analytics/infernus-permutations.json` — item-permutation-stats for hero_id 1 only (budget decision; other heroes go without).
  - `public/data/personal/matches.json` — account 267836488 match history, standard matchmaking modes only, pruned to hero_id, won/lost, duration seconds, start_time.
  - `public/data/zergggy/matches.json` — VALIDATION ONLY. Account 35187362: Infernus (hero_id 1) real matchmaking matches (exclude private lobby / bot modes), newest ~30; fetch each match's `/v1/matches/{id}/metadata` and prune to match_id, won, and Zergggy's item purchases as [{item_id, game_time_s}]. ≥20 matches with purchase data required.
  - `public/data/meta.json` — fetched_at + counts.
  Notes (judgment calls, unverified from this sandbox): exact upstream JSON field names for items/heroes/analytics/match endpoints are not confirmed here (no egress) — pruning uses defensive multi-key fallback (`firstDefined`) and is expected to need a spot-check/adjustment pass against real payloads when T2b runs the fetch for real.

- [x] **T2b — Run the fetch + commit snapshots — ORCHESTRATOR ONLY, fires must SKIP this ticket** (it needs API access the sandbox doesn't have; skip silently, no PROGRESS note needed, and take the next unchecked ticket)
  Goal: orchestrator runs `node scripts/fetch-data.mjs` on the local machine, verifies, commits `public/data/**`.
  Acceptance: snapshots.test.ts passes with data present; `du -sh public/data` < 15 MB; snapshots committed and pushed.
  Verify: `node scripts/fetch-data.mjs && npm test`

- [x] **T3 — Deterministic build generator** (needs T2b's committed snapshots for its tests; if `public/data/meta.json` is absent, skip to T4 — its tests are fixture-based)
  Goal: src/generator/ produces ≥2 named builds for ANY active hero from aggregate snapshots only.
  Files: src/generator/**, src/test/generator.test.ts, scripts/gate-heldout.mjs (real implementation).
  Spec: a documented, deterministic scoring function (stable tie-breaks by item id). Inputs: items.json, heroes.json, analytics/hero-<id>.json, infernus-permutations.json when present — NEVER zergggy data. Score items on: win rate with confidence damping by sample size (shrink toward the hero mean), usage rate, stat value per soul, tier/soul thresholds by game phase (early/mid/late budgets), per-build archetype weight profiles derived from the hero's scaling stats in heroes.json (Infernus: gun/fire-rate archetype vs spirit/afterburn archetype), and an active/passive balance cap. Output per build: name, ordered buy list of ≥12 items grouped early/mid/late with per-item cost + running soul total, plus ability level-up sequence (unlock order + tier-upgrade order) for the hero's 4 real abilities driven by ability-order-stats (deterministic sensible fallback when a hero lacks data).
  Acceptance: generator.test.ts asserts — two runs on the same snapshot are deep-equal; Infernus + ≥3 other heroes each yield ≥2 builds, ≥12 items, nondecreasing running totals, 4 named abilities; gate:heldout greps src/generator for "zergggy" (case-insensitive) and fails on any hit.
  Verify: `npm test && npm run gate:heldout`
  DATA-GAP JUDGMENT CALLS (see PROGRESS.md 2026-09-01 entry for detail): every hero's `heroes.json.base_stats` came back structurally identical (a T2 field-mapping gap — `starting_stats`/`level_scaling` don't carry real per-hero values from this API), so archetype weighting uses item `item_slot_type` (weapon/spirit) + a `vitality` mid-bonus instead of hero scaling stats. Every `analytics/hero-<id>.json` row's `ability_order_stats[].sequence` is null (same kind of gap), so the ability level-up sequence always uses the spec's documented fallback (unlock 1-4, then upgrade round-robin ×2) rather than real per-hero order. `active_description`/`passive_description` are null for all 251 items, so the active/passive split for the balance cap uses a stat-line heuristic (nonzero `AbilityCooldown`) instead. None of this touches src/generator's zergggy-free guarantee; all three are flagged for an orchestrator follow-up on scripts/fetch-data.mjs field names if a future ticket wants the real data.

- [x] **T4 — Held-out validation + personalization**
  Goal: src/validation/ scores generated builds against Zergggy's core set; src/personalization/ computes one displayed insight.
  Files: src/validation/**, src/personalization/**, src/test/validation.test.ts.
  Spec: core set = items appearing in ≥30% of his sampled matches, win-weighted (each match weight: win 1.5, loss 1.0 — document exact formula in README); items below threshold are "experiments", excluded entirely. Per generated build: per-item core/not-core flag + agreement % in [0,100] = weighted blend of core-set overlap and buy-order agreement (pairwise order concordance on shared items) — document the formula. Personalization: median standard-match duration for account 267836488 → an annotation shaping/labeling the late-game budget line. Frame all validation output as "how well the generator did", never as a build source.
  Acceptance: validation.test.ts covers core-set math on a small fixture, agreement bounds, and experiments exclusion; only src/validation/ reads zergggy paths.
  Verify: `npm test && npm run gate:heldout`
  Formulas (README still owes the polished writeup — T7): `coreSetShare(item) = (Σ matchWeight(m) for matches m containing item) / (Σ matchWeight(m) over all sampled matches)`, matchWeight = 1.5 if won else 1.0, threshold 0.30 inclusive. `agreement% = round(100 * (0.6 * coreSetOverlap + 0.4 * buyOrderAgreement))`, clamped [0,100], where coreSetOverlap = |build items in core set| / |core set|, and buyOrderAgreement is the win-weighted pairwise concordance (per src/validation/orderPreferences.ts) of the build's shared core-set items against Zergggy's majority buy order, defaulting to 0.5 (neutral) for a pair/build with no signal.
  JUDGMENT CALL: "only src/validation/ reads zergggy paths" is scoped to production modules — src/test/ is exempt since snapshots.test.ts (T2a) already asserts the zergggy snapshot's own shape, which is data-integrity testing, not generator/scoring logic; see src/test/validation.test.ts's held-out isolation test for the exact boundary.
