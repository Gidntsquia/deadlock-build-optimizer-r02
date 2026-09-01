# GOALS — Deadlock Build Optimizer

## Standing rules (every fire reads this first)
- ⛔ ROUTINE DISABLED 2026-09-01T07:43Z (mandatory token-accounting rule): the Phase 1.5 test fire landed no `usage-log:` commit — Stop hook produced no `.usage-log/` output in the cloud sandbox. Do not re-enable until the user resolves the hook problem (see PROGRESS.md 07:50Z entry).
- ROUTINE: trigger id `trig_01QxmDBRdwQgKUHKsTf8ZNXg` · cron `13 * * * *` (hourly) · repo https://github.com/Gidntsquia/deadlock-build-optimizer-r02 · runs visible via claude.ai Code routines (RemoteTrigger list_runs with the trigger id)
- GATES — all must pass before checking any box: `npm run build` · `npm test` · `npm run gate:heldout` (required whenever src/ changed). Code review alone is not verification.
- HELD-OUT RULE (experiment integrity): nothing under `src/generator/` may read, import, or reference any file under `public/data/zergggy/` — nor contain the string "zergggy" at all. Only `src/validation/` may read that data. Never tune generator weights to raise the Zergggy agreement score; a low score is a finding, not a bug.
- DATA: snapshots are committed under `public/data/`; the app reads ONLY snapshots (fully offline after fetch). Keep total snapshot size < 15 MB by pruning fields. fetch-data politeness: sequential requests, ≥300 ms sleep between calls, one retry after 5 s on HTTP 429.
- Checking a box: move the finished ticket block VERBATIM to GOALS_ARCHIVE.md in the same commit.
- Prefer zero runtime deps beyond react/react-dom; log any addition in PROGRESS.md with a reason.
- Do not grep or read `public/data/` wholesale (large JSON); never modify `scripts/log-usage.sh` or `.usage-log/`.

## Open tickets

