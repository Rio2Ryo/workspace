"""Integration tests for publish-if-delta.sh — the launchd auto-sync
wrapper that commits/pushes/deploys the public status page only when
the SQLite DB has unpublished posts.

The script's decision logic had zero coverage: the no-delta skip gate,
the post-sync cursor-advancement guard (catches a sync that exits 0 but
fails to advance `.sync_cursor`), and the deploy gating. A silent bug
here means a stale public page or a wrongful push.

Sandbox stubs every side-effecting dependency:
  - venv/bin/python  -> a dispatcher: the read_state heredoc runs for
                        real (real sqlite3 against a controlled test
                        DB); `sync.py` is simulated (success/failure
                        and cursor-advance both controllable)
  - threads-watcher-status/deploy.sh -> records its invocation instead
                        of actually deploying
The real publish-if-delta.sh drives all of it.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import stat
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _write_exec(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _make_db(path: Path, max_id: int) -> None:
    """A minimal posts table — read_state only ever does MAX(id)."""
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY)")
    for i in range(1, max_id + 1):
        conn.execute("INSERT INTO posts (id) VALUES (?)", (i,))
    conn.commit()
    conn.close()


def _make_sandbox(tmp_path: Path) -> Path:
    sb = tmp_path / "sandbox"
    sb.mkdir()
    (sb / "logs").mkdir()
    (sb / "venv" / "bin").mkdir(parents=True)
    (sb / "threads-watcher-status").mkdir()

    shutil.copy(PROJECT_ROOT / "publish-if-delta.sh", sb / "publish-if-delta.sh")
    (sb / "publish-if-delta.sh").chmod(0o755)

    # Stub python: the read_state heredoc (`python - `) runs for real;
    # `python sync.py ...` is simulated. A successful sync advances
    # .sync_cursor to MAX(id) — exactly what the real sync.py does —
    # unless `.sync-skip-cursor` is present (to exercise the wrapper's
    # post-sync cursor guard). `.sync-should-fail` makes sync exit 1.
    _write_exec(sb / "venv" / "bin" / "python", (
        "#!/bin/sh\n"
        'if [ "$1" = "sync.py" ]; then\n'
        "  touch .sync-called\n"
        '  [ -f .sync-should-fail ] && exit 1\n'
        '  if [ ! -f .sync-skip-cursor ]; then\n'
        "    python3 -c \"import sqlite3; "
        "open('.sync_cursor','w').write(str(sqlite3.connect('threads_watcher.db')"
        ".execute('select coalesce(max(id),0) from posts').fetchone()[0]))\"\n"
        "  fi\n"
        "  exit 0\n"
        "fi\n"
        'exec python3 "$@"\n'
    ))

    # Stub deploy.sh — records the call; `.deploy-should-fail` -> exit 1.
    _write_exec(sb / "threads-watcher-status" / "deploy.sh", (
        "#!/bin/sh\n"
        'echo "STUB deploy invoked"\n'
        "touch .deploy-called\n"
        '[ -f .deploy-should-fail ] && exit 1\n'
        "exit 0\n"
    ))
    return sb


def _run(
    sb: Path,
    *,
    db_max: int,
    cursor: int | None,
    make_db: bool = True,
    sync_fails: bool = False,
    sync_skips_cursor: bool = False,
    deploy_fails: bool = False,
) -> tuple[int, str, bool, bool]:
    """Run publish-if-delta.sh. Returns
    (exit_code, output, sync_called, deploy_called)."""
    db_path = sb / "threads_watcher.db"
    if db_path.exists():
        db_path.unlink()
    if make_db:
        _make_db(db_path, db_max)
    cursor_path = sb / ".sync_cursor"
    if cursor is None:
        cursor_path.unlink(missing_ok=True)
    else:
        cursor_path.write_text(str(cursor), encoding="utf-8")

    for marker, flag in [
        (".sync-called", False), (".deploy-called", False),
        (".sync-should-fail", sync_fails), (".sync-skip-cursor", sync_skips_cursor),
        (".deploy-should-fail", deploy_fails),
    ]:
        p = sb / marker
        p.unlink(missing_ok=True)
        if flag:
            p.write_text("", encoding="utf-8")

    proc = subprocess.run(
        ["bash", "publish-if-delta.sh"],
        cwd=str(sb), capture_output=True, text=True, timeout=30,
    )
    return (
        proc.returncode,
        proc.stdout + proc.stderr,
        (sb / ".sync-called").exists(),
        (sb / ".deploy-called").exists(),
    )


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    return _make_sandbox(tmp_path)


# ── no-delta skip gate ────────────────────────────────────────────────


def test_no_delta_skips_sync_and_deploy(sandbox: Path) -> None:
    # cursor == db_max → delta 0 → skip without running sync or deploy.
    code, out, synced, deployed = _run(sandbox, db_max=10, cursor=10)
    assert code == 0
    assert synced is False
    assert deployed is False
    assert "skip: no unpublished delta" in out


def test_cursor_ahead_of_db_still_skips(sandbox: Path) -> None:
    # Defensive: a cursor somehow past db_max is delta<0 → still a skip.
    code, _out, synced, deployed = _run(sandbox, db_max=5, cursor=9)
    assert code == 0
    assert synced is False and deployed is False


# ── delta present → sync → deploy ─────────────────────────────────────


def test_delta_runs_sync_then_deploy(sandbox: Path) -> None:
    code, out, synced, deployed = _run(sandbox, db_max=20, cursor=10)
    assert code == 0
    assert synced is True
    assert deployed is True
    assert "delta detected" in out
    assert "publish complete" in out


def test_missing_cursor_file_is_treated_as_zero(sandbox: Path) -> None:
    # No .sync_cursor → read_cursor() returns 0 → full DB is "delta".
    code, _out, synced, deployed = _run(sandbox, db_max=3, cursor=None)
    assert code == 0
    assert synced is True and deployed is True


# ── failure gates ─────────────────────────────────────────────────────


def test_sync_failure_aborts_before_deploy(sandbox: Path) -> None:
    code, out, synced, deployed = _run(sandbox, db_max=20, cursor=10, sync_fails=True)
    assert code == 1
    assert synced is True       # it was attempted
    assert deployed is False    # but deploy must NOT run
    assert "sync.py failed" in out


def test_sync_that_does_not_advance_cursor_is_caught(sandbox: Path) -> None:
    # The subtle guard: sync.py exits 0 but .sync_cursor never moved
    # past db_max_before. The wrapper must catch this and abort before
    # deploy rather than publish a half-synced state.
    code, out, synced, deployed = _run(
        sandbox, db_max=20, cursor=10, sync_skips_cursor=True,
    )
    assert code == 1
    assert synced is True
    assert deployed is False
    assert "did not advance cursor" in out


def test_deploy_failure_surfaces_exit_1(sandbox: Path) -> None:
    code, out, synced, deployed = _run(sandbox, db_max=20, cursor=10, deploy_fails=True)
    assert code == 1
    assert synced is True
    assert deployed is True   # invoked, but it failed
    assert "deploy failed" in out


def test_missing_db_aborts_with_error(sandbox: Path) -> None:
    # read_state can't open the DB → the wrapper must exit 1, not press
    # on with a bogus delta.
    code, out, synced, deployed = _run(sandbox, db_max=0, cursor=0, make_db=False)
    assert code == 1
    assert synced is False and deployed is False


# ── stderr hygiene: launchd's StandardErrorPath is errors-only ────────
#
# ts_log used to tee every line to stderr, so launchd's
# logs/publish.err.log filled with a routine "skip: no unpublished
# delta" line every tick (90 KB and growing in the live deployment) —
# burying real errors. Routine progress now goes to stdout / the log
# file; only ts_err lines reach stderr.


def test_routine_skip_message_does_not_pollute_stderr(sandbox: Path) -> None:
    _make_db(sandbox / "threads_watcher.db", 10)
    (sandbox / ".sync_cursor").write_text("10", encoding="utf-8")
    proc = subprocess.run(
        ["bash", "publish-if-delta.sh"],
        cwd=str(sandbox), capture_output=True, text=True, timeout=30,
    )
    assert proc.returncode == 0
    # The skip is still logged — to stdout and the log file — just not stderr.
    assert "skip: no unpublished delta" in proc.stdout
    assert "skip: no unpublished delta" not in proc.stderr
    log = (sandbox / "logs" / "publish.log").read_text(encoding="utf-8")
    assert "skip: no unpublished delta" in log


def test_real_error_still_reaches_stderr(sandbox: Path) -> None:
    # sync.py failing is a real error — it MUST stay on stderr so
    # launchd's error log and any monitor catch it.
    _make_db(sandbox / "threads_watcher.db", 20)
    (sandbox / ".sync_cursor").write_text("10", encoding="utf-8")
    (sandbox / ".sync-should-fail").write_text("", encoding="utf-8")
    proc = subprocess.run(
        ["bash", "publish-if-delta.sh"],
        cwd=str(sandbox), capture_output=True, text=True, timeout=30,
    )
    assert proc.returncode == 1
    assert "ERROR: sync.py failed" in proc.stderr
