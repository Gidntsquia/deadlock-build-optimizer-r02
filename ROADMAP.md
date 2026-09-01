# ROADMAP — Deadlock Build Optimizer

North star: a mobile-first React web app that generates data-driven item builds (item list, buy order, ability level-up order) for any Deadlock hero. Since 2026-09-01: tuned for agreement with top player Zergggy's real Infernus builds (the TUNING set), then validated against player ctc's Drifter builds as the HELD-OUT test set — measured once, never tuned toward.

MVP acceptance checklist: fully walked and checked off by T7 (2026-09-01) — see README.md for the criteria. (One line there is since superseded: item descriptions are no longer null; `stat_sections` now carries the game's real tooltip data, see T14.)

## Known gaps / stretch (pull from here when GOALS.md is empty)
- Per-hero archetype tuning beyond Infernus (weight profiles per hero class).
- Situational/counter item swap suggestions.
- Validation against additional top players.
- PWA caching of item images for true offline visuals.
- Build export in an in-game-importable format, if the API documents one.
