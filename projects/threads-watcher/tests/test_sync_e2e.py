"""End-to-end tests for sync.main against a real ephemeral git repo.

Before this file, sync.py's _do_commit_and_maybe_push (the part that
actually shells out to git add/commit/push) was only exercised by:
  - 16 pure-helper unit tests in test_sync_cli.py (command builders)
  - 28 guard unit tests in test_sync_guards.py
  - exactly one production run of `python sync.py --confirm --enable-push`
    on 2026-05-17 (commit 16d0bd5 in workspace).
That was a single tracer — not a regression net. A refactor that, say,
swapped the order of `write_cursor` vs `git commit`, or that no-op'd
the staged-others abort guard, would only have been caught by another
production run.

Strategy: spin up a self-contained git repo in tempdir, seed a sqlite DB
with the schema sync.py expects, write a snapshot file, and invoke
`sync.main([...])` as if it were the CLI. Assert on commit shape, cursor
file content, and log file.

No network. No subprocess mocking — we want to verify the real `git add`
/ `git commit` invocations are wired right. Tests are deterministic
because every git invocation is path-scoped to the tempdir.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sync as sync_mod  # noqa: E402
from db import connect, init_db, record_check, save_post_screenshot  # noqa: E402


SNAPSHOT_REL = "snapshot/state.json"


# ── fixture helpers ─────────────────────────────────────────────────────


def _run(*cmd: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(list(cmd), cwd=str(cwd), capture_output=True, text=True, check=True)


def _seed_repo(tmp_path: Path, *, recent_checks: list[str] | None = None, posts: int = 3) -> dict:
    """Build a temp git repo with snapshot + sqlite DB + initial commit.

    Returns a dict of paths used by main(): db, snapshot, cursor, log,
    workspace.
    """
    workspace = tmp_path / "ws"
    workspace.mkdir()

    _run("git", "init", "-q", "-b", "main", cwd=workspace)
    # Make commits work without relying on the host's git config.
    _run("git", "config", "user.email", "test@example.com", cwd=workspace)
    _run("git", "config", "user.name", "test", cwd=workspace)
    _run("git", "config", "commit.gpgsign", "false", cwd=workspace)

    snapshot = workspace / SNAPSHOT_REL
    snapshot.parent.mkdir(parents=True)
    snapshot.write_text(json.dumps({"posts": [], "handle": "@x", "version": 0}), encoding="utf-8")
    _run("git", "add", str(snapshot.relative_to(workspace)), cwd=workspace)
    _run("git", "commit", "-q", "-m", "initial snapshot", cwd=workspace)

    db = workspace / "watcher.db"
    conn = connect(db)
    init_db(conn)
    for i in range(posts):
        save_post_screenshot(
            conn,
            handle="@x", post_id=f"P{i}", post_url=f"u/{i}",
            first_seen_at="t", captured_at="t",
            screenshot_png=b"png", width=1, height=1, local_path=None,
        )
    for status in (recent_checks or ["ok", "ok", "ok"]):
        record_check(conn, handle="@x", checked_at="t", found_count=10, new_count=0, status=status, error=None)
    conn.close()

    return {
        "workspace": workspace,
        "snapshot": snapshot,
        "db": db,
        "cursor": workspace / ".cursor",
        "log": workspace / "sync.log",
    }


def _argv(paths: dict, *extra: str) -> list[str]:
    """Build the CLI args sync.main expects, pointing every default at the temp repo."""
    return [
        "--db", str(paths["db"]),
        "--snapshot", str(paths["snapshot"]),
        "--cursor", str(paths["cursor"]),
        "--log", str(paths["log"]),
        "--workspace", str(paths["workspace"]),
        "--snapshot-rel", SNAPSHOT_REL,
        # 0 gap so the recently-committed initial snapshot doesn't block us.
        "--min-gap-sec", "0",
        *extra,
    ]


def _mutate_snapshot(snapshot: Path, n: int = 1) -> None:
    """Edit snapshot so `git diff --cached` after `git add` is non-empty."""
    data = json.loads(snapshot.read_text(encoding="utf-8"))
    data["posts"] = [{"id": f"new-{i}"} for i in range(n)]
    data["version"] = data.get("version", 0) + 1
    snapshot.write_text(json.dumps(data), encoding="utf-8")


def _last_commit_subject(workspace: Path) -> str:
    return subprocess.check_output(
        ["git", "-C", str(workspace), "log", "-1", "--format=%s"], text=True,
    ).strip()


def _staged_paths(workspace: Path) -> list[str]:
    out = subprocess.check_output(
        ["git", "-C", str(workspace), "diff", "--cached", "--name-only"], text=True,
    )
    return [line for line in out.splitlines() if line]


def _commit_count(workspace: Path) -> int:
    return int(subprocess.check_output(
        ["git", "-C", str(workspace), "rev-list", "--count", "HEAD"], text=True,
    ).strip())


# ── happy paths ─────────────────────────────────────────────────────────


def test_confirm_creates_commit_when_snapshot_changed(tmp_path):
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)

    before = _commit_count(paths["workspace"])
    rc = sync_mod.main(_argv(paths, "--confirm"))
    after = _commit_count(paths["workspace"])

    assert rc == 0
    assert after == before + 1
    subject = _last_commit_subject(paths["workspace"])
    assert subject.startswith("chore(threads-watcher): snapshot @")
    assert "(delta=3)" in subject  # 3 posts seeded, cursor=0


def test_cursor_written_after_successful_commit(tmp_path):
    paths = _seed_repo(tmp_path, posts=5)
    _mutate_snapshot(paths["snapshot"])

    rc = sync_mod.main(_argv(paths, "--confirm"))

    assert rc == 0
    # Cursor must reflect the new high-water mark from the DB so a
    # subsequent run takes the no-delta short-circuit.
    assert paths["cursor"].read_text(encoding="utf-8").strip() == "5"


def test_idempotent_second_run_skips_with_no_delta(tmp_path):
    paths = _seed_repo(tmp_path, posts=4)
    _mutate_snapshot(paths["snapshot"])

    sync_mod.main(_argv(paths, "--confirm"))
    commits_after_first = _commit_count(paths["workspace"])

    # Second run, no new posts in DB, cursor=4 already.
    rc = sync_mod.main(_argv(paths, "--confirm"))
    commits_after_second = _commit_count(paths["workspace"])

    assert rc == 0
    assert commits_after_second == commits_after_first  # no new commit


# ── safety nets ─────────────────────────────────────────────────────────


def test_aborts_when_unrelated_file_is_already_staged(tmp_path):
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)

    # Simulate the "footgun" condition the abort guard exists for:
    # someone (or a tool) left another file staged in the workspace.
    foreign = paths["workspace"] / "foreign.txt"
    foreign.write_text("oops", encoding="utf-8")
    _run("git", "add", "foreign.txt", cwd=paths["workspace"])

    before = _commit_count(paths["workspace"])
    rc = sync_mod.main(_argv(paths, "--confirm"))
    after = _commit_count(paths["workspace"])

    # exit=1 (skip is a soft "no work to do"; abort is a hard refuse)
    assert rc == 1
    # Crucial: NO commit was made. foreign.txt stays staged for the
    # human to deal with rather than getting bundled into the snapshot.
    assert after == before
    assert "foreign.txt" in _staged_paths(paths["workspace"])

    log_text = paths["log"].read_text(encoding="utf-8")
    assert "ABORT" in log_text
    assert "foreign.txt" in log_text


def test_dry_default_makes_no_git_changes(tmp_path):
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"])

    before = _commit_count(paths["workspace"])
    rc = sync_mod.main(_argv(paths))  # no --confirm
    after = _commit_count(paths["workspace"])

    assert rc == 0
    assert after == before  # no commit
    assert _staged_paths(paths["workspace"]) == []  # no `git add` either
    assert not paths["cursor"].exists()  # cursor not written in dry mode

    log_text = paths["log"].read_text(encoding="utf-8")
    assert "DRY:" in log_text


def test_recent_failures_skip_does_not_touch_git(tmp_path):
    paths = _seed_repo(tmp_path, recent_checks=["ok", "error", "error"])
    _mutate_snapshot(paths["snapshot"])

    before = _commit_count(paths["workspace"])
    rc = sync_mod.main(_argv(paths, "--confirm"))
    after = _commit_count(paths["workspace"])

    # Skip path = exit 0, no commit, no cursor write
    assert rc == 0
    assert after == before
    assert not paths["cursor"].exists()


def test_missing_db_returns_1(tmp_path):
    paths = _seed_repo(tmp_path)
    paths["db"].unlink()

    rc = sync_mod.main(_argv(paths, "--confirm"))

    assert rc == 1
    log_text = paths["log"].read_text(encoding="utf-8")
    assert "db not found" in log_text


def test_missing_snapshot_returns_1(tmp_path):
    paths = _seed_repo(tmp_path)
    paths["snapshot"].unlink()

    rc = sync_mod.main(_argv(paths, "--confirm"))

    assert rc == 1
    log_text = paths["log"].read_text(encoding="utf-8")
    assert "snapshot not found" in log_text


# ── ordering contract: cursor only after commit succeeded ───────────────


def test_cursor_not_written_before_commit_when_commit_path_runs(tmp_path):
    """Pin the ordering: `write_cursor` must come AFTER `git commit`
    returns 0, so a future failure path can't leave the cursor advanced
    while the snapshot was never committed."""
    paths = _seed_repo(tmp_path, posts=7)
    _mutate_snapshot(paths["snapshot"])

    rc = sync_mod.main(_argv(paths, "--confirm"))
    assert rc == 0

    # Cursor advanced, commit exists, both reflect the same state.
    assert paths["cursor"].read_text(encoding="utf-8").strip() == "7"
    assert "(delta=7)" in _last_commit_subject(paths["workspace"])


# ── snapshot-matches-index path ─────────────────────────────────────────


def test_skips_commit_when_snapshot_matches_committed_state(tmp_path):
    """If the snapshot in DB-derived form already matches what's in git
    (e.g., a re-run after the file was already committed by another
    process), sync.py should bump the cursor and skip the commit."""
    paths = _seed_repo(tmp_path)
    # Don't mutate snapshot — git index already matches working tree.

    before = _commit_count(paths["workspace"])
    rc = sync_mod.main(_argv(paths, "--confirm"))
    after = _commit_count(paths["workspace"])

    assert rc == 0
    assert after == before  # no commit
    # Cursor still bumped — we did all the work the next run would have done.
    assert paths["cursor"].read_text(encoding="utf-8").strip() == "3"


# ── --enable-push paths (bare repo as origin) ───────────────────────────


def _make_bare_origin(tmp_path: Path, workspace: Path, *, branch: str = "main") -> Path:
    """Create a bare repo to serve as `origin`, point workspace at it."""
    bare = tmp_path / "origin.git"
    _run("git", "init", "--bare", "-q", "-b", branch, cwd=tmp_path)
    # `git init --bare -b main` doesn't actually take cwd that way for the
    # bare dir; do it explicitly.
    if not bare.exists():
        subprocess.run(["git", "init", "--bare", "-q", "-b", branch, str(bare)], check=True)
    _run("git", "remote", "add", "origin", str(bare), cwd=workspace)
    # Push the initial commit so the branch exists upstream; otherwise the
    # first `git push origin <branch>` would set upstream itself, which we
    # don't want to bake into the test (sync.py doesn't pass -u).
    _run("git", "push", "-q", "origin", branch, cwd=workspace)
    return bare


def _bare_branch_tip(bare: Path, branch: str) -> str:
    """SHA at the tip of <branch> in the bare repo (or '' if absent)."""
    res = subprocess.run(
        ["git", "-C", str(bare), "rev-parse", branch],
        capture_output=True, text=True,
    )
    return res.stdout.strip() if res.returncode == 0 else ""


def test_enable_push_pushes_commit_to_origin(tmp_path):
    paths = _seed_repo(tmp_path)
    bare = _make_bare_origin(tmp_path, paths["workspace"])
    _mutate_snapshot(paths["snapshot"], n=2)

    bare_tip_before = _bare_branch_tip(bare, "main")
    rc = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))
    bare_tip_after = _bare_branch_tip(bare, "main")

    assert rc == 0
    # The bare repo's HEAD moved to the new commit we just created.
    assert bare_tip_after != ""
    assert bare_tip_after != bare_tip_before
    # And it matches the workspace HEAD — proof the right SHA was pushed.
    ws_head = subprocess.check_output(
        ["git", "-C", str(paths["workspace"]), "rev-parse", "HEAD"], text=True,
    ).strip()
    assert bare_tip_after == ws_head

    log_text = paths["log"].read_text(encoding="utf-8")
    assert "pushed to origin main" in log_text


def test_confirm_without_enable_push_does_not_advance_remote(tmp_path):
    """The --enable-push gate must be opt-in. A plain --confirm commits
    locally but leaves the bare remote untouched. Pin so a future
    "always push" refactor can't silently publish dev snapshots."""
    paths = _seed_repo(tmp_path)
    bare = _make_bare_origin(tmp_path, paths["workspace"])
    _mutate_snapshot(paths["snapshot"], n=1)

    bare_tip_before = _bare_branch_tip(bare, "main")
    rc = sync_mod.main(_argv(paths, "--branch", "main", "--confirm"))
    bare_tip_after = _bare_branch_tip(bare, "main")

    assert rc == 0
    assert bare_tip_after == bare_tip_before  # remote untouched
    # But locally a new commit exists.
    ws_head = subprocess.check_output(
        ["git", "-C", str(paths["workspace"]), "rev-parse", "HEAD"], text=True,
    ).strip()
    assert ws_head != bare_tip_before

    log_text = paths["log"].read_text(encoding="utf-8")
    assert "skipping push" in log_text


