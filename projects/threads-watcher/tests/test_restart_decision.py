"""Tests for restart_decision.py — the restart-trigger classifier that
auto-restart-if-stale.sh consults.

The bug this closes: the wrapper used to grep only for the stale-CODE
phrase, so a HUNG LOOP (heartbeat stale, PID still alive) passed the
pgrep gate, failed the grep, and was never auto-restarted. These tests
pin that both reload-fixable modes trigger a restart and that the
operator-only modes (DOM regression, recent errors) do not.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from restart_decision import is_restart_triggering, restart_reason, main  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ── realistic --health-check output fragments ─────────────────────────
# These mirror what `python watcher.py --health-check` actually prints
# (HealthReport.to_text → "reason=..." lines).

STALE_CODE = (
    "handle=<process> healthy=False\n"
    "reason=watcher started at 2026-05-22T09:00:00Z but 2 source "
    "file(s) have been edited since — Python won't reload imports. "
    "Run ./restart-watcher.sh to pick up the new code.\n"
)

HUNG_LOOP = (
    "handle=@hal.lifedesign healthy=False\n"
    "reason=heartbeat stale: newest check is 3938s old (>= 300s "
    "threshold) — watcher loop likely hung or dead\n"
)

DOM_REGRESSION = (
    "handle=@hal.lifedesign healthy=False\n"
    "reason=all of last 3 checks reported found_count=0 after "
    "previously finding posts\n"
)

RECENT_ERRORS = (
    "handle=@hal.lifedesign healthy=False\n"
    "reason=all of last 3 checks had non-ok status\n"
)

HEALTHY = (
    "handle=<process> healthy=True\n"
    "reason=watcher running fresh code (started 2026-05-22T11:00:00Z)\n"
    "handle=@hal.lifedesign healthy=True\n"
    "reason=heartbeat fresh: newest check is 60s old (< 300s)\n"
)


# ── is_restart_triggering ─────────────────────────────────────────────


def test_stale_code_triggers_restart():
    assert is_restart_triggering(STALE_CODE) is True


def test_hung_loop_triggers_restart():
    # The headline regression guard: a stale heartbeat MUST trigger a
    # restart. The pre-fix grep missed this case entirely.
    assert is_restart_triggering(HUNG_LOOP) is True


def test_dom_regression_does_not_trigger_restart():
    # A reload won't fix broken selectors — leave it for an operator.
    assert is_restart_triggering(DOM_REGRESSION) is False


def test_recent_errors_does_not_trigger_restart():
    assert is_restart_triggering(RECENT_ERRORS) is False


def test_healthy_does_not_trigger_restart():
    assert is_restart_triggering(HEALTHY) is False


def test_empty_output_does_not_trigger_restart():
    assert is_restart_triggering("") is False


def test_combined_stale_and_regression_still_triggers():
    # A full --health-check run prints every report; if ANY block is a
    # reload-fixable signal the restart should fire.
    assert is_restart_triggering(HUNG_LOOP + DOM_REGRESSION) is True


# ── restart_reason ────────────────────────────────────────────────────


def test_restart_reason_names_stale_code():
    assert restart_reason(STALE_CODE) == "stale-code"


def test_restart_reason_names_hung_loop():
    assert restart_reason(HUNG_LOOP) == "hung-loop"


def test_restart_reason_none_when_not_triggering():
    assert restart_reason(DOM_REGRESSION) is None
    assert restart_reason(HEALTHY) is None


def test_restart_reason_prefers_stale_code_when_both_present():
    # A process behind on code is the more fundamental fault to name.
    assert restart_reason(STALE_CODE + HUNG_LOOP) == "stale-code"


# ── CLI (stdin → exit code), the contract auto-restart-if-stale.sh uses ─


def _run_cli(stdin_text: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "restart_decision.py"],
        cwd=str(PROJECT_ROOT),
        input=stdin_text,
        capture_output=True,
        text=True,
    )


def test_cli_exit_zero_and_prints_reason_for_hung_loop():
    r = _run_cli(HUNG_LOOP)
    assert r.returncode == 0
    assert r.stdout.strip() == "hung-loop"


def test_cli_exit_zero_for_stale_code():
    r = _run_cli(STALE_CODE)
    assert r.returncode == 0
    assert r.stdout.strip() == "stale-code"


def test_cli_exit_one_for_dom_regression():
    r = _run_cli(DOM_REGRESSION)
    assert r.returncode == 1
    assert r.stdout.strip() == ""


def test_cli_exit_one_for_healthy():
    assert _run_cli(HEALTHY).returncode == 1


def test_main_function_direct(monkeypatch, capsys):
    import io
    monkeypatch.setattr("sys.stdin", io.StringIO(HUNG_LOOP))
    assert main() == 0
    assert capsys.readouterr().out.strip() == "hung-loop"
