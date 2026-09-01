# PROGRESS — newest first, ≤25 lines per entry; past ~1,500 lines rotate all but newest ~10 entries verbatim to PROGRESS_ARCHIVE.md

## 2026-09-01T18:18Z — T13 done: single recommended build per hero
- `generateBuilds` now returns one `Build` instead of `Build[]`. `buildForArchetype` computes both weapon/spirit candidates as before, each now paired with a `totalScore` (sum of its selected items' already-computed composite scores). New `pickBestBuild(candidates)` (pure, exported) picks the higher `totalScore`, ties broken by ascending archetype name then the build's own item-id sequence — generator-internal only, never consults validation/agreement output (held-out rule respected throughout).
- Build.name is now `"<Hero> Build"` (was `"<Hero> Weapon/Spirit Build"`); `BuildCard` shows the winning archetype as a `.build-card__archetype` subtitle ("Weapon build"/"Spirit build"). App.tsx's `builds`/`Map<string, ValidationReport>` state collapsed to `build`/single `ValidationReport | null` (still calls unchanged `validateBuildsAgainstHeldOut([generated])`).
- Updated: generator.test.ts (">=2 builds" → "exactly 1 build"; new `pickBestBuild` fixture tests — higher score wins order-independent; tie breaks to 'spirit'), app.test.tsx + e2e/mobile.spec.ts (`.build-card` count 2→1), validation.test.ts (array destructure → plain assignment), README (generator + UI sections rewritten for the internal-2/exported-1 shape).
- CAUGHT BY OWN GATE: a draft doc comment in index.ts used the literal word the held-out gate greps for — `gate:heldout` correctly failed the build; reworded, no functional issue. Left as a demonstration the gate works.
- Verified: `npm run build` clean; `npx vitest run` 41 passed/2 skipped (was 39/2); `npm run gate:heldout` OK (5 files, zero held-out references); `npx playwright test` 5/5. `node_modules` was missing at fire start (fresh container) — ran `npm ci` first.
- T13 archived to GOALS_ARCHIVE.md. Queue was T13 → T14 → T10 → T11 → T12; next up is T14 (stat_sections tooltip rendering) — data already committed, nothing blocking.

## 2026-09-01T18:06Z — orchestrator: FULL-SPEED mode (user request, budget healthy)
- User: "Make things go faster; we're well under the usage limit." Decision log:
- Tried routine cron `13,43 * * * *` → API rejects sub-1h intervals ("cron interval too short"). Routine stays hourly at :13 (that's the platform floor, not a choice).
- Speed levers instead: (1) PACE: full added to GOALS.md header — fires keep taking tickets in the same run instead of one-per-fire; (2) session backstop retimed from every 2h to `33,44 * * * *` with eager-dispatch: fire an extra run the moment the previous one finishes (never within 25 min of the next :13 tick). Effective throughput ≈2 fires/hour.
- This supersedes the default 2h tick cadence per explicit user authorization; revert to `48 */2 * * *` + drop PACE line if budget tightens.
## 2026-09-01T17:45Z — orchestrator: T14 queued (ghost stats bug) + stat_sections/is_active_item in snapshots
- User bug report: item sheet shows engine-internal "ghost stats" (AbilityUnitTargetLimit, ChannelMoveSpeed, …). Root cause: stat_lines is the raw property bag; the game only displays keys named in tooltip_sections.
- fetch-data.mjs now emits `stat_sections` per item (game's own display definition: per-section labeled stats with prefix/postfix, elevated flags, plain-text descriptions stripped of HTML/SVG) + `is_active_item` (real flag; also closes the old null-descriptions gap). stat_lines UNCHANGED — still the scoring input, so generator behavior is unperturbed. Snapshots refetched + committed, 7.0MB.
- Verified locally: `npm run build` clean, `npm test` 39 passed/2 skipped, `npm run gate:heldout` OK.
- T14 queued after T13 (UI swap to stat_sections). Queue: T13 → T14 → T10 → T11 → T12.
## 2026-09-01T17:24Z — T9 done: high-elo (Phantom+) weighting of win-rate/usage
- `HeroAnalytics` gained `high_badge_item_stats`/`high_badge_min` (already-committed data, no fetch needed). New `blendHighBadgeStat` in score.ts: `weight = 0.75 * min(highMatches/100, 1)` (ramps 0→0.75 as high-badge sample grows 0→100 matches, flat above), blends win rate and usage ratio as `weight*high + (1-weight)*overall`. Confidence damping (K=50 shrink-to-mean, unchanged formula) now applies to the blended rate + a same-weight-blended "effective matches" figure, in that order (blend then damp, as spec'd).
- `scoreItem`'s inputs renamed to `overall*`/`high*` pairs; `index.ts` threads a second stats-by-id map + `maxHighBadgeItemMatches` through. `loaders.ts`/`setup.ts` untouched (generic JSON passthrough, no change needed).
- New fixture tests (generator.test.ts, not snapshot-gated): item with weak-overall/strong-high-elo outscores its mirror image when high-badge sample is adequate (1000 matches); a 5-high-badge-match item's blend stays within 0.05 of pure-overall (smooth degrade); zero high-badge evidence collapses to exactly overall.
- HELD-OUT FINDING (not tuned toward): re-ran Infernus's real builds against Zergggy before/after via a throwaway test (deleted after) — agreement % unchanged both ways, Weapon 35% / Spirit 51%. Blend didn't reorder Infernus's top items enough to matter for this snapshot.
- README's new "High-elo weighting (Phantom+)" section documents the exact formulas + the finding above.
- Verified: `npm run build` clean; `npx vitest run` 39 passed/2 skipped (was 36/2); `npm run gate:heldout` OK (5 files, zero zergggy references — only reads `high_badge_item_stats`).
- T9 archived to GOALS_ARCHIVE.md. Next: T10 (in-game build-card restyle) — first UI-heavy ticket, needs DESIGN.md tokens (already committed).

## 2026-09-01T17:17Z — T8 done: item detail hides zero-value stat lines
- FOUND FIRST: this container's local `main` was 18 commits behind detached HEAD (same recurring class of issue as prior fires) — `git checkout main && git merge --ff-only <HEAD>`; turned out `origin/main` was already at that commit, only the local ref was stale, so nothing to push for that step.
- Added `isMeaningfulStatLine(value)` to ItemDetailSheet.tsx: nonzero numbers/numeric strings kept; unit-suffixed strings like "7m" parsed via `parseFloat` (`Number("7m")` is NaN) so they're correctly kept when nonzero, hidden when "0m"; a real snapshot value of literally `"asdasd"` (junk, no label) is hidden; a display-metadata object (`{label,...}`, the known upstream gap where the numeric value is missing) is kept whenever its label is non-empty, since we can't know its zero-ness otherwise.
- Wrapped the stats list in a new `.item-detail-sheet__stats-section` with an `<h3>Stats</h3>` heading (didn't exist before) — the whole section is omitted when zero lines pass the filter.
- Verified against real data (not hardcoded): item 1548066885 "Extended Magazine" has 15 stat_lines, filter reduces it to the 5 real ones.
- Tests added (src/test/app.test.tsx): 5 pure-function cases for the filter + 2 real-snapshot-backed ItemDetailSheet render tests (mixed zero/nonzero item shows only nonzero + Cost/Tier/Slot intact; an all-zero item, if one exists, hides the Stats section).
- Verified: `npm run build` clean; `npx vitest run` 36 passed/2 skipped (was 30/2); `npm run gate:heldout` OK (UI-only change, generator untouched); `npx playwright test` 5/5 (existing e2e specs don't touch stat content — confirmed still green rather than assumed).
- T8 archived to GOALS_ARCHIVE.md. Budget allowed only this one ticket this fire (fast-forward recovery + full e2e run ate the rest). Next: T9 (high-elo weighting) — data already committed, nothing blocking.

## 2026-09-01T16:55Z — orchestrator: project REOPENED — user requested T8/T9/T10, routine re-enabled
- User asked for: (T8) item detail shows only meaningful stats, no zero rows; (T9) scoring weighted toward high-elo players; (T10) build display restyled like the in-game build browser (user supplied a reference screenshot — the T10 ticket text is the authoritative spec since fires can't see it).
- T9 data prep done locally (orchestrator, same egress-workaround pattern as T2b): fetch-data.mjs now also pulls per-hero item-stats at `min_average_badge=81` (Phantom+ — measured: keeps 151/155 Infernus items & ~1.15M rows; Ascendant+ collapses to ~25k rows) into `high_badge_item_stats`; full snapshot refreshed and committed, public/data = 6.9MB.
- Verified locally after refresh: `npm run build` clean, `npm test` 30 passed/2 skipped, `npm run gate:heldout` OK.
- Routine re-enabled + backstop re-armed (see board). Next fire: T8 (smallest) or T9 — snapshots are committed so nothing is blocked.

## 2026-09-01T17:08Z — orchestrator: T11 (ability-order panel) + T12 (design cohesion) queued; DESIGN.md added
- User supplied a 2nd reference screenshot (in-game "Ability Point Order" timeline) and asked for an app-wide beautification pass. Ticket text is the authoritative spec for fires (they can't see images); user confirmed the ◆1/◆2/◆5 badges are upgrade steps (AP cost per upgrade tier).
- DESIGN.md created: full token system (parchment/abyss/navy palette, slot colors, Baloo 2 + Nunito Sans via @fontsource, motion + quality floor) distilled from both screenshots — T10/T11/T12 all defer to it.
- heroes.json abilities now carry `image` URLs (orchestrator refetched locally, same egress pattern; all 38×4 resolved). CLAUDE.md repo map updated for DESIGN.md.
- Queue order: T8 → T9 → T10 → T11 → T12.

## 2026-09-01T17:10Z — orchestrator: T13 (single best build) queued ahead of the UI tickets
- User wants exactly one good build per hero. T13 inserted between T9 and T10 (queue position, not ticket number, is execution order) so T10's restyle lands on the single-build layout.
- Pick rule pinned in the ticket: generator-internal composite score only, stable tie-breaks — NEVER pick using Zergggy agreement (held-out rule). Queue order now: T8 → T9 → T13 → T10 → T11 → T12.

