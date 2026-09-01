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

- [ ] **T17 — desktop fills the viewport; mobile UI unchanged (user request 2026-09-01: "fill the screen on a mac viewport but maintain its good mobile ui on phone")**
  - Goal: on desktop widths the app stops being a narrow centered column and uses the screen. Breakpoint ~≥1024px: the layout goes fluid up to ~1440px max-width with comfortable margins; phase panels ("Early Game" / "Mid to Late Game") sit side by side when they fit, card grids grow their per-row count, the Ability Point Order panel spans full content width (no internal horizontal scroll when it fits). Below the breakpoint NOTHING changes — the 390×844 mobile experience is the reference and must stay pixel-equivalent.
  - DESIGN.md's Desktop note (added 2026-09-01) is authoritative for the breakpoint/max-width values.
  - Files: layout CSS (wherever T12 put it), `src/App.tsx` if structure needs a wrapper, `e2e/` — add a desktop spec at 1440×900 asserting no horizontal page scroll and content width ≥ 85% of viewport (capped by max-width), keep the mobile spec green. Update CLAUDE.md's "desktop is just a centered column" convention line to the new truth.
  - Acceptance: (1) 1440×900 e2e: content fills per above, no page-level horizontal scroll; (2) 390×844 e2e unchanged and green; (3) zero hardcoded colors added outside the :root token block (T12 rule holds); (4) all suites green.
  - Verify: `npm run build` · `npm test` · `npm run gate:heldout` · `npm run test:e2e`.
