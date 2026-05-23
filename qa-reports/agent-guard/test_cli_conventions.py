"""Cross-tool meta-test: pin the shared CLI conventions of the
operator helpers (mttr.py + cron-latency.mjs).

Why this exists
---------------
Both helpers were built turn-by-turn (mttr.py at commit a17b7e2,
cron-latency.mjs at 6d2a952) with the same operator-facing shape:

  --json       machine-readable output
  --help, -h   exits 0 with 'usage'
  bad flag     exits 2
  missing file exits 1 with stderr naming the file
  stdin pipe   supported when no positional arg

But there's no test that ENFORCES this contract across both tools.
A future third helper that adopts a different shape (e.g., --json-out
instead of --json, or exit 1 for bad args instead of 2) would land
silently — operators would then have to remember each tool's quirks,
which is exactly the friction these helpers were built to remove.

This meta-test parametrises the shared contract over the list of
tools so a new CLI just adds one entry to TOOLS and inherits the
whole test set.

Default venv (threads-watcher's .venv has pytest); subprocess against
the actual tool binaries.
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest


WORKSPACE = Path(__file__).resolve().parent.parent.parent


@dataclass(frozen=True)
class Tool:
    """A CLI tool to validate.

    `runner` is a list of args prepended to every invocation
    (e.g., ['python', 'mttr.py'] or ['node', 'cron-latency.mjs']).
    `min_args_for_help` is the help flag the tool accepts; both
    tools today support --help, but if a future tool only accepts
    -h, list it here.
    """
    label: str
    runner: list[str]
    cwd: Path
    help_flag: str = '--help'


TOOLS: list[Tool] = [
    Tool(
        label='mttr.py',
        runner=[sys.executable, 'mttr.py'],
        cwd=WORKSPACE / 'projects' / 'threads-watcher',
    ),
    Tool(
        label='cron-latency.mjs',
        runner=['node', 'scripts/cron-latency.mjs'],
        cwd=WORKSPACE / 'second-brain' / 'apps' / 'api',
    ),
]


def _run(tool: Tool, args: list[str], input_text: str = '') -> subprocess.CompletedProcess:
    return subprocess.run(
        [*tool.runner, *args],
        cwd=str(tool.cwd),
        capture_output=True,
        text=True,
        timeout=15,
        input=input_text,
    )


# ── conventions exercised against each tool independently ──────────────


@pytest.mark.parametrize('tool', TOOLS, ids=lambda t: t.label)
class TestCliConventions:
    def test_help_exits_zero_with_usage(self, tool: Tool):
        # Operators discover CLI surface via --help; if it ever exits
        # non-zero or omits 'usage', the tool feels broken even though
        # it works.
        r = _run(tool, [tool.help_flag])
        assert r.returncode == 0, (
            f"{tool.label}: {tool.help_flag} should exit 0, got "
            f"{r.returncode}. stderr: {r.stderr}"
        )
        assert 'usage' in r.stdout.lower(), (
            f"{tool.label}: {tool.help_flag} stdout should contain 'usage'. "
            f"Got: {r.stdout[:200]}"
        )

    def test_unknown_flag_exits_two(self, tool: Tool):
        # argparse (py) + custom dispatch (js) both adopt the
        # GNU convention: exit 2 for usage errors, exit 1 for
        # runtime errors. Pin so a future tool that uses exit 1 for
        # bad args (which conflicts with file-not-found) trips here.
        r = _run(tool, ['--no-such-flag-xyz'])
        assert r.returncode == 2, (
            f"{tool.label}: unknown flag should exit 2, got {r.returncode}. "
            f"stderr: {r.stderr[:300]}"
        )

    def test_missing_file_exits_one_with_stderr_hint(self, tool: Tool):
        # Both tools accept a file path as positional arg. A wrong
        # path should exit 1 (runtime error, NOT 2) AND the stderr
        # MUST name the offending path so the operator can typo-check
        # without re-reading help.
        fake = '/tmp/no-such-cli-conventions-test-XYZ.log'
        r = _run(tool, [fake])
        assert r.returncode == 1, (
            f"{tool.label}: missing file should exit 1, got "
            f"{r.returncode}. stderr: {r.stderr[:300]}"
        )
        assert fake in r.stderr or 'not found' in r.stderr.lower(), (
            f"{tool.label}: stderr should mention the missing file or "
            f"'not found'. Got: {r.stderr[:300]}"
        )

    def test_json_flag_emits_parseable_json_on_empty_input(self, tool: Tool):
        # `--json` is the machine-readable surface. Even with empty
        # input (no events, no records), output MUST be parseable as
        # JSON (the dashboard/Discord-hook side can `jq` it without a
        # nullity guard at every consumer).
        r = _run(tool, ['--json'], input_text='')
        assert r.returncode == 0, (
            f"{tool.label}: empty-input --json should exit 0, got "
            f"{r.returncode}. stderr: {r.stderr[:300]}"
        )
        try:
            parsed = json.loads(r.stdout)
        except json.JSONDecodeError as e:
            pytest.fail(
                f"{tool.label}: --json output is not valid JSON: {e}\n"
                f"stdout: {r.stdout[:300]}"
            )
        # Both tools emit either [] (no records) or {} (empty dict).
        # Pin: empty falsy structure, not null/None.
        assert parsed in ([], {}) or len(parsed) == 0, (
            f"{tool.label}: empty-input --json output should be falsy "
            f"empty (got: {parsed!r})"
        )


# ── inventory pin: a new helper has to be deliberately added ───────────


def test_tools_inventory_is_pinned():
    # Pin the list so a refactor that adds a 3rd helper has to
    # deliberately extend this test rather than slip past.
    labels = sorted(t.label for t in TOOLS)
    assert labels == ['cron-latency.mjs', 'mttr.py'], (
        f"TOOLS inventory drifted. Got {labels}. "
        f"If you ADDED a CLI helper, register it in TOOLS so the "
        f"shared conventions get tested. If you REMOVED one, update "
        f"this assertion to reflect the new canonical set."
    )


def test_each_tool_binary_exists():
    # A broken cwd / typo'd script path would make every
    # parametrised test fail with confusing "FileNotFoundError"
    # before any assertion runs. Catch at the inventory layer with
    # a focused error message.
    offenders: list[str] = []
    for t in TOOLS:
        if not t.cwd.is_dir():
            offenders.append(f"{t.label}: cwd {t.cwd} does not exist")
            continue
        # Last runner arg (after interpreter) should be a resolvable
        # script path RELATIVE TO cwd.
        script = t.cwd / t.runner[-1]
        if not script.is_file():
            offenders.append(f"{t.label}: script {script} not found")
    assert not offenders, '\n'.join(offenders)
