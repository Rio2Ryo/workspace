"""Coverage for the two sync.py helpers that had 0 test mentions:

  * clear_dry_run_state  — the "release" half of the dry-run state
    machine (save_dry_run_state writes, this removes). If broken,
    get_active_dry_run_alert() emits a "dry-run stuck" ALERT long
    after the streak has actually been resolved — a real ops
    false-positive class.
  * build_git_diff_cached_allowed_args — pure arg builder used to
    detect whether the snapshot or an explicit allowlist of
    companion paths have staged changes. The wrapper
    build_git_diff_cached_snapshot_args (single-path case) IS
    tested; the n-path variant was the gap.

Plus one state-machine round-trip that exercises both halves
(save → clear → load returns None) so a future refactor that
changes file path conventions in one half breaks here, not in
production where the false-positive alert is the only symptom.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync import (  # noqa: E402
    DryRunState,
    build_git_diff_cached_allowed_args,
    build_git_diff_cached_snapshot_args,
    clear_dry_run_state,
    load_dry_run_state,
    save_dry_run_state,
)


# ── clear_dry_run_state ───────────────────────────────────────────────


def test_clear_dry_run_state_removes_existing_file(tmp_path: Path) -> None:
    state_file = tmp_path / "dry-run-state.json"
    state_file.write_text('{"pending_ticks": 5}')
    assert state_file.exists()
    clear_dry_run_state(state_file)
    assert not state_file.exists()


def test_clear_dry_run_state_is_idempotent_for_missing_file(
    tmp_path: Path,
) -> None:
    # The "release" path runs every successful confirm AND on
    # delta-drops-to-zero. Most calls will hit an already-missing
    # file (the streak never started or was already cleared).
    # Must NOT raise on the no-op case.
    state_file = tmp_path / "absent.json"
    assert not state_file.exists()
    clear_dry_run_state(state_file)  # no raise
    assert not state_file.exists()


def test_clear_dry_run_state_swallows_oserror_with_warning(
    tmp_path: Path, capsys, monkeypatch
) -> None:
    # OSError on unlink (e.g., permission denied on the parent dir)
    # must NOT propagate — the dry-run state file failing to clear
    # is annoying but should not crash the watcher loop. Test by
    # monkeypatching Path.unlink to raise.
    state_file = tmp_path / "perm-locked.json"
    state_file.write_text('{}')

    def fake_unlink(self, missing_ok=False):  # noqa: ARG001
        raise OSError("Operation not permitted")

    monkeypatch.setattr(Path, "unlink", fake_unlink)
    clear_dry_run_state(state_file)  # must not raise
    err = capsys.readouterr().err
    # Operator-visible WARN line names the path so they can
    # investigate the perm issue.
    assert "WARN" in err
    assert "perm-locked.json" in err
    assert "dry-run state" in err


def test_save_then_clear_then_load_returns_none(tmp_path: Path) -> None:
    # End-to-end state machine: save plants, clear removes, load
    # returns None. Pin the round-trip — if a future refactor
    # changes file format or path convention in only one half, the
    # symptom in production is a permanent "dry-run stuck" alert
    # AFTER --confirm succeeds. This catches it at PR time.
    state_file = tmp_path / "machine.json"
    save_dry_run_state(state_file, DryRunState(delta=1, count=3, since="2026-05-23T00:00:00Z"))
    assert state_file.exists()
    loaded = load_dry_run_state(state_file)
    assert loaded is not None
    assert loaded.count == 3

    clear_dry_run_state(state_file)
    assert load_dry_run_state(state_file) is None


# ── build_git_diff_cached_allowed_args ────────────────────────────────


def test_diff_cached_allowed_no_extras() -> None:
    args = build_git_diff_cached_allowed_args(
        Path("/ws"), "snap.json", None
    )
    assert args == [
        "git", "-C", "/ws",
        "diff", "--cached", "--quiet", "--", "snap.json",
    ]


def test_diff_cached_allowed_empty_list_extras() -> None:
    # The single-path wrapper passes [] explicitly; equivalence with
    # None is a contract worth pinning so callers can choose either
    # without subtle behavior diffs.
    args_none = build_git_diff_cached_allowed_args(Path("/ws"), "snap.json", None)
    args_empty = build_git_diff_cached_allowed_args(Path("/ws"), "snap.json", [])
    assert args_none == args_empty


def test_diff_cached_allowed_single_extra_path_appended() -> None:
    args = build_git_diff_cached_allowed_args(
        Path("/ws"), "snap.json", ["other.json"]
    )
    assert args[-2:] == ["snap.json", "other.json"]


def test_diff_cached_allowed_multiple_extras_appended_in_order() -> None:
    args = build_git_diff_cached_allowed_args(
        Path("/ws"), "snap.json", ["a.txt", "b.txt", "c.txt"]
    )
    # Order matters — `git diff -- path1 path2` evaluates the args
    # positionally; reordering could change which path is matched as
    # the "snapshot" if pathspec patterns ever entered the mix.
    assert args[-4:] == ["snap.json", "a.txt", "b.txt", "c.txt"]


def test_diff_cached_snapshot_wrapper_delegates_to_allowed_with_empty_list() -> None:
    # The wrapper is the single-path case of the n-path builder. Pin
    # the equivalence so a future "optimisation" that special-cases
    # the wrapper can't subtly change the resulting git invocation.
    wrapper = build_git_diff_cached_snapshot_args(Path("/ws"), "snap.json")
    direct = build_git_diff_cached_allowed_args(Path("/ws"), "snap.json", [])
    assert wrapper == direct
