"""End-to-end test for run-watcher.sh's THREADS_WATCHER_BASELINE_LOOKBACK_DAYS
env-var passthrough.

Why this exists
---------------
Observed on 2026-05-23: the @hal.lifedesign + @bmw_intokyo handles
have been recording 93% `partial_error` for many days because the
watcher's all-time MAX(found_count)=15 baseline no longer matches the
current steady state (found=4). Every partial_error row poisons the
sync guard (`grep -i error` in sync_guards.py:79) and silently blocks
every snapshot publish.

health.py:110-141 already documents the fix: `previous_max_found`
accepts a `lookback_days` arg, and watcher.py wires the
`--baseline-lookback-days` CLI flag end-to-end (tested in
test_cli_args.py). But the launchd-managed `run-watcher.sh` had no
way to set it — operators had to edit the script, restart watcher,
risk syntax errors. This test pins the missing-but-now-added dial.

Two contracts:
  1. THREADS_WATCHER_BASELINE_LOOKBACK_DAYS unset → `--baseline-lookback-days 7`
     IS passed (7-day rolling window is now the default to prevent sticky
     all-time peaks from causing persistent partial_error false positives).
  2. THREADS_WATCHER_BASELINE_LOOKBACK_DAYS=<N> → exec line includes
     `--baseline-lookback-days <N>` so the watcher uses the specified window.
     Set to 0 to restore the all-time-max behaviour.

Implementation:
  Use a stub `python` shim on PATH that captures argv and exits.
  Run a derivative of run-watcher.sh that's been stripped of the
  `source venv/bin/activate` line (the test sandbox has no venv;
  the activate-source is orthogonal to the contract under test).
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
import tempfile
import textwrap

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUN_WATCHER = PROJECT_ROOT / "run-watcher.sh"


def _make_sandbox(tmpdir: Path) -> tuple[Path, Path]:
    """Lay down a stub python (captures argv to a file) and a copy of
    run-watcher.sh with `source venv/bin/activate` neutralised.

    Returns (sandbox_run_watcher_path, captured_argv_path).
    """
    captured = tmpdir / "argv.txt"

    # Stub python: write the full argv (one arg per line) to $CAPTURED_ARGV
    # and exit 0 immediately. Replaces `exec python -u watcher.py …`
    # in the sandboxed run-watcher.sh.
    stub_bin = tmpdir / "stub-bin"
    stub_bin.mkdir()
    stub_python = stub_bin / "python"
    stub_python.write_text(
        textwrap.dedent(
            f"""\
            #!/usr/bin/env bash
            : > "{captured}"
            for a in "$@"; do
              printf '%s\\n' "$a" >> "{captured}"
            done
            exit 0
            """
        )
    )
    stub_python.chmod(0o755)

    # Sandboxed run-watcher.sh: strip the `cd "$(dirname …)"` and
    # `source venv/bin/activate` lines so the script runs from anywhere
    # without depending on a real venv.
    src = RUN_WATCHER.read_text(encoding="utf-8")
    lines = []
    for line in src.splitlines():
        # Skip cd and venv source — keep everything else verbatim so
        # the test exercises the actual env-var → argv wiring.
        if line.strip().startswith('cd "$(dirname'):
            continue
        if "source venv/bin/activate" in line:
            continue
        lines.append(line)
    sandboxed = tmpdir / "run-watcher.sh"
    sandboxed.write_text("\n".join(lines) + "\n")
    sandboxed.chmod(0o755)
    return sandboxed, captured


def _run(env_extra: dict[str, str]) -> list[str]:
    """Execute the sandboxed run-watcher.sh with env_extra additions
    and return the captured argv list (one element per CLI argument
    passed to python)."""
    with tempfile.TemporaryDirectory() as td:
        tmpdir = Path(td)
        runner, argv_file = _make_sandbox(tmpdir)
        env = os.environ.copy()
        env["PATH"] = f"{tmpdir / 'stub-bin'}:{env['PATH']}"
        env.update(env_extra)
        # Critical: ensure the env-under-test isn't inherited from
        # outside (could leak from another test or the operator shell).
        if "THREADS_WATCHER_BASELINE_LOOKBACK_DAYS" not in env_extra:
            env.pop("THREADS_WATCHER_BASELINE_LOOKBACK_DAYS", None)
        proc = subprocess.run(
            ["bash", str(runner)],
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert proc.returncode == 0, (
            f"sandboxed run-watcher.sh exited {proc.returncode}: "
            f"stdout={proc.stdout!r} stderr={proc.stderr!r}"
        )
        return argv_file.read_text().splitlines()


def test_default_passes_7_day_baseline_lookback_arg():
    # No env var → --baseline-lookback-days 7 IS injected. The 7-day
    # rolling window is now the default to prevent all-time-peak
    # stickiness (e.g. @hal.lifedesign peaked at 16 on 2026-05-29,
    # then settled at 15, causing persistent partial_error until the
    # lookback window drops that peak out of scope). Override with
    # THREADS_WATCHER_BASELINE_LOOKBACK_DAYS=0 to restore all-time behaviour.
    argv = _run({})
    assert "--baseline-lookback-days" in argv, (
        "Unset env var must inject --baseline-lookback-days 7 (new default). "
        f"Got: {argv!r}"
    )
    idx = argv.index("--baseline-lookback-days")
    assert idx + 1 < len(argv), f"flag must have a value after it. Got: {argv!r}"
    assert argv[idx + 1] == "7", (
        f"default value must be '7'. Got: {argv[idx + 1]!r}"
    )
    # Sanity: the watcher still gets --watch + --interval.
    assert "--watch" in argv
    assert "--interval" in argv


def test_env_var_propagates_as_cli_flag():
    # Operator sets the env var → flag IS passed with the env-var value.
    # This is the dial the live launchd-managed watcher needed (the
    # @hal.lifedesign 93% partial_error rate would clear after 7 days
    # of consistent found=4 observations once this is enabled).
    argv = _run({"THREADS_WATCHER_BASELINE_LOOKBACK_DAYS": "7"})
    assert "--baseline-lookback-days" in argv, (
        f"Setting the env var must inject --baseline-lookback-days. "
        f"Got: {argv!r}"
    )
    # The value must be the env var verbatim, in the position
    # immediately after the flag (so argparse sees it as the flag's
    # argument, not a positional).
    idx = argv.index("--baseline-lookback-days")
    assert idx + 1 < len(argv), f"flag must have a value after it. Got: {argv!r}"
    assert argv[idx + 1] == "7", (
        f"env var value '7' must be the flag's argument verbatim. Got: {argv[idx + 1]!r}"
    )


def test_empty_env_var_treated_as_unset():
    # Defensive: empty string env var must behave as unset — both get the
    # 7-day default. `${THREADS_WATCHER_BASELINE_LOOKBACK_DAYS:-7}` treats
    # empty string the same as unset (bash `:-` fires on empty too), so the
    # flag IS passed with "7", not "" (which would explode argparse).
    argv = _run({"THREADS_WATCHER_BASELINE_LOOKBACK_DAYS": ""})
    assert "--baseline-lookback-days" in argv, (
        f"Empty env var must fall back to default '7' (same as unset). "
        f"Got: {argv!r}"
    )
    idx = argv.index("--baseline-lookback-days")
    assert idx + 1 < len(argv) and argv[idx + 1] == "7", (
        f"Empty env var must produce --baseline-lookback-days 7 (not empty string). "
        f"Got: {argv!r}"
    )


def test_env_var_value_with_unusual_but_valid_input():
    # The shell passes the value verbatim — int validation happens at
    # argparse layer. Pin that the shell doesn't mangle the value.
    argv = _run({"THREADS_WATCHER_BASELINE_LOOKBACK_DAYS": "30"})
    idx = argv.index("--baseline-lookback-days")
    assert argv[idx + 1] == "30"


def test_baseline_arg_appears_after_interval_arg():
    # argparse handles ordering, but pin the actual exec layout so
    # operators reading the script can predict where the flag lands.
    argv = _run({"THREADS_WATCHER_BASELINE_LOOKBACK_DAYS": "14"})
    interval_idx = argv.index("--interval")
    baseline_idx = argv.index("--baseline-lookback-days")
    assert baseline_idx > interval_idx, (
        f"--baseline-lookback-days should come after --interval in the "
        f"exec line. Got: {argv!r}"
    )
