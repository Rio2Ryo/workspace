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
import json
import os
import shlex
import socket
import sqlite3
import subprocess
import sys
import time
from collections.abc import Callable
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
DEFAULT_DRY_STATE = PROJECT_ROOT / "logs" / "dry-run-state.json"
DEFAULT_WORKSPACE = PROJECT_ROOT.parent.parent  # .../workspace
DEFAULT_BRANCH = "shiro/phase2-perf-metrics"
DEFAULT_LOCKDIR = PROJECT_ROOT / ".sync.lock.d"

SNAPSHOT_REL_FROM_WORKSPACE = "projects/threads-watcher/threads-watcher-status/state.json"
SCREENSHOT_ASSETS_REL_FROM_WORKSPACE = "projects/threads-watcher/threads-watcher-status/screenshots"

# After this many consecutive ticks of "DRY: would commit (delta=N)" with
# unchanged delta, emit an ALERT line so operators see the dry-run is
# accumulating un-acted-on work. 3 ticks at 30-min cadence = ~90 minutes
# of pending — long enough to skip flapping deltas, short enough to
# surface in a single morning scroll of the log.
DRY_RUN_ALERT_THRESHOLD = 3

# A held lockdir older than this — or owned by a PID that is no longer
# alive — is treated as stale and reclaimed. sync.py runs for seconds;
# the launchd cadence is 30 min, so an hour-old lock cannot belong to a
# live run. Without staleness detection a sync.py killed by SIGKILL /
# OOM / reboot (all of which skip release_lock's finally block) wedges
# the lockdir forever: every later launchd tick hits FileExistsError,
# logs "skipping", and exits 0 — auto-sync silently dies while looking
# healthy in `launchctl list`.
DEFAULT_LOCK_STALE_SEC = 3600


# ── pure helpers (unit-tested) ──────────────────────────────────────────


# ── dry-run accumulation tracker ────────────────────────────────────────
#
# Each launchd tick is a fresh Python process, so "consecutive dry-run
# decisions" can't be tracked in-memory. We persist a tiny JSON file
# (logs/dry-run-state.json) with `{delta, count, since}` so the next
# tick can decide whether to escalate. The pure helpers below are
# tested without touching the filesystem; the I/O wrapper is a thin
# read-mutate-write at the route.


@dataclass(frozen=True)
class DryRunState:
    """Persisted across launchd ticks. `delta` is the pending DB delta
    the LAST tick said it would commit; `count` is how many ticks in a
    row that same delta has stayed pending; `since` is the wall-clock
    timestamp of the FIRST tick in the current streak."""
    delta: int
    count: int
    since: str  # ISO8601 UTC


def update_dry_run_state(
    prev: DryRunState | None,
    current_delta: int,
    now_ts_iso: str,
) -> DryRunState:
    """Pure: given the prior tick's state and the current tick's delta,
    return the next state.

    - Unchanged non-zero delta → bump count, keep `since`.
    - Changed delta → reset count to 1, set `since` to now.
    - Zero/negative delta (nothing to do) → also resets — we only care
      about consecutive ticks of REAL pending work.
    """
    if current_delta <= 0:
        return DryRunState(delta=current_delta, count=0, since=now_ts_iso)
    if prev is None or prev.delta != current_delta:
        return DryRunState(delta=current_delta, count=1, since=now_ts_iso)
    return DryRunState(delta=current_delta, count=prev.count + 1, since=prev.since)


def should_emit_dry_run_alert(state: DryRunState, threshold: int = DRY_RUN_ALERT_THRESHOLD) -> bool:
    """Emit an ALERT only when the same delta has been pending for at
    least `threshold` consecutive ticks. The boundary is "at least" so
    threshold=3 emits on the 3rd, 4th, ... tick (1st + 2nd are quiet)."""
    return state.count >= threshold and state.delta > 0


