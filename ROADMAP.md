# ROADMAP — Deadlock Build Optimizer

North star: a mobile-first React web app that generates data-driven item builds (item list, buy order, ability level-up order) for any Deadlock hero — Infernus tuned as the default — validated against top player Zergggy's real Infernus builds as a HELD-OUT test set: his data measures the generator, never feeds it.

## Acceptance checklist (T7 walked this 2026-09-01; see README.md for full detail on every line below)
- [x] `npm run fetch-data` writes snapshots: item catalog ≥200 shopable items, per-hero analytics for every active hero, ≥20 Zergggy Infernus matches with per-match item purchases.
- [x] With snapshots present and network disabled, `npm run build` succeeds and the served app renders with no console errors.
- [x] App opens on Infernus with ≥2 named builds; each: ordered buy list ≥12 items grouped early/mid/late, per-item cost, running soul total, correct shop image per item.
- [x] Any 3 other heroes generate and render builds (buy list + ability order) without errors.
- [x] Each build shows an ability level-up sequence using the 4 real Infernus ability names — unlock order and upgrade tiers.
- [x] Tapping any build item opens a detail card: image, cost, tier, slot type, stat data — active/passive descriptive text is `null` in this snapshot for every item, so `stat_lines` stands in for it (README "Known data gaps").
- [x] Every recommended item carries a Zergggy core/not-core badge; each build shows an agreement %; README states the ≥30% core-set rule (experiments excluded). Scoped to Infernus, since Zergggy's held-out sample is Infernus-only by design.
- [x] Grep proof: generator module(s) contain no reference to the Zergggy snapshot; only the validation module reads it.
- [x] 390×844: no horizontal scrolling anywhere; all interactive elements tappable (≥40 px). Verified in a real browser (Playwright/Chromium, T6), not just jsdom.
- [x] README documents scoring inputs/weights; rerunning the generator on the same snapshot yields identical builds.

## Known gaps / stretch (pull from here when GOALS.md is empty)
- Per-hero archetype tuning beyond Infernus (weight profiles per hero class).
- Situational/counter item swap suggestions.
- Validation against additional top players.
- PWA caching of item images for true offline visuals.
- Build export in an in-game-importable format, if the API documents one.
