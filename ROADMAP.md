# ROADMAP — Deadlock Build Optimizer

North star: a mobile-first React web app that generates data-driven item builds (item list, buy order, ability level-up order) for any Deadlock hero — Infernus tuned as the default — validated against top player Zergggy's real Infernus builds as a HELD-OUT test set: his data measures the generator, never feeds it.

## Acceptance checklist (T7 walks this; criteria test behavior and data shape, never specific item names)
- [ ] `npm run fetch-data` writes snapshots: item catalog ≥200 shopable items, per-hero analytics for every active hero, ≥20 Zergggy Infernus matches with per-match item purchases.
- [ ] With snapshots present and network disabled, `npm run build` succeeds and the served app renders with no console errors.
- [ ] App opens on Infernus with ≥2 named builds; each: ordered buy list ≥12 items grouped early/mid/late, per-item cost, running soul total, correct shop image per item.
- [ ] Any 3 other heroes generate and render builds (buy list + ability order) without errors.
- [ ] Each build shows an ability level-up sequence using the 4 real Infernus ability names — unlock order and upgrade tiers.
- [ ] Tapping any build item opens a detail card: image, cost, tier, slot type, stat/ability text matching the assets data.
- [ ] Every recommended item carries a Zergggy core/not-core badge; each build shows an agreement %; README states the ≥30% core-set rule (experiments excluded).
- [ ] Grep proof: generator module(s) contain no reference to the Zergggy snapshot; only the validation module reads it.
- [ ] 390×844: no horizontal scrolling anywhere; all interactive elements tappable (≥40 px).
- [ ] README documents scoring inputs/weights; rerunning the generator on the same snapshot yields identical builds.

## Known gaps / stretch (pull from here when GOALS.md is empty)
- Per-hero archetype tuning beyond Infernus (weight profiles per hero class).
- Situational/counter item swap suggestions.
- Validation against additional top players.
- PWA caching of item images for true offline visuals.
- Build export in an in-game-importable format, if the API documents one.
