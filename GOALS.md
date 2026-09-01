# GOALS — Deadlock Build Optimizer

## Standing rules (every fire reads this first)
- USAGE-LOG WAIVER (user decision 2026-09-01T07:55Z): the Stop hook lands no `usage-log:` commits from the cloud sandbox (HOME-guard mismatch). The user explicitly waived the halt rule — NEVER halt, disable, or park the routine over missing usage-log commits. `scripts/log-usage.sh`, `.claude/settings.json`, `.usage-log/` still must never be modified.
- SANDBOX EGRESS: cloud fires CANNOT reach `api.deadlock-api.com` or `assets.deadlock-api.com` (org proxy rejects CONNECT, 403). Never attempt live API fetches in a fire, and never fabricate data. All real fetching is done LOCALLY by the orchestrator (T2b). Fires build code + tests that work offline against committed snapshots or small fixtures; a ticket blocked on missing snapshots gets skipped with a one-line PROGRESS.md note.
- ROUTINE: trigger id `trig_01QxmDBRdwQgKUHKsTf8ZNXg` · cron `13 * * * *` (hourly) · repo https://github.com/Gidntsquia/deadlock-build-optimizer-r02 · runs visible via claude.ai Code routines (RemoteTrigger list_runs with the trigger id)
- GATES — all must pass before checking any box: `npm run build` · `npm test` · `npm run gate:heldout` (required whenever src/ changed). Code review alone is not verification.
- HELD-OUT RULE (experiment integrity): nothing under `src/generator/` may read, import, or reference any file under `public/data/zergggy/` — nor contain the string "zergggy" at all. Only `src/validation/` may read that data. Never tune generator weights to raise the Zergggy agreement score; a low score is a finding, not a bug.
- DATA: snapshots are committed under `public/data/`; the app reads ONLY snapshots (fully offline after fetch). Keep total snapshot size < 15 MB by pruning fields. fetch-data politeness: sequential requests, ≥300 ms sleep between calls, one retry after 5 s on HTTP 429.
- Checking a box: move the finished ticket block VERBATIM to GOALS_ARCHIVE.md in the same commit.
- Prefer zero runtime deps beyond react/react-dom; log any addition in PROGRESS.md with a reason.
- Do not grep or read `public/data/` wholesale (large JSON); never modify `scripts/log-usage.sh` or `.usage-log/`.

## Open tickets

