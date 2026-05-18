"""Health checks derived from the SQLite audit log.

These functions detect operational regressions (e.g., DOM scraping broke and
watcher silently records zero-found checks) without needing live network
calls. Designed to be cron-callable via `watcher.py --health-check`.

Also exposes the real-time partial-result judgment used inside the watcher's
main loop, so the same DOM-regression heuristic is unit-tested in one place.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


REGRESSION_THRESHOLD = 3
"""Default: N consecutive checks with found_count=0 after at least one
check found posts implies the scraper is broken."""


@dataclass(frozen=True)
class HealthReport:
    handle: str
    is_healthy: bool
    reason: str
    recent_checks: list[dict]

    def to_text(self) -> str:
        lines = [f"handle={self.handle} healthy={self.is_healthy}", f"reason={self.reason}"]
        for c in self.recent_checks:
            lines.append(
                f"  - checked_at={c['checked_at']} found={c['found_count']} new={c['new_count']} status={c['status']}"
            )
        return "\n".join(lines)


def _recent_checks(conn: sqlite3.Connection, handle: str, n: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT checked_at, found_count, new_count, status, error
        FROM checks
        WHERE handle = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (handle, n),
    ).fetchall()
    return [dict(row) for row in rows]


def _ever_found_posts(conn: sqlite3.Connection, handle: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM checks WHERE handle = ? AND found_count > 0 LIMIT 1",
        (handle,),
    ).fetchone()
    return row is not None


def check_dom_regression(
    conn: sqlite3.Connection,
    handle: str,
    *,
    threshold: int = REGRESSION_THRESHOLD,
) -> HealthReport:
    """Return a HealthReport flagging DOM regression.

    Heuristic: if the most recent `threshold` checks all reported
    found_count=0 AND the handle has previously found posts, the scraper
    is most likely broken (DOM changed, blocked by anti-bot, profile
    privated, etc.).
    """
    recent = _recent_checks(conn, handle, threshold)

    if len(recent) < threshold:
        return HealthReport(
            handle=handle,
            is_healthy=True,
            reason=f"not enough history yet ({len(recent)}/{threshold} checks)",
            recent_checks=recent,
        )

    if any(c["found_count"] > 0 for c in recent):
        return HealthReport(
            handle=handle,
            is_healthy=True,
            reason=f"at least one of the last {threshold} checks found posts",
            recent_checks=recent,
        )

    if not _ever_found_posts(conn, handle):
        return HealthReport(
            handle=handle,
            is_healthy=True,
            reason="handle has never produced posts; cannot conclude regression",
            recent_checks=recent,
        )

    return HealthReport(
        handle=handle,
        is_healthy=False,
        reason=(
            f"last {threshold} checks all returned found_count=0 but this handle "
            "has previously produced posts — likely DOM regression or block"
        ),
        recent_checks=recent,
    )


def previous_max_found(
    conn: sqlite3.Connection,
    handle: str,
    *,
    lookback_days: int | None = None,
) -> int:
    """Return MAX(found_count) across this handle's successful checks.

    Returns 0 when the handle has no `status='ok'` history yet (i.e. brand
    new handle), which the partial-error judge below treats as "no baseline,
    don't flag".

    `lookback_days`: if set, restrict the MAX to checks newer than N days.
    Default `None` preserves the historical all-time-peak semantics.

    Why the lookback exists:
        The all-time MAX is sticky. If a handle's true baseline
        permanently drops (user deletes posts, account churns,
        Threads UI change shifts what 'a post' means), the historic
        peak still wins forever, and every new run trips
        partial_error against a baseline that no longer reflects
        reality.

        An empirical look at @hal.lifedesign on 2026-05-18 showed the
        common steady state is actually found=15 with occasional
        ~8% partial blips down to found=4 — so the *immediate*
        operator problem is transient noise, not a stuck baseline.
        But for handles that DO drift permanently (this is mostly a
        question of when, not if, over a year of watching), the
        lookback gives operators an opt-in escape valve. Default
        remains all-time to keep existing callers' behaviour intact;
        opt-in via a future watcher.py CLI flag.
    """
    if lookback_days is None:
        row = conn.execute(
            "SELECT MAX(found_count) AS max_found FROM checks WHERE handle = ? AND status = 'ok'",
            (handle,),
        ).fetchone()
    else:
        # `datetime('now', '-N days')` is SQLite's native time arithmetic;
        # checked_at is stored as ISO-8601 UTC ('YYYY-MM-DDTHH:MM:SSZ').
        # The 'Z' suffix doesn't affect the string comparison since
        # SQLite returns the same shape from datetime().
        row = conn.execute(
            "SELECT MAX(found_count) AS max_found FROM checks "
            "WHERE handle = ? AND status = 'ok' "
            "AND checked_at > strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', ? || ' days'))",
            (handle, f"-{int(lookback_days)}"),
        ).fetchone()
    if row is None:
        return 0
    raw = row["max_found"]
    return int(raw) if raw is not None else 0


def judge_partial_error(found_count: int, prev_max: int) -> str | None:
    """Decide whether the current check should be flagged as partial_error.

    Returns a human-readable reason string if the run should be marked
    partial_error (and watcher logs as `[warn]`), or `None` if the run is fine.

    The heuristic: a handle that has previously produced posts (prev_max > 0)
    but suddenly returned a strictly smaller set is almost always a DOM
    selector regression or an anti-bot block, not a real "posts disappeared"
    event. Treat as partial.
    """
    if prev_max <= 0:
        return None
    if found_count >= prev_max:
        return None
    return (
        f"profile extraction returned partial result: found={found_count} "
        f"previous_max={prev_max}"
    )


def check_process_staleness(
    *,
    process_start_iso: str | None,
    source_files: list[tuple[str, str | None]],
) -> HealthReport:
    """Detect when the live watcher is running stale (pre-edit) code.

    `process_start_iso` is the ISO-8601 start time of the `--watch`
    process, or None if no such process is running.

    `source_files` is a list of (path, mtime_iso) tuples for the files
    whose changes need a restart to pick up — typically watcher.py,
    watcher_pure.py, health.py, db.py. mtime_iso may be None for a
    missing file (treated as "no constraint from this file").

    Detects the silent-stale-code bug observed on 2026-05-18: the
    `--watch` loop ran from 5/17 20:00 but the partial_error code
    landed at 5/17 23:16; Python's import-once model meant the live
    process never picked up the new behaviour for ~13 hours.
    Reports unhealthy when the process started BEFORE any source
    file's mtime — the operator should run `restart-watcher.sh`.

    Pure function: no os.stat, no pgrep, no fs/process access. Caller
    feeds in pre-resolved values so this is unit-testable without a
    live process or mutable filesystem state.
    """
    if process_start_iso is None:
        # No running --watch loop. Not a staleness issue per se; the
        # caller may want to treat this as a separate "watcher down"
        # warning, but we don't conflate the two checks.
        return HealthReport(
            handle="<process>",
            is_healthy=True,
            reason="no running watcher process — staleness not applicable",
            recent_checks=[],
        )

    # Find the newest source-file mtime that's strictly after the
    # process start. Any such file means the live code is older than
    # what's on disk.
    process_started = process_start_iso
    newer_files: list[dict] = []
    for path, mtime in source_files:
        if mtime is None:
            continue
        if mtime > process_started:
            newer_files.append({
                "checked_at": mtime,
                "found_count": 0,
                "new_count": 0,
                "status": f"newer-than-process: {path}",
            })

    if not newer_files:
        return HealthReport(
            handle="<process>",
            is_healthy=True,
            reason=f"watcher running fresh code (started {process_started})",
            recent_checks=[],
        )

    return HealthReport(
        handle="<process>",
        is_healthy=False,
        reason=(
            f"watcher started at {process_started} but {len(newer_files)} source "
            f"file(s) have been edited since — Python won't reload imports. "
            f"Run ./restart-watcher.sh to pick up the new code."
        ),
        recent_checks=newer_files,
    )


def check_recent_errors(
    conn: sqlite3.Connection,
    handle: str,
    *,
    threshold: int = REGRESSION_THRESHOLD,
) -> HealthReport:
    """Flag the case where the last N checks include 'error' or 'partial_error' statuses."""
    recent = _recent_checks(conn, handle, threshold)
    if len(recent) < threshold:
        return HealthReport(
            handle=handle,
            is_healthy=True,
            reason=f"not enough history yet ({len(recent)}/{threshold} checks)",
            recent_checks=recent,
        )

    bad_statuses = [c for c in recent if c["status"] in {"error", "partial_error"}]
    if len(bad_statuses) >= threshold:
        return HealthReport(
            handle=handle,
            is_healthy=False,
            reason=f"all of last {threshold} checks had non-ok status",
            recent_checks=recent,
        )

    return HealthReport(
        handle=handle,
        is_healthy=True,
        reason=f"recent checks include only {len(bad_statuses)}/{threshold} non-ok",
        recent_checks=recent,
    )
