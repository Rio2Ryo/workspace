"""Unit tests for backup_db.py.

Pins the hot-safe snapshot + retention contract:
  - sqlite3.Connection.backup() (not cp) so concurrent watcher.py
    writes don't corrupt the backup
  - timestamp filename allows multiple-per-day runs
  - integrity_check on the backup before retaining anything
  - --dry-run is side-effect-free
  - retention prunes oldest by name (chronological because the
    timestamp format sorts lexicographically)
"""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backup_db import (  # noqa: E402
    BACKUP_PREFIX,
    BACKUP_SUFFIX,
    backup_filename,
    list_existing_backups,
    main,
    run_backup,
)


# ── Fixtures ──────────────────────────────────────────────────────────


def _make_source_db(path: Path, *, rows: int = 5) -> None:
    """Create a tiny sqlite DB with a known table + row count so we
    can prove the backup preserves data."""
    conn = sqlite3.connect(path)
    try:
        conn.execute("CREATE TABLE marker (n INTEGER PRIMARY KEY, payload TEXT)")
        conn.executemany(
            "INSERT INTO marker (n, payload) VALUES (?, ?)",
            [(i, f"payload-{i}") for i in range(rows)],
        )
        conn.commit()
    finally:
        conn.close()


@pytest.fixture
def src_db(tmp_path: Path) -> Path:
    p = tmp_path / "src.db"
    _make_source_db(p, rows=5)
    return p


@pytest.fixture
def backup_dir(tmp_path: Path) -> Path:
    return tmp_path / "backups"


# ── backup_filename ────────────────────────────────────────────────────


def test_backup_filename_format_uses_utc_iso() -> None:
    # JST input must still produce UTC filename — important because
    # macOS launchd timezone is host-dependent.
    jst_now = datetime(2026, 5, 23, 18, 0, 0, tzinfo=timezone.utc).astimezone(
        timezone(__import__("datetime").timedelta(hours=9))
    )
    name = backup_filename(jst_now)
    assert name == "threads_watcher-20260523T180000Z.db"
    assert name.startswith(BACKUP_PREFIX)
    assert name.endswith(BACKUP_SUFFIX)


def test_backup_filename_seconds_precision_avoids_collisions() -> None:
    # Two runs 1s apart must yield different filenames — otherwise
    # the second silently overwrites the first.
    t1 = datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc)
    t2 = datetime(2026, 5, 23, 12, 0, 1, tzinfo=timezone.utc)
    assert backup_filename(t1) != backup_filename(t2)


# ── run_backup — happy path ────────────────────────────────────────────


def test_backup_writes_file_with_expected_filename(
    src_db: Path, backup_dir: Path
) -> None:
    fixed = datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc)
    result = run_backup(db_path=src_db, backup_dir=backup_dir, keep=7, now=fixed)
    expected = backup_dir / "threads_watcher-20260523T120000Z.db"
    assert result.backup_path == expected
    assert expected.exists()
    assert result.bytes_written > 0
    assert result.dry_run is False


def test_backup_preserves_source_data(src_db: Path, backup_dir: Path) -> None:
    # The whole reason we use sqlite3.Connection.backup() over `cp`:
    # the backup must contain the same rows as the source. Verify by
    # opening the backup and counting.
    run_backup(db_path=src_db, backup_dir=backup_dir, keep=7)
    backups = list_existing_backups(backup_dir)
    assert len(backups) == 1

    conn = sqlite3.connect(backups[0])
    try:
        n = conn.execute("SELECT COUNT(*) FROM marker").fetchone()[0]
    finally:
        conn.close()
    assert n == 5


def test_backup_creates_dir_if_missing(src_db: Path, backup_dir: Path) -> None:
    # Fresh install path: backups/ doesn't exist yet. The script
    # must create it rather than crash.
    assert not backup_dir.exists()
    run_backup(db_path=src_db, backup_dir=backup_dir, keep=7)
    assert backup_dir.is_dir()


# ── run_backup — retention ─────────────────────────────────────────────


