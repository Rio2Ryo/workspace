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


def previous_max_found(conn: sqlite3.Connection, handle: str) -> int:
    """Return MAX(found_count) across this handle's successful checks.

    Returns 0 when the handle has no `status='ok'` history yet (i.e. brand
    new handle), which the partial-error judge below treats as "no baseline,
    don't flag".
    """
    row = conn.execute(
        "SELECT MAX(found_count) AS max_found FROM checks WHERE handle = ? AND status = 'ok'",
        (handle,),
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