def test_enable_push_failure_returns_1_and_logs_error(tmp_path):
    """When the push subprocess fails (e.g., bogus remote), exit=1 and
    the error message must be in the log — not swallowed."""
    paths = _seed_repo(tmp_path)
    # Point origin at a nonexistent path — push will fail.
    _run("git", "remote", "add", "origin", str(tmp_path / "does-not-exist.git"), cwd=paths["workspace"])
    _mutate_snapshot(paths["snapshot"], n=1)

    rc = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))

    assert rc == 1
    log_text = paths["log"].read_text(encoding="utf-8")
    assert "git push failed" in log_text
    # The local commit still happened — only the push failed.
    ws_commits = _commit_count(paths["workspace"])
    assert ws_commits == 2  # initial + the one sync just made
    # The cursor must NOT have advanced: the commit is local-only, not
    # synced to origin, so the next tick must re-enter and retry the
    # push (see test_failed_push_is_retried_on_next_run). Advancing it
    # here would strand the commit forever (delta would read 0).
    assert not paths["cursor"].exists()


def test_failed_push_is_retried_on_next_run(tmp_path):
    """A push failure must not strand the local commit. The cursor is
    advanced only once the commit reaches origin, so the next run
    re-enters with the same delta, finds the snapshot already
    committed, and retries the push until it lands."""
    paths = _seed_repo(tmp_path)
    # A real bare origin captured at the INITIAL commit (no sync commit).
    bare = _make_bare_origin(tmp_path, paths["workspace"])
    initial_tip = _bare_branch_tip(bare, "main")
    _mutate_snapshot(paths["snapshot"], n=1)

    # Run 1: break origin so the push fails after a successful commit.
    _run("git", "remote", "set-url", "origin", str(tmp_path / "missing.git"), cwd=paths["workspace"])
    rc1 = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))
    assert rc1 == 1
    assert not paths["cursor"].exists()                    # cursor NOT advanced
    assert _bare_branch_tip(bare, "main") == initial_tip   # origin still at initial
    commits_after_run1 = _commit_count(paths["workspace"])
    assert commits_after_run1 == 2                         # initial + sync commit

    # Run 2: restore origin → the stranded commit's push is retried.
    _run("git", "remote", "set-url", "origin", str(bare), cwd=paths["workspace"])
    rc2 = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))
    assert rc2 == 0
    # No NEW commit — run 2 only retried the push of run 1's commit.
    assert _commit_count(paths["workspace"]) == commits_after_run1
    # The stranded commit is now on origin, and the cursor finally advances.
    assert _bare_branch_tip(bare, "main") != initial_tip
    assert paths["cursor"].read_text(encoding="utf-8").strip() == "3"
    log_text = paths["log"].read_text(encoding="utf-8")
    assert "pushed to origin main" in log_text