- [ ] **T2 — Data pipeline (`npm run fetch-data`)**
  Goal: scripts/fetch-data.mjs snapshots everything the app needs into public/data/, pruned, and the snapshots get committed.
  Files: scripts/fetch-data.mjs, public/data/** (generated), src/test/snapshots.test.ts.
  Outputs:
  - `public/data/items.json` — all upgrade items from `https://assets.deadlock-api.com/v2/items/by-type/upgrade`: id, class_name, name, cost, item_tier, item_slot_type, image webp URL, and the properties/tooltip fields needed for the detail card (stat lines + active/passive descriptions). ≥200 shopable items.
  - `public/data/heroes.json` — ACTIVE heroes only (exclude disabled/in-development): id, name, card image URL, base stats + per-level stat growth, and the hero's 4 ability ids + real names.
  - `public/data/analytics/hero-<id>.json` — for EVERY active hero: item-stats and ability-order-stats from `https://api.deadlock-api.com/v1/analytics/...?hero_id=N`, pruned to scoring fields (item_id, wins, matches/usage; ability sequences with wins/matches).
  - `public/data/analytics/infernus-permutations.json` — item-permutation-stats for hero_id 1 only (budget decision; other heroes go without).
  - `public/data/personal/matches.json` — account 267836488 match history, standard matchmaking modes only, pruned to hero_id, won/lost, duration seconds, start_time.
  - `public/data/zergggy/matches.json` — VALIDATION ONLY. Account 35187362: Infernus (hero_id 1) real matchmaking matches (exclude private lobby / bot modes), newest ~30; fetch each match's `/v1/matches/{id}/metadata` and prune to match_id, won, and Zergggy's item purchases as [{item_id, game_time_s}]. ≥20 matches with purchase data required.
  - `public/data/meta.json` — fetched_at + counts.
  Acceptance: script is rerunnable; src/test/snapshots.test.ts asserts the counts/required fields above against the committed snapshots; `du -sh public/data` < 15 MB; snapshots committed in the same push.
  Verify: `node scripts/fetch-data.mjs && npm test`

- [ ] **T3 — Deterministic build generator**
  Goal: src/generator/ produces ≥2 named builds for ANY active hero from aggregate snapshots only.
  Files: src/generator/**, src/test/generator.test.ts, scripts/gate-heldout.mjs (real implementation).
  Spec: a documented, deterministic scoring function (stable tie-breaks by item id). Inputs: items.json, heroes.json, analytics/hero-<id>.json, infernus-permutations.json when present — NEVER zergggy data. Score items on: win rate with confidence damping by sample size (shrink toward the hero mean), usage rate, stat value per soul, tier/soul thresholds by game phase (early/mid/late budgets), per-build archetype weight profiles derived from the hero's scaling stats in heroes.json (Infernus: gun/fire-rate archetype vs spirit/afterburn archetype), and an active/passive balance cap. Output per build: name, ordered buy list of ≥12 items grouped early/mid/late with per-item cost + running soul total, plus ability level-up sequence (unlock order + tier-upgrade order) for the hero's 4 real abilities driven by ability-order-stats (deterministic sensible fallback when a hero lacks data).
  Acceptance: generator.test.ts asserts — two runs on the same snapshot are deep-equal; Infernus + ≥3 other heroes each yield ≥2 builds, ≥12 items, nondecreasing running totals, 4 named abilities; gate:heldout greps src/generator for "zergggy" (case-insensitive) and fails on any hit.
  Verify: `npm test && npm run gate:heldout`

- [ ] **T4 — Held-out validation + personalization**
  Goal: src/validation/ scores generated builds against Zergggy's core set; src/personalization/ computes one displayed insight.
  Files: src/validation/**, src/personalization/**, src/test/validation.test.ts.
  Spec: core set = items appearing in ≥30% of his sampled matches, win-weighted (each match weight: win 1.5, loss 1.0 — document exact formula in README); items below threshold are "experiments", excluded entirely. Per generated build: per-item core/not-core flag + agreement % in [0,100] = weighted blend of core-set overlap and buy-order agreement (pairwise order concordance on shared items) — document the formula. Personalization: median standard-match duration for account 267836488 → an annotation shaping/labeling the late-game budget line. Frame all validation output as "how well the generator did", never as a build source.
  Acceptance: validation.test.ts covers core-set math on a small fixture, agreement bounds, and experiments exclusion; only src/validation/ reads zergggy paths.
  Verify: `npm test && npm run gate:heldout`

- [ ] **T5 — Mobile-first interactive UI**
  Goal: the full app per spec, designed at 390×844.
  Files: src/App.tsx, src/components/**, styles.
  Spec: hero picker (all active heroes, Infernus default); per build: name, buy list grouped early/mid/late with cost + running soul total, item rows with shop image + Zergggy core/not-core badge and per-build agreement % (validation shown for Infernus; other heroes render builds without the validation report); ability level-up sequence with real ability names; tapping any item opens a detail card (image, cost, tier, slot type, stat lines, active/passive text from snapshot tooltip data); personalization insight line. No horizontal scroll at 390px; tap targets ≥40 px; desktop = centered column (~max-width 480px).
  Acceptance: jsdom tests boot the real `<App/>`: Infernus default with ≥2 builds of ≥12 items; tapping an item shows its detail card with cost/tier/slot; selecting 3 other heroes renders builds + ability orders without errors; badges and agreement % present for Infernus.
  Verify: `npm run build && npm test`

- [ ] **T6 — Real-browser verification pass**
  Goal: verify what jsdom structurally can't see.
  Files: e2e/** (Playwright) or documented audit in PROGRESS.md.
  Spec: try installing Playwright + chromium in this sandbox. If it installs: at 390×844 assert no horizontal overflow (scrollWidth ≤ 390) on the main screen, an open detail card, and a non-Infernus hero; spot-check tap-target boxes ≥40 px. If browsers can't install, do a targeted CSS audit (fixed widths, overflow-x) and record "unverified in real browser" honestly. Also: production `npm run build` + preview smoke — app must not crash with network disabled (item images may 404; that's acceptable offline).
  Verify: `npx playwright test` if installed, else the documented audit; `npm run build`

- [ ] **T7 — README + acceptance sweep**
  Goal: README.md documenting everything; final walk of the acceptance checklist in ROADMAP.md.
  Files: README.md.
  Spec: run instructions (`npm install`, `npm run fetch-data`, `npm run dev`); scoring-function inputs and exact weights + determinism statement; the ≥30% win-weighted core-set rule with experiments excluded; held-out design (generator never reads Zergggy — grep gate); every judgment call so far (pull from PROGRESS.md Decisions); parked/unverified items.
  Acceptance: README covers all of the above; all gates green; every box in ROADMAP.md's acceptance checklist verified or explicitly listed as failed/unverified — fix failures before checking this ticket.
  Verify: `npm run build && npm test && npm run gate:heldout`
