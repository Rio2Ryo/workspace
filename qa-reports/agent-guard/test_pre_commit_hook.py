"""Unit tests for the regex patterns embedded in pre-commit-hook.sh.

The hook's `run_pytest_for <pattern> <pkg_dir> <label>` calls a regex
against `git diff --cached --name-only` output to decide whether to
trigger the pytest pre-flight. A regex bug there has TWO failure
modes — both bad:

  - over-matching: trigger pytest on unrelated commits, wasting
    operator time (e.g., editing docs/ runs threads-watcher pytest)
  - under-matching: silently skip pytest on commits that SHOULD have
    triggered it — the exact regression-detection-lag class the
    hook exists to close (commits efe6a92 / 854bd8b)

These tests pin the patterns by extracting them from the hook script
and running them against representative path inputs. No subprocess
or git setup — pure regex testing.

Why this exists
---------------
Hook ships with regression-injection verification (turn-by-turn
commit messages document those runs), but injection tests verify
ONE pattern at a time. A future hook edit that breaks the pattern
in a way the injection test doesn't cover (e.g., a regex change
that still matches the injected file but mis-handles other
patterns) would slip past. Pinning the patterns in unit tests
catches regex-narrowing AND regex-broadening regressions.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "pre-commit-hook.sh"


def extract_gate_patterns() -> list[tuple[str, str, str]]:
    """Parse `run_pytest_for '<regex>' '<pkg_dir>' '<label>'` and
    `run_vitest_for '<regex>' '<pkg_dir>' '<label>'` lines from the
    hook source. Returns list of (regex, pkg_dir, label) tuples in
    file order.

    Robust to:
      - one or many spaces between args
      - line continuation (\\)
      - quotes on each arg
    """
    src = SCRIPT.read_text(encoding="utf-8")
    # Collapse line continuations so a multi-line invocation matches as
    # a single line.
    collapsed = re.sub(r"\\\s*\n\s*", " ", src)
    pattern = re.compile(
        r"^\s*run_(?:pytest|vitest)_for\s+'([^']+)'\s+'([^']+)'\s+'([^']+)'\s*$",
        re.MULTILINE,
    )
    return [(m.group(1), m.group(2), m.group(3))
            for m in pattern.finditer(collapsed)]


# ── pattern discovery sanity ───────────────────────────────────────────


def test_at_least_one_gate_is_wired():
    # Catches a future hook edit that accidentally drops all gates
    # (e.g., a copy-paste accident that comments out every
    # `run_*_for` line). Without this guard, the rest of the tests
    # would silently iterate zero patterns and pass trivially.
    gates = extract_gate_patterns()
    assert len(gates) >= 1, (
        "No gate patterns found in pre-commit-hook.sh. Either the "
        "hook script lost all run_pytest_for / run_vitest_for "
        "invocations, or extract_gate_patterns() is broken."
    )


# ── threads-watcher gate: matches what it should ───────────────────────


def test_threads_watcher_gate_matches_top_level_py():
    # sync.py / sync_guards.py / mttr.py / db.py / health.py / etc.
    # are the production source files. Editing any MUST trigger the
    # pytest pre-flight.
    pattern = _find_pattern_for_pkg('projects/threads-watcher')
    for path in [
        'projects/threads-watcher/sync.py',
        'projects/threads-watcher/sync_guards.py',
        'projects/threads-watcher/mttr.py',
        'projects/threads-watcher/db.py',
        'projects/threads-watcher/health.py',
        'projects/threads-watcher/watcher_pure.py',
    ]:
        assert re.search(pattern, path), (
            f"path {path!r} should match threads-watcher gate but didn't"
        )


def test_threads_watcher_gate_matches_test_files():
    pattern = _find_pattern_for_pkg('projects/threads-watcher')
    for path in [
        'projects/threads-watcher/tests/test_sync_guards.py',
        'projects/threads-watcher/tests/conftest.py',
        'projects/threads-watcher/tests/subdir/test_x.py',
    ]:
        assert re.search(pattern, path), (
            f"path {path!r} (tests/) should match threads-watcher gate"
        )


def test_threads_watcher_gate_matches_launchd_managed_shell_scripts():
    # The 3 shell scripts launchd invokes — edits to them go through
    # the publish-if-delta integration tests / restart tests.
    pattern = _find_pattern_for_pkg('projects/threads-watcher')
    for path in [
        'projects/threads-watcher/publish-if-delta.sh',
        'projects/threads-watcher/run-watcher.sh',
        'projects/threads-watcher/auto-restart-if-stale.sh',
    ]:
        assert re.search(pattern, path), (
            f"path {path!r} (launchd shell) should match threads-watcher gate"
        )


# ── threads-watcher gate: skips what it should ─────────────────────────


def test_threads_watcher_gate_skips_unrelated_trees():
    # 🔒 Zero-cost guarantee for operators editing OTHER trees.
    # Any false-positive here means operators pay 41s of pytest
    # for nothing.
    pattern = _find_pattern_for_pkg('projects/threads-watcher')
    for path in [
        'second-brain/apps/api/src/index.ts',
        'second-brain/apps/web/src/app/page.tsx',
        'docs/README.md',
        'tasks/QUEUE.md',
        'projects/top3-favorites/src/App.tsx',
        # SIBLING projects shouldn't trigger threads-watcher pytest
        'projects/citta-backend/server.py',
    ]:
        assert not re.search(pattern, path), (
            f"path {path!r} should NOT match threads-watcher gate "
            f"(would cause false-positive pytest invocation)"
        )


def test_threads_watcher_gate_skips_subdirectory_python_not_under_tests():
    # Edge case: a python file under a SUB-directory of
    # projects/threads-watcher/ that isn't tests/. The current
    # pattern `[^/]+\.py$` requires the .py file at the immediate
    # project root (one path segment), so a nested .py is skipped.
    # This is the intended scope — nested Python under
    # threads-watcher would be tooling/data/etc, not production code.
    pattern = _find_pattern_for_pkg('projects/threads-watcher')
    path = 'projects/threads-watcher/scripts/helper.py'
    assert not re.search(pattern, path), (
        f"deeply-nested {path!r} should NOT match (gate is for top-level "
        f"+tests/+launchd shell only)"
    )


# ── helper: locate pattern by pkg_dir ──────────────────────────────────


def _find_pattern_for_pkg(pkg_dir: str) -> str:
    """Return the pattern string from the gate that targets the
    given pkg_dir. Fails the test cleanly if no such gate exists."""
    for pat, pkg, _label in extract_gate_patterns():
        if pkg == pkg_dir:
            return pat
    raise AssertionError(
        f"No gate in pre-commit-hook.sh targets pkg_dir={pkg_dir!r}. "
        f"Check the hook hasn't dropped the gate or renamed the dir."
    )


# ── extract_gate_patterns self-test ────────────────────────────────────


def test_extract_handles_multiline_continuation():
    # Pin: the hook uses `\` continuation for long gate invocations.
    # Our line-continuation collapse must preserve the args.
    synthetic = (
        "run_pytest_for 'pattern' \\\n"
        "  'pkg' \\\n"
        "  'label'\n"
    )
    # Stub: write to tmp, parse, reset.
    src = SCRIPT.read_text(encoding="utf-8")
    try:
        SCRIPT.write_text(synthetic, encoding="utf-8")
        gates = extract_gate_patterns()
        assert any(p == 'pattern' and pk == 'pkg' and lb == 'label' for p, pk, lb in gates), (
            f"Multi-line continuation parsing dropped a gate. "
            f"Parsed: {gates}"
        )
    finally:
        SCRIPT.write_text(src, encoding="utf-8")


# ── pkg_dir consistency: each gate targets a real directory ────────────


def test_every_gate_targets_an_existing_directory():
    # 🔒 Catches a typo in pkg_dir (e.g., 'projects/threads-watchr')
    # that would silently make `[ -d "$abs_dir" ]` always false and
    # the gate would no-op forever. A no-op gate is worse than no
    # gate — operator thinks they're protected.
    REPO_ROOT = SCRIPT.resolve().parent.parent.parent
    offenders = []
    for _pat, pkg_dir, label in extract_gate_patterns():
        abs_dir = REPO_ROOT / pkg_dir
        if not abs_dir.is_dir():
            offenders.append(f"{label}: pkg_dir={pkg_dir} does not exist")
    assert not offenders, (
        f"Gates target non-existent dirs (gate would silently no-op): {offenders}"
    )


# ── sanity: hook script is valid bash ──────────────────────────────────


def test_hook_passes_bash_syntax_check():
    # `bash -n` parses but does not execute. Catches a missing `fi`,
    # unbalanced quote, etc., before the script gets installed +
    # deployed to operator machines.
    result = subprocess.run(
        ["bash", "-n", str(SCRIPT)],
        capture_output=True, text=True, timeout=10,
    )
    assert result.returncode == 0, (
        f"pre-commit-hook.sh failed bash syntax check:\n"
        f"stderr: {result.stderr}"
    )