def test_enable_push_targets_the_requested_branch(tmp_path):
    """The --branch argument must reach `git push origin <branch>` — not
    a default. Use a non-conventional branch name to make a regression
    in build_git_push_args obvious."""
    paths = _seed_repo(tmp_path)
    workspace = paths["workspace"]

    # Switch workspace to a non-default branch so push exercises --branch.
    _run("git", "checkout", "-q", "-b", "shiro/test-push-branch", cwd=workspace)
    bare = _make_bare_origin(tmp_path, workspace, branch="shiro/test-push-branch")
    _mutate_snapshot(paths["snapshot"], n=1)

    rc = sync_mod.main(_argv(paths, "--branch", "shiro/test-push-branch", "--confirm", "--enable-push"))

    assert rc == 0
    pushed_tip = _bare_branch_tip(bare, "shiro/test-push-branch")
    ws_head = subprocess.check_output(
        ["git", "-C", str(workspace), "rev-parse", "HEAD"], text=True,
    ).strip()
    assert pushed_tip == ws_head
    # And `main` was NOT created in the bare (we didn't push it).
    assert _bare_branch_tip(bare, "main") == ""


def test_commit_happens_before_push_attempt(tmp_path):
    """Pin ordering: commit must succeed before push runs. If a future
    refactor inverts them, a push-first failure would leave us without
    a commit to push the next time around (compounding the problem).

    We verify by setting up a push that succeeds, then inspecting the
    log line ordering — committed line must precede pushed line."""
    paths = _seed_repo(tmp_path)
    _make_bare_origin(tmp_path, paths["workspace"])
    _mutate_snapshot(paths["snapshot"], n=3)

    rc = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))
    assert rc == 0

    log_lines = paths["log"].read_text(encoding="utf-8").splitlines()
    committed_idx = next((i for i, l in enumerate(log_lines) if "committed:" in l), -1)
    pushed_idx = next((i for i, l in enumerate(log_lines) if "pushed to origin" in l), -1)

    assert committed_idx >= 0, f"no committed line in log: {log_lines}"
    assert pushed_idx >= 0, f"no pushed line in log: {log_lines}"
    assert committed_idx < pushed_idx, "commit must be logged before push"


