# PROGRESS — newest first, ≤25 lines per entry; past ~1,500 lines rotate all but newest ~10 entries verbatim to PROGRESS_ARCHIVE.md

## 2026-09-01T07:20Z — T1 done: app scaffold + toolchain
- LOUD FINDING: both `api.deadlock-api.com` and `assets.deadlock-api.com` are BLOCKED from this sandbox — CONNECT rejected with 403 by the org egress proxy (`connect_rejected`, organization policy), not a transient network issue. T2's real fetch cannot run here until that policy allows these hosts (or fetch-data is run from an environment where they're reachable).
- Built Vite + React 18 + TS scaffold by hand (interactive `npm create vite` wouldn't run non-interactively on a non-empty dir): package.json, vite.config.ts (uses `vitest/config`'s defineConfig — plain `vite`'s defineConfig + a `test` field type-conflicts with 2 vite copies), tsconfig{,.app,.node}.json, index.html, src/main.tsx, src/App.tsx, src/vite-env.d.ts, src/test/setup.ts + smoke.test.tsx.
- scripts/gate-heldout.mjs: real implementation already (walks src/generator, case-insensitive "zergggy" grep, fails on hit) — trivially passes now since src/generator/ doesn't exist yet. scripts/fetch-data.mjs: stub, exits 1 "not implemented".
- Pinned vitest to ^3.0.5 (not ^2.x) — with vite ^6 in deps, vitest 2.x's peer range pulled a nested vite@5.4.21 that type-conflicted with top-level vite@6; vitest 3.x dedupes to one vite@6.4.3. `npm audit`: 0 vulnerabilities after that bump (was 5, all from the nested old esbuild/vite).
- Verified (this sandbox): `npm install` clean, `npm run build` succeeds, `npm test` (1 smoke test mounting `<App/>`) passes, `npm run gate:heldout` passes, `npm run fetch-data` exits 1 with the expected message. NOT verified: `npm run dev` in a browser (no browser check this run — deferred to T6).
- Decisions: hand-built scaffold instead of the vite CLI generator (see above); vitest bumped past the ticket's implicit "vitest" to 3.x for the vite-6 compat fix, logged here per the runtime-deps rule (dev dep, not a runtime dep — no user-facing change).
- Next: T2 (data pipeline) — but it's blocked on the API egress denial above; next fire should retry the probe (policy may change) and, if still blocked, document the blocker plainly in GOALS.md/PROGRESS.md rather than fabricating data, and consider whether a smaller unblocked slice of T2 (e.g. snapshot schema/writer scaffolding against fixture data) is worth doing meanwhile.

## 2026-09-01 — orchestrator: project provisioned
- Repo scaffolded with durable state (GOALS/ROADMAP/CLAUDE/PROGRESS), usage Stop-hook (`scripts/log-usage.sh` + `.claude/settings.json`), autoCompactWindow 300000.
- Queue T1–T7 in GOALS.md; next fire takes T1 (scaffold + API reachability probe).
- Decisions: project lives at repo root (mandated `../../cloud-usage-hook` path); private GitHub repo; snapshots committed to `public/data/` so fires and builds work offline; permutation-stats fetched for Infernus only (budget); win-weight 1.5/1.0 for core-set; personalization = median standard-match duration annotating late-game budget. All to be restated in README (T7).
- Verified: nothing yet beyond git init + files present.