- [ ] **T8 — item detail: show only meaningful stats (user request 2026-09-01)**
  - Goal: the item detail sheet stops rendering "a bunch of unneeded 0's" — a stat line renders ONLY if it carries real information: numeric value ≠ 0, or a non-numeric display value with a usable label. Zero-valued lines and "—" placeholders are hidden. If every line is filtered out, hide the Stats section header too.
  - Files: `src/components/ItemDetailSheet.tsx`, `src/test/app.test.tsx` (extend; a small pure helper + unit test is fine if you extract the filter).
  - Acceptance: (1) a real item whose stat_lines include zero values shows only the nonzero ones (find one in the committed snapshot from the test, don't hardcode assumptions); (2) Cost/Tier/Slot rows unaffected; (3) an item with no meaningful lines shows no Stats section; (4) existing detail-sheet tests still pass.
  - Verify: `npm run build` · `npm test` · `npm run gate:heldout` · `npm run test:e2e` (components changed; chromium is preinstalled at `/opt/pw-browsers/chromium`, config already points there).

- [ ] **T9 — weight scoring toward high-elo players (user request 2026-09-01)**
  - Goal: the generator's win-rate and usage components prefer high-elo evidence. Data is ALREADY COMMITTED (orchestrator fetched it locally — do NOT attempt API calls): each `public/data/analytics/hero-N.json` now has `high_badge_item_stats` (same shape as `item_stats`: `{item_id, wins, matches}`) filtered to matches with average badge ≥ 81 (Phantom+; `high_badge_min` field + `meta.json.high_badge_min` record the cutoff). Infernus: 138 high-badge items vs 156 overall, ~1.15M item-match rows.
  - Spec: per item, when its high-badge sample is large enough (matches ≥ a documented MIN_SAMPLE constant, suggest 100), compute win-rate/usage from a blend weighted ≥70% toward the high-badge stats (suggest 0.75/0.25); below MIN_SAMPLE, fall back smoothly to overall stats (a sample-proportional blend is fine — document the exact formula in code + README). Keep the existing confidence damping (shrink-to-hero-mean K=50) applied AFTER blending. Determinism and stable tie-breaks unchanged.
  - HELD-OUT REMINDER: if the Zergggy agreement % moves, record the new number in PROGRESS.md as a finding — do NOT tune the blend to raise it.
  - Files: `src/generator/` (types/score/index), `src/data/loaders.ts` + `src/test/setup.ts` only if the analytics type needs the new field threaded, `src/test/generator.test.ts`, README's formula section.
  - Acceptance: (1) fixture test: an item whose high-elo win rate beats its overall win rate outscores the reverse case when samples are adequate; (2) fixture test: item below MIN_SAMPLE high-badge matches degrades toward overall-only scoring; (3) determinism test still green; (4) all 38 heroes still generate ≥2 builds/≥12 items (existing tests); (5) README documents the blend formula + Phantom+ cutoff.
  - Verify: `npm run build` · `npm test` · `npm run gate:heldout`.

- [ ] **T10 — restyle build display to match Deadlock's in-game build browser (user request 2026-09-01, from a reference screenshot)**
  - Goal: builds render like the in-game build editor. The reference (user-provided screenshot of the real game; fires can't see it — this spec is authoritative):
    - Each game phase is a titled horizontal section panel — "Early Game", "Mid to Late Game" — on a parchment/tan panel (`#b8a98c`-ish, subtle texture ok) over the app's dark background. Map our early→"Early Game", mid+late→"Mid to Late Game" or keep three sections with in-game-style titles — your call, document it. A third lighter-blue-tinted section titled "Testing" with an "OPTIONAL" chip is how the game shows experimental items — if we have leftover/near-miss items available cheaply, use it; otherwise omit (do NOT invent data for it).
    - Item cards: square art tile on top, item name on a small light label strip below. Tile background color by slot category: weapon = amber/orange (~`#d18b21`), vitality = green (~`#7ab82f`), spirit = purple (~`#8c5fc7`). Item image centered on the tile (images come from snapshot URLs; broken/blocked images must degrade to the colored tile + name, never a broken-image icon).
    - Tier badge: a colored corner ribbon folded over the tile's top-right with the tier as a roman numeral (I–IV). Active items get a small "ACTIVE" chip like the game's imbue/active tags.
    - Header stays app-styled (hero picker etc.) — this ticket is the build card grid + section panels, not a full chrome clone. Do not copy game logos/fonts; approximate the look with system fonts + CSS.
  - Mobile-first still rules: at 390×844 sections stack vertically, cards wrap in a grid (~4 per row), tap targets stay ≥40px, no horizontal page scroll. Keep the existing tap-to-open detail sheet, core/experiment badges, and agreement chip working (restyle, don't remove).
  - Files: `src/components/BuildCard.tsx`, `src/components/ItemRow.tsx` (likely becomes an item card), `src/styles.css`, `src/App.tsx` if section grouping moves, `src/test/app.test.tsx`, `e2e/mobile.spec.ts` (update selectors/assertions for the new card layout).
  - Acceptance: (1) phases render as titled section panels with wrapped item-card grids; (2) card shows colored tile by slot type + name label + roman-numeral tier corner; (3) `npm test` app suite green (update assertions to the new DOM); (4) e2e 5/5 at 390×844 incl. no-overflow + ≥40px tap targets + blocked-image-host boot.
  - Verify: `npm run build` · `npm test` · `npm run gate:heldout` · `npm run test:e2e`.
