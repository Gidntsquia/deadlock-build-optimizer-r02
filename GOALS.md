# GOALS — Deadlock Build Optimizer

## Standing rules (every fire reads this first)
- USAGE-LOG WAIVER (user decision 2026-09-01T07:55Z): the Stop hook lands no `usage-log:` commits from the cloud sandbox (HOME-guard mismatch). The user explicitly waived the halt rule — NEVER halt, disable, or park the routine over missing usage-log commits. `scripts/log-usage.sh`, `.claude/settings.json`, `.usage-log/` still must never be modified.
- SANDBOX EGRESS: cloud fires CANNOT reach `api.deadlock-api.com` or `assets.deadlock-api.com` (org proxy rejects CONNECT, 403). Never attempt live API fetches in a fire, and never fabricate data. All real fetching is done LOCALLY by the orchestrator (T2b). Fires build code + tests that work offline against committed snapshots or small fixtures; a ticket blocked on missing snapshots gets skipped with a one-line PROGRESS.md note.
- ROUTINE: trigger id `trig_01QxmDBRdwQgKUHKsTf8ZNXg` · cron `13 * * * *` (hourly — 1h is the platform minimum; orchestrator eager-fires extra runs between ticks) · repo https://github.com/Gidntsquia/deadlock-build-optimizer-r02 · runs visible via claude.ai Code routines (RemoteTrigger list_runs with the trigger id)
- PACE: full (user 2026-09-01T18:05Z, budget healthy): finish your ticket, then KEEP TAKING the next unchecked ticket in the same fire while run budget remains — gates verified per ticket, one commit+archive move per ticket. Stop only when budget is genuinely low or the queue is empty.
- GATES — all must pass before checking any box: `npm run build` · `npm test` · `npm run gate:heldout` (required whenever src/ changed). Code review alone is not verification.
- HELD-OUT RULE (experiment integrity): nothing under `src/generator/` may read, import, or reference any file under `public/data/zergggy/` — nor contain the string "zergggy" at all. Only `src/validation/` may read that data. Never tune generator weights to raise the Zergggy agreement score; a low score is a finding, not a bug.
- DATA: snapshots are committed under `public/data/`; the app reads ONLY snapshots (fully offline after fetch). Keep total snapshot size < 15 MB by pruning fields. fetch-data politeness: sequential requests, ≥300 ms sleep between calls, one retry after 5 s on HTTP 429.
- Checking a box: move the finished ticket block VERBATIM to GOALS_ARCHIVE.md in the same commit.
- Prefer zero runtime deps beyond react/react-dom; log any addition in PROGRESS.md with a reason.
- Do not grep or read `public/data/` wholesale (large JSON); never modify `scripts/log-usage.sh` or `.usage-log/`.

## Open tickets

- [ ] **T12 — app-wide design cohesion pass per DESIGN.md (user request 2026-09-01: "make the UI beautiful")**
  - Goal: the ENTIRE app reads as one in-game artifact — not two game-styled panels inside a web dashboard. Apply DESIGN.md everywhere T10/T11 didn't touch: app background `--bg-abyss`; build header becomes the teal title bar (hero name + build name in display face, agreement chip riding it); HeroPicker, PersonalizationBanner, and ItemDetailSheet restyled with DESIGN.md tokens (detail sheet = parchment sheet, slide-up kept as the app's one orchestrated motion moment). No white surfaces anywhere.
  - Typography: add `@fontsource/baloo-2` + `@fontsource/nunito-sans` (npm devDeps, bundled — runtime stays offline; log the additions in PROGRESS.md per the standing rule), wire the roles/weights and fallback stacks exactly as DESIGN.md specifies.
  - Quality floor (DESIGN.md): `prefers-reduced-motion` respected, visible keyboard focus (2px teal outline), text contrast ≥4.5:1, 390×844 no page overflow, tap targets ≥40px.
  - Files: `src/styles.css`, `src/App.tsx`, `src/components/{HeroPicker,PersonalizationBanner,ItemDetailSheet}.tsx`, `src/main.tsx` (font imports), `package.json`, tests/e2e as needed.
  - Acceptance: (1) zero hardcoded colors outside the :root token block (grep `#[0-9a-f]` in styles.css finds only the token definitions); (2) fonts load offline from the bundle (build output contains the woff2 files; no external font URL anywhere); (3) reduced-motion media query present and kills transitions; (4) all suites green incl. e2e 5/5.
  - Verify: `npm run build` · `npm test` · `npm run gate:heldout` · `npm run test:e2e`.
