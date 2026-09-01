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