def test_retention_prunes_oldest_by_name(src_db: Path, backup_dir: Path) -> None:
    # Pre-seed 5 fake backups dated 2026-05-15..05-19 (older = lower).
    backup_dir.mkdir()
    for day in range(15, 20):
        (backup_dir / f"{BACKUP_PREFIX}202605{day:02d}T120000Z{BACKUP_SUFFIX}").write_bytes(b"x")

    # Run a real backup on 05-23 with keep=3. Total becomes 6; oldest
    # 3 should be pruned.
    fixed = datetime(2026, 5, 23, 12, 0, 0, tzinfo=timezone.utc)
    result = run_backup(db_path=src_db, backup_dir=backup_dir, keep=3, now=fixed)

    surviving = [p.name for p in list_existing_backups(backup_dir)]
    assert len(surviving) == 3
    # Newest-first contract: the just-written backup is index 0.
    assert surviving[0] == "threads_watcher-20260523T120000Z.db"
    # The three oldest seeded ones must be gone.
    assert "threads_watcher-20260515T120000Z.db" not in surviving
    assert "threads_watcher-20260516T120000Z.db" not in surviving
    assert "threads_watcher-20260517T120000Z.db" not in surviving
    # The two most-recent seeded ones must survive.
    assert "threads_watcher-20260519T120000Z.db" in surviving
    assert "threads_watcher-20260518T120000Z.db" in surviving
    # pruned report matches what's gone.
    pruned_names = {p.name for p in result.pruned}
    assert pruned_names == {
        "threads_watcher-20260515T120000Z.db",
        "threads_watcher-20260516T120000Z.db",
        "threads_watcher-20260517T120000Z.db",
    }


def test_retention_keep_equals_existing_count_prunes_nothing(
    src_db: Path, backup_dir: Path
) -> None:
    # Pre-seed 2 fake backups; with keep=3 a new backup brings the
    # count to exactly 3 → no pruning.
    backup_dir.mkdir()
    for day in (20, 21):
        (backup_dir / f"{BACKUP_PREFIX}202605{day:02d}T120000Z{BACKUP_SUFFIX}").write_bytes(b"x")

    result = run_backup(
        db_path=src_db,
        backup_dir=backup_dir,
        keep=3,
        now=datetime(2026, 5, 22, 12, 0, 0, tzinfo=timezone.utc),
    )
    assert result.pruned == []
    assert len(list_existing_backups(backup_dir)) == 3


# ── run_backup — integrity guard ───────────────────────────────────────


def test_integrity_failure_deletes_partial_backup(
    monkeypatch, src_db: Path, backup_dir: Path
) -> None:
    # Simulate a corrupted backup: monkeypatch _integrity_check to
    # return False. The contract is that run_backup must (a) raise
    # sqlite3.DatabaseError, AND (b) leave no backup file behind so
    # the next run's retention isn't confused.
    import backup_db

    monkeypatch.setattr(backup_db, "_integrity_check", lambda p: False)

    with pytest.raises(sqlite3.DatabaseError) as exc:
        run_backup(db_path=src_db, backup_dir=backup_dir, keep=7)
    assert "integrity_check failed" in str(exc.value)
    # Most important assertion: the directory is back to empty.
    assert list_existing_backups(backup_dir) == []


# ── run_backup — dry-run ───────────────────────────────────────────────


def test_dry_run_writes_nothing(src_db: Path, backup_dir: Path) -> None:
    result = run_backup(db_path=src_db, backup_dir=backup_dir, keep=7, dry_run=True)
    assert result.dry_run is True
    assert result.bytes_written == 0
    # The directory must not exist (we didn't write).
    assert not backup_dir.exists() or list_existing_backups(backup_dir) == []
    # But the simulated backup_path is still computed so the operator
    # sees what the filename WOULD be.
    assert result.backup_path.name.startswith(BACKUP_PREFIX)


def test_dry_run_reports_what_would_be_pruned(
    src_db: Path, backup_dir: Path
) -> None:
    # Pre-seed enough fakes that a real run would prune.
    backup_dir.mkdir()
    for day in range(10, 18):  # 8 backups, May 10..17
        (backup_dir / f"{BACKUP_PREFIX}202605{day:02d}T120000Z{BACKUP_SUFFIX}").write_bytes(b"x")

    result = run_backup(
        db_path=src_db,
        backup_dir=backup_dir,
        keep=3,
        dry_run=True,
        now=datetime(2026, 5, 20, 12, 0, 0, tzinfo=timezone.utc),
    )
    # 8 seeded + 1 new = 9. keep=3 → 6 would be pruned.
    assert len(result.pruned) == 6
    # The actual files on disk are untouched (still 8, not 3).
    assert len(list_existing_backups(backup_dir)) == 8


# ── run_backup — invocation guards ─────────────────────────────────────


