# Deadlock Build Optimizer

A mobile-first React web app that generates data-driven item builds — item list, buy order, and
ability level-up order — for any active Deadlock hero (Infernus is the tuned default), and scores
each generated build against a **held-out** sample of a real top player's (Zergggy's) actual
Infernus purchases. That held-out data measures the generator; it never feeds it.

Static frontend only: no backend, no database, no auth, no paid services. One Node script
(`scripts/fetch-data.mjs`) builds the data snapshots the app reads at runtime; everything else is
Vite + React 18 + TypeScript.

## Running it

Requires Node ≥20 (built-in `fetch`).

```bash
npm install
npm run fetch-data   # refreshes public/data/** from the live Deadlock API (see Data pipeline below)
npm run dev           # local dev server
npm run build          # production build (tsc -b && vite build)
npm test                # vitest/jsdom unit + component tests
npm run test:e2e         # Playwright, real-browser 390x844 checks — run `npm run build` first
npm run gate:heldout      # fails if src/generator/ ever references the held-out data
```

`public/data/**` is committed to the repo, so `npm run dev` / `npm run build` / `npm test` all work
without ever running `fetch-data` — the app's *only* runtime data source is those committed
snapshots (plus the item/hero shop-image URLs stored inside them, the only external hosts the app
talks to at runtime).

## Data pipeline

`scripts/fetch-data.mjs` calls `assets.deadlock-api.com` and `api.deadlock-api.com` and writes:

