# GOALS — Deadlock Build Optimizer

## Standing rules (every fire reads this first)
- USAGE-LOG WAIVER (user decision 2026-09-01T07:55Z): the Stop hook lands no `usage-log:` commits from the cloud sandbox (HOME-guard mismatch). The user explicitly waived the halt rule — NEVER halt, disable, or park the routine over missing usage-log commits. `scripts/log-usage.sh`, `.claude/settings.json`, `.usage-log/` still must never be modified.
- SANDBOX EGRESS: cloud fires CANNOT reach `api.deadlock-api.com` or `assets.deadlock-api.com` (org proxy rejects CONNECT, 403). Never attempt live API fetches in a fire, and never fabricate data. All real fetching is done LOCALLY by the orchestrator (T2b). Fires build code + tests that work offline against committed snapshots or small fixtures; a ticket blocked on missing snapshots gets skipped with a one-line PROGRESS.md note.
- ROUTINE: trigger id `trig_01QxmDBRdwQgKUHKsTf8ZNXg` · cron `13 * * * *` (hourly) · repo https://github.com/Gidntsquia/deadlock-build-optimizer-r02 · runs visible via claude.ai Code routines (RemoteTrigger list_runs with the trigger id)
- GATES — all must pass before checking any box: `npm run build` · `npm test` · `npm run gate:heldout` (required whenever src/ changed). Code review alone is not verification.
- HELD-OUT RULE (experiment integrity): nothing under `src/generator/` may read, import, or reference any file under `public/data/zergggy/` — nor contain the string "zergggy" at all. Only `src/validation/` may read that data. Never tune generator weights to raise the Zergggy agreement score; a low score is a finding, not a bug.
- DATA: snapshots are committed under `public/data/`; the app reads ONLY snapshots (fully offline after fetch). Keep total snapshot size < 15 MB by pruning fields. fetch-data politeness: sequential requests, ≥300 ms sleep between calls, one retry after 5 s on HTTP 429.
- Checking a box: move the finished ticket block VERBATIM to GOALS_ARCHIVE.md in the same commit.
- Prefer zero runtime deps beyond react/react-dom; log any addition in PROGRESS.md with a reason.
- Do not grep or read `public/data/` wholesale (large JSON); never modify `scripts/log-usage.sh` or `.usage-log/`.

## Open tickets

- [ ] **T6 — Real-browser verification pass**
  Goal: verify what jsdom structurally can't see.
  Files: e2e/** (Playwright) or documented audit in PROGRESS.md.
  Spec: try installing Playwright + chromium in this sandbox. If it installs: at 390×844 assert no horizontal overflow (scrollWidth ≤ 390) on the main screen, an open detail card, and a non-Infernus hero; spot-check tap-target boxes ≥40 px. If browsers can't install, do a targeted CSS audit (fixed widths, overflow-x) and record "unverified in real browser" honestly. Also: production `npm run build` + preview smoke — app must not crash with network disabled (item images may 404; that's acceptable offline).
  Verify: `npx playwright test` if installed, else the documented audit; `npm run build`

- [ ] **T7 — README + acceptance sweep**
  Goal: README.md documenting everything; final walk of the acceptance checklist in ROADMAP.md.
  Files: README.md.
  Spec: run instructions (`npm install`, `npm run fetch-data`, `npm run dev`); scoring-function inputs and exact weights + determinism statement; the ≥30% win-weighted core-set rule with experiments excluded; held-out design (generator never reads Zergggy — grep gate); every judgment call so far (pull from PROGRESS.md Decisions); parked/unverified items.
  Acceptance: README covers all of the above; all gates green; every box in ROADMAP.md's acceptance checklist verified or explicitly listed as failed/unverified — fix failures before checking this ticket.
  Verify: `npm run build && npm test && npm run gate:heldout`
