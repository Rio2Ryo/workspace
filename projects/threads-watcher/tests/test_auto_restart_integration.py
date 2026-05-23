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


# ── healthy-state log dedup ────────────────────────────────────────────
#
# Observation 2026-05-23 against the live logs/auto-restart.out.log:
# 646 identical "watcher is healthy — no action" lines + 646 identical
# "health-check exit=0" lines over 5 days. The operational signal is
# in TRANSITIONS (healthy↔unhealthy, restart events) which stay
# verbose; the pure no-change ticks are silenced per heartbeat
# interval.


def test_first_healthy_tick_emits_full_lines(sandbox: Path) -> None:
    # Fresh sandbox — no state file → cur_state ('healthy') != last ('').
    # Both lines emit, state file is created.
    code, out, _restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0,
    )
    assert code == 0
    assert "health-check exit=0" in out
    assert "watcher is healthy — no action" in out
    state_file = sandbox / "logs" / ".auto-restart-last-state"
    assert state_file.exists()
    persisted = state_file.read_text(encoding="utf-8").strip()
    assert persisted.startswith("healthy|")


def test_second_healthy_tick_suppresses_both_lines(sandbox: Path) -> None:
    # First tick logs + persists. Second tick with identical state must
    # NOT re-log either of the dedup'd lines.
    _run(sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0)
    code, out, _restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0,
    )
    assert code == 0
    assert "health-check exit=" not in out
    assert "watcher is healthy" not in out


def test_healthy_to_unhealthy_transition_re_emits(sandbox: Path) -> None:
    # First tick healthy → state file says 'healthy'. Second tick is
    # DOM-regression unhealthy (non-fixable). The transition is the
    # operationally interesting event — must log unconditionally, AND
    # update the state file.
    _run(sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0)
    code, out, _restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_DOM_REGRESSION, health_exit=1,
    )
    assert code == 0
    assert "health-check exit=1" in out  # transition logs the exit code
    assert "leaving for operator" in out
    state_file = sandbox / "logs" / ".auto-restart-last-state"
    persisted = state_file.read_text(encoding="utf-8").strip()
    assert persisted.startswith("unhealthy_not_fixable|")


def test_unhealthy_to_healthy_transition_re_emits(sandbox: Path) -> None:
    # Inverse: state file says 'unhealthy', current tick is healthy →
    # log unconditionally so operator sees the recovery.
    _run(
        sandbox, process_alive=True, health_output=HEALTH_DOM_REGRESSION, health_exit=1,
    )
    code, out, _restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0,
    )
    assert code == 0
    assert "health-check exit=0" in out
    assert "watcher is healthy — no action" in out


def test_heartbeat_re_emits_after_interval_elapsed(sandbox: Path) -> None:
    # First tick stamps the state with "now". Forge the stored
    # timestamp to "long ago" so the heartbeat branch fires.
    _run(sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0)
    state_file = sandbox / "logs" / ".auto-restart-last-state"
    state_file.write_text("healthy|1700000000\n", encoding="utf-8")
    # Default AUTO_RESTART_HEARTBEAT_SEC=3600; forged 2023 timestamp is
    # well past it → both lines re-emit.
    code, out, _restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0,
    )
    assert code == 0
    assert "health-check exit=0" in out
    assert "watcher is healthy — no action" in out


def test_three_consecutive_healthy_ticks_yield_only_one_log_pair(sandbox: Path) -> None:
    # 🔒 The core operational win — without this guard, an off-by-one
    # comparison would silently let dupes through.
    captured_outs = []
    for _ in range(3):
        _code, out, _restarted = _run(
            sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0,
        )
        captured_outs.append(out)
    # Count "watcher is healthy" mentions across all 3 ticks' outputs.
    healthy_count = sum(o.count("watcher is healthy") for o in captured_outs)
    assert healthy_count == 1, (
        f"Expected exactly one 'watcher is healthy' across 3 ticks; "
        f"got {healthy_count}.\nOutputs:\n" + "\n---\n".join(captured_outs)
    )


def test_short_heartbeat_env_re_emits_more_often(sandbox: Path) -> None:
    # AUTO_RESTART_HEARTBEAT_SEC=1 → second tick >= 1s later re-emits.
    # Forge the timestamp to make the test deterministic without
    # sleeping.
    _run(sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0)
    state_file = sandbox / "logs" / ".auto-restart-last-state"
    import time
    state_file.write_text(f"healthy|{int(time.time()) - 5}\n", encoding="utf-8")

    env = dict(os.environ)
    env["PATH"] = f"{sandbox / 'stub-bin'}:{env['PATH']}"
    env["AUTO_RESTART_HEARTBEAT_SEC"] = "1"
    (sandbox / ".pgrep-found").write_text("", encoding="utf-8")
    (sandbox / ".health-output").write_text(HEALTH_HEALTHY, encoding="utf-8")
    (sandbox / ".health-exit").write_text("0", encoding="utf-8")
    (sandbox / ".last-auto-restart").unlink(missing_ok=True)

    proc = subprocess.run(
        ["bash", "auto-restart-if-stale.sh"],
        cwd=str(sandbox), env=env, capture_output=True, text=True, timeout=30,
    )
    assert proc.returncode == 0
    out = proc.stdout + proc.stderr
    assert "watcher is healthy" in out
    assert "health-check exit=0" in out


def test_restart_event_always_logs_regardless_of_dedup(sandbox: Path) -> None:
    # 🔒 A restart event must NEVER be suppressed by the dedup gate.
    # First tick: healthy → state='healthy'. Second tick: hung loop →
    # restart triggered. The restart logging is unconditional.
    _run(sandbox, process_alive=True, health_output=HEALTH_HEALTHY, health_exit=0)
    code, out, restarted = _run(
        sandbox, process_alive=True, health_output=HEALTH_HUNG_LOOP, health_exit=1,
    )
    assert code == 0
    assert restarted is True
    assert "health-check exit=1" in out
    assert "restart-triggering signal detected" in out
    assert "hung-loop" in out
