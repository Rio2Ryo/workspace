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

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync import (  # noqa: E402
    DEFAULT_LOCK_STALE_SEC,
    _LOCK_OWNER_FILENAME,
    acquire_lock,
    lock_is_stale,
    main,
    release_lock,
)


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


class TestStaleLockRecovery:
    """A SIGKILL / OOM-kill / reboot skips main()'s release_lock finally
    block, leaving the lockdir behind. Without staleness detection the
    bare mkdir lock would wedge every future launchd tick: each fires,
    hits FileExistsError, logs 'skipping', and exits 0 — auto-sync dies
    silently while looking healthy in `launchctl list`. These pin the
    recovery — a dead-PID owner, or an age past the TTL, is reclaimed."""

    def _seed_lock(self, lockdir: Path, owner: dict | None) -> None:
        """Create a held lockdir carrying a given owner.json payload.
        owner=None writes no owner file (a pre-staleness lockdir, or a
        lock torn between mkdir and the owner.json write)."""
        lockdir.mkdir()
        if owner is not None:
            (lockdir / _LOCK_OWNER_FILENAME).write_text(
                json.dumps(owner), encoding="utf-8"
            )

    def _dead_pid(self) -> int:
        """A PID guaranteed not to be alive: spawn a trivial child, wait
        for it to exit and be reaped, then reuse its (now-free) PID."""
        proc = subprocess.Popen([sys.executable, "-c", ""])
        proc.wait()
        return proc.pid

    def _owner(self, pid: int, started_ts: int) -> dict:
        return {
            "pid": pid,
            "host": socket.gethostname(),
            "started_ts": started_ts,
            "started_at": "2026-05-23T00:00:00Z",
        }

    def test_dead_pid_owner_is_stale_and_reclaimed(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        # Recent started_ts — only the dead PID marks it stale.
        self._seed_lock(lock, self._owner(self._dead_pid(), int(time.time())))
        assert lock_is_stale(lock, DEFAULT_LOCK_STALE_SEC) is True
        assert acquire_lock(lock) is True
        # Reclaim must leave a fresh owner.json naming THIS process.
        owner = json.loads((lock / _LOCK_OWNER_FILENAME).read_text())
        assert owner["pid"] == os.getpid()

    def test_live_pid_owner_within_ttl_is_held(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        # os.getpid() is this very test process — unambiguously alive.
        self._seed_lock(lock, self._owner(os.getpid(), int(time.time())))
        assert lock_is_stale(lock, DEFAULT_LOCK_STALE_SEC) is False
        assert acquire_lock(lock) is False

    def test_live_pid_owner_past_ttl_is_reclaimed(self, tmp_path: Path):
        # A genuinely hung run: PID alive, but started 2h ago. The TTL
        # backstop reclaims it — no real sync runs for an hour.
        lock = tmp_path / "lock.d"
        self._seed_lock(lock, self._owner(os.getpid(), int(time.time()) - 7200))
        assert lock_is_stale(lock, DEFAULT_LOCK_STALE_SEC) is True
        assert acquire_lock(lock) is True

    def test_no_owner_file_fresh_lock_is_held(self, tmp_path: Path):
        # owner.json missing (pre-staleness lockdir) + fresh mtime →
        # treat as a live holder; never reclaim a just-created lock.
        lock = tmp_path / "lock.d"
        self._seed_lock(lock, None)
        assert lock_is_stale(lock, DEFAULT_LOCK_STALE_SEC) is False
        assert acquire_lock(lock) is False

    def test_no_owner_file_old_lock_is_reclaimed(self, tmp_path: Path):
        # owner.json missing + lockdir mtime 2h old → TTL fallback.
        lock = tmp_path / "lock.d"
        self._seed_lock(lock, None)
        old = time.time() - 7200
        os.utime(lock, (old, old))
        assert lock_is_stale(lock, DEFAULT_LOCK_STALE_SEC) is True
        assert acquire_lock(lock) is True

    def test_corrupt_owner_file_falls_back_to_mtime_ttl(self, tmp_path: Path):
        # owner.json present but not valid JSON → treated as missing,
        # falls back to the lockdir mtime TTL.
        lock = tmp_path / "lock.d"
        lock.mkdir()
        (lock / _LOCK_OWNER_FILENAME).write_text("{not json", encoding="utf-8")
        old = time.time() - 7200
        os.utime(lock, (old, old))
        assert lock_is_stale(lock, DEFAULT_LOCK_STALE_SEC) is True

    def test_acquire_writes_owner_file_on_fresh_lock(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        assert acquire_lock(lock) is True
        owner = json.loads((lock / _LOCK_OWNER_FILENAME).read_text())
        assert owner["pid"] == os.getpid()
        assert owner["host"] == socket.gethostname()

    def test_release_removes_owner_file_so_rmdir_succeeds(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        acquire_lock(lock)
        assert (lock / _LOCK_OWNER_FILENAME).exists()
        release_lock(lock)
        # owner.json removed first → the rmdir isn't blocked by a
        # non-empty directory; the whole lockdir is gone.
        assert not lock.exists()

    def test_reclaim_emits_log_line(self, tmp_path: Path):
        lock = tmp_path / "lock.d"
        self._seed_lock(lock, self._owner(self._dead_pid(), int(time.time())))
        lines: list[str] = []
        assert acquire_lock(lock, log=lines.append) is True
        assert any("recovered stale sync lock" in m for m in lines)

    def test_main_recovers_stale_lock_instead_of_skipping(self, tmp_path: Path):
        # End-to-end wedge scenario: a dead-PID lockdir must NOT make
        # main() skip — it reclaims, proceeds, and the log says so.
        db = tmp_path / "db.sqlite"
        db.touch()
        snap = tmp_path / "state.json"
        snap.write_text("{}", encoding="utf-8")
        lock = tmp_path / "lock.d"
        self._seed_lock(lock, self._owner(self._dead_pid(), int(time.time())))

        # main may raise/exit non-zero (the empty DB has no `posts`
        # table) — we only assert it got PAST the lock gate.
        try:
            main([
                "--db", str(db),
                "--snapshot", str(snap),
                "--cursor", str(tmp_path / ".cursor"),
                "--log", str(tmp_path / "sync.log"),
                "--workspace", str(tmp_path),
                "--lockdir", str(lock),
            ])
        except Exception:
            pass

        log_text = (tmp_path / "sync.log").read_text(encoding="utf-8")
        assert "recovered stale sync lock" in log_text
        assert "another sync.py is in progress — skipping" not in log_text
