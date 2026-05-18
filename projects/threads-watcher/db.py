"""SQLite persistence for Threads watcher screenshots.

The database is the source of truth. Local PNG files are only an optional
inspection/debug artifact.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_DB_FILE = PROJECT_ROOT / "threads_watcher.db"

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


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
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
          local_path
        ) VALUES (?, ?, ?, ?, ?, ?, 'image/png', ?, ?, ?, ?)
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


def latest_snapshot(conn: sqlite3.Connection, handle: str) -> dict[str, Any]:
    post_rows = conn.execute(
        """
        SELECT handle, post_id, post_url, first_seen_at, captured_at,
               screenshot_size_bytes, screenshot_width, screenshot_height
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
    return {
        "handle": handle,
        "last_check": dict(check_row) if check_row else None,
        "saved_count": len(post_rows),
        "posts": [dict(row) for row in post_rows],
    }
