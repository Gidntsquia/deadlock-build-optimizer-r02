# Deadlock Build Optimizer — conventions

Stack: React 18 + Vite + TypeScript. Static frontend + one Node data script — no backend, no DB, no auth, no paid services. Node ≥20 (built-in fetch).

Commands: `npm run dev` · `npm run build` · `npm test` (vitest/jsdom) · `npm run test:e2e` (Playwright, needs `npm run build` first — see `playwright.config.ts`) · `npm run fetch-data` · `npm run gate:heldout`

## Repo map (keep truthful when structure changes)
- `DESIGN.md` — authoritative design tokens/type/motion for the in-game-style UI (T10–T12)
- `scripts/fetch-data.mjs` — snapshot pipeline, writes `public/data/`
- `scripts/gate-heldout.mjs` — fails if `src/generator/` references zergggy or heldout-ctc
- `scripts/log-usage.sh` — token-usage Stop hook (experiment infra; NEVER modify), logs to `.usage-log/`
- `public/data/` — committed JSON snapshots, the app's ONLY runtime data source
  - `zergggy/` — TUNING data (Zergggy/Infernus): ONLY `src/validation/` may read it
  - `heldout-ctc/` — HELD-OUT test data (ctc/Drifter): ONLY `src/validation/` may read it; never tune toward it
- `src/generator/` — deterministic build scoring (no zergggy access, ever)
- `src/validation/` — Zergggy core-set + agreement scoring
- `src/components/` — UI components
- `src/data/` — runtime snapshot loaders (`fetch('/data/**')`); no zergggy access, ever
- `src/test/` — vitest suites
- `e2e/` — Playwright specs; real-browser 390×844 layout/tap-target checks against `npm run preview` (`npm run test:e2e`)

## Conventions
- Mobile-first: design at 390×844, tap targets ≥40 px, desktop is just a centered column.
- Determinism: every sort gets a stable tie-break (ascending item id).
- Runtime data comes from snapshots only; the only external URLs at runtime are item/hero image URLs stored in the snapshots.
- Quote all URLs and paths in shell commands. Exclude `public/data` from grep/search (large JSON).
- Commit style: `<ticket-id>: <what>` (e.g. `T3: generator scoring core`).
