# GOALS — Deadlock Build Optimizer

## Standing rules (every fire reads this first)
- USAGE-LOG WAIVER (user decision 2026-09-01T07:55Z): the Stop hook lands no `usage-log:` commits from the cloud sandbox (HOME-guard mismatch). The user explicitly waived the halt rule — NEVER halt, disable, or park the routine over missing usage-log commits. `scripts/log-usage.sh`, `.claude/settings.json`, `.usage-log/` still must never be modified.
- SANDBOX EGRESS: cloud fires CANNOT reach `api.deadlock-api.com` or `assets.deadlock-api.com` (org proxy rejects CONNECT, 403). Never attempt live API fetches in a fire, and never fabricate data. All real fetching is done LOCALLY by the orchestrator (T2b). Fires build code + tests that work offline against committed snapshots or small fixtures; a ticket blocked on missing snapshots gets skipped with a one-line PROGRESS.md note.
- ROUTINE: trigger id `trig_01QxmDBRdwQgKUHKsTf8ZNXg` · cron `13 * * * *` (hourly — 1h is the platform minimum; orchestrator eager-fires extra runs between ticks) · repo https://github.com/Gidntsquia/deadlock-build-optimizer-r02 · runs visible via claude.ai Code routines (RemoteTrigger list_runs with the trigger id)
- PACE: full (user 2026-09-01T18:05Z, budget healthy): finish your ticket, then KEEP TAKING the next unchecked ticket in the same fire while run budget remains — gates verified per ticket, one commit+archive move per ticket. Stop only when budget is genuinely low or the queue is empty.
- GATES — all must pass before checking any box: `npm run build` · `npm test` · `npm run gate:heldout` (required whenever src/ changed). Code review alone is not verification.
- HELD-OUT RULE (redesigned by user 2026-09-01T19:07Z): **Zergggy is now the TUNING set** — tuning generator constants to raise Zergggy-Infernus agreement is allowed and expected (T19). **`public/data/heldout-ctc/` (player ctc, Drifter) is the new HELD-OUT test set**: only `src/validation/` may read it, NOTHING may ever be tuned toward its agreement number — it is measured and reported, full stop. Mechanical isolation unchanged for both: nothing under `src/generator/` may read, import, or reference `public/data/zergggy/` or `public/data/heldout-ctc/` (nor contain the strings "zergggy"/"heldout-ctc" — gate:heldout now checks both); tuned constants land in the generator as plain numbers, the tuning harness lives outside `src/generator/`.
- DATA: snapshots are committed under `public/data/`; the app reads ONLY snapshots (fully offline after fetch). Keep total snapshot size < 15 MB by pruning fields. fetch-data politeness: sequential requests, ≥300 ms sleep between calls, one retry after 5 s on HTTP 429.
- Checking a box: move the finished ticket block VERBATIM to GOALS_ARCHIVE.md in the same commit.
- Prefer zero runtime deps beyond react/react-dom; log any addition in PROGRESS.md with a reason.
- Do not grep or read `public/data/` wholesale (large JSON); never modify `scripts/log-usage.sh` or `.usage-log/`.

## Open tickets

(queue empty — next fire should check ROADMAP.md's known gaps per PACE:full)
