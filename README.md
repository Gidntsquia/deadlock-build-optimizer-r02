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
| `public/data/items.json` | All shopable upgrade items: id, name, cost, tier, slot type, image URL, stat lines (scoring only), `stat_sections` (real in-game tooltip display data, T14), `is_active_item`. ≥200 items. |
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

Ability level-up order (T15) is built per-hero from the snapshot's own AP-spend data:
`high_badge_ability_order_stats` (Phantom+) is used when its highest-matches row clears a 100-match
floor, else `ability_order_stats`; ties break by wins then ascending joined sequence. The winning
row's ~15-long ability-id sequence is mapped step by step — first occurrence of an ability = unlock,
later occurrences = upgrade. The old deterministic fallback (unlock 1–4, then upgrade round-robin
×2, 12 steps total) still exists in `src/generator/abilityOrder.ts` and is used only when a hero has
no usable sequence row or a chosen row references an ability id outside its own 4.

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
a card — winning archetype shown as a subtitle (e.g. "Spirit build") — restyled (T10) to match
Deadlock's own in-game build browser using DESIGN.md's token system (`:root` custom properties for
the parchment/abyss/navy palette and slot colors). The buy list renders as two parchment "Early Game"
/ "Mid to Late Game" panels (`.phase-panel`) — the generator's internal 3-way early/mid/late split
still drives scoring/ordering, but mid and late collapse into one display panel per DESIGN.md's
layout concept (a "Testing" third panel exists in-game but is omitted here — nothing in the snapshot
identifies leftover/near-miss items to populate it with). Each item is a square slot-colored tile
(orange/green/purple for weapon/vitality/spirit) with a corner tier ribbon (roman I–IV; item_tier 5,
a 23-item flat-9999-soul sentinel category that isn't a real 5th shop tier, falls back to the plain
number), an "Active" chip when `item.is_active_item` is set, a khaki name-label strip, cost, running
soul total, and a core/not-core badge when a validation report exists. A broken/blocked item image
degrades to the colored tile with no broken-image icon (tracked via `onError` state, not a CSS
fallback). Tapping any item opens a bottom-sheet detail card (image, cost, tier, slot type, and the
item's real in-game tooltip sections — T14, see below). No horizontal scroll at 390px; every
tappable element (hero select, item cards, the detail sheet's close button) is ≥40px in its
constrained dimension. Desktop is just the same layout centered in a ~480px column.

Below the buy list, an **Ability Point Order** panel (`AbilityOrderPanel`, T11) replaces the old
plain step list with the game's own timeline layout: a navy panel (`--panel-navy`) with one darker
row (`--row-navy`) per ability, in hero order, each starting with a 40px icon tile (the ability's
real image from `heroes.json`; a broken/missing image degrades to the ability's initial letter on a
`--badge-khaki` tile, same `onError`-state pattern as the item cards). The generated ability sequence
(`build.ability_order`, unlocks then 2 upgrade rounds — see the generator section above) maps onto N
shared columns across every row, so a spend at step k always renders in column k regardless of which
row it belongs to — markers only align vertically when spends are genuinely simultaneous, exactly
like the in-game panel. **Unlock** steps render as a violet rotated-square diamond (`--diamond-violet`,
no number); **upgrade** steps render as a khaki pill showing `◆` + the in-game AP cost for that
upgrade's index (0→1, 1→2, 2→5 — looked up by position, not hardcoded to "2 upgrades exist": the
generator currently emits exactly 2 upgrades/ability, so ◆5 never appears yet, but the panel already
supports a 3rd). The row content scrolls horizontally inside the panel (`overflow-x: auto`) if the
column count doesn't fit 390px — the page itself never scrolls horizontally, verified in both the
jsdom suite and the Playwright mobile spec.

Runtime data loads via `fetch('/data/**')` against the static snapshot files (`src/data/loaders.ts`
for items/heroes/analytics/personal matches; `src/validation/loadMatches.ts` for the held-out fetch,
kept inside `src/validation/` for the same isolation reason as above) — no other runtime network
calls except the item/hero image URLs the snapshots themselves store.

### Design cohesion pass (T12)

The build header is now a full-bleed teal title bar (`--header-teal`, `--ink` text, `Baloo 2` display
face) sitting flush atop the buy-list panels — the `.build-card` itself carries no background of its
own any more, so the parchment phase panels and navy ability panel visually float on the app's abyss
background between them, matching DESIGN.md's "parchment panels floating on a near-black abyss"
framing rather than reading as boxes-inside-a-box. `HeroPicker` and `PersonalizationBanner` moved off
the old flat gray to a `--surface-dark` near-black-green surface (not in DESIGN.md's own table, since
neither element appears in the reference screenshots — added as the same abyss-family palette, never
white, and still confined to the `:root` token block). `ItemDetailSheet` is now a parchment sheet
(`--panel-parchment`, `--ink` text) instead of a dark card, with its close button and "Active"/
"Passive" section headings restyled to match (the latter also promoted to the `Baloo 2` display face,
consistent with DESIGN.md's "panel headings" typography rule).

Fonts are vendored via `@fontsource/baloo-2` (700/800) and `@fontsource/nunito-sans` (400/600/700) —
npm devDeps, imported in `main.tsx` so Vite bundles the actual `.woff2`/`.woff` files into the build
output; the runtime never fetches a font from `fonts.googleapis.com` or any other host, keeping the
snapshot-only offline guarantee intact. JUDGMENT CALL: only the `latin-*` subset files are imported
(not the full cyrillic/greek/vietnamese set each package ships) since the app's UI text is English-only
— cuts the font payload to ~90 KB across 5 weight/family combinations instead of pulling every subset.

Motion is deliberately restrained to DESIGN.md's "one orchestrated moment": the item detail sheet's
slide-up plus its backdrop fade (`@keyframes`, CSS-only, no JS animation library), and a subtle
`scale(1.03)` press/hover state on item cards. A `prefers-reduced-motion: reduce` media query collapses
every transition/animation to near-zero duration app-wide. Keyboard focus is visible everywhere
(`:focus-visible` → 2px `--header-teal` outline) instead of the browser default. `src/test/styles.test.ts`
encodes T12's acceptance criteria as regression tests rather than one-off manual checks: zero hex colors
outside the `:root` block, the reduced-motion query's presence, `@fontsource` imports (not an external
font host) in `main.tsx`, and the focus-visible outline rule.

### Item detail tooltip (`stat_sections`, T14)

`items.json`'s `stat_lines` is the item's full engine property bag (scoring input only, most keys
never shown in-game). The real in-game tooltip is defined by a separate, pre-committed
`stat_sections` field per item — exactly which properties the game itself displays, grouped into
sections (`innate` | `active` | `passive` | `null`), each with an optional plain-text description and
an ordered (elevated-first) list of `{ key, label, value, prefix, postfix, elevated }` rows.
`ItemDetailSheet` renders `stat_sections`, never `stat_lines` — innate sections get no heading (the
game's top block); active/passive sections get an "Active"/"Passive" heading. A row is hidden when
its `value` is `null` (reuses T8's `isMeaningfulStatLine`, which already treats `null` as
not-meaningful) or when it's a numeric zero. `prefix: '{s:sign}'` is a template token meaning "show a
leading `+` for a positive value" (a negative value already carries its own `-`); literal `+`/`-`
prefixes render as-is. `elevated: true` rows (the game's emphasized big numbers) render bold/larger
via `.item-detail-sheet__stat--elevated`. JUDGMENT CALL: ~11% of stats (125/1093 in this snapshot)
have their unit already baked into `value` (e.g. `value: "10m"`, `postfix: "m"` — an upstream
extraction quirk, not something T14 fixes at the source) — `formatSectionStatValue` skips appending
the postfix when the value string already ends with it, to avoid rendering "10mm".

## Known data gaps and judgment calls

The upstream API returned several fields as `null` or structurally identical across every hero for
this snapshot. None of these affect the held-out isolation guarantee; each is a deliberate,
documented fallback rather than fabricated data:

- **`heroes.json` base stats** are structurally identical across all 38 heroes (a field-mapping gap
  in the fetch — `starting_stats`/`level_scaling` didn't carry real per-hero values from this API).
  Archetype weighting uses each item's own `item_slot_type` instead of hero scaling stats.
- **`active_description` / `passive_description`** are `null` for all 251 items — the build's
  activated-item cap uses a stat-line heuristic (nonzero `AbilityCooldown`, `is_active_item` since
  T14 is available as the real flag for future display use); the item detail card no longer renders
  these two always-null fields at all — `stat_sections`' own per-section descriptions (T14) are the
  real ability text and are populated for active/passive sections that have one.
- Some `stat_lines[].value` entries are display-metadata objects (`{label, prefix, postfix, ...}`)
  instead of numeric strings, rather than every value being numeric as the rest of the schema
  implies. The generator treats a non-numeric value as 0 (unaffected, since it already coerced with
  `Number(...)`); `stat_lines` is scoring-only now (T14 moved the detail card to `stat_sections`,
  whose values are always a plain string, number, or `null`, never this display-metadata shape).
- The hand-built Vite/React/TS scaffold (T1) was written directly instead of via `npm create vite`,
  which needs an interactive prompt this sandbox can't satisfy on a non-empty directory; `vitest`
  was pinned to `^3.x` (not the ticket's implicit `^2.x`) because `vitest@2` on `vite@6` pulled a
  duplicate nested `vite@5` that type-conflicted with the top-level `vite@6` — a dev-only fix, no
  runtime dependency change.
- `@fontsource/baloo-2` and `@fontsource/nunito-sans` (T12) were added as npm devDeps — they only
  supply static font files Vite bundles at build time (no runtime code), so the "zero runtime deps
  beyond react/react-dom" rule (`GOALS.md`) is unaffected; only the `latin-*` subset per weight is
  imported (see the design-cohesion section above).
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
- [x] App opens on Infernus with its single recommended named build (T13; the generator still scores
      two internal weapon/spirit candidates and exports the higher-scoring one); it has an ordered
      ≥12-item buy list grouped early/mid/late, per-item cost, running soul total, and each item's
      real shop image (`app.test.tsx`, `generator.test.ts`).
- [x] Any 3 other heroes generate and render a build (buy list + ability order) without errors
      (`app.test.tsx`, and spot-checked for 4 heroes in `generator.test.ts`).
- [x] The build shows an ability level-up sequence using the hero's 4 real ability names.
- [x] Tapping any build item opens a detail card: image, cost, tier, slot type, and its real in-game
      tooltip stats (`stat_sections`, T14) — `active_description`/`passive_description` are `null`
      for every item in this snapshot (see
      Known data gaps above), so `stat_sections`' own per-section descriptions are what's shown in
      their place where present; there is no separate descriptive ability text in the data beyond that.
- [x] Every item in Infernus's build carries a core/not-core badge and the Infernus build shows
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