# ── dry-run accumulator: stale-state clearing ───────────────────────────
#
# The dry-run accumulator (logs/dry-run-state.json) is written only on the
# dry-run-AND-proceed path. It was never cleared when the streak resolves:
#   - a real commit lands (--confirm), or
#   - the delta drops to 0 (nothing pending).
# So once a streak built up and the operator promoted sync to --confirm,
# the stale file lingered and get_active_dry_run_alert() kept emitting a
# false "dry-run stuck" banner on the status page. Observed live:
# logs/dry-run-state.json said {delta:3,count:18,since:2026-05-19} while
# logs/sync.log showed real commits on 2026-05-21/22.


def test_confirm_commit_clears_stale_dry_run_state(tmp_path):
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)
    dry_state = tmp_path / "dry-run-state.json"
    # Stale streak left over from before --confirm was enabled.
    dry_state.write_text(
        json.dumps({"delta": 3, "count": 18, "since": "2026-05-19T15:01:42Z"}),
        encoding="utf-8",
    )

    rc = sync_mod.main(_argv(paths, "--confirm", "--dry-state", str(dry_state)))

    assert rc == 0
    # The commit resolved the pending work — the stale streak file must be
    # gone so get_active_dry_run_alert() stops firing a false alert.
    assert not dry_state.exists()


