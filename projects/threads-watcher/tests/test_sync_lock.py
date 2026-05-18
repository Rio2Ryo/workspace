"""Tests for sync.py's mkdir-atomic mutex (acquire_lock / release_lock).

Why this exists
---------------
Race scenario: launchd 30-min cycle fires AND operator runs `python
sync.py --confirm` manually within the same second. Both read the
same cursor, both git add + commit, second commit either duplicates
the first or hits index.lock conflict. With --enable-push, both
push, second fast-forwards over the first.

The mutex prevents this. Currently sync.py is in DRY-RUN mode (no
--confirm), so the race is benign — adding this guard as preventive
infrastructure for the --confirm promotion.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync import acquire_lock, main, release_lock  # noqa: E402


class TestAcquireRelease:
    def test_first_acquire_succeeds(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        assert acquire_lock(lock) is True
        assert lock.is_dir()

    def test_second_acquire_returns_false(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        assert acquire_lock(lock) is True
        # Second acquire while first still holds: must fail.
        assert acquire_lock(lock) is False

    def test_release_then_reacquire(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        assert acquire_lock(lock) is True
        release_lock(lock)
        assert not lock.exists()
        assert acquire_lock(lock) is True

    def test_release_is_idempotent(self, tmp_path: Path):
        """Repeated release shouldn't throw — the finally block runs
        even when acquire_lock returned False (defensive against the
        future-me forgetting to gate release on acquire success)."""
        lock = tmp_path / "lock.d"
        release_lock(lock)  # before any acquire
        release_lock(lock)  # twice
        # Now acquire + release + release again
        acquire_lock(lock)
        release_lock(lock)
        release_lock(lock)
        # Should still be acquirable.
        assert acquire_lock(lock) is True


class TestMainGate:
    """Pin that sync.main() honours the lock: if lockdir already exists,
    main returns 0 quickly without touching the DB."""

    def _seed_minimal_workspace(self, tmp_path: Path) -> tuple[Path, Path, Path]:
        """Set up the minimum sync.main needs: an empty DB file + a
        snapshot file + workspace dir. Returns (db, snapshot, workspace)."""
        db = tmp_path / "db.sqlite"
        # main() requires the file to exist (its own check, before
        # sqlite3.connect). Touch is fine — sqlite handles empty files.
        db.touch()
        snapshot = tmp_path / "state.json"
        snapshot.write_text("{}", encoding="utf-8")
        return db, snapshot, tmp_path

    def test_main_returns_0_and_skips_when_lock_held(self, tmp_path: Path, capsys):
        db, snap, ws = self._seed_minimal_workspace(tmp_path)
        lockdir = tmp_path / "lock.d"
        lockdir.mkdir()  # held by hypothetical other process

        exit_code = main([
            "--db", str(db),
            "--snapshot", str(snap),
            "--cursor", str(tmp_path / ".cursor"),
            "--log", str(tmp_path / "sync.log"),
            "--workspace", str(ws),
            "--lockdir", str(lockdir),
        ])
        assert exit_code == 0

        captured = capsys.readouterr().out + capsys.readouterr().err
        # The log message gets routed through TeeLogger to stdout/file.
        # Pin the user-visible 'skipping' phrase rather than the exact
        # format so a future log-format tweak doesn't churn this test.
        log_text = (tmp_path / "sync.log").read_text(encoding="utf-8")
        assert "another sync.py is in progress — skipping" in log_text
        assert "operator force" in log_text

    def test_main_acquires_lock_when_free(self, tmp_path: Path):
        """Even though the rest of main may fail (missing tables etc.),
        the lock is at least acquired and then released — confirmed by
        the lockdir being absent after the run."""
        db, snap, ws = self._seed_minimal_workspace(tmp_path)
        lockdir = tmp_path / "lock.d"
        assert not lockdir.exists()  # baseline

        # main may return non-zero due to missing DB tables — that's
        # not what we're testing here, just that the lock lifecycle
        # works under main's finally clause.
        try:
            main([
                "--db", str(db),
                "--snapshot", str(snap),
                "--cursor", str(tmp_path / ".cursor"),
                "--log", str(tmp_path / "sync.log"),
                "--workspace", str(ws),
                "--lockdir", str(lockdir),
            ])
        except Exception:
            pass

        # The lock dir should have been released by the finally block.
        assert not lockdir.exists(), "lockdir leaked — release_lock didn't run"
