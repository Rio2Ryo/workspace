"""Pure-Python ports of the gate checks implemented in `sync.sh.example`.

The shell script is the runtime path (launchd → bash). These helpers exist
so each guard can be unit-tested deterministically against synthetic SQLite
and JSON fixtures, without invoking bash or sqlite3 CLI. They are *also*
import-safe for any future Python orchestrator that wants to replace the
shell script with equivalent behaviour.

Guard semantics mirror the shell exactly. If you change a threshold here,
mirror it in sync.sh.example (or, better, replace the shell with this).
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path


# ── Tunables (must match sync.sh.example defaults) ──────────────────────

DEFAULT_COMMIT_MIN_GAP_SEC = 3600
DEFAULT_RECENT_CHECKS_WINDOW = 3
BAD_CHECK_STATUSES = frozenset({"error"})  # matches `grep -qi 'error'`


@dataclass(frozen=True)
class GuardDecision:
    """Single guard outcome.

    `proceed` is True only if every guard allows the sync to continue.
    `reason` is the human-readable explanation logged either way.
    """

    proceed: bool
    reason: str


# ── 1. DB delta detection ───────────────────────────────────────────────


def detect_delta(current_max: int, last_cursor: int) -> GuardDecision:
    """Skip when DB hasn't produced new rows since the last successful sync.

    The shell uses `<=` so an unchanged cursor (no growth) is also a skip.
    Negative cursor is treated as 0 to tolerate a corrupt cursor file.
    """
    cursor = max(0, last_cursor)
    if current_max <= cursor:
        return GuardDecision(False, f"no delta (max={current_max} cursor={cursor})")
    return GuardDecision(True, f"delta={current_max - cursor}")


# ── 2. Recent-failures guard ────────────────────────────────────────────


def recent_failures_guard(
    conn: sqlite3.Connection,
    *,
    window: int = DEFAULT_RECENT_CHECKS_WINDOW,
) -> GuardDecision:
    """Skip when any of the last `window` checks reported an error.

    Mirrors the shell's `grep -qi 'error'` against deduped recent statuses.
    'partial_error' contains the substring 'error' and so also triggers
    the skip — match the shell exactly even though we'd arguably prefer
    a stricter set test. If/when the shell tightens this, update both.
    """
    rows = conn.execute(
        "SELECT status FROM checks ORDER BY id DESC LIMIT ?",
        (window,),
    ).fetchall()
    statuses = [str(row[0]) for row in rows]
    bad = [s for s in statuses if "error" in s.lower()]
    if bad:
        return GuardDecision(
            False,
            f"recent failures detected (statuses={','.join(statuses) or '<none>'})",
        )
    return GuardDecision(True, f"recent statuses ok (statuses={','.join(statuses) or '<none>'})")


# ── 3. Commit-frequency guard ───────────────────────────────────────────


def commit_gap_guard(
    last_commit_ts: int,
    now_ts: int,
    *,
    min_gap_sec: int = DEFAULT_COMMIT_MIN_GAP_SEC,
) -> GuardDecision:
    """Skip when last snapshot commit happened too recently.

    `last_commit_ts == 0` means the file was never committed (or git log
    returned nothing) — allow the first commit through, as the shell does.
    """
    if last_commit_ts <= 0:
        return GuardDecision(True, "no prior commit recorded; allowing first sync")
    gap = now_ts - last_commit_ts
    if gap < min_gap_sec:
        return GuardDecision(False, f"commit gap {gap}s < {min_gap_sec}s")
    return GuardDecision(True, f"gap={gap}s")


# ── 4. Snapshot sanity (no BLOB / no local_path leaked) ─────────────────


FORBIDDEN_POST_KEYS = frozenset({"screenshot_png", "local_path"})


def _find_forbidden_key(node: object, trail: str) -> tuple[str, str] | None:
    """Walk dict/list trees, returning (forbidden_key, path) on first hit.

    Only DICT KEYS trip the guard — string values containing the literal
    text 'local_path' are legitimate (e.g., human-readable error
    messages) and must not false-positive.

    Returns None when nothing forbidden is present.
    """
    if isinstance(node, dict):
        for key, value in node.items():
            if key in FORBIDDEN_POST_KEYS:
                here = f"{trail}.{key}" if trail else key
                return key, here
            child_trail = f"{trail}.{key}" if trail else key
            found = _find_forbidden_key(value, child_trail)
            if found is not None:
                return found
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            child_trail = f"{trail}[{idx}]"
            found = _find_forbidden_key(item, child_trail)
            if found is not None:
                return found
    return None


def snapshot_sanity_check(snapshot_path: Path) -> GuardDecision:
    """Skip when the public snapshot has leaked private fields.

    The threads-watcher public status JSON must never expose the raw
    screenshot bytes (privacy/size) nor the local filesystem path
    (information disclosure). The shell does the same check via embedded
    Python; this is the canonical Python version.

    Walks the FULL snapshot tree (dicts + lists, all depths). Catches
    leaks not just in posts[i] but also in last_check, recent_stats,
    sync_state, and any future top-level field. Pre-rewrite the guard
    only inspected `posts[i].keys()`, so a `last_check.error.local_path`
    or a top-level `local_path` would have shipped to the public web UI
    without the guard noticing.
    """
    try:
        data = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return GuardDecision(False, f"snapshot not found: {snapshot_path}")
    except json.JSONDecodeError as exc:
        return GuardDecision(False, f"snapshot is not valid JSON: {exc}")

    # Valid JSON whose top level is not an object (a list / string /
    # number / null) — `.get` below would raise AttributeError. A guard
    # must reject it cleanly, not crash evaluate_all with a traceback.
    if not isinstance(data, dict):
        return GuardDecision(
            False, f"snapshot is not a JSON object (got {type(data).__name__})"
        )

    # Posts list must contain dicts only (per-element type pin).
    posts = data.get("posts") or []
    for idx, post in enumerate(posts):
        if not isinstance(post, dict):
            return GuardDecision(False, f"post[{idx}] is not an object")

    # Deep walk over the whole payload (root included).
    found = _find_forbidden_key(data, trail="")
    if found is not None:
        key, where = found
        # Format the location nicely for the historic `post[i] leaked...`
        # reason format used pre-rewrite tests, otherwise show the path
        # we found (e.g., `last_check.error.local_path`).
        if where.startswith("posts[") and where.count(".") == 1:
            # e.g. posts[1].screenshot_png → "post[1] leaked..." (preserve
            # the legacy phrasing exercised by existing tests).
            idx_part = where.split(".", 1)[0]  # 'posts[1]'
            idx = idx_part[len("posts["):-1]
            return GuardDecision(
                False, f"post[{idx}] leaked forbidden keys: ['{key}']"
            )
        return GuardDecision(
            False, f"leaked forbidden key at {where}: '{key}'"
        )

    return GuardDecision(True, f"snapshot ok ({len(posts)} posts checked)")


# ── 5. Composite: run all guards in shell order ─────────────────────────


@dataclass(frozen=True)
class SyncDecision:
    proceed: bool
    delta: int  # 0 when no delta or upstream check failed
    decisions: list[GuardDecision]

    def first_blocker(self) -> GuardDecision | None:
        for d in self.decisions:
            if not d.proceed:
                return d
        return None


def evaluate_all(
    *,
    current_max: int,
    last_cursor: int,
    conn: sqlite3.Connection,
    last_commit_ts: int,
    now_ts: int,
    snapshot_path: Path,
    min_gap_sec: int = DEFAULT_COMMIT_MIN_GAP_SEC,
    window: int = DEFAULT_RECENT_CHECKS_WINDOW,
) -> SyncDecision:
    """Run guards in the same order as the shell, short-circuit on first skip."""
    decisions: list[GuardDecision] = []
    delta_decision = detect_delta(current_max, last_cursor)
    decisions.append(delta_decision)
    if not delta_decision.proceed:
        return SyncDecision(False, 0, decisions)

    fail_decision = recent_failures_guard(conn, window=window)
    decisions.append(fail_decision)
    if not fail_decision.proceed:
        return SyncDecision(False, current_max - max(0, last_cursor), decisions)

    gap_decision = commit_gap_guard(last_commit_ts, now_ts, min_gap_sec=min_gap_sec)
    decisions.append(gap_decision)
    if not gap_decision.proceed:
        return SyncDecision(False, current_max - max(0, last_cursor), decisions)

    sanity_decision = snapshot_sanity_check(snapshot_path)
    decisions.append(sanity_decision)
    if not sanity_decision.proceed:
        return SyncDecision(False, current_max - max(0, last_cursor), decisions)

    return SyncDecision(True, current_max - max(0, last_cursor), decisions)
