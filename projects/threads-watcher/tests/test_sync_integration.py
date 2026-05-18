"""End-to-end integration tests for sync.py against a real git repo.

These tests are the safety net for the "Ao WIP混入" footgun: if the
workspace had unrelated files staged when sync.py runs, a bare
`git commit -m ...` would sweep them into the snapshot commit. We
provoke exactly that scenario and assert sync.py aborts.

A throwaway repo is created per-test under tmp_path so we never touch
the real workspace. sync.main() is called in-process — no subprocess
shelling out — and `subprocess.run` is left untouched so it really
exercises git.
"""

from __future__ import annotations

import json
import subprocess
import sys
import sqlite3
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import init_db, record_check, save_post_screenshot  # noqa: E402
import sync  # noqa: E402


SNAPSHOT_REL = "projects/threads-watcher/threads-watcher-status/state.json"


def _git(repo: Path, *args: str) -> str:
    res = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    )
    return res.stdout.strip()


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init", "-q", "-b", "shiro/phase2-perf-metrics")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test")
    _git(repo, "commit", "--allow-empty", "-q", "-m", "root")
    snap = repo / SNAPSHOT_REL
    snap.parent.mkdir(parents=True)
    snap.write_text(json.dumps({"posts": [], "last_check": "x"}), encoding="utf-8")
    _git(repo, "add", "--", SNAPSHOT_REL)
    _git(repo, "commit", "-q", "-m", "seed snapshot")
    return repo


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    p = tmp_path / "threads_watcher.db"
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    # 5 posts so detect_delta() proceeds against cursor=0.
    for pid in ("a", "b", "c", "d", "e"):
        save_post_screenshot(
            conn, handle="@x", post_id=pid, post_url=f"u/{pid}",
            first_seen_at="t", captured_at="t",
            screenshot_png=b"x", width=1, height=1, local_path=None,
        )
    # 3 healthy checks so recent_failures_guard() proceeds.
    for _ in range(3):
        record_check(
            conn, handle="@x", checked_at="t",
            found_count=0, new_count=0, status="ok",
        )
    conn.commit()
    conn.close()
    return p


def _bump_snapshot(repo: Path, delta_marker: str) -> Path:
    snap = repo / SNAPSHOT_REL
    snap.write_text(
        json.dumps({"posts": [], "last_check": delta_marker}),
        encoding="utf-8",
    )
    return snap


def _run(repo: Path, db: Path, cursor: Path, snapshot: Path, *extra: str) -> int:
    return sync.main([
        "--db", str(db),
        "--snapshot", str(snapshot),
        "--cursor", str(cursor),
        "--log", str(repo / "logs" / "sync.log"),
        "--workspace", str(repo),
        "--snapshot-rel", SNAPSHOT_REL,
        "--min-gap-sec", "0",
        *extra,
    ])


def test_commit_does_not_sweep_unrelated_staged_files(repo, db_path, tmp_path):
    """The core "Ao WIP混入" defense.

    Provoke: stage an unrelated file BEFORE running sync.py with --confirm.
    Assert: sync aborts (exit 1) and the unrelated file is still staged
    (i.e., still in the index, but no commit happened).
    """
    snap = _bump_snapshot(repo, "delta-bump-1")
    other = repo / "projects" / "other-project" / "wip.txt"
    other.parent.mkdir(parents=True)
    other.write_text("half-prepared bug-fix here\n", encoding="utf-8")
    _git(repo, "add", "--", "projects/other-project/wip.txt")

    head_before = _git(repo, "rev-parse", "HEAD")
    rc = _run(repo, db_path, tmp_path / "cursor", snap, "--confirm")

    head_after = _git(repo, "rev-parse", "HEAD")
    staged = _git(repo, "diff", "--cached", "--name-only")

    assert rc == 1, "sync.py must refuse to commit while unrelated WIP is staged"
    assert head_before == head_after, "no commit must be created"
    assert "projects/other-project/wip.txt" in staged, "unrelated WIP must remain staged for the user"


def test_commit_succeeds_with_clean_index_and_only_commits_snapshot(repo, db_path, tmp_path):
    """Positive path: nothing else staged, snapshot changed → exactly 1 file in the commit."""
    snap = _bump_snapshot(repo, "delta-bump-2")
    head_before = _git(repo, "rev-parse", "HEAD")

    rc = _run(repo, db_path, tmp_path / "cursor", snap, "--confirm")

    head_after = _git(repo, "rev-parse", "HEAD")
    assert rc == 0
    assert head_before != head_after, "a new commit must exist"
    files = _git(repo, "show", "--name-only", "--format=", "HEAD").splitlines()
    assert files == [SNAPSHOT_REL], (
        f"commit must contain only the snapshot, got {files}"
    )


def test_commit_path_scoped_with_unrelated_unstaged_changes(repo, db_path, tmp_path):
    """Unstaged WIP elsewhere is fine — only *staged* contamination is fatal.

    Pre-commit hooks and parallel work often leave files modified-but-not-staged.
    sync.py should still be able to do its job in that situation.
    """
    snap = _bump_snapshot(repo, "delta-bump-3")
    parallel = repo / "projects" / "parallel" / "draft.txt"
    parallel.parent.mkdir(parents=True)
    parallel.write_text("ongoing work, not staged\n", encoding="utf-8")

    rc = _run(repo, db_path, tmp_path / "cursor", snap, "--confirm")

    assert rc == 0, "unstaged unrelated changes must not block the snapshot commit"
    files = _git(repo, "show", "--name-only", "--format=", "HEAD").splitlines()
    assert files == [SNAPSHOT_REL]
    assert parallel.read_text(encoding="utf-8") == "ongoing work, not staged\n"


def test_skips_commit_when_snapshot_matches_index_but_bumps_cursor(repo, db_path, tmp_path):
    """If the snapshot on disk already matches HEAD, we still bump the cursor.

    This mirrors sync.sh §5 — without it, every subsequent run keeps
    re-evaluating the same delta forever.
    """
    cursor = tmp_path / "cursor"
    head_before = _git(repo, "rev-parse", "HEAD")

    # snapshot unchanged from the seed; delta vs cursor=0 still > 0
    rc = _run(repo, db_path, cursor, repo / SNAPSHOT_REL, "--confirm")

    head_after = _git(repo, "rev-parse", "HEAD")
    assert rc == 0
    assert head_before == head_after, "no commit since the snapshot is already in git"
    assert cursor.read_text(encoding="utf-8").strip() == "5", (
        "cursor must advance to current_max so we don't keep re-checking"
    )
