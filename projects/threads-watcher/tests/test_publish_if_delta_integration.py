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
    # .sync_cursor to MAX(id) — exactly what the real sync.py does.
    # `.sync-skip-cursor` simulates a guard SKIP: sync.py exits 0
    # WITHOUT advancing the cursor and logs `guard: SKIP | <reason>`
    # (mirrored to stderr by --tee-stderr); the reason defaults but is
    # overridable via `.sync-skip-reason`. `.sync-should-fail` -> exit 1.
    _write_exec(sb / "venv" / "bin" / "python", (
        "#!/bin/sh\n"
        'if [ "$1" = "sync.py" ]; then\n'
        "  touch .sync-called\n"
        '  [ -f .sync-should-fail ] && exit 1\n'
        '  if [ -f .sync-skip-cursor ]; then\n'
        '    reason="leaked forbidden key at posts[0].local_path"\n'
        '    [ -f .sync-skip-reason ] && reason=$(cat .sync-skip-reason)\n'
        '    echo "2026-05-23T00:00:00Z   guard: SKIP | $reason" >&2\n'
        "  else\n"
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
    sync_skip_reason: str | None = None,
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

    skip_reason_p = sb / ".sync-skip-reason"
    skip_reason_p.unlink(missing_ok=True)
    if sync_skip_reason is not None:
        skip_reason_p.write_text(sync_skip_reason, encoding="utf-8")

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
    # sync.py exits 0 but .sync_cursor never moved past db_max_before —
    # a guard blocked the sync. The wrapper must catch this and abort
    # before deploy rather than publish a half-synced state.
    code, out, synced, deployed = _run(
        sandbox, db_max=20, cursor=10, sync_skips_cursor=True,
    )
    assert code == 1
    assert synced is True
    assert deployed is False
    assert "guard blocked the sync" in out
    # The legacy message blamed the cursor logic — a misdiagnosis that
    # sent operators to the wrong place. It must be gone.
    assert "did not advance cursor" not in out


def test_guard_skip_reason_is_surfaced_in_the_error(sandbox: Path) -> None:
    # When a guard blocks the sync, publish-if-delta must report the
    # guard's OWN reason (from sync.py's `guard: SKIP | ...` log line),
    # so an operator sees the real cause — e.g. a leaked private field
    # in state.json — instead of being misdirected to the cursor logic.
    reason = "leaked forbidden key at last_check.error.local_path: 'local_path'"
    code, out, synced, deployed = _run(
        sandbox, db_max=20, cursor=10,
        sync_skips_cursor=True, sync_skip_reason=reason,
    )
    assert code == 1
    assert synced is True
    assert deployed is False
    assert reason in out
    assert "did not advance cursor" not in out


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


# ── skip-line dedup (heartbeat) ────────────────────────────────────────
#
# Production observation 2026-05-23: logs/publish.log was 98% identical
# "skip: no unpublished delta" lines — 5-min cadence × multi-day quiet
# period = ~288 lines/day of noise. The dedup logic suppresses repeat
# skip lines so the FIRST tick after a state change OR a heartbeat
# interval emits the line, every other tick stays silent.


def test_first_no_delta_run_emits_the_skip_line(sandbox: Path) -> None:
    # Fresh sandbox — no last-state file exists, so cur_state != ""
    # (which is the persisted last_state). The line emits and the
    # state file is created for subsequent ticks.
    code, out, synced, _deployed = _run(sandbox, db_max=10, cursor=10)
    assert code == 0
    assert synced is False
    assert "skip: no unpublished delta (db_max=10 cursor=10)" in out
    # The state file should now exist with `cur_state|now_ts`
    state_file = sandbox / "logs" / ".publish-if-delta-last-skip"
    assert state_file.exists()
    persisted = state_file.read_text(encoding="utf-8").strip()
    assert persisted.startswith("10:10|")  # db_max:cursor|epoch


def test_second_identical_run_suppresses_the_skip_line(sandbox: Path) -> None:
    # First tick logs + writes state file.
    _run(sandbox, db_max=10, cursor=10)
    # Second tick with identical state must NOT re-log.
    code, out, _synced, _deployed = _run(sandbox, db_max=10, cursor=10)
    assert code == 0
    # No skip line in this run's output. (The log file has the prior
    # tick's line but stdout/stderr captured here is just this run.)
    assert "skip: no unpublished delta" not in out


def test_state_change_re_emits_the_skip_line(sandbox: Path) -> None:
    # First tick: db_max=10 cursor=10 → log "10:10"
    _run(sandbox, db_max=10, cursor=10)
    # State changed (new posts arrived but cursor didn't move — still
    # no delta because cursor == db_max BEFORE? wait, db_max=15 + cursor=15
    # would be delta=0; let's use that. The point is the persisted
    # signature differs: "15:15" != "10:10" → re-log.
    code, out, _synced, _deployed = _run(sandbox, db_max=15, cursor=15)
    assert code == 0
    assert "skip: no unpublished delta (db_max=15 cursor=15)" in out


def test_heartbeat_re_emits_after_interval_elapsed(sandbox: Path) -> None:
    # First tick stamps the state file with the current timestamp.
    _run(sandbox, db_max=10, cursor=10)
    state_file = sandbox / "logs" / ".publish-if-delta-last-skip"
    # Forge the state file's stored timestamp to "long ago" so the
    # elapsed branch fires regardless of test wall-clock.
    state_file.write_text("10:10|1700000000\n", encoding="utf-8")
    # PUBLISH_SKIP_HEARTBEAT_SEC defaults to 3600s; even at the default
    # the forged 2023-era timestamp is well past it. Run again with the
    # same state and confirm the line re-emits.
    code, out, _synced, _deployed = _run(sandbox, db_max=10, cursor=10)
    assert code == 0
    assert "skip: no unpublished delta (db_max=10 cursor=10)" in out
    # And the state file's timestamp should be fresh again.
    after = state_file.read_text(encoding="utf-8").strip()
    new_ts = int(after.split("|")[1])
    assert new_ts > 1700000000


def test_three_consecutive_identical_ticks_yield_only_one_log_line(sandbox: Path) -> None:
    # Tail of logs/publish.log after 3 quiet ticks should contain
    # exactly one "skip: no unpublished delta" line, not three.
    _run(sandbox, db_max=10, cursor=10)
    _run(sandbox, db_max=10, cursor=10)
    _run(sandbox, db_max=10, cursor=10)
    log_text = (sandbox / "logs" / "publish.log").read_text(encoding="utf-8")
    skip_lines = [l for l in log_text.splitlines() if "skip: no unpublished delta" in l]
    assert len(skip_lines) == 1, (
        f"Expected exactly one skip line in publish.log after 3 quiet "
        f"ticks; got {len(skip_lines)}:\n" + "\n".join(skip_lines)
    )


def test_short_heartbeat_env_re_emits_more_often(sandbox: Path) -> None:
    # Override the heartbeat interval to 1 second via env. A second tick
    # >= 1 second later should re-emit. We forge the timestamp to make
    # the test deterministic without sleeping.
    _run(sandbox, db_max=10, cursor=10)
    state_file = sandbox / "logs" / ".publish-if-delta-last-skip"
    # Set stored ts to "now-5s" so the 1s heartbeat fires.
    import time
    state_file.write_text(f"10:10|{int(time.time()) - 5}\n", encoding="utf-8")

    env = os.environ.copy()
    env["PUBLISH_SKIP_HEARTBEAT_SEC"] = "1"
    proc = subprocess.run(
        ["bash", "publish-if-delta.sh"],
        cwd=str(sandbox), capture_output=True, text=True, timeout=30, env=env,
    )
    assert proc.returncode == 0
    assert "skip: no unpublished delta" in proc.stdout + proc.stderr


def test_delta_path_unchanged_by_dedup_state_file(sandbox: Path) -> None:
    # The dedup only touches the no-delta exit path. A real delta tick
    # must run sync + deploy normally regardless of the state file
    # contents. Pin so the dedup can't accidentally leak into the
    # sync path.
    state_file = sandbox / "logs" / ".publish-if-delta-last-skip"
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text("99:99|0\n", encoding="utf-8")  # garbage prior state
    code, _out, synced, deployed = _run(sandbox, db_max=20, cursor=10)
    assert code == 0
    assert synced is True
    assert deployed is True
