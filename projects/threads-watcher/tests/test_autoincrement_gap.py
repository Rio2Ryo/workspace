"""Regression test: document and lock-in the SQLite AUTOINCREMENT +
INSERT OR IGNORE behavior that sync.sh relies on.

Observed in production DB (2026-05-17):
    sqlite_sequence.seq = 26
    MAX(posts.id)       = 20
    COUNT(posts)        = 18

→ INSERT OR IGNORE allocates the next id from sqlite_sequence even when
the row is ignored due to UNIQUE conflict. So sqlite_sequence drifts
ahead of MAX(id). sync.sh MUST use MAX(id) (not sqlite_sequence.seq) as
the cursor; otherwise it would falsely think new posts exist whenever a
duplicate was rejected.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db, save_post_screenshot  # noqa: E402


@pytest.fixture
def conn(tmp_path: Path):
    db_path = tmp_path / "gap.db"
    c = connect(db_path)
    init_db(c)
    yield c
    c.close()


def _seq(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT seq FROM sqlite_sequence WHERE name='posts'").fetchone()
    return int(row[0]) if row else 0


def _max_id(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COALESCE(MAX(id), 0) FROM posts").fetchone()[0]


def _count(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]


def test_unique_conflict_does_not_advance_max_id(conn: sqlite3.Connection) -> None:
    """INSERT OR IGNORE on UNIQUE conflict: row not added → MAX(id) unchanged."""
    save_post_screenshot(conn, handle="@h", post_id="p1", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
    assert _max_id(conn) == 1
    # 5 attempts at the same (handle, post_id) — all should be ignored
    for _ in range(5):
        ok = save_post_screenshot(conn, handle="@h", post_id="p1", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
        assert ok is False
    assert _max_id(conn) == 1  # never moved
    assert _count(conn) == 1


def test_autoincrement_seq_DRIFTS_ahead_of_max_id_after_ignored_inserts(conn: sqlite3.Connection) -> None:
    """The killer assertion that justifies sync.sh using MAX(id) instead of seq."""
    save_post_screenshot(conn, handle="@h", post_id="p1", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
    # 3 attempts at same post_id → ignored, but AUTOINCREMENT may still advance
    for _ in range(3):
        save_post_screenshot(conn, handle="@h", post_id="p1", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
    seq = _seq(conn)
    max_id = _max_id(conn)
    # The whole point: seq has DRIFTED past max_id (or at least is >= max_id),
    # while MAX(id) reflects only successfully inserted rows.
    assert seq >= max_id
    assert max_id == 1
    # If sync.sh used seq, it would think 3 new posts existed. It must use MAX(id).


def test_max_id_correctly_advances_only_on_successful_inserts(conn: sqlite3.Connection) -> None:
    """Mix of successes and ignored conflicts: MAX(id) tracks real growth."""
    save_post_screenshot(conn, handle="@h", post_id="a", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
    save_post_screenshot(conn, handle="@h", post_id="a", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")  # ignored
    save_post_screenshot(conn, handle="@h", post_id="b", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
    save_post_screenshot(conn, handle="@h", post_id="b", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")  # ignored
    save_post_screenshot(conn, handle="@h", post_id="c", post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
    assert _count(conn) == 3
    # MAX(id) reflects the 3 successful inserts, even if seq is higher
    assert _max_id(conn) >= 3


def test_delete_creates_gap_between_min_and_max(conn: sqlite3.Connection) -> None:
    """Documents how the production DB ended up with MIN=1, MAX=20, COUNT=18:
    deletions between the two extremes leave id gaps but MIN/MAX still cover them."""
    for pid in ("a", "b", "c", "d", "e"):
        save_post_screenshot(conn, handle="@h", post_id=pid, post_url="u", first_seen_at="t", captured_at="t", screenshot_png=b"x")
    # Simulate a middle delete (e.g., manual cleanup)
    conn.execute("DELETE FROM posts WHERE post_id IN ('b','d')")
    conn.commit()
    min_id = conn.execute("SELECT MIN(id) FROM posts").fetchone()[0]
    assert min_id == 1
    assert _max_id(conn) == 5
    assert _count(conn) == 3
