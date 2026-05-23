"""Integration tests for restart-watcher.sh — the script that actually
stops and relaunches the `watcher.py --watch` loop.

auto-restart-if-stale.sh decides WHEN to restart; restart-watcher.sh
does the restart. Its body had no coverage: the mkdir-based mutex
(double-launch guard), the SIGTERM→wait→SIGKILL escalation, the
post-stop zombie check, and the 3-second post-launch liveness check.

Sandbox stubs the process layer:
  - pgrep        -> a fake on PATH whose output is scripted per test
                    (`.pgrep-mode` = empty | once | always)
  - run-watcher.sh -> records its invocation; stays alive (exec sleep)
                      or dies fast, per `.run-watcher-diefast`
  - log_rotation.py -> the real file, copied in
`kill` stays the shell builtin; the fake PID 999999 it signals does
not exist, so the real SIGTERM/SIGKILL calls are harmless no-ops.
"""

from __future__ import annotations

import os
import shutil
import signal
import stat
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _write_exec(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _make_sandbox(tmp_path: Path) -> Path:
    sb = tmp_path / "sandbox"
    sb.mkdir()
    (sb / "logs").mkdir()
    (sb / "stub-bin").mkdir()

    shutil.copy(PROJECT_ROOT / "restart-watcher.sh", sb / "restart-watcher.sh")
    shutil.copy(PROJECT_ROOT / "log_rotation.py", sb / "log_rotation.py")
    (sb / "restart-watcher.sh").chmod(0o755)

    # Stub run-watcher.sh: records the launch, then either stays alive
    # past the script's 3s liveness check (exec sleep) or dies fast.
    _write_exec(sb / "run-watcher.sh", (
        "#!/bin/sh\n"
        "touch .run-watcher-called\n"
        'if [ -f .run-watcher-diefast ]; then exit 1; fi\n'
        "echo $$ > .run-watcher.pid\n"
        "exec sleep 30\n"
    ))

    # Fake pgrep — output scripted by `.pgrep-mode`:
    #   empty  -> never finds a process
    #   once   -> finds PID 999999 on the first call, nothing after
    #             (simulates "SIGTERM worked")
    #   always -> always finds 999999 (simulates a process that won't die)
    _write_exec(sb / "stub-bin" / "pgrep", (
        "#!/bin/sh\n"
        'mode=$(cat .pgrep-mode 2>/dev/null || echo empty)\n'
        'case "$mode" in\n'
        "  always) echo 999999 ;;\n"
        "  once)\n"
        '    n=$(cat .pgrep-count 2>/dev/null || echo 0)\n'
        '    echo $((n + 1)) > .pgrep-count\n'
        '    [ "$n" = 0 ] && echo 999999\n'
        "    ;;\n"
        "esac\n"
        "exit 0\n"
    ))
    return sb


def _run(sb: Path, *, pgrep_mode: str = "empty", diefast: bool = False,
         lock_held: bool = False) -> tuple[int, str, bool]:
    """Run restart-watcher.sh. Returns (exit_code, output, run_watcher_launched)."""
    (sb / ".pgrep-mode").write_text(pgrep_mode, encoding="utf-8")
    (sb / ".pgrep-count").unlink(missing_ok=True)
    (sb / ".run-watcher-called").unlink(missing_ok=True)
    (sb / ".run-watcher.pid").unlink(missing_ok=True)
    diefast_flag = sb / ".run-watcher-diefast"
    diefast_flag.unlink(missing_ok=True)
    if diefast:
        diefast_flag.write_text("", encoding="utf-8")

    lockdir = sb / ".restart-watcher.lock.d"
    if lock_held:
        lockdir.mkdir(exist_ok=True)
    elif lockdir.exists():
        lockdir.rmdir()

    env = dict(os.environ)
    env["PATH"] = f"{sb / 'stub-bin'}:{env['PATH']}"
    # 🔒 Test-injection of the production env-tunable sleep durations
    # (restart-watcher.sh defaults: KILL_WAIT=1s × 10 iters + 1s
    # SIGKILL + LIVENESS=3s = 14s worst-case wall time). Tests don't
    # need real kernel signal grace — they use fake pgrep/run-watcher
    # stubs, so much shorter waits are fine. KILL_WAIT=0.3 (not 0.1)
    # leaves enough time for the `once` pgrep stub's non-atomic
    # counter-file IO to settle between iterations (the stub uses
    # cat + arithmetic + redirect — sub-100ms race window observed
    # under pre-commit pre-flight CPU load).
    env["THREADS_WATCHER_RESTART_KILL_WAIT_SEC"] = "0.3"
    env["THREADS_WATCHER_RESTART_LIVENESS_WAIT_SEC"] = "0.3"

    proc = subprocess.run(
        ["bash", "restart-watcher.sh"],
        cwd=str(sb), env=env, capture_output=True, text=True, timeout=40,
    )
    return proc.returncode, proc.stdout + proc.stderr, (sb / ".run-watcher-called").exists()


@pytest.fixture
def sandbox(tmp_path: Path):
    sb = _make_sandbox(tmp_path)
    yield sb
    # Reap the stub watcher (exec sleep 30) so it doesn't linger.
    pidfile = sb / ".run-watcher.pid"
    if pidfile.exists():
        try:
            os.kill(int(pidfile.read_text().strip()), signal.SIGKILL)
        except (ProcessLookupError, ValueError):
            pass


# ── mutex ─────────────────────────────────────────────────────────────


def test_lock_held_skips_without_launching(sandbox: Path) -> None:
    # A concurrent restart-watcher.sh holds the lock dir → this run must
    # bail out cleanly (exit 0) and NOT launch a second watcher.
    code, out, launched = _run(sandbox, lock_held=True)
    assert code == 0
    assert launched is False
    assert "another restart-watcher.sh is in progress" in out


# ── launch paths ──────────────────────────────────────────────────────


def test_no_existing_process_launches_fresh(sandbox: Path) -> None:
    code, out, launched = _run(sandbox, pgrep_mode="empty")
    assert code == 0
    assert launched is True
    assert "no existing watcher process" in out
    assert "watcher is alive" in out


def test_existing_process_is_stopped_then_relaunched(sandbox: Path) -> None:
    # pgrep finds PID 999999 once, then nothing → the SIGTERM path runs,
    # the wait loop sees it gone, and a fresh watcher launches.
    code, out, launched = _run(sandbox, pgrep_mode="once")
    assert code == 0
    assert launched is True
    assert "stopping existing watcher" in out
    assert "watcher is alive" in out


# ── failure paths ─────────────────────────────────────────────────────


def test_watcher_dying_within_3s_surfaces_exit_1(sandbox: Path) -> None:
    # run-watcher.sh exits immediately → the post-launch liveness check
    # must catch it and exit 1.
    code, out, launched = _run(sandbox, pgrep_mode="empty", diefast=True)
    assert code == 1
    assert launched is True
    # Liveness-wait message includes the configured wait (the test
    # sandbox sets it to 0.1s). Match the stable prefix only.
    assert "exited within" in out and "of launch" in out


def test_unkillable_process_aborts_before_launch(sandbox: Path) -> None:
    # pgrep always reports the process alive → SIGTERM+SIGKILL "fail" →
    # the zombie sanity check aborts with exit 1 and never launches a
    # fresh watcher on top of the (apparently) live one.
    code, out, launched = _run(sandbox, pgrep_mode="always")
    assert code == 1
    assert launched is False
    assert "could not stop existing watcher" in out