def test_zero_delta_clears_stale_dry_run_state(tmp_path):
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"])
    # First confirm sync advances the cursor to the DB max.
    assert sync_mod.main(_argv(paths, "--confirm")) == 0

    dry_state = tmp_path / "dry-run-state.json"
    dry_state.write_text(
        json.dumps({"delta": 2, "count": 9, "since": "2026-05-19T10:00:00Z"}),
        encoding="utf-8",
    )

    # Second run: cursor == DB max → delta 0 → guard skip. Nothing is
    # pending, so the stale streak must be cleared.
    rc = sync_mod.main(_argv(paths, "--confirm", "--dry-state", str(dry_state)))

    assert rc == 0
    assert not dry_state.exists()


def test_gap_skip_with_pending_delta_keeps_dry_run_state(tmp_path):
    """Precision guard: a guard skip while delta is still > 0 (work is
    genuinely pending) must NOT clear the streak — only a real commit or
    a zero delta resolves it."""
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)
    dry_state = tmp_path / "dry-run-state.json"
    original = json.dumps({"delta": 3, "count": 4, "since": "2026-05-22T10:00:00Z"})
    dry_state.write_text(original, encoding="utf-8")

    # Huge min-gap → the just-created initial commit blocks this tick.
    # delta stays > 0 (pending), so the streak file must survive intact.
    rc = sync_mod.main(
        _argv(paths, "--confirm", "--min-gap-sec", "999999", "--dry-state", str(dry_state))
    )

    assert rc == 0
    assert dry_state.exists()
    assert json.loads(dry_state.read_text(encoding="utf-8")) == json.loads(original)


