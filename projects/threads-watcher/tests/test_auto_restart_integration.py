"""Integration tests for auto-restart-if-stale.sh.

restart_decision.py is unit-tested; this drives the WHOLE wrapper
script in a sandbox so its orchestration is pinned: the dead-process
gate, the cooldown gate, the health-check -> classifier -> restart
path, and the exit codes.

The sandbox replaces every external dependency with a stub:
  - pgrep            -> a fake on PATH; presence of `.pgrep-found`
                        decides "process alive" vs "dead"
  - watcher.py       -> the stub `venv/bin/python` prints a controlled
                        --health-check output instead of running it
  - restart-watcher.sh -> records its invocation (`.restart-called`)
                          instead of actually restarting; exit code
                          controllable via STUB_RESTART_EXIT
  - restart_decision.py / log_rotation.py -> the REAL files, copied in,
                        so the classification path is exercised for real
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent

HEALTH_HEALTHY = (
    "handle=<process> healthy=True\n"
    "reason=watcher running fresh code (started 2026-05-22T11:00:00Z)\n"
    "handle=@h healthy=True\nreason=heartbeat fresh: newest check is 60s old (< 300s)\n"
)
HEALTH_HUNG_LOOP = (
    "handle=@h healthy=False\n"
    "reason=heartbeat stale: newest check is 3938s old (>= 300s threshold) "
    "— watcher loop likely hung or dead\n"
)
HEALTH_STALE_CODE = (
    "handle=<process> healthy=False\n"
    "reason=watcher started at 2026-05-22T09:00:00Z but 2 source file(s) "
    "have been edited since — Python won't reload imports.\n"
)
HEALTH_DOM_REGRESSION = (
    "handle=@h healthy=False\n"
    "reason=all of last 3 checks reported found_count=0 after previously finding posts\n"
)


def _write_exec(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _make_sandbox(tmp_path: Path) -> Path:
    """Build a self-contained copy of the threads-watcher dir with every
    external dependency stubbed."""
    sb = tmp_path / "sandbox"
    sb.mkdir()
    (sb / "logs").mkdir()
    (sb / "venv" / "bin").mkdir(parents=True)
    (sb / "stub-bin").mkdir()

    # Real files under test / real helpers it calls.
    shutil.copy(PROJECT_ROOT / "auto-restart-if-stale.sh", sb / "auto-restart-if-stale.sh")
    shutil.copy(PROJECT_ROOT / "restart_decision.py", sb / "restart_decision.py")
    shutil.copy(PROJECT_ROOT / "log_rotation.py", sb / "log_rotation.py")
    (sb / "auto-restart-if-stale.sh").chmod(0o755)

    # Stub restart-watcher.sh — records the call, never really restarts.
    _write_exec(sb / "restart-watcher.sh", (
        "#!/bin/sh\n"
        'echo "STUB restart-watcher invoked"\n'
        'touch .restart-called\n'
        'exit "${STUB_RESTART_EXIT:-0}"\n'
    ))

    # Stub venv: activate just prepends venv/bin; the stub `python`
    # serves a controlled --health-check and delegates everything else
    # (restart_decision.py, log_rotation.py) to the real python3.
    (sb / "venv" / "bin" / "activate").write_text(
        'export PATH="$PWD/venv/bin:$PATH"\n', encoding="utf-8"
    )
    _write_exec(sb / "venv" / "bin" / "python", (
        "#!/bin/sh\n"
        'if [ "$1" = "watcher.py" ]; then\n'
        "  cat .health-output 2>/dev/null\n"
        '  exit "$(cat .health-exit 2>/dev/null || echo 0)"\n'
        "fi\n"
        'exec python3 "$@"\n'
    ))

    # Fake pgrep — exit 0 (found) iff `.pgrep-found` exists in cwd.
    _write_exec(sb / "stub-bin" / "pgrep", (
        "#!/bin/sh\n"
        "[ -f .pgrep-found ] && exit 0\n"
        "exit 1\n"
    ))
    return sb


def _run(
    sb: Path,
    *,
    process_alive: bool,
    health_output: str = "",
    health_exit: int = 0,
    cooldown_marker: bool = False,
    restart_exit: int = 0,
) -> tuple[int, str, bool]:
    """Run the wrapper in the sandbox. Returns (exit_code, combined
    output, restart_was_invoked)."""
    if process_alive:
        (sb / ".pgrep-found").write_text("", encoding="utf-8")
    else:
        (sb / ".pgrep-found").unlink(missing_ok=True)
    (sb / ".health-output").write_text(health_output, encoding="utf-8")
    (sb / ".health-exit").write_text(str(health_exit), encoding="utf-8")
    (sb / ".restart-called").unlink(missing_ok=True)
    if cooldown_marker:
        (sb / ".last-auto-restart").write_text("", encoding="utf-8")
    else:
        (sb / ".last-auto-restart").unlink(missing_ok=True)

    env = dict(os.environ)
    env["PATH"] = f"{sb / 'stub-bin'}:{env['PATH']}"
    env["STUB_RESTART_EXIT"] = str(restart_exit)

    proc = subprocess.run(
        ["bash", "auto-restart-if-stale.sh"],
        cwd=str(sb),
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return proc.returncode, proc.stdout + proc.stderr, (sb / ".restart-called").exists()


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    return _make_sandbox(tmp_path)


# ── dead-process gate ─────────────────────────────────────────────────


def test_dead_process_triggers_restart(sandbox: Path) -> None:
    code, out, restarted = _run(sandbox, process_alive=False)
    assert restarted is True
    assert code == 0
    assert "no live watcher process" in out


def test_dead_process_blocked_by_cooldown(sandbox: Path) -> None:
    # A fresh .last-auto-restart marker → within the 300s cooldown.
    code, out, restarted = _run(sandbox, process_alive=False, cooldown_marker=True)
    assert restarted is False
    assert code == 1
    assert "cooldown active" in out


# ── alive process: health-check → classifier → restart ────────────────


def test_alive_and_healthy_does_not_restart(sandbox: Path) -> None:
    code, out, restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0,
    )
    assert restarted is False
    assert code == 0
    assert "healthy — no action" in out


def test_alive_with_hung_loop_triggers_restart(sandbox: Path) -> None:
    # The headline case: process alive (pgrep gate passes) but the loop
    # is hung. Pre-fix this slipped through both gates. Now the
    # classifier catches "heartbeat stale:" and the restart fires.
    code, out, restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HUNG_LOOP, health_exit=1,
    )
    assert restarted is True
    assert code == 0
    assert "hung-loop" in out


def test_alive_with_stale_code_triggers_restart(sandbox: Path) -> None:
    code, out, restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_STALE_CODE, health_exit=1,
    )
    assert restarted is True
    assert code == 0
    assert "stale-code" in out


def test_alive_with_dom_regression_does_not_restart(sandbox: Path) -> None:
    # DOM regression is an operator issue — a restart would just mask it.
    code, out, restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_DOM_REGRESSION, health_exit=1,
    )
    assert restarted is False
    assert code == 0
    assert "leaving for operator" in out


def test_alive_hung_loop_blocked_by_cooldown(sandbox: Path) -> None:
    code, out, restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HUNG_LOOP, health_exit=1,
        cooldown_marker=True,
    )
    assert restarted is False
    assert code == 1
    assert "cooldown active" in out


def test_restart_failure_surfaces_exit_2(sandbox: Path) -> None:
    # restart-watcher.sh itself fails → the wrapper must exit 2 so a
    # cron wrapper can tell "restart broke" from "restart blocked".
    code, out, restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HUNG_LOOP, health_exit=1,
        restart_exit=1,
    )
    assert restarted is True  # it was invoked
    assert code == 2
    assert "restart-watcher.sh failed" in out
