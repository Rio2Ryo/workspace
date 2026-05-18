"""db_health.py の単体テスト。

threads-watcher の DB は posts に PNG を BLOB で持ち、checks が
監視ループ毎に append される構造。サイズの一次監視を CLI 化した
`db_health.py` の集計 / 閾値 / 出力フォーマットを固定する。
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db, record_check, save_post_screenshot  # noqa: E402
from db_health import collect_report, main  # noqa: E402


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    p = tmp_path / "th.db"
    conn = connect(p)
    init_db(conn)
    conn.close()
    return p


def _add_post(conn: sqlite3.Connection, *, handle: str, post_id: str, png_size: int) -> None:
    save_post_screenshot(
        conn,
        handle=handle,
        post_id=post_id,
        post_url=f"https://x/p/{post_id}",
        first_seen_at="2026-05-19T00:00:00Z",
        captured_at="2026-05-19T00:00:00Z",
        screenshot_png=b"P" * png_size,
        width=10,
        height=10,
    )


# ── Empty-DB baseline ─────────────────────────────────────────────────


def test_empty_db_counts_zero(db_path: Path) -> None:
    r = collect_report(db_path)
    assert r.posts_count == 0
    assert r.checks_count == 0
    assert r.blob_bytes_total == 0
    assert r.handles == []
    # File still exists with WAL header bytes — non-zero but small.
    assert r.file_bytes > 0
    assert r.thresholds_tripped == []


def test_missing_db_file_raises_filenotfounderror(tmp_path: Path) -> None:
    # Regression guard: collect_report must NOT silently create the DB.
    # sqlite3.connect() would; we stat first.
    missing = tmp_path / "no-such-db.db"
    with pytest.raises(FileNotFoundError):
        collect_report(missing)


# ── Aggregation correctness ───────────────────────────────────────────


def test_aggregates_posts_and_blob_bytes_per_handle(db_path: Path) -> None:
    conn = connect(db_path)
    _add_post(conn, handle="@a", post_id="1", png_size=100)
    _add_post(conn, handle="@a", post_id="2", png_size=200)
    _add_post(conn, handle="@b", post_id="3", png_size=400)
    conn.close()

    r = collect_report(db_path)
    assert r.posts_count == 3
    assert r.blob_bytes_total == 700
    by_handle = {h.handle: h for h in r.handles}
    assert by_handle["@a"].posts == 2
    assert by_handle["@a"].blob_bytes == 300
    assert by_handle["@b"].posts == 1
    assert by_handle["@b"].blob_bytes == 400


def test_handles_listed_in_sorted_order(db_path: Path) -> None:
    # Pin alphabetical ordering so JSON output is stable for log diff/grep.
    conn = connect(db_path)
    _add_post(conn, handle="@zeta", post_id="z1", png_size=1)
    _add_post(conn, handle="@alpha", post_id="a1", png_size=1)
    _add_post(conn, handle="@mu", post_id="m1", png_size=1)
    conn.close()

    r = collect_report(db_path)
    assert [h.handle for h in r.handles] == ["@alpha", "@mu", "@zeta"]


def test_checks_count_is_independent_of_posts(db_path: Path) -> None:
    # checks table grows on every watcher tick regardless of new posts —
    # this is the metric most likely to trip the threshold first.
    conn = connect(db_path)
    for i in range(5):
        record_check(conn, handle="@a", checked_at=f"2026-05-19T00:00:0{i}Z",
                     found_count=0, new_count=0, status="ok", error=None)
    conn.close()

    r = collect_report(db_path)
    assert r.posts_count == 0
    assert r.checks_count == 5


# ── Threshold semantics ───────────────────────────────────────────────


def test_threshold_mb_not_tripped_when_under(db_path: Path) -> None:
    # Empty DB → ~10 KB. Threshold 1 MB → not tripped.
    r = collect_report(db_path, threshold_mb=1.0)
    assert r.thresholds_tripped == []


def test_threshold_mb_tripped_at_or_above(db_path: Path) -> None:
    conn = connect(db_path)
    # 2 MB of BLOB → file size definitely >= 1 MB.
    _add_post(conn, handle="@big", post_id="big1", png_size=2 * 1024 * 1024)
    conn.close()

    r = collect_report(db_path, threshold_mb=1.0)
    assert len(r.thresholds_tripped) == 1
    assert "file_size>=1.0MB" in r.thresholds_tripped[0]


def test_threshold_checks_tripped_at_or_above(db_path: Path) -> None:
    conn = connect(db_path)
    for i in range(3):
        record_check(conn, handle="@a", checked_at=f"2026-05-19T00:00:0{i}Z",
                     found_count=0, new_count=0, status="ok", error=None)
    conn.close()

    r = collect_report(db_path, threshold_checks=3)
    assert any("checks_count>=3" in t for t in r.thresholds_tripped)


def test_both_thresholds_can_trip_together(db_path: Path) -> None:
    conn = connect(db_path)
    _add_post(conn, handle="@big", post_id="b1", png_size=2 * 1024 * 1024)
    for i in range(2):
        record_check(conn, handle="@a", checked_at=f"2026-05-19T00:00:0{i}Z",
                     found_count=0, new_count=0, status="ok", error=None)
    conn.close()

    r = collect_report(db_path, threshold_mb=1.0, threshold_checks=2)
    assert len(r.thresholds_tripped) == 2


# ── Output format ─────────────────────────────────────────────────────


def test_json_output_is_single_line_and_parses(db_path: Path) -> None:
    conn = connect(db_path)
    _add_post(conn, handle="@a", post_id="1", png_size=128)
    conn.close()

    r = collect_report(db_path)
    js = r.to_json()
    assert "\n" not in js
    parsed = json.loads(js)
    assert parsed["posts_count"] == 1
    assert parsed["blob_bytes_total"] == 128
    assert parsed["handles"] == [{"handle": "@a", "posts": 1, "blob_bytes": 128}]
    assert parsed["thresholds_tripped"] == []


def test_text_output_mentions_tripped_when_threshold_hit(db_path: Path) -> None:
    conn = connect(db_path)
    _add_post(conn, handle="@a", post_id="1", png_size=2 * 1024 * 1024)
    conn.close()

    r = collect_report(db_path, threshold_mb=1.0)
    txt = r.to_text()
    assert "TRIPPED:" in txt
    assert "MB" in txt


# ── CLI surface ───────────────────────────────────────────────────────


def test_main_returns_zero_when_no_threshold(db_path: Path, capsys) -> None:
    rc = main(["--db", str(db_path)])
    out = capsys.readouterr().out
    assert rc == 0
    assert "posts=" in out


def test_main_returns_two_when_threshold_tripped(db_path: Path, capsys) -> None:
    conn = connect(db_path)
    _add_post(conn, handle="@a", post_id="1", png_size=2 * 1024 * 1024)
    conn.close()

    rc = main(["--db", str(db_path), "--threshold-mb", "1"])
    out = capsys.readouterr().out
    # Report still printed even though we're exiting 2 — cron log needs the
    # numbers, not just the exit code.
    assert "TRIPPED:" in out
    assert rc == 2


def test_main_json_flag_emits_parseable_line(db_path: Path, capsys) -> None:
    conn = connect(db_path)
    _add_post(conn, handle="@a", post_id="1", png_size=42)
    conn.close()

    rc = main(["--db", str(db_path), "--json"])
    assert rc == 0
    out = capsys.readouterr().out.strip()
    # One line, parseable.
    assert "\n" not in out
    data = json.loads(out)
    assert data["posts_count"] == 1
    assert data["blob_bytes_total"] == 42


def test_main_returns_one_when_db_missing(tmp_path: Path, capsys) -> None:
    # Invocation error (exit 1) is distinct from threshold tripped (exit
    # 2) so cron wrappers can page on data growth but page differently on
    # script breakage.
    rc = main(["--db", str(tmp_path / "absent.db")])
    err = capsys.readouterr().err
    assert rc == 1
    assert "does not exist" in err


def test_main_returns_one_on_corrupt_db(tmp_path: Path, capsys) -> None:
    bad = tmp_path / "corrupt.db"
    bad.write_bytes(b"not a sqlite db, just text")
    rc = main(["--db", str(bad)])
    err = capsys.readouterr().err
    assert rc == 1
    # Either "failed to read" or "not a database" — we accept any
    # SQLite-originated error message via the broad DatabaseError catch.
    assert "ERROR" in err