# ── sync_event log-line surface (skipped / dry_run / committed / pushed / error)
#
# Per-outcome assertions complementing the unit tests in
# test_sync_guards.TestFormatOutcomeEvent. These prove the canonical
# event line actually lands in the live sync.log for each exit path
# `_do_commit_and_maybe_push` can take, not just that the helper
# produces the right string in isolation.
#
# Operators run:
#   grep "sync_event: skipped" logs/sync.log \
#     | grep -o "blocker=[a-z_]*" | sort | uniq -c
#
# These tests prove the log file actually contains the lines that grep
# pattern depends on.


def test_committed_event_appears_on_successful_commit(tmp_path):
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)

    rc = sync_mod.main(_argv(paths, "--confirm"))
    assert rc == 0

    log_text = paths["log"].read_text(encoding="utf-8")
    # delta is computed at evaluate_all from the DB max minus the
    # cursor (which starts at 0 for a fresh tempdir). _seed_repo
    # creates 3 posts by default; the helper line should reflect
    # that exact value.
    assert "sync_event: committed delta=3" in log_text, (
        f"committed event missing from log; got:\n{log_text}"
    )


def test_pushed_event_appears_with_branch_when_enable_push(tmp_path):
    paths = _seed_repo(tmp_path)
    _make_bare_origin(tmp_path, paths["workspace"])
    _mutate_snapshot(paths["snapshot"], n=2)

    rc = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))
    assert rc == 0

    log_text = paths["log"].read_text(encoding="utf-8")
    assert "sync_event: pushed delta=3 branch=main" in log_text, (
        f"pushed event missing from log; got:\n{log_text}"
    )
    # And the committed event still lands first — both should appear.
    assert "sync_event: committed delta=3" in log_text


def test_pushed_event_does_NOT_appear_when_push_disabled(tmp_path):
    """The opt-in --enable-push gate must mean 'pushed' literally did
    not happen. Pin so future code can't quietly emit pushed= when
    only the local commit ran."""
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)

    # No --enable-push.
    rc = sync_mod.main(_argv(paths, "--confirm"))
    assert rc == 0

    log_text = paths["log"].read_text(encoding="utf-8")
    assert "sync_event: committed" in log_text   # local commit happened
    assert "sync_event: pushed" not in log_text  # push deliberately skipped


