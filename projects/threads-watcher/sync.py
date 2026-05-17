"""Threads-watcher snapshot sync — Python orchestrator.

Replaces sync.sh.example. Same guard semantics (tested in
test_sync_guards.py), but Python end-to-end so the cursor/git flow is
also unit-testable and the launchd job can stop depending on bash.

Default behaviour is DRY: nothing is staged, committed, or pushed
unless you pass --confirm. --enable-push additionally enables push,
and only takes effect together with --confirm.

Usage examples:
  python3 sync.py                                      # full dry-run, no writes
  python3 sync.py --confirm                            # commit only (no push)
  python3 sync.py --confirm --enable-push              # commit + push
  python3 sync.py --min-gap-sec 0 --confirm            # bypass commit-gap guard

Exit codes:
  0   ran cleanly (commit may or may not have happened, see log)
  1   guard blocked OR commit/push subprocess failed
  2   bad CLI arguments
"""

from __future__ import annotations

import argparse
import os
import shlex
import sqlite3
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sync_guards import (
    DEFAULT_COMMIT_MIN_GAP_SEC,
    DEFAULT_RECENT_CHECKS_WINDOW,
    SyncDecision,
    evaluate_all,
)

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_DB = PROJECT_ROOT / "threads_watcher.db"
DEFAULT_SNAPSHOT = PROJECT_ROOT / "threads-watcher-status" / "state.json"
DEFAULT_CURSOR = PROJECT_ROOT / ".sync_cursor"
DEFAULT_LOG = PROJECT_ROOT / "logs" / "sync.log"
DEFAULT_WORKSPACE = PROJECT_ROOT.parent.parent  # .../workspace
DEFAULT_BRANCH = "shiro/phase2-perf-metrics"

SNAPSHOT_REL_FROM_WORKSPACE = "projects/threads-watcher/threads-watcher-status/state.json"


# ── pure helpers (unit-tested) ──────────────────────────────────────────


def read_cursor(path: Path) -> int:
    """Return last-synced max(posts.id). Missing/corrupt file → 0.

    Treating a corrupt file as 0 means the next run does a full
    re-evaluation rather than dying. Combined with detect_delta's
    `current_max > cursor`, the worst case is one extra (small) commit.
    """
    try:
        raw = path.read_text(encoding="utf-8").strip()
        return max(0, int(raw))
    except (FileNotFoundError, ValueError):
        return 0


