# PROGRESS — newest first, ≤25 lines per entry; past ~1,500 lines rotate all but newest ~10 entries verbatim to PROGRESS_ARCHIVE.md

## 2026-09-01 — orchestrator: project provisioned
- Repo scaffolded with durable state (GOALS/ROADMAP/CLAUDE/PROGRESS), usage Stop-hook (`scripts/log-usage.sh` + `.claude/settings.json`), autoCompactWindow 300000.
- Queue T1–T7 in GOALS.md; next fire takes T1 (scaffold + API reachability probe).
- Decisions: project lives at repo root (mandated `../../cloud-usage-hook` path); private GitHub repo; snapshots committed to `public/data/` so fires and builds work offline; permutation-stats fetched for Infernus only (budget); win-weight 1.5/1.0 for core-set; personalization = median standard-match duration annotating late-game budget. All to be restated in README (T7).
- Verified: nothing yet beyond git init + files present.
