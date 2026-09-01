# GOALS — Deadlock Build Optimizer

## Standing rules (every fire reads this first)
- USAGE-LOG WAIVER (user decision 2026-09-01T07:55Z): the Stop hook lands no `usage-log:` commits from the cloud sandbox (HOME-guard mismatch). The user explicitly waived the halt rule — NEVER halt, disable, or park the routine over missing usage-log commits. `scripts/log-usage.sh`, `.claude/settings.json`, `.usage-log/` still must never be modified.
- SANDBOX EGRESS: cloud fires CANNOT reach `api.deadlock-api.com` or `assets.deadlock-api.com` (org proxy rejects CONNECT, 403). Never attempt live API fetches in a fire, and never fabricate data. All real fetching is done LOCALLY by the orchestrator (T2b). Fires build code + tests that work offline against committed snapshots or small fixtures; a ticket blocked on missing snapshots gets skipped with a one-line PROGRESS.md note.
- ROUTINE: trigger id `trig_01QxmDBRdwQgKUHKsTf8ZNXg` · cron `13 * * * *` (hourly — 1h is the platform minimum; orchestrator eager-fires extra runs between ticks) · repo https://github.com/Gidntsquia/deadlock-build-optimizer-r02 · runs visible via claude.ai Code routines (RemoteTrigger list_runs with the trigger id)
- PACE: full (user 2026-09-01T18:05Z, budget healthy): finish your ticket, then KEEP TAKING the next unchecked ticket in the same fire while run budget remains — gates verified per ticket, one commit+archive move per ticket. Stop only when budget is genuinely low or the queue is empty.
- GATES — all must pass before checking any box: `npm run build` · `npm test` · `npm run gate:heldout` (required whenever src/ changed). Code review alone is not verification.
- HELD-OUT RULE (redesigned by user 2026-09-01T19:07Z): **Zergggy is now the TUNING set** — tuning generator constants to raise Zergggy-Infernus agreement is allowed and expected (T19). **`public/data/heldout-ctc/` (player ctc, Drifter) is the new HELD-OUT test set**: only `src/validation/` may read it, NOTHING may ever be tuned toward its agreement number — it is measured and reported, full stop. Mechanical isolation unchanged for both: nothing under `src/generator/` may read, import, or reference `public/data/zergggy/` or `public/data/heldout-ctc/` (nor contain the strings "zergggy"/"heldout-ctc" — gate:heldout now checks both); tuned constants land in the generator as plain numbers, the tuning harness lives outside `src/generator/`.
- DATA: snapshots are committed under `public/data/`; the app reads ONLY snapshots (fully offline after fetch). Keep total snapshot size < 15 MB by pruning fields. fetch-data politeness: sequential requests, ≥300 ms sleep between calls, one retry after 5 s on HTTP 429.
- Checking a box: move the finished ticket block VERBATIM to GOALS_ARCHIVE.md in the same commit.
- Prefer zero runtime deps beyond react/react-dom; log any addition in PROGRESS.md with a reason.
- Do not grep or read `public/data/` wholesale (large JSON); never modify `scripts/log-usage.sh` or `.usage-log/`.

## Open tickets

- [ ] **T21 — Ability Point Order panel: no scrollbar, full-width row bars (user bug report 2026-09-01)**
  - User dislikes the horizontal scrollbar on the ability panel, and scrolling reveals the navy row bars stop short of the content's full width.
  - Goal: at 390×844 the whole ~15-column sequence FITS inside the panel with no horizontal scrollbar — shrink the per-column width/markers/tiles as needed (columns can go ~20px; unlock diamonds and AP pills scale down; ability icon tiles may shrink or the label column narrows). Do not clip or drop steps, do not reintroduce page-level scroll.
  - Row-bar bug (fix regardless): each `--row-navy` bar must span the panel content's full scrollable width, not just the visible viewport (size backgrounds on the scroll-content element, e.g. width: max-content/min-width: 100% on the row, not the scroll container). If any viewport still overflows (very long sequences, narrow desktop windows), bars must extend to the end of the scrolled content.
  - Files: `src/components/AbilityOrderPanel.tsx` + its styles, `src/test/app.test.tsx`, `e2e/mobile.spec.ts`.
  - Acceptance: (1) e2e at 390×844: ability panel `scrollWidth <= clientWidth` (no horizontal overflow) with a full 15-step sequence; (2) all 15 steps present in the DOM; (3) jsdom or e2e check that row bars are laid out on the full-width content element (assert the CSS structure); (4) all suites green.
  - Verify: `npm run build` · `npm test` · `npm run gate:heldout` · `npm run test:e2e`.


- [ ] **T23 — synergy + affinity scoring, heavier usage/win-rate weighting, full re-tune (user request 2026-09-01T20:04Z: "agreement still far too low; factor in item usage and win rates more; consider character play styles and items that synergize with their abilities")**
  - Data (committed by orchestrator 2026-09-01): each `analytics/hero-N.json` gains `item_pair_stats` — top 200 Phantom+ item PAIRS by matches, `{ items: [idA, idB], wins, matches }` — which items win TOGETHER on this hero. `items.json` gains `roster_usage_share: number|null` — the roster-average usage share for the item (this hero's own share ÷ roster share = how much the item over-indexes on this hero's kit; that ratio IS the empirical play-style/ability-synergy signal).
  - Three additions to `src/generator/score.ts`, all behind `ScoreConstants` so the sweep can tune them:
    1. **Heavier usage/win-rate**: extend the tuning grid's weight profiles with options that weight usage and win rate substantially higher than the current defaults — the user asked for this explicitly; let the sweep confirm how far to push.
    2. **Hero-affinity multiplier**: `affinity = clamp(heroUsageShare / max(roster_usage_share, 0.01), 0.5, 3)`; `score *= 1 + affinityWeight * (affinity - 1)`; grid `affinityWeight ∈ {0, 0.15, 0.3}`.
    3. **Pair synergy in build assembly**: when picking the next item, bonus = `pairSynergyWeight * mean(lift(picked, candidate))` where lift = pair win rate − hero average win rate, damped toward 0 by pair matches (shrink-to-mean K, reuse the existing damping helper), 0 for unseen pairs; grid `pairSynergyWeight ∈ {0, 0.1, 0.2}`. Deterministic (stable tie-breaks unchanged).
  - Types/loaders: add the two fields where the Item/HeroAnalytics types live; loaders are generic passthrough.
  - Re-run `npm run tune` with the expanded grid. Keep the search bounded (≤ ~1500 combos; coarse-then-fine two-stage is fine if runtime demands). Apply the argmax (same deterministic ties + sanity floor as T19).
  - HARD LIMITS: never read/reference `public/data/heldout-ctc/`; gate:heldout green; determinism + T18 chain rules + T13 single-build all hold.
  - Acceptance: (1) tuned Zergggy agreement ≥ the current 46%, both numbers in PROGRESS.md with the winning constants and grid size; (2) fixture tests for affinity multiplier and pair-synergy bonus (including the damped/unseen-pair zero case); (3) all suites + gates green.
  - Verify: `npm run build` · `npm test` · `npm run gate:heldout` · `npm run test:e2e`.