def write_cursor(path: Path, value: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{value}\n", encoding="utf-8")


def build_commit_message(now_iso: str, delta: int) -> str:
    """Mirror sync.sh's commit-message shape so log greps stay portable."""
    return f"chore(threads-watcher): snapshot @ {now_iso} (delta={delta})"


def build_git_add_args(workspace: Path, relpath: str) -> list[str]:
    return ["git", "-C", str(workspace), "add", "--", relpath]


def build_git_commit_args(workspace: Path, message: str) -> list[str]:
    return ["git", "-C", str(workspace), "commit", "-m", message]


def build_git_push_args(workspace: Path, branch: str) -> list[str]:
    return ["git", "-C", str(workspace), "push", "origin", branch]


def build_git_last_commit_ts_args(workspace: Path, relpath: str) -> list[str]:
    return [
        "git", "-C", str(workspace),
        "log", "-1", "--format=%ct", "--", relpath,
    ]


def get_max_post_id(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COALESCE(MAX(id), 0) AS m FROM posts").fetchone()
    return int(row[0]) if row else 0


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── subprocess wrapper (not directly unit-tested) ───────────────────────


@dataclass
class CmdResult:
    args: list[str]
    returncode: int
    stdout: str
    stderr: str


def run_cmd(args: list[str], *, check: bool = False) -> CmdResult:
    p = subprocess.run(args, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(
            f"command failed (exit={p.returncode}): {shlex.join(args)}\n{p.stderr}"
        )
    return CmdResult(args=args, returncode=p.returncode, stdout=p.stdout.strip(), stderr=p.stderr.strip())


def get_last_commit_ts(workspace: Path, relpath: str) -> int:
    """Unix epoch seconds of the most recent commit touching relpath.

    Returns 0 if the file has never been committed (matches shell).
    """
    res = run_cmd(build_git_last_commit_ts_args(workspace, relpath))
    if res.returncode != 0 or not res.stdout:
        return 0
    try:
        return int(res.stdout)
    except ValueError:
        return 0


# ── logging ─────────────────────────────────────────────────────────────


class TeeLogger:
    """Append-to-file + stderr. No rotation; matches sync.sh logger."""

    def __init__(self, log_path: Path):
        self.log_path = log_path
        log_path.parent.mkdir(parents=True, exist_ok=True)

    def log(self, msg: str) -> None:
        line = f"{now_iso()} {msg}\n"
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(line)
        sys.stderr.write(line)


# ── orchestration ───────────────────────────────────────────────────────


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Threads-watcher snapshot sync — Python orchestrator (replaces sync.sh.example).",
    )
    p.add_argument("--db", type=Path, default=DEFAULT_DB)
    p.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    p.add_argument("--cursor", type=Path, default=DEFAULT_CURSOR)
    p.add_argument("--log", type=Path, default=DEFAULT_LOG)
    p.add_argument("--workspace", type=Path, default=DEFAULT_WORKSPACE,
                   help="Path to the git repo containing the snapshot file.")
    p.add_argument("--snapshot-rel", default=SNAPSHOT_REL_FROM_WORKSPACE,
                   help="Snapshot path relative to --workspace, used by git add/log.")
    p.add_argument("--branch", default=DEFAULT_BRANCH)
    p.add_argument("--min-gap-sec", type=int, default=DEFAULT_COMMIT_MIN_GAP_SEC)
    p.add_argument("--window", type=int, default=DEFAULT_RECENT_CHECKS_WINDOW)
    p.add_argument("--confirm", action="store_true",
                   help="Actually commit. Without it, dry-run only — no git writes.")
    p.add_argument("--enable-push", action="store_true",
                   help="Also push after commit. Only effective with --confirm.")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    log = TeeLogger(args.log)

    if not args.db.exists():
        log.log(f"ERROR: db not found: {args.db}")
        return 1
    if not args.snapshot.exists():
        log.log(f"ERROR: snapshot not found: {args.snapshot}")
        return 1

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    try:
        current_max = get_max_post_id(conn)
        last_cursor = read_cursor(args.cursor)
        last_commit_ts = get_last_commit_ts(args.workspace, args.snapshot_rel)
        now_ts = int(time.time())

        decision = evaluate_all(
            current_max=current_max,
            last_cursor=last_cursor,
            conn=conn,
            last_commit_ts=last_commit_ts,
            now_ts=now_ts,
            snapshot_path=args.snapshot,
            min_gap_sec=args.min_gap_sec,
            window=args.window,
        )

        _log_decision(log, decision, current_max, last_cursor)

        if not decision.proceed:
            return 0  # guard skip is healthy behavior, not a failure

        if not args.confirm:
            log.log(
                f"DRY: would `git add` + commit "
                f"\"{build_commit_message(now_iso(), decision.delta)}\""
                + (f" then push origin {args.branch}" if args.enable_push else "")
            )
            log.log(f"DRY: would update cursor: {last_cursor} -> {current_max}")
            return 0

        return _do_commit_and_maybe_push(args, log, current_max, decision)
    finally:
        conn.close()


def _log_decision(log: TeeLogger, decision: SyncDecision, current_max: int, last_cursor: int) -> None:
    log.log(f"db_max={current_max} cursor={last_cursor} delta={decision.delta} proceed={decision.proceed}")
    for d in decision.decisions:
        log.log(f"  guard: {'OK ' if d.proceed else 'SKIP'} | {d.reason}")


def _do_commit_and_maybe_push(
    args: argparse.Namespace,
    log: TeeLogger,
    current_max: int,
    decision: SyncDecision,
) -> int:
    add_res = run_cmd(build_git_add_args(args.workspace, args.snapshot_rel))
    if add_res.returncode != 0:
        log.log(f"ERROR: git add failed: {add_res.stderr}")
        return 1

    # If staged diff is empty, the in-DB snapshot already matches what
    # git has — bump the cursor anyway so we don't keep re-checking,
    # but skip the commit (mirrors sync.sh §5).
    diff_check = run_cmd(
        ["git", "-C", str(args.workspace), "diff", "--cached", "--quiet"]
    )
    if diff_check.returncode == 0:
        log.log("snapshot already matches git index; no commit needed")
        write_cursor(args.cursor, current_max)
        return 0

    message = build_commit_message(now_iso(), decision.delta)
    commit_res = run_cmd(build_git_commit_args(args.workspace, message))
    if commit_res.returncode != 0:
        log.log(f"ERROR: git commit failed: {commit_res.stderr}")
        return 1
    log.log(f"committed: {message}")
    write_cursor(args.cursor, current_max)

    if not args.enable_push:
        log.log("ENABLE_PUSH not set, skipping push (commit local only)")
        return 0

    push_res = run_cmd(build_git_push_args(args.workspace, args.branch))
    if push_res.returncode != 0:
        log.log(f"ERROR: git push failed: {push_res.stderr}")
        return 1
    log.log(f"pushed to origin {args.branch}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
