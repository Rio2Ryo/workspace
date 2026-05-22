"""db_health.py の単体テスト。

threads-watcher の DB は posts に PNG を BLOB で持ち、checks が
監視ループ毎に append される構造。サイズの一次監視を CLI 化した
`db_health.py` の集計 / 閾値 / 出力フォーマットを固定する。
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
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


# ── Page-level metrics (page_count / freelist / free_ratio) ───────────
#
# These pin the "would VACUUM help?" diagnostic added for the
# AUTO_SYNC_DESIGN.md §4 #7 operational concern. Before this:
# operators saw "file is N MB" with no way to distinguish reclaimable
# free pages from real growth.


def test_empty_db_reports_page_metrics_with_zero_freelist(db_path: Path) -> None:
    r = collect_report(db_path)
    # SQLite always allocates at least 1 page for the schema header,
    # so page_count > 0 even for a freshly-init'd empty DB.
    assert r.page_count > 0
    assert r.page_size > 0
    assert r.freelist_count == 0
    assert r.free_ratio == 0.0


def test_free_ratio_is_positive_after_delete_without_vacuum(db_path: Path) -> None:
    # Insert a substantial amount of BLOB data, then DELETE it. SQLite
    # does NOT auto-VACUUM by default (auto_vacuum is OFF unless
    # explicitly set at DB creation), so the freed pages land on the
    # freelist and free_ratio goes up. This is exactly the case the new
    # --threshold-free-ratio flag is meant to flag: file_bytes still
    # large, but most of it is reclaimable via VACUUM.
    conn = connect(db_path)
    try:
        for i in range(50):
            _add_post(conn, handle="h", post_id=f"p{i}", png_size=4096)
        conn.commit()
        before = collect_report(db_path)
        assert before.freelist_count == 0  # no deletes yet

        conn.execute("DELETE FROM posts")
        conn.commit()
    finally:
        conn.close()
    after = collect_report(db_path)
    assert after.freelist_count > 0, "DELETE without VACUUM should leave freelist pages"
    assert after.free_ratio > 0.0


def test_threshold_free_ratio_not_tripped_when_under(db_path: Path) -> None:
    # Empty DB: free_ratio = 0.0. A 0.5 threshold (50% free) must not trip.
    r = collect_report(db_path, threshold_free_ratio=0.5)
    assert r.thresholds_tripped == []


def test_threshold_free_ratio_trips_at_or_above(db_path: Path) -> None:
    # Populate, delete, then assert the trip. The deleted-everything
    # ratio is implementation-dependent (table_root pages stay
    # allocated), so we don't pin an exact value — instead, query the
    # actual ratio first and set the threshold below it.
    conn = connect(db_path)
    try:
        for i in range(100):
            _add_post(conn, handle="h", post_id=f"p{i}", png_size=4096)
        conn.commit()
        conn.execute("DELETE FROM posts")
        conn.commit()
    finally:
        conn.close()
    actual = collect_report(db_path)
    assert actual.free_ratio > 0.0
    # Set the threshold strictly below the actual ratio → must trip.
    threshold = actual.free_ratio * 0.5
    tripped = collect_report(db_path, threshold_free_ratio=threshold)
    assert len(tripped.thresholds_tripped) == 1
    assert "free_ratio" in tripped.thresholds_tripped[0]
    assert "VACUUM" in tripped.thresholds_tripped[0]


def test_threshold_free_ratio_zero_page_count_does_not_divide_by_zero() -> None:
    # Pure-property test: ensure DbHealthReport.free_ratio handles
    # the page_count=0 case (defensive — collect_report can't actually
    # produce this since init_db creates pages, but the dataclass is
    # frozen-public and may be constructed by external callers).
    from db_health import DbHealthReport

    r = DbHealthReport(
        db_path="/nonexistent",
        file_bytes=0,
        posts_count=0,
        checks_count=0,
        blob_bytes_total=0,
        handles=[],
        page_size=4096,
        page_count=0,
        freelist_count=0,
        thresholds_tripped=[],
    )
    assert r.free_ratio == 0.0


def test_text_output_includes_page_metrics_line(db_path: Path) -> None:
    r = collect_report(db_path)
    text = r.to_text()
    # The page line is what operators visually scan for when deciding
    # between VACUUM and a row-level cleanup — pin its presence and
    # the labels so a future format tweak doesn't drop them.
    assert "page_size=" in text
    assert "page_count=" in text
    assert "freelist=" in text
    assert "used=" in text
    assert "free=" in text


def test_json_output_includes_page_metrics(db_path: Path) -> None:
    r = collect_report(db_path)
    payload = json.loads(r.to_json())
    # asdict serialises the dataclass fields verbatim — free_ratio is a
    # @property, so it is NOT in the JSON. Consumers must compute it
    # themselves; this test pins that contract.
    assert payload["page_size"] > 0
    assert payload["page_count"] > 0
    assert payload["freelist_count"] == 0
    assert "free_ratio" not in payload


def test_main_returns_two_when_free_ratio_threshold_tripped(
    db_path: Path, capsys
) -> None:
    # End-to-end CLI: populate + delete to create freelist, run main()
    # with a 1% threshold (well under whatever DELETE-without-VACUUM
    # produces), expect exit 2 + TRIPPED line + non-zero pages reported.
    conn = connect(db_path)
    try:
        for i in range(50):
            _add_post(conn, handle="h", post_id=f"p{i}", png_size=4096)
        conn.commit()
        conn.execute("DELETE FROM posts")
        conn.commit()
    finally:
        conn.close()

    rc = main(["--db", str(db_path), "--threshold-free-ratio", "0.01"])
    out = capsys.readouterr().out
    assert rc == 2
    assert "TRIPPED" in out
    assert "free_ratio" in out
    assert "VACUUM" in out


# ── Backup-age monitoring (pairs with backup_db.py) ───────────────────
#
# Closes the loop: backup_db.py creates timestamped snapshots; this
# alert fires when the most-recent one has aged past the operator's
# tolerance OR when no backups exist at all. Without this alert, a
# silently-failing backup job (perm error, disk full, plist disabled)
# is invisible until the next time someone needs to restore.


def test_backup_dir_none_means_no_backup_fields(db_path: Path) -> None:
    # Opt-out: caller didn't pass --backup-dir, so the three backup
    # fields stay None and the text output omits the backup line.
    r = collect_report(db_path)
    assert r.backup_dir is None
    assert r.latest_backup is None
    assert r.backup_age_hours is None
    assert "backup_dir=" not in r.to_text()


def test_backup_dir_empty_reports_none_latest(db_path: Path, tmp_path: Path) -> None:
    empty = tmp_path / "backups-empty"
    empty.mkdir()
    r = collect_report(db_path, backup_dir=empty)
    assert r.backup_dir == str(empty)
    assert r.latest_backup is None
    assert r.backup_age_hours is None
    assert "latest=NONE" in r.to_text()


def test_backup_dir_missing_directory_reports_none_latest(
    db_path: Path, tmp_path: Path
) -> None:
    # Same shape as empty dir — operator can wire the flag in
    # before the first backup ever ran without crashing.
    missing = tmp_path / "backups-not-yet-created"
    r = collect_report(db_path, backup_dir=missing)
    assert r.latest_backup is None
    assert r.backup_age_hours is None


def test_age_uses_mtime_not_filename(db_path: Path, tmp_path: Path) -> None:
    # Plant two files; the one with the newer MTIME wins even if its
    # filename timestamp is older. This matches the docstring on
    # find_latest_backup and protects against manual `cp` backups
    # whose filenames may not follow the convention.
    import os
    bdir = tmp_path / "backups"
    bdir.mkdir()
    old_named_but_new_mtime = bdir / "threads_watcher-20250101T000000Z.db"
    new_named_but_old_mtime = bdir / "threads_watcher-20260601T000000Z.db"
    old_named_but_new_mtime.write_bytes(b"x")
    new_named_but_old_mtime.write_bytes(b"x")
    # Force mtimes to disagree with filename order.
    now = datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc).timestamp()
    os.utime(old_named_but_new_mtime, (now, now))
    os.utime(new_named_but_old_mtime, (now - 7 * 86400, now - 7 * 86400))

    r = collect_report(
        db_path,
        backup_dir=bdir,
        now=datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc),
    )
    assert r.latest_backup == "threads_watcher-20250101T000000Z.db"


def test_threshold_not_tripped_when_backup_is_fresh(
    db_path: Path, tmp_path: Path
) -> None:
    import os
    bdir = tmp_path / "backups"
    bdir.mkdir()
    fresh = bdir / "threads_watcher-20260523T100000Z.db"
    fresh.write_bytes(b"x")
    now = datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc)
    os.utime(fresh, (now.timestamp() - 3600, now.timestamp() - 3600))  # 1h old

    r = collect_report(
        db_path,
        backup_dir=bdir,
        threshold_backup_age_hours=24,
        now=now,
    )
    assert r.thresholds_tripped == []
    assert r.backup_age_hours is not None
    assert 0.9 < r.backup_age_hours < 1.1


def test_threshold_trips_when_backup_is_stale(
    db_path: Path, tmp_path: Path
) -> None:
    import os
    bdir = tmp_path / "backups"
    bdir.mkdir()
    stale = bdir / "threads_watcher-20260515T000000Z.db"
    stale.write_bytes(b"x")
    now = datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc)
    os.utime(stale, (now.timestamp() - 48 * 3600, now.timestamp() - 48 * 3600))

    r = collect_report(
        db_path,
        backup_dir=bdir,
        threshold_backup_age_hours=24,
        now=now,
    )
    assert len(r.thresholds_tripped) == 1
    msg = r.thresholds_tripped[0]
    assert "backup_age>=24" in msg
    assert "threads_watcher-20260515T000000Z.db" in msg


def test_threshold_trips_when_no_backups_exist(
    db_path: Path, tmp_path: Path
) -> None:
    # The most operationally important case: backup job has been broken
    # so long there's nothing in the directory. Without this branch,
    # an empty backup-dir + threshold would silently pass.
    empty = tmp_path / "backups-broken"
    empty.mkdir()
    r = collect_report(
        db_path,
        backup_dir=empty,
        threshold_backup_age_hours=24,
    )
    assert len(r.thresholds_tripped) == 1
    assert "no backups in" in r.thresholds_tripped[0]


def test_clock_skew_future_backup_does_not_trip(
    db_path: Path, tmp_path: Path
) -> None:
    # mtime in the future would produce a negative age — clamp to 0
    # so a positive threshold never fires on clock skew alone.
    import os
    bdir = tmp_path / "backups"
    bdir.mkdir()
    future = bdir / "threads_watcher-20260601T000000Z.db"
    future.write_bytes(b"x")
    now = datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc)
    os.utime(future, (now.timestamp() + 86400, now.timestamp() + 86400))

    r = collect_report(
        db_path,
        backup_dir=bdir,
        threshold_backup_age_hours=1,
        now=now,
    )
    assert r.thresholds_tripped == []
    assert r.backup_age_hours == 0.0


def test_main_returns_one_when_threshold_passed_without_dir(
    db_path: Path, capsys
) -> None:
    # --threshold-backup-age-hours without --backup-dir is an invocation
    # error (the threshold has nothing to look at). Exit 1, not 2, so a
    # cron wrapper can distinguish from real threshold trips (exit 2).
    rc = main(["--db", str(db_path), "--threshold-backup-age-hours", "24"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "requires --backup-dir" in err


def test_main_returns_two_when_backup_threshold_tripped(
    db_path: Path, tmp_path: Path, capsys
) -> None:
    # End-to-end via main(): empty backup dir + threshold = exit 2 with
    # TRIPPED line in stdout naming backup_age.
    empty = tmp_path / "backups-broken"
    empty.mkdir()
    rc = main([
        "--db", str(db_path),
        "--backup-dir", str(empty),
        "--threshold-backup-age-hours", "24",
    ])
    out = capsys.readouterr().out
    assert rc == 2
    assert "TRIPPED" in out
    assert "backup_age" in out
