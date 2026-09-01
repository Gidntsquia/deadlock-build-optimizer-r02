# GOALS ARCHIVE — finished ticket blocks, verbatim, newest last

- [x] **T1 — App scaffold + toolchain**
  Goal: Vite + React 18 + TypeScript scaffold that builds and tests clean.
  Files: package.json, vite.config.ts, tsconfig*.json, index.html, src/main.tsx, src/App.tsx, src/test/smoke.test.tsx, scripts/gate-heldout.mjs (stub), scripts/fetch-data.mjs (stub).
  Do FIRST — API probe from this sandbox, result recorded in PROGRESS.md:
  `curl -s -o /dev/null -w "%{http_code}" "https://api.deadlock-api.com/v1/analytics/item-stats?hero_id=1"` and `curl -s -o /dev/null -w "%{http_code}" "https://assets.deadlock-api.com/v2/heroes"`. If either is unreachable, say so LOUDLY in PROGRESS.md — T2 depends on it.
  Acceptance: `npm install` clean on Node ≥20; `npm run build` succeeds; `npm test` runs a jsdom smoke test mounting `<App/>` (vitest + jsdom + @testing-library/react); `npm run gate:heldout` exists (trivially passes while src/generator is empty); `npm run fetch-data` exists as stub exiting 1 with "not implemented".
  Verify: `npm run build && npm test && npm run gate:heldout`
