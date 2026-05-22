"""SQLite persistence for Threads watcher screenshots.

The database is the source of truth. Local PNG files are only an optional
inspection/debug artifact.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any
import re


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_DB_FILE = PROJECT_ROOT / "threads_watcher.db"
# Mirrors sync.py's DEFAULT_CURSOR. Duplicated here (vs imported from
# sync.py) to avoid creating a db→sync module dependency loop; this is
# a constant convention, not logic.
DEFAULT_CURSOR_FILE = PROJECT_ROOT / ".sync_cursor"

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  post_id TEXT NOT NULL,
  post_url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  screenshot_png BLOB NOT NULL,
  screenshot_content_type TEXT NOT NULL DEFAULT 'image/png',
  screenshot_size_bytes INTEGER NOT NULL,
  screenshot_width INTEGER,
  screenshot_height INTEGER,
  local_path TEXT,
  post_text TEXT,
  posted_at TEXT,
  UNIQUE(handle, post_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_handle_captured_at
  ON posts(handle, captured_at DESC);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  found_count INTEGER NOT NULL,
  new_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_checks_handle_checked_at
  ON checks(handle, checked_at DESC);
"""


def connect(db_path: str | Path = DEFAULT_DB_FILE) -> sqlite3.Connection:
    # Coerce str → Path so callers can pass either ("threads.db" from a
    # CLI arg, Path("...") from a typed module). All production callers
    # currently pass Path explicitly, but the unannotated str case
    # raised AttributeError on .parent during interactive debugging on
    # 2026-05-18 — robustness fix, not a live caller bug.
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    cols = {str(row["name"]) for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    # Lightweight forward migrations for already-running Mac mini DBs.
    _ensure_column(conn, "posts", "post_text", "post_text TEXT")
    _ensure_column(conn, "posts", "posted_at", "posted_at TEXT")
    conn.commit()


def get_seen_post_ids(conn: sqlite3.Connection, handle: str) -> list[str]:
    rows = conn.execute(
        "SELECT post_id FROM posts WHERE handle = ? ORDER BY id ASC",
        (handle,),
    ).fetchall()
    return [str(row["post_id"]) for row in rows]


def save_post_screenshot(
    conn: sqlite3.Connection,
    *,
    handle: str,
    post_id: str,
    post_url: str,
    first_seen_at: str,
    captured_at: str,
    screenshot_png: bytes,
    width: int | None = None,
    height: int | None = None,
    local_path: str | None = None,
    post_text: str | None = None,
    posted_at: str | None = None,
) -> bool:
    """Persist a screenshot BLOB. Returns True when inserted, False if duplicate."""
    cur = conn.execute(
        """
        INSERT OR IGNORE INTO posts (
          handle,
          post_id,
          post_url,
          first_seen_at,
          captured_at,
          screenshot_png,
          screenshot_content_type,
          screenshot_size_bytes,
          screenshot_width,
          screenshot_height,
          local_path,
          post_text,
          posted_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'image/png', ?, ?, ?, ?, ?, ?)
        """,
        (
            handle,
            post_id,
            post_url,
            first_seen_at,
            captured_at,
            sqlite3.Binary(screenshot_png),
            len(screenshot_png),
            width,
            height,
            local_path,
            post_text,
            posted_at,
        ),
    )
    conn.commit()
    return cur.rowcount == 1



def update_post_screenshot(
    conn: sqlite3.Connection,
    *,
    handle: str,
    post_id: str,
    captured_at: str,
    screenshot_png: bytes,
    width: int | None = None,
    height: int | None = None,
    local_path: str | None = None,
    post_text: str | None = None,
    posted_at: str | None = None,
) -> bool:
    """Replace the screenshot for an already-known post.

    Used when capture quality improves (for example hiding Threads login/app
    popups before taking the screenshot). Keeps first_seen_at/post_url stable.
    """
    cur = conn.execute(
        """
        UPDATE posts
        SET captured_at = ?,
            screenshot_png = ?,
            screenshot_content_type = 'image/png',
            screenshot_size_bytes = ?,
            screenshot_width = ?,
            screenshot_height = ?,
            local_path = ?,
            post_text = COALESCE(?, post_text),
            posted_at = COALESCE(?, posted_at)
        WHERE handle = ? AND post_id = ?
        """,
        (
            captured_at,
            sqlite3.Binary(screenshot_png),
            len(screenshot_png),
            width,
            height,
            local_path,
            post_text,
            posted_at,
            handle,
            post_id,
        ),
    )
    conn.commit()
    return cur.rowcount == 1

def record_check(
    conn: sqlite3.Connection,
    *,
    handle: str,
    checked_at: str,
    found_count: int,
    new_count: int,
    status: str,
    error: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO checks (handle, checked_at, found_count, new_count, status, error)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (handle, checked_at, found_count, new_count, status, error),
    )
    conn.commit()


def recent_stats(
    conn: sqlite3.Connection,
    handle: str,
    *,
    window_hours: int = 24,
) -> dict[str, Any]:
    """Aggregate the last `window_hours` of checks for a handle.

    Surfaces operator-visible health signals that the single-row
    `last_check` field can't: how often the watcher hit partial_error
    vs ok over a meaningful window, error breakdown, and the
    success rate used by sync.py's recent-failures gate to gauge
    whether the handle is in a transient blip or sustained issue.

    Returns a dict with keys:
        window_hours, total, ok, partial_error, error, other,
        success_rate (float in [0, 1] — total `ok` / total).
    `other` catches future status strings so the schema is
    forward-compatible. `total == 0` returns `success_rate=None`.
    """
    rows = conn.execute(
        "SELECT status FROM checks "
        "WHERE handle = ? "
        "AND checked_at > strftime('%Y-%m-%dT%H:%M:%SZ', datetime('now', ? || ' hours'))",
        (handle, f"-{int(window_hours)}"),
    ).fetchall()
    statuses = [str(r[0]) for r in rows]
    ok_count = sum(1 for s in statuses if s == "ok")
    partial_count = sum(1 for s in statuses if s == "partial_error")
    error_count = sum(1 for s in statuses if s == "error")
    other_count = len(statuses) - ok_count - partial_count - error_count
    total = len(statuses)
    return {
        "window_hours": window_hours,
        "total": total,
        "ok": ok_count,
        "partial_error": partial_count,
        "error": error_count,
        "other": other_count,
        "success_rate": (ok_count / total) if total > 0 else None,
    }


def _safe_asset_segment(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return cleaned or fallback


def export_status_screenshots(
    conn: sqlite3.Connection,
    handle: str,
    status_root: Path,
) -> dict[str, str]:
    """Write DB screenshot BLOBs under the static status site and return public paths.

    The DB remains the source of truth; this creates display-only PNG assets
    inside ``threads-watcher-status/screenshots/`` so the static page can render
    thumbnails without leaking host-local absolute paths or embedding large BLOBs
    in state.json. Returned paths are relative to ``status_root`` and safe for
    browser ``src`` attributes.
    """
    rows = conn.execute(
        """
        SELECT post_id, screenshot_png, screenshot_size_bytes, local_path
        FROM posts
        WHERE handle = ?
        ORDER BY captured_at DESC
        """,
        (handle,),
    ).fetchall()

    safe_handle = _safe_asset_segment(handle.lstrip("@"), "handle")
    out: dict[str, str] = {}
    for row in rows:
        post_id = str(row["post_id"])
        local_name = Path(str(row["local_path"] or "")).name
        if not local_name.lower().endswith(".png"):
            local_name = f"{post_id}.png"
        filename = _safe_asset_segment(local_name, f"{post_id}.png")
        if not filename.lower().endswith(".png"):
            filename += ".png"
        rel = Path("screenshots") / safe_handle / filename
        dest = status_root / rel
        png = bytes(row["screenshot_png"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Re-export only when the on-disk asset differs. The check
        # compares CONTENT, not size: update_post_screenshot replaces
        # the BLOB when a re-capture improves quality, and two PNGs of
        # the same post can compress to an identical byte length —
        # a size-only check then skipped the rewrite and left the
        # public page showing the stale screenshot.
        if not dest.exists() or dest.read_bytes() != png:
            dest.write_bytes(png)
        out[post_id] = rel.as_posix()
    return out


def sync_state(
    conn: sqlite3.Connection,
    cursor_path: Path = DEFAULT_CURSOR_FILE,
) -> dict[str, Any]:
    """Surface sync.py's progress against the live DB without depending on sync.py.

    Returns `{cursor, db_max, delta, cursor_file_exists}` where:
      - cursor: int read from `cursor_path`, or 0 if missing/corrupt
      - db_max: MAX(id) from posts table (0 if empty)
      - delta: db_max - cursor (≥0 means sync would commit if --confirm
        AND the recent-failures guard passes)
      - cursor_file_exists: bool, to distinguish "never synced" (False, 0)
        from "synced and caught up" (True, 0)

    Operators reading state.json can see at-a-glance whether sync.py
    is healthy and current without tailing logs.
    """
    row = conn.execute("SELECT COALESCE(MAX(id), 0) AS m FROM posts").fetchone()
    db_max = int(row[0]) if row else 0

    cursor_exists = cursor_path.exists()
    cursor = 0
    if cursor_exists:
        try:
            cursor = max(0, int(cursor_path.read_text(encoding="utf-8").strip()))
        except (FileNotFoundError, ValueError):
            cursor = 0

    return {
        "cursor": cursor,
        "db_max": db_max,
        "delta": max(0, db_max - cursor),
        "cursor_file_exists": cursor_exists,
    }


def latest_snapshot(conn: sqlite3.Connection, handle: str) -> dict[str, Any]:
    post_rows = conn.execute(
        """
        SELECT handle, post_id, post_url, first_seen_at, captured_at,
               screenshot_size_bytes, screenshot_width, screenshot_height,
               post_text, posted_at
        FROM posts
        WHERE handle = ?
        ORDER BY captured_at DESC
        """,
        (handle,),
    ).fetchall()
    check_row = conn.execute(
        """
        SELECT checked_at, found_count, new_count, status, error
        FROM checks
        WHERE handle = ?
        ORDER BY checked_at DESC
        LIMIT 1
        """,
        (handle,),
    ).fetchone()
    # Pre-compute 1h / 24h / 7d windows so the static UI can switch
    # without a server round-trip — operators flip ?window=1 / 24 / 168
    # in the URL. `recent_stats` (24h alias) preserved for callers that
    # don't know about the indexed map.
    rs_by_window = {
        "1": recent_stats(conn, handle, window_hours=1),
        "24": recent_stats(conn, handle, window_hours=24),
        "168": recent_stats(conn, handle, window_hours=168),  # 7 days
    }
    return {
        "handle": handle,
        "last_check": dict(check_row) if check_row else None,
        "saved_count": len(post_rows),
        "posts": [dict(row) for row in post_rows],
        "recent_stats": rs_by_window["24"],
        "recent_stats_by_window": rs_by_window,
        "sync_state": sync_state(conn),
    }
