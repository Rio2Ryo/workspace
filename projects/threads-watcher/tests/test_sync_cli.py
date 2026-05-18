"""Tests for sync.py's pure helpers and CLI argument shape.

Subprocess/git invocations are NOT exercised here — they're covered by
end-to-end dry-run smoke against the real DB+snapshot. What this file
pins is the deterministic glue: cursor I/O, commit-message format,
git-command construction, and arg parsing.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import init_db, record_check, save_post_screenshot  # noqa: E402
from sync import (  # noqa: E402
    build_commit_message,
    build_git_add_args,
    build_git_commit_args,
    build_git_diff_cached_snapshot_args,
    build_git_last_commit_ts_args,
    build_git_push_args,
    build_git_staged_other_paths_args,
    get_max_post_id,
    parse_args,
    read_cursor,
    write_cursor,
)


# ── cursor I/O ──────────────────────────────────────────────────────────


def test_read_cursor_missing_file_returns_zero(tmp_path):
    assert read_cursor(tmp_path / "nope") == 0


def test_read_cursor_corrupt_file_returns_zero(tmp_path):
    p = tmp_path / "c"
    p.write_text("not-a-number\n")
    assert read_cursor(p) == 0


def test_read_cursor_empty_file_returns_zero(tmp_path):
    p = tmp_path / "c"
    p.write_text("")
    assert read_cursor(p) == 0


def test_read_cursor_negative_value_clamped_to_zero(tmp_path):
    p = tmp_path / "c"
    p.write_text("-42\n")
    assert read_cursor(p) == 0


def test_read_cursor_round_trip(tmp_path):
    p = tmp_path / "c"
    write_cursor(p, 4242)
    assert read_cursor(p) == 4242


def test_write_cursor_creates_parent_dir(tmp_path):
    p = tmp_path / "nested" / "deep" / "cursor"
    write_cursor(p, 7)
    assert read_cursor(p) == 7


def test_write_cursor_overwrites_existing(tmp_path):
    p = tmp_path / "c"
    write_cursor(p, 10)
    write_cursor(p, 20)
    assert read_cursor(p) == 20


# ── commit message shape (greppable contract with shell) ────────────────


def test_commit_message_includes_iso_and_delta():
    msg = build_commit_message("2026-05-18T08:00:00Z", 43)
    assert "chore(threads-watcher): snapshot @" in msg
    assert "2026-05-18T08:00:00Z" in msg
    assert "(delta=43)" in msg


def test_commit_message_handles_zero_delta_for_completeness():
    # zero-delta shouldn't reach commit normally (guard skips), but if
    # forced via --min-gap-sec=0 with manually-edited cursor, the format
    # must still be intact.
    msg = build_commit_message("2026-05-18T09:00:00Z", 0)
    assert "(delta=0)" in msg


# ── git command construction ────────────────────────────────────────────


def test_git_add_args_uses_dash_dash_separator(tmp_path):
    args = build_git_add_args(tmp_path, "projects/threads-watcher/state.json")
    assert args[:3] == ["git", "-C", str(tmp_path)]
    # `--` before the path ensures odd filenames can never be interpreted
    # as a flag (e.g., a file named "--force"). Pin that defensive shape.
    assert "--" in args
    assert args.index("--") < args.index("projects/threads-watcher/state.json")


def test_git_commit_args_scopes_to_snapshot_path(tmp_path):
    # The commit must include `-- <relpath>` so any other staged changes
    # in the workspace (an Ao WIP partially staged, a sibling project's
    # bug-fix) are NOT swept into the snapshot commit.
    args = build_git_commit_args(tmp_path, "chore: x", "projects/threads-watcher/state.json")
    assert args == [
        "git", "-C", str(tmp_path),
        "commit", "-m", "chore: x",
        "--", "projects/threads-watcher/state.json",
    ]


def test_git_diff_cached_snapshot_args_is_path_scoped(tmp_path):
    # The diff probe used to decide "already matches the index" must be
    # path-scoped — a bare `git diff --cached --quiet` would mis-fire on
    # any unrelated staged change and trigger an erroneous commit.
    args = build_git_diff_cached_snapshot_args(tmp_path, "x/y.json")
    assert args == [
        "git", "-C", str(tmp_path),
        "diff", "--cached", "--quiet", "--", "x/y.json",
    ]


def test_git_staged_other_paths_args_excludes_snapshot(tmp_path):
    # Magic exclusion pathspec: `:!<relpath>` tells git to list every
    # staged path *except* the snapshot. Used as a pre-commit footgun
    # check; if anything else is in there, we abort.
    args = build_git_staged_other_paths_args(tmp_path, "x/y.json")
    assert args == [
        "git", "-C", str(tmp_path),
        "diff", "--cached", "--name-only",
        "--", ".", ":!x/y.json",
    ]


def test_git_push_args_specifies_origin_and_branch(tmp_path):
    args = build_git_push_args(tmp_path, "shiro/phase2-perf-metrics")
    assert args == ["git", "-C", str(tmp_path), "push", "origin", "shiro/phase2-perf-metrics"]


def test_git_last_commit_ts_args_use_format_ct(tmp_path):
    args = build_git_last_commit_ts_args(tmp_path, "x/y.json")
    assert "log" in args and "-1" in args
    assert "--format=%ct" in args
    # `--` before path same defensive concern as build_git_add_args.
    assert "--" in args
    assert args.index("--") < args.index("x/y.json")


# ── get_max_post_id (small SQL helper) ──────────────────────────────────


@pytest.fixture
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    init_db(c)
    yield c
    c.close()


def test_max_post_id_returns_zero_on_empty_db(conn):
    assert get_max_post_id(conn) == 0


def test_max_post_id_reflects_highest_id(conn):
    for pid in ("a", "b", "c"):
        save_post_screenshot(
            conn,
            handle="@x", post_id=pid, post_url=f"u/{pid}",
            first_seen_at="t", captured_at="t",
            screenshot_png=b"x", width=1, height=1, local_path=None,
        )
    assert get_max_post_id(conn) == 3


# ── parse_args defaults & flag wiring ───────────────────────────────────


def test_parse_args_default_is_dry_no_push():
    args = parse_args([])
    assert args.confirm is False
    assert args.enable_push is False


def test_parse_args_confirm_alone_implies_no_push():
    args = parse_args(["--confirm"])
    assert args.confirm is True
    assert args.enable_push is False


def test_parse_args_push_requires_confirm_semantically():
    # parse_args won't reject --enable-push without --confirm — the
    # check lives in main(). Document the surface so a future enforcement
    # change shows up here.
    args = parse_args(["--enable-push"])
    assert args.confirm is False
    assert args.enable_push is True


def test_parse_args_min_gap_can_be_zeroed():
    args = parse_args(["--min-gap-sec", "0"])
    assert args.min_gap_sec == 0


def test_parse_args_window_override():
    args = parse_args(["--window", "5"])
    assert args.window == 5


def test_parse_args_branch_default_matches_current_branch():
    # If someone re-targets the WIP to a different branch, this will fail
    # and force a deliberate update — better than silently committing
    # against the wrong branch.
    args = parse_args([])
    assert args.branch == "shiro/phase2-perf-metrics"
