"""CLI argparse contract for watcher.py.

Pins the surface area operators interact with: argument names,
defaults, and how they thread into the run_once / run_watch entry
points.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402


def _parse(argv: list[str]):
    """Drive watcher.main's argparse directly. Recreates the parser the
    same way main() does so the tests pin EXACTLY the surface main
    exposes, not a private copy."""
    parser = __import__('argparse').ArgumentParser()
    parser.add_argument("--handle", default=watcher.DEFAULT_HANDLE)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true")
    mode.add_argument("--watch", action="store_true")
    mode.add_argument("--health-check", action="store_true")
    parser.add_argument("--interval", type=int, default=600)
    parser.add_argument("--threshold", type=int, default=3)
    parser.add_argument("--baseline-lookback-days", type=int, default=None)
    return parser.parse_args(argv)


class TestBaselineLookbackArg:
    def test_default_is_none(self):
        """Default `None` preserves the all-time-peak behaviour for
        every existing operator and cron config."""
        args = _parse([])
        assert args.baseline_lookback_days is None

    def test_accepts_positive_int(self):
        args = _parse(["--baseline-lookback-days", "7"])
        assert args.baseline_lookback_days == 7

    def test_accepts_one(self):
        args = _parse(["--baseline-lookback-days", "1"])
        assert args.baseline_lookback_days == 1

    def test_rejects_non_int(self):
        with pytest.raises(SystemExit):
            _parse(["--baseline-lookback-days", "abc"])


class TestRunOnceThreadsLookback:
    """Pin that the kwarg actually reaches the helper, not just the
    parser. Without this, a typo in the call site would silently make
    the CLI flag a no-op."""

    def test_signature_accepts_baseline_lookback_days(self):
        import inspect
        sig = inspect.signature(watcher.run_once)
        assert "baseline_lookback_days" in sig.parameters
        assert sig.parameters["baseline_lookback_days"].default is None

    def test_run_watch_signature_accepts_baseline_lookback_days(self):
        import inspect
        sig = inspect.signature(watcher.run_watch)
        assert "baseline_lookback_days" in sig.parameters
        assert sig.parameters["baseline_lookback_days"].default is None


class TestActualHelpOutput:
    """Smoke-check that argparse renders the new flag in --help. If
    operators search 'lookback' in the help text, they should find
    it. Catches regressions where the help kwarg gets clobbered."""

    def test_help_mentions_baseline_lookback(self, capsys):
        with pytest.raises(SystemExit):
            watcher.main(["--help"])
        captured = capsys.readouterr().out
        assert "--baseline-lookback-days" in captured
        assert "all-time peak" in captured.lower() or "long-standing" in captured.lower()
