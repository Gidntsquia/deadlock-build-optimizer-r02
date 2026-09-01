#!/usr/bin/env bash
# Claude Code Stop hook for cloud routine fires (token-efficiency experiment).
# In the cloud sandbox, the fire's full transcript (with per-message token
# usage) lives under ~/.claude/projects/. This hook dumps that usage into the
# repo (.usage-log/<session>.jsonl) and pushes, so the local tally can count
# cloud fires exactly. No-op outside the sandbox (local sessions are already
# counted from local transcripts — double-logging there would be noise).
set -u
[ "${LOG_USAGE_FORCE:-0}" = "1" ] || [ "$HOME" = "/home/user" ] || exit 0
TOP=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$TOP" || exit 0
mkdir -p .usage-log

python3 - <<'PY'
import glob
import json
import os
from pathlib import Path

seen = {}
first_stem = None
for f in sorted(glob.glob(os.path.expanduser("~/.claude/projects/**/*.jsonl"), recursive=True)):
    if first_stem is None:
        first_stem = Path(f).stem
    with open(f) as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("type") != "assistant":
                continue
            m = rec.get("message") or {}
            usage, mid = m.get("usage"), m.get("id")
            if not usage or not mid:
                continue
            seen[mid] = {
                "id": mid,
                "model": m.get("model"),
                "timestamp": rec.get("timestamp"),
                "usage": usage,
            }

out = Path(".usage-log") / f"{first_stem or 'session'}.jsonl"
with open(out, "w") as fh:
    for rec in seen.values():
        fh.write(json.dumps(rec) + "\n")
print(f"usage-log: {out} ({len(seen)} api calls)")
PY

git add .usage-log
git -c user.email=usage-hook@experiment -c user.name=usage-hook \
  commit -m "usage-log: record fire token usage" >/dev/null 2>&1
for _ in 1 2 3; do
  git push >/dev/null 2>&1 && break
  git pull --rebase >/dev/null 2>&1
done
exit 0