def get_active_dry_run_alert(
    state_path: Path = DEFAULT_DRY_STATE,
    threshold: int = DRY_RUN_ALERT_THRESHOLD,
) -> dict | None:
    """Read the persisted dry-run state and return a serializable
    alert payload if the threshold has been reached.

    Used by watcher._write_web_snapshot_from_db to surface the alert
    into threads-watcher-status/state.json so the web UI can render
    a banner. Returns None when there's no alert (state missing,
    streak under threshold, or delta cleared) so the UI hides the
    banner without extra JS branching.

    Side-effect-free; safe to call from any process that has read
    access to the state file. Returns plain dict (not the
    DryRunState dataclass) so json.dumps can serialize it directly
    into the snapshot payload.
    """
    state = load_dry_run_state(state_path)
    if state is None:
        return None
    if not should_emit_dry_run_alert(state, threshold):
        return None
    return {
        "pending_ticks": state.count,
        "since": state.since,
        "delta": state.delta,
    }


def load_dry_run_state(path: Path) -> DryRunState | None:
    """Read the persisted state file. Missing / corrupt → None (fresh start)."""
    try:
        import json
        data = json.loads(path.read_text(encoding="utf-8"))
        return DryRunState(
            delta=int(data["delta"]),
            count=int(data["count"]),
            since=str(data["since"]),
        )
    except (FileNotFoundError, ValueError, KeyError, TypeError):
        return None


def save_dry_run_state(path: Path, state: DryRunState) -> None:
    """Persist the state. Best-effort — failure logs but doesn't bring
    down the sync (the worst case is the next tick starts a fresh streak,
    so the alert will be slightly delayed)."""
    try:
        import json
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "delta": state.delta,
            "count": state.count,
            "since": state.since,
        }), encoding="utf-8")
    except OSError:
        # Don't propagate — the dry-run still ran correctly, only the
        # accumulator missed a beat. Print to stderr so an operator
        # tailing logs sees it.
        sys.stderr.write(f"WARN: failed to save dry-run state to {path}\n")


def clear_dry_run_state(path: Path) -> None:
    """Remove the dry-run accumulator file — called when the streak is
    resolved: a real commit landed (--confirm), or the delta dropped to
    0 (nothing pending). Without this the stale file would keep
    get_active_dry_run_alert() emitting a 'dry-run stuck' ALERT long
    after syncs resumed. Best-effort: a missing file is the desired end
    state anyway, so unlink failure only warns."""
    try:
        path.unlink(missing_ok=True)
    except OSError as e:
        sys.stderr.write(f"WARN: failed to clear dry-run state {path}: {e}\n")


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


def build_git_commit_args(workspace: Path, message: str, relpath: str, extra_relpaths: list[str] | None = None) -> list[str]:
    """Commit ONLY the snapshot path.

    A bare `git commit -m ...` sweeps every staged change into the
    snapshot commit. With the workspace also hosting unrelated WIP, that
    means an accidental `git add -A` elsewhere — or a partially-staged
    bug-fix — could ride along on the next sync. Scoping with `-- relpath`
    forces git to commit only what matches the pathspec, leaving any
    other staged changes still staged and untouched.
    """
    return ["git", "-C", str(workspace), "commit", "-m", message, "--", relpath, *(extra_relpaths or [])]


def build_git_push_args(workspace: Path, branch: str) -> list[str]:
    return ["git", "-C", str(workspace), "push", "origin", branch]


def build_git_last_commit_ts_args(workspace: Path, relpath: str) -> list[str]:
    return [
        "git", "-C", str(workspace),
        "log", "-1", "--format=%ct", "--", relpath,
    ]


def build_git_staged_other_paths_args(workspace: Path, relpath: str, extra_allowed_relpaths: list[str] | None = None) -> list[str]:
    """List staged paths *other than* the snapshot.

    Used as a pre-commit safety net: if anything unrelated is already
    staged, we refuse to commit instead of silently bundling it.
    """
    exclusions = [f":!{relpath}"] + [f":!{p}" for p in (extra_allowed_relpaths or [])]
    return [
        "git", "-C", str(workspace),
        "diff", "--cached", "--name-only",
        "--", ".", *exclusions,
    ]


def build_git_diff_cached_snapshot_args(workspace: Path, relpath: str) -> list[str]:
    """Detect whether the snapshot itself has any staged changes."""
    return build_git_diff_cached_allowed_args(workspace, relpath, [])


