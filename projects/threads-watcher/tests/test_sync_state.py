"""Tests for db.sync_state(conn, cursor_path).

Surfaces sync.py's cursor-vs-DB progress to the status UI so operators
don't have to tail logs/sync.err.log to know whether the next
launchd cycle would commit anything.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db, latest_snapshot, sync_state  # noqa: E402


@pytest.fixture
def conn(tmp_path: Path):
    c = connect(tmp_path / "ss.db")
    init_db(c)
    yield c
    c.close()


def _seed_post(conn, post_id: str) -> None:
    """Minimal `posts` row. Schema requires screenshot_png NOT NULL,
    so pass a 1-byte placeholder BLOB — the value isn't read by
    sync_state, only the row's autoincrement `id` matters."""
    conn.execute(
        "INSERT INTO posts (handle, post_id, post_url, first_seen_at, captured_at,"
        " screenshot_png, screenshot_size_bytes, screenshot_width, screenshot_height) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ("@h", post_id, f"https://t/{post_id}", "2026-05-18T00:00:00Z",
         "2026-05-18T00:00:00Z", sqlite3.Binary(b"\x00"), 1, 1, 1),
    )
    conn.commit()


class TestSyncStateMissingCursor:
    def test_no_cursor_file_returns_zero(self, conn: sqlite3.Connection, tmp_path: Path):
        cursor = tmp_path / ".sync_cursor"
        assert not cursor.exists()
        state = sync_state(conn, cursor)
        assert state["cursor"] == 0
        assert state["db_max"] == 0
        assert state["delta"] == 0
        assert state["cursor_file_exists"] is False

    def test_missing_cursor_with_posts_yields_full_delta(self, conn: sqlite3.Connection, tmp_path: Path):
        """Operator-noticeable: never-synced repo has full backlog to push."""
        _seed_post(conn, "p1")
        _seed_post(conn, "p2")
        _seed_post(conn, "p3")
        state = sync_state(conn, tmp_path / ".sync_cursor")
        assert state["db_max"] == 3
        assert state["cursor"] == 0
        assert state["delta"] == 3
        assert state["cursor_file_exists"] is False


class TestSyncStateCursorPresent:
    def test_cursor_caught_up_delta_zero(self, conn: sqlite3.Connection, tmp_path: Path):
        _seed_post(conn, "p1")
        _seed_post(conn, "p2")
        cursor = tmp_path / ".sync_cursor"
        cursor.write_text("2", encoding="utf-8")
        state = sync_state(conn, cursor)
        assert state["cursor"] == 2
        assert state["db_max"] == 2
        assert state["delta"] == 0
        assert state["cursor_file_exists"] is True

    def test_cursor_behind_yields_positive_delta(self, conn: sqlite3.Connection, tmp_path: Path):
        _seed_post(conn, "p1")
        _seed_post(conn, "p2")
        _seed_post(conn, "p3")
        cursor = tmp_path / ".sync_cursor"
        cursor.write_text("1", encoding="utf-8")
        state = sync_state(conn, cursor)
        assert state["cursor"] == 1
        assert state["db_max"] == 3
        assert state["delta"] == 2

    def test_cursor_ahead_of_db_clamps_to_zero(self, conn: sqlite3.Connection, tmp_path: Path):
        """Defensive: cursor > db_max shouldn't surface as negative delta
        in the UI. Pin the max(0, ...) clamp so a future refactor can't
        silently regress to showing -N."""
        _seed_post(conn, "p1")
        cursor = tmp_path / ".sync_cursor"
        cursor.write_text("999", encoding="utf-8")
        state = sync_state(conn, cursor)
        assert state["cursor"] == 999
        assert state["db_max"] == 1
        assert state["delta"] == 0


class TestSyncStateCorruptCursor:
    def test_garbage_cursor_treated_as_zero(self, conn: sqlite3.Connection, tmp_path: Path):
        """Mirrors sync.read_cursor's "corrupt → 0, re-evaluate" policy."""
        _seed_post(conn, "p1")
        cursor = tmp_path / ".sync_cursor"
        cursor.write_text("not-a-number", encoding="utf-8")
        state = sync_state(conn, cursor)
        assert state["cursor"] == 0
        assert state["db_max"] == 1
        assert state["delta"] == 1
        # File EXISTS even though contents are garbage — operator should
        # see "present" in the UI and look at .sync_cursor directly.
        assert state["cursor_file_exists"] is True

    def test_empty_cursor_file_treated_as_zero(self, conn: sqlite3.Connection, tmp_path: Path):
        cursor = tmp_path / ".sync_cursor"
        cursor.write_text("", encoding="utf-8")
        state = sync_state(conn, cursor)
        assert state["cursor"] == 0
        assert state["cursor_file_exists"] is True

    def test_negative_cursor_clamped_to_zero(self, conn: sqlite3.Connection, tmp_path: Path):
        """sync.read_cursor uses `max(0, int(raw))`; mirror that exactly."""
        cursor = tmp_path / ".sync_cursor"
        cursor.write_text("-42", encoding="utf-8")
        state = sync_state(conn, cursor)
        assert state["cursor"] == 0


class TestLatestSnapshotIncludesSyncState:
    def test_snapshot_carries_sync_state(self, conn: sqlite3.Connection):
        snap = latest_snapshot(conn, "@h")
        assert "sync_state" in snap
        assert set(snap["sync_state"].keys()) == {
            "cursor", "db_max", "delta", "cursor_file_exists",
        }