| File | Contents |
| --- | --- |
| `public/data/items.json` | All shopable upgrade items: id, name, cost, tier, slot type, image URL, stat lines, active/passive tooltip text. ≥200 items. |
| `public/data/heroes.json` | Every **active** hero (disabled/in-development heroes excluded): id, name, base stats, stat growth, and the hero's 4 real ability ids + names. |
| `public/data/analytics/hero-<id>.json` | Per-hero item win/usage stats and ability-order stats, for every active hero. |
| `public/data/analytics/infernus-permutations.json` | Item-permutation stats for Infernus only (a fetch-budget decision — every other hero's analytics come from the per-hero file above). |
| `public/data/personal/matches.json` | One account's standard-matchmaking match history (hero, win/loss, duration, start time) — powers the personalization insight. |
| `public/data/zergggy/matches.json` | **Held-out only.** ~30 of Zergggy's real Infernus matches (real matchmaking, private lobbies/bots excluded), each with `{item_id, game_time_s}` purchases. |
| `public/data/meta.json` | `fetched_at` + counts, written last. |

Politeness: requests are sequential with a ≥300 ms gap, with one retry after a 5 s backoff on
HTTP 429. Total snapshot size is kept under 15 MB by pruning to the fields above.

## The generator (`src/generator/`)

Pure function of three snapshot inputs (`heroes.json`, `items.json`,
`analytics/hero-<id>.json`) — **never** `public/data/zergggy/**`. `npm run gate:heldout` greps
`src/generator/` for the string "zergggy" (case-insensitive) and fails the build if it finds one;
`src/generator` never tunes its weights against the held-out agreement score either — a low score
is a finding about the generator, not something to chase.

For each hero it internally builds two candidates — a **Weapon**-leaning build and a
**Spirit**-leaning build — by scoring every item and greedily filling early/mid/late buy-phase
quotas (4/4/5 items, tier bands 800/1600/3200/6400/9999 souls → early/early/mid/late/late) by score,
backfilling to a 12-item floor if a phase runs short, and capping at 2 activated-ability items per
build (`AbilityCooldown != 0`, the only per-item activation signal in this snapshot). It then exports
only the single higher-scoring candidate (`pickBestBuild`, T13): each candidate's total score is the
sum of its selected items' composite scores; ties break on ascending archetype name, then on the
build's item-id sequence. The pick is generator-internal only — it never consults held-out Zergggy
agreement (that would be tuning to the held-out set); the UI still shows the exported build's
agreement % as before, purely as a display metric. The composite item score:

```
score = 0.35 * confidenceDampedWinRate   (shrink the BLENDED win rate below toward the hero's mean
                                            win rate, as if padded with 50 extra matches at that
                                            mean — damps low-sample items without ignoring them)
      + 0.25 * usageRate                  (the BLENDED usage ratio below)
      + 0.25 * valuePerSoul               (sum of |non-mechanics stat values| / cost, normalized
                                            against the item pool's max)
      + 0.15 * archetypeBias              (1.0 own-archetype slot, 0.6 vitality, 0.2 off-archetype)
```

Ties break on ascending item id — the generator is a pure function of its inputs (no randomness, no
clock reads), so re-running it on an unchanged snapshot always yields a deep-equal result
(`generator.test.ts` asserts this directly).

### High-elo weighting (Phantom+)

Each hero's win rate and usage prefer high-elo evidence. `fetch-data.mjs` pulls a second,
pre-filtered stat set per hero — `high_badge_item_stats` — restricted to matches with an average
lobby badge ≥ 81 (Phantom+; recorded as `high_badge_min` in each analytics file and in
`meta.json`). Per item, the overall stats (`item_stats`, all skill levels) and the high-badge stats
are blended **before** the confidence damping above is applied:

```
weight = 0.75 * min(item.high_badge_matches / 100, 1)   // ramps 0 -> 0.75 as high-badge
                                                          // sample grows from 0 to 100 matches,
                                                          // flat at 0.75 above 100
blendedWinRate = weight * highBadgeWinRate + (1 - weight) * overallWinRate
blendedUsage   = weight * (item.high_badge_matches / hero's max high-badge matches)
               + (1 - weight) * (item.overall_matches / hero's max overall matches)
```

At ≥100 high-badge matches an item's win rate/usage is a fixed 75%/25% blend toward the high-elo
sample (≥70% per spec); below that, the high-badge weight ramps down linearly to 0, so a handful of
high-elo matches nudges the blend only slightly and zero high-elo matches falls back to pure overall
stats — a smooth degrade, not a hard cutoff. The confidence-damping formula is unchanged, but now
takes the blended rate and a correspondingly blended "effective matches" figure (same weight applied
to the two raw sample sizes) instead of the item's raw overall wins/matches.
`src/generator/score.ts`'s `blendHighBadgeStat`/`dampedWinRate`/`scoreItem` implement this exactly;
`generator.test.ts`'s "scoreItem high-elo blend" suite covers both the "beats the reverse case" and
"degrades toward overall-only below the sample floor" behaviors with fixtures.

Checked against the held-out Zergggy agreement score (never tuned toward it): Infernus's Weapon and
Spirit builds score identically (35% / 51%) before and after this change — the blend didn't move
the top-ranked items enough to change either build's item selection for this particular hero/snapshot.

Ability level-up order unlocks the hero's 4 named abilities in listed order (steps 1–4), then
upgrades them round-robin twice more (steps 5–12) — the snapshot's
`ability_order_stats[].sequence` field is `null` for every hero, so there's no real per-hero order
to prefer over this documented fallback.

## Held-out validation (`src/validation/`)

Only `src/validation/` may read `public/data/zergggy/**` — enforced by `gate:heldout` for
`src/generator/`, and by a repo-wide isolation test (`validation.test.ts`) that greps every other
`src/` module (excluding `src/test/`, which only tests the held-out snapshot's own shape) for the
same string.

**Core set**: an item is "core" if it was bought in ≥30% of Zergggy's win-weighted sample —
otherwise it's an "experiment" and is excluded from scoring entirely (not penalized, just ignored).

```
share(item) = (Σ matchWeight(m) for matches m containing item) / (Σ matchWeight(m) over all matches)
matchWeight(m) = 1.5 if m.won else 1.0
threshold = 0.30, inclusive
```

**Agreement %** — how well a *generated* build matches Zergggy's known play, never a suggestion to
copy his items:

```
agreement% = round(100 * (0.6 * coreSetOverlap + 0.4 * buyOrderAgreement)), clamped to [0, 100]

coreSetOverlap    = |build items in the core set| / |core set|
buyOrderAgreement = win-weighted pairwise concordance of the build's shared core-set items against
                    Zergggy's majority first-purchase order; a pair/build with no signal defaults
                    to the neutral 0.5, not 0
```

Because Zergggy's sample is Infernus-only, the core/not-core badge and agreement % only appear on
Infernus's builds — every other hero's builds render normally, just without a validation report.

## Personalization (`src/personalization/`)

One insight, computed from `public/data/personal/matches.json`: the median duration of the
player's standard matches, labeled short (<25 min) / average (25–40 min) / long (>40 min), shown as
a banner meant to contextualize the late-game budget in the build below it.

## UI (`src/App.tsx`, `src/components/**`)

Mobile-first at 390×844: a hero `<select>` (Infernus default), the single recommended build (T13) as
a card — winning archetype shown as a subtitle (e.g. "Spirit build") — with its buy list grouped
early/mid/late (item image, name, cost, running soul total, core/not-core badge when a validation
report exists), an ability level-up order list, and the personalization banner. Tapping
any item opens a bottom-sheet detail card (image, cost, tier, slot type, stat lines). No horizontal
scroll at 390px; every tappable element (hero select, item rows, the detail sheet's close button)
is ≥40px in its constrained dimension. Desktop is just the same layout centered in a ~480px column.

Runtime data loads via `fetch('/data/**')` against the static snapshot files (`src/data/loaders.ts`
for items/heroes/analytics/personal matches; `src/validation/loadMatches.ts` for the held-out fetch,
kept inside `src/validation/` for the same isolation reason as above) — no other runtime network
calls except the item/hero image URLs the snapshots themselves store.

## Known data gaps and judgment calls

The upstream API returned several fields as `null` or structurally identical across every hero for
this snapshot. None of these affect the held-out isolation guarantee; each is a deliberate,
documented fallback rather than fabricated data:

- **`heroes.json` base stats** are structurally identical across all 38 heroes (a field-mapping gap
  in the fetch — `starting_stats`/`level_scaling` didn't carry real per-hero values from this API).
  Archetype weighting uses each item's own `item_slot_type` instead of hero scaling stats.
- **`ability_order_stats[].sequence`** is `null` for every hero — the ability order always uses the
  documented fallback (unlock 1–4, then upgrade round-robin ×2) rather than a real per-hero order.
- **`active_description` / `passive_description`** are `null` for all 251 items — the active/passive
  split for the build's activated-item cap uses a stat-line heuristic (nonzero `AbilityCooldown`)
  instead, and the item detail card shows raw `stat_lines` rather than descriptive ability text
  (there is none in this snapshot to show).
- Some `stat_lines[].value` entries are display-metadata objects (`{label, prefix, postfix, ...}`)
  instead of numeric strings, rather than every value being numeric as the rest of the schema
  implies. The generator treats a non-numeric value as 0 (unaffected, since it already coerced with
  `Number(...)`); the detail card falls back to the object's `label`, or "—".
- The hand-built Vite/React/TS scaffold (T1) was written directly instead of via `npm create vite`,
  which needs an interactive prompt this sandbox can't satisfy on a non-empty directory; `vitest`
  was pinned to `^3.x` (not the ticket's implicit `^2.x`) because `vitest@2` on `vite@6` pulled a
  duplicate nested `vite@5` that type-conflicted with the top-level `vite@6` — a dev-only fix, no
  runtime dependency change.
- This project's cloud sandbox cannot reach `api.deadlock-api.com` / `assets.deadlock-api.com` (org
  egress policy) — the real `fetch-data` run and the snapshot commit (`public/data/**`) were done
  once, locally, outside the sandbox; every other ticket built and tested against the committed
  result.
- Playwright's Chromium happened to be pre-installed in this cloud sandbox, so the real-browser
  verification pass (`e2e/mobile.spec.ts`) ran for real against a production `npm run preview`
  build rather than falling back to a static CSS audit.

## Parked / not done

Pulled from `ROADMAP.md`'s "known gaps / stretch" list — none of these are implemented:
per-hero archetype tuning beyond Infernus, situational/counter item swap suggestions, validation
against additional top players, PWA caching of item images for true offline visuals, and build
export in an in-game-importable format.

## Acceptance checklist (`ROADMAP.md`)

- [x] `npm run fetch-data` writes snapshots: item catalog ≥200 shopable items (251), per-hero
      analytics for every active hero (38/38), ≥20 Zergggy Infernus matches with per-match item
      purchases (30). Verified once, locally, when the snapshots were fetched (T2b).
- [x] With snapshots present and the external image host blocked (network-disabled proxy for the
      only external runtime host), `npm run build` succeeds and the served app renders with zero
      console/page errors (`e2e/mobile.spec.ts`'s "offline resilience" test, T6).
- [x] App opens on Infernus with ≥2 named builds; each has an ordered ≥12-item buy list grouped
      early/mid/late, per-item cost, running soul total, and each item's real shop image
      (`app.test.tsx`, `generator.test.ts`).
- [x] Any 3 other heroes generate and render builds (buy list + ability order) without errors
      (`app.test.tsx`, and spot-checked for 4 heroes in `generator.test.ts`).
- [x] Each build shows an ability level-up sequence using the hero's 4 real ability names.
- [x] Tapping any build item opens a detail card: image, cost, tier, slot type, and stat data —
      `active_description`/`passive_description` are `null` for every item in this snapshot (see
      Known data gaps above), so `stat_lines` is what's shown in their place; there is no
      descriptive ability text in the data to display.
- [x] Every item in Infernus's builds carries a core/not-core badge and each Infernus build shows
      an agreement % — scoped to Infernus because Zergggy's held-out sample is Infernus-only by
      design (see Held-out validation above); other heroes render without a validation report,
      also by design.
- [x] Grep proof: `npm run gate:heldout` fails the build if `src/generator/` ever references
      "zergggy"; a separate isolation test does the same for every other `src/` module except
      `src/validation/` and `src/test/`.
- [x] 390×844: no horizontal scrolling on the Infernus default screen, with a detail card open, or
      on a non-Infernus hero; hero select / item rows / detail-sheet close button all measure
      ≥40px in their constrained dimension (`e2e/mobile.spec.ts`, real Chromium, T6).
- [x] This README documents the scoring inputs/weights above; `generator.test.ts` asserts that two
      runs of `generateBuilds` on the same snapshot are deep-equal (determinism).