def build_git_diff_cached_allowed_args(workspace: Path, relpath: str, extra_relpaths: list[str] | None = None) -> list[str]:
    """Detect whether the snapshot or allowed companion assets are staged."""
    return [
        "git", "-C", str(workspace),
        "diff", "--cached", "--quiet", "--", relpath, *(extra_relpaths or []),
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


# Rotation primitive lives in log_rotation.py so both TeeLogger
# (Python-internal, per-log() call) and restart-watcher.sh
# (bash-invoked at watcher restart time) share the same dance.
# Backwards-compat alias preserved — existing tests import
# `_rotate_log_files` from sync.py.
from log_rotation import rotate_log_files as _rotate_log_files  # noqa: E402, F401


class TeeLogger:
    """Append-to-file logger with optional stderr mirror and optional
    size-based rotation.

    Stderr mirror (`also_stderr`)
    -----------------------------
    Pre-fix the logger unconditionally wrote to both file and stderr;
    under launchd that produced two near-identical files (logs/sync.log
    + StandardErrorPath capture of stderr). File-only is the new
    default; operator TTY runs and `--tee-stderr` opt back in.

    Rotation (`max_bytes`, `backup_count`)
    --------------------------------------
    Default `max_bytes=0` is no rotation (back-compat with pre-existing
    callers that just want unbounded append). When `max_bytes > 0`,
    every log() call checks the file size BEFORE writing; if a write
    would push past the threshold, the current file is rotated to
    `path.1` (existing `.N` shifted to `.N+1`, anything past
    `backup_count` dropped) and a fresh file is opened. Matches
    stdlib RotatingFileHandler semantics without subclassing — we
    keep the timestamp-prefix format under our control.

    Rotation IS triggered by the current write (not the next one)
    so an oversize append never lands. Atomicity: rename is the only
    cross-process mutation; reads of `path` from a concurrent process
    either see the old name (just before rename) or the new file
    (after rename), never a torn read.
    """

    def __init__(
        self,
        log_path: Path,
        also_stderr: bool = False,
        max_bytes: int = 0,
        backup_count: int = 5,
    ):
        self.log_path = log_path
        self.also_stderr = also_stderr
        self.max_bytes = max_bytes
        self.backup_count = backup_count
        log_path.parent.mkdir(parents=True, exist_ok=True)

    def log(self, msg: str) -> None:
        line = f"{now_iso()} {msg}\n"
        line_bytes = line.encode("utf-8")
        if self.max_bytes > 0 and self.log_path.exists():
            current = self.log_path.stat().st_size
            if current + len(line_bytes) > self.max_bytes:
                _rotate_log_files(self.log_path, self.backup_count)
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(line)
        if self.also_stderr:
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
    p.add_argument("--screenshot-assets-rel", default=SCREENSHOT_ASSETS_REL_FROM_WORKSPACE,
                   help="Screenshot assets directory relative to --workspace; committed with the snapshot when present.")
    p.add_argument("--branch", default=DEFAULT_BRANCH)
    p.add_argument("--min-gap-sec", type=int, default=DEFAULT_COMMIT_MIN_GAP_SEC)
    p.add_argument("--window", type=int, default=DEFAULT_RECENT_CHECKS_WINDOW)
    p.add_argument("--confirm", action="store_true",
                   help="Actually commit. Without it, dry-run only — no git writes.")
    p.add_argument(
        "--lockdir",
        type=Path,
        default=DEFAULT_LOCKDIR,
        help=(
            "Per-process mkdir-atomic mutex directory. Default is "
            f"{DEFAULT_LOCKDIR}. Override for tests or alternate cron "
            "tenants. Only one sync.py can hold this directory at a time."
        ),
    )
    p.add_argument(
        "--lock-stale-sec",
        type=int,
        default=DEFAULT_LOCK_STALE_SEC,
        help=(
            "A held --lockdir is reclaimed as stale when it is owned "
            "by a dead PID, or older than N seconds. Default "
            f"{DEFAULT_LOCK_STALE_SEC} (1h) — longer than any real "
            "sync run, so a live run is never reclaimed, but short "
            "enough that a lock wedged by a SIGKILL / OOM / reboot "
            "(which all skip release_lock) self-heals."
        ),
    )
    p.add_argument("--enable-push", action="store_true",
                   help="Also push after commit. Only effective with --confirm.")
    p.add_argument(
        "--dry-state",
        type=Path,
        default=DEFAULT_DRY_STATE,
        help=(
            "Persistent state file for the dry-run accumulator. "
            "Tracks consecutive ticks of identical pending delta so "
            "the next tick can emit an ALERT after threshold "
            f"({DRY_RUN_ALERT_THRESHOLD}) ticks. Override for tests."
        ),
    )
    p.add_argument(
        "--tee-stderr",
        action="store_true",
        help=(
            "Mirror every log line to stderr in addition to the "
            "--log file. Default: false (file-only — avoids the "
            "double-write into launchd's StandardErrorPath). Pass "
            "this when running interactively from a TTY."
        ),
    )
    p.add_argument(
        "--max-log-bytes",
        type=int,
        default=0,
        help=(
            "Rotate --log when it exceeds N bytes. Default 0 = no "
            "rotation (unbounded append). 1048576 (1 MB) is a "
            "reasonable launchd-cadence value: at ~5 lines/tick × "
            "30-min cadence, rotation fires roughly every ~3-4 "
            "months and 5 backups = ~5 MB ceiling."
        ),
    )
    p.add_argument(
        "--log-backup-count",
        type=int,
        default=5,
        help=(
            "Number of rotated log backups to keep (path.1 .. "
            "path.N). Only effective when --max-log-bytes > 0."
        ),
    )
    return p.parse_args(argv)


_LOCK_OWNER_FILENAME = "owner.json"


def _pid_alive(pid: int) -> bool:
    """True if a process with `pid` currently exists. `os.kill(pid, 0)`
    sends no signal — it only probes existence. PermissionError means
    the PID exists but is owned by another user, so it is still alive."""
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _write_lock_owner(lockdir: Path) -> None:
    """Record who holds the lock so a later contender can tell a live
    holder from a crashed one. Best-effort: the mkdir IS the lock and
    this file is only staleness metadata, so a failed write must not
    abort acquisition — the TTL fallback still works without it."""
    owner = {
        "pid": os.getpid(),
        "host": socket.gethostname(),
        "started_ts": int(time.time()),
        "started_at": now_iso(),
    }
    try:
        (lockdir / _LOCK_OWNER_FILENAME).write_text(
            json.dumps(owner), encoding="utf-8"
        )
    except OSError:
        pass


def _read_lock_owner(lockdir: Path) -> dict | None:
    """Parse the lockdir's owner.json; None when missing or corrupt."""
    try:
        owner = json.loads(
            (lockdir / _LOCK_OWNER_FILENAME).read_text(encoding="utf-8")
        )
        return owner if isinstance(owner, dict) else None
    except (OSError, ValueError):
        return None


def lock_is_stale(lockdir: Path, stale_after_sec: int) -> bool:
    """Decide whether an existing lockdir was abandoned by a dead run.

    Two signals, in priority order:
      1. A same-host owner.json naming a PID that is no longer alive →
         unambiguously stale (recovers on the very next tick after a
         crash, without waiting for the TTL).
      2. Age > stale_after_sec → stale. The fallback for when owner.json
         is missing/corrupt (a pre-staleness lockdir, or the holder died
         in the window between mkdir and the owner.json write), when the
         PID lives on another host we can't probe, or when a same-host
         PID is alive but has hung far past any plausible sync duration.

    A live same-host PID still inside the TTL window is treated as a
    genuine holder (returns False)."""
    owner = _read_lock_owner(lockdir)
    if owner is not None and owner.get("host") == socket.gethostname():
        pid = owner.get("pid")
        if isinstance(pid, int) and not _pid_alive(pid):
            return True
    started_ts = owner.get("started_ts") if owner else None
    if not isinstance(started_ts, (int, float)):
        try:
            started_ts = lockdir.stat().st_mtime
        except OSError:
            return False
    return (time.time() - started_ts) > stale_after_sec


def acquire_lock(
    lockdir: Path,
    *,
    stale_after_sec: int = DEFAULT_LOCK_STALE_SEC,
    log: Callable[[str], None] | None = None,
) -> bool:
    """mkdir-atomic lock. Returns True on success, False if another sync
    is genuinely in progress. Matches restart-watcher.sh's lock pattern
    (4355a8a) — portable across macOS / Linux without flock(1) which
    macOS doesn't ship.

    Race scenario this prevents (real once --confirm is enabled):
      launchd 30-min cycle fires AND operator runs `python sync.py
      --confirm` manually within the same second. Both read the same
      cursor, both git add + git commit — second commit either
      duplicates the first or hits an index.lock conflict. With
      --enable-push, both push, second push fast-forwards over the
      first.

    Stale-lock recovery: release_lock only runs in main()'s finally
    block, so a SIGKILL / OOM-kill / power loss leaves the lockdir
    behind. A bare mkdir lock would then wedge every future tick. So a
    contended lock is probed via lock_is_stale(); a dead owner PID or
    an age past stale_after_sec means the holder is gone, and the lock
    is reclaimed (rmdir + one retry mkdir). If a competitor reclaims
    first, the retry mkdir fails and we correctly return False — the
    residual reclaim race needs two live syncs starting within the same
    microsecond against a pre-existing stale lock, which a 30-min
    periodic job does not produce.

    Caller releases via release_lock() in a finally block.
    """
    try:
        lockdir.mkdir(parents=False, exist_ok=False)
        _write_lock_owner(lockdir)
        return True
    except FileExistsError:
        pass

    if not lock_is_stale(lockdir, stale_after_sec):
        return False

    if log is not None:
        log(
            f"recovered stale sync lock {lockdir} — previous run did "
            f"not release it (SIGKILL / OOM / reboot)"
        )
    try:
        (lockdir / _LOCK_OWNER_FILENAME).unlink()
    except OSError:
        pass
    try:
        lockdir.rmdir()
    except OSError:
        # Another contender is mid-reclaim, or the dir gained content
        # we don't own — yield rather than risk clobbering it.
        return False
    try:
        lockdir.mkdir(parents=False, exist_ok=False)
        _write_lock_owner(lockdir)
        return True
    except FileExistsError:
        return False


def release_lock(lockdir: Path) -> None:
    """Best-effort lock release. Idempotent — repeated calls are safe.
    Removes the owner.json metadata file first so the rmdir does not
    fail on a non-empty directory. Swallows OSError so a missing /
    already-removed lockdir doesn't mask the real error that brought
    us here."""
    try:
        (lockdir / _LOCK_OWNER_FILENAME).unlink()
    except OSError:
        pass
    try:
        lockdir.rmdir()
    except OSError:
        pass


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    # Auto-enable stderr mirror when stderr is a TTY (interactive run);
    # CLI --tee-stderr is the explicit override for non-TTY cases where
    # the operator still wants both streams. launchd's stderr is a file
    # descriptor → isatty() is False → no double write.
    also_stderr = args.tee_stderr or (
        getattr(sys.stderr, "isatty", lambda: False)()
    )
    log = TeeLogger(
        args.log,
        also_stderr=also_stderr,
        max_bytes=args.max_log_bytes,
        backup_count=args.log_backup_count,
    )

    if not args.db.exists():
        log.log(f"ERROR: db not found: {args.db}")
        return 1
    if not args.snapshot.exists():
        log.log(f"ERROR: snapshot not found: {args.snapshot}")
        return 1

    # Lock BEFORE opening the DB / reading the cursor. The launchd cycle
    # is purely periodic — if another sync is in progress, skipping this
    # tick is the right answer (the next tick will catch up).
    if not acquire_lock(
        args.lockdir, stale_after_sec=args.lock_stale_sec, log=log.log
    ):
        log.log(
            f"another sync.py is in progress — skipping "
            f"(lock dir {args.lockdir} exists)"
        )
        log.log(f"  (operator force: rm -rf {args.lockdir} && python sync.py ...)")
        return 0

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
            # A zero delta means nothing is pending — resolve any
            # dry-run streak so the status page stops showing a stale
            # "dry-run stuck" alert. A guard skip with delta > 0 leaves
            # the streak intact: the work is still genuinely pending.
            if decision.delta == 0:
                clear_dry_run_state(args.dry_state)
            return 0  # guard skip is healthy behavior, not a failure

        if not args.confirm:
            # Dry-run accumulator: emit an ALERT when the same delta
            # has been pending for N consecutive ticks. Operators
            # running `launchctl list` see exit=0 (healthy) but the
            # system is doing nothing productive — this surfaces it
            # in the log without changing behaviour.
            prev_state = load_dry_run_state(args.dry_state)
            now_iso_str = now_iso()
            next_state = update_dry_run_state(prev_state, decision.delta, now_iso_str)
            if should_emit_dry_run_alert(next_state):
                log.log(
                    f"ALERT: dry-run pending for {next_state.count} ticks "
                    f"since {next_state.since} (delta={next_state.delta}); "
                    f"promote to live by adding --confirm to the plist's "
                    f"ProgramArguments and launchctl unload/load"
                )
            save_dry_run_state(args.dry_state, next_state)

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
        release_lock(args.lockdir)


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
    # Pre-commit safety: if anything *other than* the snapshot is already
    # staged (e.g., a half-prepared bug-fix in some other project, or
    # something an `git add -A` swept up), refuse rather than letting the
    # snapshot commit silently include unrelated WIP. The path-scoped
    # commit below would already skip those changes, but the workspace
    # staying dirty after we run is itself a footgun — we surface it.
    asset_relpaths = []
    if args.screenshot_assets_rel and (args.workspace / args.screenshot_assets_rel).exists():
        asset_relpaths.append(args.screenshot_assets_rel)

    other = run_cmd(build_git_staged_other_paths_args(args.workspace, args.snapshot_rel, asset_relpaths))
    if other.returncode != 0:
        log.log(f"ERROR: git diff --cached probe failed: {other.stderr}")
        return 1
    if other.stdout:
        log.log(
            "ABORT: unrelated files are already staged in the workspace; "
            "refusing to commit to avoid bundling WIP into the snapshot commit. "
            f"staged-others: {other.stdout.replace(chr(10), ', ')}"
        )
        return 1

    add_res = run_cmd(build_git_add_args(args.workspace, args.snapshot_rel))
    if add_res.returncode != 0:
        log.log(f"ERROR: git add failed: {add_res.stderr}")
        return 1
    for asset_rel in asset_relpaths:
        asset_add_res = run_cmd(build_git_add_args(args.workspace, asset_rel))
        if asset_add_res.returncode != 0:
            log.log(f"ERROR: git add screenshots failed: {asset_add_res.stderr}")
            return 1

    # If staged diff is empty for *just the snapshot*, the in-DB snapshot
    # already matches what git has — bump the cursor anyway so we don't
    # keep re-checking, but skip the commit (mirrors sync.sh §5).
    diff_check = run_cmd(build_git_diff_cached_allowed_args(args.workspace, args.snapshot_rel, asset_relpaths))
    if diff_check.returncode == 0:
        log.log("snapshot and screenshot assets already match git index; no commit needed")
        write_cursor(args.cursor, current_max)
        clear_dry_run_state(args.dry_state)
        return 0

    message = build_commit_message(now_iso(), decision.delta)
    commit_res = run_cmd(build_git_commit_args(args.workspace, message, args.snapshot_rel, asset_relpaths))
    if commit_res.returncode != 0:
        log.log(f"ERROR: git commit failed: {commit_res.stderr}")
        return 1
    log.log(f"committed: {message}")
    write_cursor(args.cursor, current_max)
    # The pending delta is now in git — resolve any dry-run streak so a
    # stale "dry-run stuck" alert can't outlive the work it tracked.
    clear_dry_run_state(args.dry_state)

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