def test_missing_source_raises_filenotfounderror(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        run_backup(
            db_path=tmp_path / "absent.db",
            backup_dir=tmp_path / "backups",
            keep=7,
        )


def test_keep_zero_raises_valueerror(src_db: Path, backup_dir: Path) -> None:
    # keep=0 would delete the backup we just wrote — a misconfiguration
    # we'd rather catch than silently fulfill.
    with pytest.raises(ValueError):
        run_backup(db_path=src_db, backup_dir=backup_dir, keep=0)


def test_keep_negative_raises_valueerror(src_db: Path, backup_dir: Path) -> None:
    with pytest.raises(ValueError):
        run_backup(db_path=src_db, backup_dir=backup_dir, keep=-3)


# ── main() CLI ─────────────────────────────────────────────────────────


def test_main_returns_zero_on_happy_path(src_db: Path, backup_dir: Path, capsys) -> None:
    rc = main(["--db", str(src_db), "--dir", str(backup_dir), "--keep", "7"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "backup=" in out
    assert "bytes=" in out
    assert "pruned=" in out


def test_main_returns_two_when_source_missing(tmp_path: Path, capsys) -> None:
    rc = main(["--db", str(tmp_path / "absent.db"), "--dir", str(tmp_path / "b")])
    assert rc == 2
    assert "ERROR" in capsys.readouterr().err


def test_main_dry_run_prefixes_output(src_db: Path, backup_dir: Path, capsys) -> None:
    rc = main(["--db", str(src_db), "--dir", str(backup_dir), "--dry-run"])
    assert rc == 0
    out = capsys.readouterr().out
    # Every line carries the [dry-run] tag so log scrapers can filter
    # real from simulated runs cleanly.
    for line in out.strip().splitlines():
        assert line.startswith("[dry-run]"), f"missing [dry-run] prefix on: {line!r}"
    # Nothing landed on disk.
    assert not backup_dir.exists() or list_existing_backups(backup_dir) == []


def test_main_returns_two_when_keep_invalid(src_db: Path, backup_dir: Path, capsys) -> None:
    rc = main(["--db", str(src_db), "--dir", str(backup_dir), "--keep", "0"])
    assert rc == 2
    assert "ERROR" in capsys.readouterr().err


# ── Production-shape volume e2e ────────────────────────────────────────
#
# Existing 17 tests use 5-row src_db (~12KB). Real production
# threads_watcher.db is 29MB+ with screenshot_png BLOBs (post rows
# carry PNG bytes of variable size, typically 50-500KB each). BLOB-
# heavy DBs exercise different code paths than empty-table tests:
#   - SQLite backup API copies pages; performance scales with DB size
#   - integrity_check walks every page including BLOB extensions
#   - retention with many backups stresses the filename listing/sort
#
# This block validates correctness + performance at production scale:
#   - 5MB DB with BLOB column (mirrors real screenshot_png shape)
#   - 10 retained generations (production --keep 7 + headroom)
#   - <5s budget per backup (real production runs are sub-second
#     under macOS APFS; pin against future fsync regression)


def _make_production_shape_db(path: Path, *, num_rows: int = 100,
                              blob_bytes: int = 50_000) -> int:
    """Create a DB mirroring the production threads_watcher.db shape:
    posts table with screenshot_png BLOB column. Total file size
    ≈ num_rows × blob_bytes (default 5MB). Returns actual file size."""
    conn = sqlite3.connect(path)
    try:
        conn.executescript("""
            CREATE TABLE posts (
                id INTEGER PRIMARY KEY,
                handle TEXT NOT NULL,
                post_id TEXT NOT NULL,
                post_url TEXT,
                first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
                captured_at TEXT NOT NULL DEFAULT (datetime('now')),
                screenshot_png BLOB NOT NULL,
                screenshot_content_type TEXT,
                screenshot_size_bytes INTEGER,
                screenshot_width INTEGER,
                screenshot_height INTEGER,
                local_path TEXT
            );
            CREATE UNIQUE INDEX idx_posts_handle_post ON posts (handle, post_id);
        """)
        # Use deterministic content so a corrupted backup would mismatch
        # at a specific byte position — easier to debug than random.
        marker_byte = b'\xab'
        blob_payload = marker_byte * blob_bytes
        conn.executemany(
            "INSERT INTO posts (handle, post_id, screenshot_png, "
            "screenshot_size_bytes) VALUES (?, ?, ?, ?)",
            [(f"@h{i % 5}", f"post{i:06d}", blob_payload, blob_bytes)
             for i in range(num_rows)],
        )
        conn.commit()
    finally:
        conn.close()
    return path.stat().st_size


def test_production_shape_backup_preserves_byte_identical_copy(tmp_path):
    # 🔒 Headline correctness pin: BLOB-heavy DB round-trips through
    # backup byte-for-byte. SQLite backup API uses page-level copy;
    # any bug in the BLOB-page handling would surface here as a
    # checksum mismatch.
    src = tmp_path / "src.db"
    backup_dir = tmp_path / "backups"
    src_size = _make_production_shape_db(src, num_rows=100, blob_bytes=50_000)
    assert src_size > 4_000_000, f"fixture too small: {src_size} bytes"

    backup_path = run_backup(
        db_path=src, backup_dir=backup_dir, keep=7,
        now=datetime(2026, 5, 23, tzinfo=timezone.utc),
    ).backup_path
    assert backup_path.exists()
    # Backup file size matches source.
    backup_size = backup_path.stat().st_size
    assert backup_size == src_size, (
        f"backup size {backup_size} != source size {src_size}; "
        f"BLOB pages dropped?"
    )
    # 🔒 Content match: read all BLOBs from both DBs, compare.
    src_conn = sqlite3.connect(src)
    bk_conn = sqlite3.connect(backup_path)
    try:
        src_blobs = src_conn.execute(
            "SELECT post_id, screenshot_png FROM posts ORDER BY id"
        ).fetchall()
        bk_blobs = bk_conn.execute(
            "SELECT post_id, screenshot_png FROM posts ORDER BY id"
        ).fetchall()
        assert len(src_blobs) == len(bk_blobs) == 100
        for s, b in zip(src_blobs, bk_blobs):
            assert s[0] == b[0], f"post_id mismatch: {s[0]} vs {b[0]}"
            assert s[1] == b[1], (
                f"BLOB mismatch for {s[0]}: lengths {len(s[1])} vs {len(b[1])}"
            )
    finally:
        src_conn.close()
        bk_conn.close()


def test_production_shape_backup_passes_integrity_check(tmp_path):
    # 🔒 Backup integrity verified via PRAGMA integrity_check (same
    # check backup_db.py uses internally). For a BLOB-heavy DB,
    # integrity_check walks every page including BLOB extensions —
    # surfaces page corruption that a row-count alone would miss.
    src = tmp_path / "src.db"
    backup_dir = tmp_path / "backups"
    _make_production_shape_db(src, num_rows=100, blob_bytes=50_000)
    backup_path = run_backup(
        db_path=src, backup_dir=backup_dir, keep=7,
        now=datetime(2026, 5, 23, tzinfo=timezone.utc),
    ).backup_path
    conn = sqlite3.connect(backup_path)
    try:
        result = conn.execute("PRAGMA integrity_check").fetchall()
        # `ok` is the single-row response for a clean DB.
        assert result == [("ok",)], f"integrity_check failed: {result}"
    finally:
        conn.close()


def test_production_shape_backup_completes_under_5s(tmp_path):
    # 🔒 Performance budget: 5MB DB backup should be sub-second on
    # macOS APFS. Pin 5s ceiling against future fsync / page-copy
    # regression that would compound at production 29MB+ scale
    # (running every 3 AM cron tick — slow backup risks overlap
    # with watcher's next tick).
    import time as _time
    src = tmp_path / "src.db"
    backup_dir = tmp_path / "backups"
    _make_production_shape_db(src, num_rows=100, blob_bytes=50_000)
    start = _time.monotonic()
    run_backup(
        db_path=src, backup_dir=backup_dir, keep=7,
        now=datetime(2026, 5, 23, tzinfo=timezone.utc),
    )
    elapsed = _time.monotonic() - start
    assert elapsed < 5.0, (
        f"backup of 5MB DB took {elapsed:.2f}s; budget 5s. "
        f"At production 29MB+ scale this would proportionally "
        f"impact the 3 AM cron window."
    )


def test_production_shape_retention_prunes_oldest_across_10_generations(tmp_path):
    # 🔒 Retention scaling: --keep 7 with 10 existing backups should
    # delete 3 oldest, leave 7 newest. Catches lexicographic-sort
    # regression in list_existing_backups that would mis-order
    # YYYYMMDD-formatted filenames at the boundary.
    src = tmp_path / "src.db"
    backup_dir = tmp_path / "backups"
    _make_production_shape_db(src, num_rows=20, blob_bytes=10_000)
    # Create 10 backups across consecutive days. The filename uses
    # ISO timestamp, so daily-incremented ts sorts lexicographically
    # in the same order as chronologically.
    backups_created: list[Path] = []
    for day in range(10):
        ts = datetime(2026, 5, 1 + day, tzinfo=timezone.utc)
        result = run_backup(db_path=src, backup_dir=backup_dir, keep=999, now=ts)
        backups_created.append(result.backup_path)
    # All 10 should exist.
    assert all(p.exists() for p in backups_created)
    # Now run with --keep 7: oldest 3 should be deleted.
    ts = datetime(2026, 5, 11, tzinfo=timezone.utc)
    run_backup(db_path=src, backup_dir=backup_dir, keep=7, now=ts)
    remaining = list_existing_backups(backup_dir)
    # 7 oldest-day backups + the newest one we just created = 8.
    # The --keep 7 trims to 7 NEWEST.
    assert len(remaining) == 7, (
        f"expected 7 backups after --keep 7; got {len(remaining)}: "
        f"{[p.name for p in remaining]}"
    )
    # 🔒 Oldest 3 (May 1, 2, 3) should be gone.
    for old_day in (1, 2, 3):
        old_p = next((p for p in backups_created
                      if f"-{2026:04d}{5:02d}{old_day:02d}T" in p.name), None)
        if old_p:
            assert not old_p.exists(), (
                f"oldest backup {old_p.name} should have been pruned"
            )