def test_error_event_emitted_when_unrelated_file_staged(tmp_path):
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)
    foreign = paths["workspace"] / "foreign.txt"
    foreign.write_text("oops", encoding="utf-8")
    _run("git", "add", "foreign.txt", cwd=paths["workspace"])

    rc = sync_mod.main(_argv(paths, "--confirm"))
    assert rc == 1  # hard abort (not a soft guard skip)

    log_text = paths["log"].read_text(encoding="utf-8")
    # stage names which substep failed — operator can grep
    #   grep "sync_event: error" logs/sync.log | grep -o "stage=[a-z_]*"
    # to see the histogram of error causes.
    assert "sync_event: error" in log_text
    assert "stage=unrelated_staged" in log_text
    # 🔒 Pin: the human-readable ABORT line MUST name the staged
    # file so the operator can `git restore --staged <path>` without
    # having to `git status` separately. Empirically the live
    # 2026-05-23T10:58:43Z incident emitted the file name; pinning
    # so a future refactor of the log format can't strip it silently
    # (operators would otherwise see only "ABORT: unrelated files
    # are already staged" with no path to act on).
    assert "staged-others: foreign.txt" in log_text
    # 🔒 Pin: the structured event MUST carry a count so
    #   grep "sync_event: error" logs/sync.log \\
    #       | grep -o "staged_others_count=[0-9]*"
    # gives the severity histogram (1 stray file vs 20+ paths
    # post-rebase look very different).
    assert "staged_others_count=1" in log_text


def test_unrelated_staged_log_lists_multiple_files_with_count(tmp_path):
    """Multi-file abort: both the human line lists every blocker AND
    the structured event count matches."""
    paths = _seed_repo(tmp_path)
    _mutate_snapshot(paths["snapshot"], n=2)
    # Stage two unrelated files at once. This is the realistic shape
    # after an interrupted rebase / `git add -A` mishap.
    for name in ("alpha.txt", "beta.txt"):
        (paths["workspace"] / name).write_text("wip", encoding="utf-8")
        _run("git", "add", name, cwd=paths["workspace"])

    rc = sync_mod.main(_argv(paths, "--confirm"))
    assert rc == 1

    log_text = paths["log"].read_text(encoding="utf-8")
    assert "stage=unrelated_staged" in log_text
    # 🔒 BOTH file names listed in the human ABORT line. If the
    # log format ever drops the names or only emits the first one,
    # operators lose the ability to scan the log for the offender
    # without a separate git command.
    assert "alpha.txt" in log_text
    assert "beta.txt" in log_text
    # 🔒 Count matches the actual blocker cardinality.
    assert "staged_others_count=2" in log_text


def test_committed_event_does_NOT_appear_on_push_retry_when_snapshot_already_committed(tmp_path):
    """The push-retry path (snapshot already in git from a prior tick
    that failed to push) re-enters _do_commit_and_maybe_push but
    skips the commit step. The `committed` event represents 'we
    just committed something new'; it must NOT fire here. Otherwise
    operator-side histograms over-count commits."""
    paths = _seed_repo(tmp_path)
    _make_bare_origin(tmp_path, paths["workspace"])
    _mutate_snapshot(paths["snapshot"], n=2)

    # First run with push enabled — commits + pushes.
    rc = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))
    assert rc == 0
    # Roll the cursor BACK so the next tick re-enters with the same
    # delta. This simulates "previous push silently failed and the
    # cursor wasn't advanced".
    paths["cursor"].write_text("0", encoding="utf-8")

    # Truncate the log so we observe only the second run's emits.
    paths["log"].write_text("", encoding="utf-8")
    rc = sync_mod.main(_argv(paths, "--branch", "main", "--confirm", "--enable-push"))
    assert rc == 0

    log_text = paths["log"].read_text(encoding="utf-8")
    # Snapshot already matched git index — no new commit was made.
    assert "snapshot and screenshot assets already match git index" in log_text
    assert "sync_event: committed" not in log_text, (
        "committed event must NOT fire on the push-retry path "
        f"(nothing was committed). Log:\n{log_text}"
    )
    # But pushed CAN still fire — the retry IS pushing.
    assert "sync_event: pushed delta=3 branch=main" in log_text
