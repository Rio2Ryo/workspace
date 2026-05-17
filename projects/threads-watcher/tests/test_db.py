"""db.py の単体テスト。インメモリ的に tmp_path 上の SQLite で完結する。"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

# プロジェクトルートを sys.path に追加してフラットな db モジュールを読み込む
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import (  # noqa: E402
    connect,
    get_seen_post_ids,
    init_db,
    latest_snapshot,
    record_check,
    save_post_screenshot,
)


@pytest.fixture
def conn(tmp_path: Path):
    db_path = tmp_path / "test.db"
    c = connect(db_path)
    init_db(c)
    yield c
    c.close()


def test_init_db_is_idempotent(conn: sqlite3.Connection) -> None:
    init_db(conn)
    init_db(conn)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert {"posts", "checks"} <= tables


def test_save_post_screenshot_inserts_then_dedupes(conn: sqlite3.Connection) -> None:
    png = b"\x89PNG\r\n\x1a\nfakebody"
    ok1 = save_post_screenshot(
        conn,
        handle="@h",
        post_id="p1",
        post_url="https://x/p/p1",
        first_seen_at="2026-05-17T00:00:00Z",
        captured_at="2026-05-17T00:00:00Z",
        screenshot_png=png,
        width=100,
        height=200,
        local_path="screenshots/h/p1.png",
    )
    ok2 = save_post_screenshot(
        conn,
        handle="@h",
        post_id="p1",
        post_url="https://x/p/p1",
        first_seen_at="2026-05-17T00:00:01Z",
        captured_at="2026-05-17T00:00:01Z",
        screenshot_png=png,
        width=100,
        height=200,
        local_path="screenshots/h/p1.png",
    )
    assert ok1 is True
    assert ok2 is False
    count = conn.execute("SELECT COUNT(*) FROM posts WHERE handle=? AND post_id=?", ("@h", "p1")).fetchone()[0]
    assert count == 1


def test_get_seen_post_ids_orders_by_insertion(conn: sqlite3.Connection) -> None:
    for pid in ("a", "b", "c"):
        save_post_screenshot(
            conn,
            handle="@h",
            post_id=pid,
            post_url=f"https://x/p/{pid}",
            first_seen_at="2026-05-17T00:00:00Z",
            captured_at="2026-05-17T00:00:00Z",
            screenshot_png=b"png",
            width=None,
            height=None,
            local_path=None,
        )
    assert get_seen_post_ids(conn, "@h") == ["a", "b", "c"]


def test_get_seen_post_ids_isolates_by_handle(conn: sqlite3.Connection) -> None:
    save_post_screenshot(
        conn,
        handle="@a",
        post_id="p1",
        post_url="https://x/p/p1",
        first_seen_at="t",
        captured_at="t",
        screenshot_png=b"png",
    )
    save_post_screenshot(
        conn,
        handle="@b",
        post_id="p1",
        post_url="https://x/p/p1",
        first_seen_at="t",
        captured_at="t",
        screenshot_png=b"png",
    )
    assert get_seen_post_ids(conn, "@a") == ["p1"]
    assert get_seen_post_ids(conn, "@b") == ["p1"]


def test_record_check_appends_audit_row(conn: sqlite3.Connection) -> None:
    record_check(
        conn,
        handle="@h",
        checked_at="2026-05-17T00:00:00Z",
        found_count=5,
        new_count=2,
        status="ok",
        error=None,
    )
    record_check(
        conn,
        handle="@h",
        checked_at="2026-05-17T00:01:00Z",
        found_count=5,
        new_count=0,
        status="partial_error",
        error="dom warn",
    )
    rows = conn.execute("SELECT status, error FROM checks ORDER BY id ASC").fetchall()
    assert [(r["status"], r["error"]) for r in rows] == [
        ("ok", None),
        ("partial_error", "dom warn"),
    ]


def test_latest_snapshot_excludes_blob_and_local_path(conn: sqlite3.Connection) -> None:
    """公開 snapshot に BLOB と local_path が混入しないことを保証"""
    save_post_screenshot(
        conn,
        handle="@h",
        post_id="p1",
        post_url="https://x/p/p1",
        first_seen_at="2026-05-17T00:00:00Z",
        captured_at="2026-05-17T00:00:00Z",
        screenshot_png=b"\x89PNG_BIG_BLOB_HERE",
        width=1280,
        height=2400,
        local_path="screenshots/h/p1.png",
    )
    record_check(
        conn,
        handle="@h",
        checked_at="2026-05-17T00:00:01Z",
        found_count=1,
        new_count=1,
        status="ok",
        error=None,
    )
    snap = latest_snapshot(conn, "@h")
    assert snap["handle"] == "@h"
    assert snap["saved_count"] == 1
    assert snap["last_check"]["status"] == "ok"
    assert snap["last_check"]["new_count"] == 1
    for post in snap["posts"]:
        assert "screenshot_png" not in post, "BLOB leaked in public snapshot"
        assert "local_path" not in post, "local file path leaked in public snapshot"
        assert post["screenshot_size_bytes"] == len(b"\x89PNG_BIG_BLOB_HERE")


def test_latest_snapshot_orders_posts_newest_first(conn: sqlite3.Connection) -> None:
    save_post_screenshot(
        conn,
        handle="@h",
        post_id="old",
        post_url="https://x/p/old",
        first_seen_at="2026-05-17T00:00:00Z",
        captured_at="2026-05-17T00:00:00Z",
        screenshot_png=b"png",
    )
    save_post_screenshot(
        conn,
        handle="@h",
        post_id="new",
        post_url="https://x/p/new",
        first_seen_at="2026-05-17T01:00:00Z",
        captured_at="2026-05-17T01:00:00Z",
        screenshot_png=b"png",
    )
    snap = latest_snapshot(conn, "@h")
    assert [p["post_id"] for p in snap["posts"]] == ["new", "old"]


def test_latest_snapshot_empty_handle_returns_empty_lists(conn: sqlite3.Connection) -> None:
    snap = latest_snapshot(conn, "@nobody")
    assert snap["handle"] == "@nobody"
    assert snap["saved_count"] == 0
    assert snap["last_check"] is None
    assert snap["posts"] == []


def test_connect_enables_wal_and_fk(conn: sqlite3.Connection) -> None:
    journal = conn.execute("PRAGMA journal_mode").fetchone()[0]
    fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    assert journal.lower() == "wal"
    assert fk == 1
