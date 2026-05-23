"""Unit tests for watcher._combined_snapshot.

The function merges per-handle latest_snapshot() dicts into a single
time-sorted feed used by the status page. Previously 0% test coverage
despite being in the publish-to-Vercel critical path.

Pinned properties:
  - Posts from every handle land in the merged feed.
  - Sort: posted_at > captured_at > first_seen_at > "" (reverse order so
    newest is first). A regression in the key function reorders the
    static UI silently.
  - last_check: pick the newest checked_at across all handles (not the
    first handle's). A regression makes the status banner show stale
    data when the freshest handle is anywhere but position 0.
  - handle field: legacy comma-separated string for the existing UI.
  - handles field: list form for new clients.
  - saved_count: equals total merged-post count.
  - Empty handles list: falls back to DEFAULT_HANDLES[0] for the base
    dict — pins this surprising-but-documented side effect so an
    accidental empty input doesn't silently no-op.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402
from watcher import _combined_snapshot  # noqa: E402


def make_snapshot(
    handle: str,
    posts: list[dict[str, Any]],
    last_check: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "handle": handle,
        "saved_count": len(posts),
        "posts": posts,
        "last_check": last_check,
    }


@pytest.fixture
def stub_latest_snapshot(monkeypatch):
    """Replace db.latest_snapshot calls with a lookup-by-handle stub.

    Tests register snapshots via `register(handle, snapshot_dict)`; the
    stub returns whatever was registered for that handle (or an empty
    snapshot if unregistered).
    """
    registry: dict[str, dict[str, Any]] = {}

    def fake(conn: Any, handle: str) -> dict[str, Any]:
        return registry.get(handle, make_snapshot(handle, [], None))

    monkeypatch.setattr(watcher, "latest_snapshot", fake)

    def register(handle: str, snap: dict[str, Any]) -> None:
        registry[handle] = snap

    return register


# ── Happy path: merge multiple handles ────────────────────────────────


def test_merges_posts_from_every_handle(stub_latest_snapshot) -> None:
    stub_latest_snapshot("@a", make_snapshot("@a", [
        {"post_id": "a1", "posted_at": "2026-05-23T10:00:00Z"},
    ]))
    stub_latest_snapshot("@b", make_snapshot("@b", [
        {"post_id": "b1", "posted_at": "2026-05-23T11:00:00Z"},
    ]))
    result = _combined_snapshot(conn=None, handles=["@a", "@b"])
    ids = [p["post_id"] for p in result["posts"]]
    assert sorted(ids) == ["a1", "b1"]
    assert result["saved_count"] == 2


def test_sorts_newest_first_by_posted_at(stub_latest_snapshot) -> None:
    stub_latest_snapshot("@a", make_snapshot("@a", [
        {"post_id": "old", "posted_at": "2026-05-20T00:00:00Z"},
        {"post_id": "new", "posted_at": "2026-05-23T00:00:00Z"},
    ]))
    stub_latest_snapshot("@b", make_snapshot("@b", [
        {"post_id": "mid", "posted_at": "2026-05-22T00:00:00Z"},
    ]))
    result = _combined_snapshot(conn=None, handles=["@a", "@b"])
    assert [p["post_id"] for p in result["posts"]] == ["new", "mid", "old"]


def test_sort_key_falls_back_to_captured_at_then_first_seen_at(
    stub_latest_snapshot,
) -> None:
    # Pin the precedence: posted_at > captured_at > first_seen_at.
    # A regression that swaps the order would silently shuffle the
    # UI when posts lack one of the timestamps.
    stub_latest_snapshot("@a", make_snapshot("@a", [
        {"post_id": "by_posted_at", "posted_at": "2026-05-23T10:00:00Z",
         "captured_at": "1900-01-01T00:00:00Z"},
        {"post_id": "by_captured_at", "captured_at": "2026-05-23T09:00:00Z",
         "first_seen_at": "1900-01-01T00:00:00Z"},
        {"post_id": "by_first_seen", "first_seen_at": "2026-05-23T08:00:00Z"},
    ]))
    result = _combined_snapshot(conn=None, handles=["@a"])
    assert [p["post_id"] for p in result["posts"]] == [
        "by_posted_at",
        "by_captured_at",
        "by_first_seen",
    ]


def test_post_with_no_timestamps_sinks_to_end(stub_latest_snapshot) -> None:
    # The sort key falls through to "" — the post lands at the bottom
    # (reverse=True puts "" last). Without this, a post missing every
    # timestamp would sort unpredictably depending on dict iteration.
    stub_latest_snapshot("@a", make_snapshot("@a", [
        {"post_id": "timestamped", "posted_at": "2026-05-23T00:00:00Z"},
        {"post_id": "no_ts"},
    ]))
    result = _combined_snapshot(conn=None, handles=["@a"])
    assert [p["post_id"] for p in result["posts"]] == ["timestamped", "no_ts"]


# ── last_check selection ──────────────────────────────────────────────


def test_last_check_picks_newest_across_all_handles(stub_latest_snapshot) -> None:
    # Critical for the status-page banner: a regression that just
    # returned handles[0].last_check would silently show stale data
    # whenever a later-position handle had the freshest check.
    stub_latest_snapshot("@first", make_snapshot("@first", [],
        last_check={"checked_at": "2026-05-23T00:00:00Z", "status": "ok"},
    ))
    stub_latest_snapshot("@later", make_snapshot("@later", [],
        last_check={"checked_at": "2026-05-23T12:00:00Z", "status": "ok"},
    ))
    result = _combined_snapshot(conn=None, handles=["@first", "@later"])
    assert result["last_check"]["checked_at"] == "2026-05-23T12:00:00Z"


def test_last_check_is_none_when_every_handle_has_none(
    stub_latest_snapshot,
) -> None:
    stub_latest_snapshot("@a", make_snapshot("@a", [], last_check=None))
    stub_latest_snapshot("@b", make_snapshot("@b", [], last_check=None))
    result = _combined_snapshot(conn=None, handles=["@a", "@b"])
    assert result["last_check"] is None


def test_last_check_filters_out_none_when_one_handle_has_data(
    stub_latest_snapshot,
) -> None:
    # Mixed shape: one handle has a check, another doesn't. The None
    # must NOT crash the sort key (str(None.get(...)) would AttributeError).
    stub_latest_snapshot("@a", make_snapshot("@a", [], last_check=None))
    stub_latest_snapshot("@b", make_snapshot("@b", [],
        last_check={"checked_at": "2026-05-23T00:00:00Z", "status": "ok"},
    ))
    result = _combined_snapshot(conn=None, handles=["@a", "@b"])
    assert result["last_check"] is not None
    assert result["last_check"]["checked_at"] == "2026-05-23T00:00:00Z"


# ── handle / handles fields ───────────────────────────────────────────


def test_handle_field_is_legacy_comma_separated_string(
    stub_latest_snapshot,
) -> None:
    # The existing static UI reads `handle` as a string. Pin the
    # comma-separated form so a future "use the list" refactor
    # explicitly updates this test.
    stub_latest_snapshot("@a", make_snapshot("@a", []))
    stub_latest_snapshot("@b", make_snapshot("@b", []))
    result = _combined_snapshot(conn=None, handles=["@a", "@b"])
    assert result["handle"] == "@a, @b"
    assert result["handles"] == ["@a", "@b"]


# ── Empty handles list edge case ──────────────────────────────────────


def test_empty_handles_falls_back_to_default_handle_for_base_dict(
    stub_latest_snapshot,
    monkeypatch,
) -> None:
    # Documented surprising behavior: empty input triggers a DB query
    # to DEFAULT_HANDLES[0]. Pin this so a future "raise on empty"
    # refactor breaks the test explicitly rather than silently
    # changing semantics.
    monkeypatch.setattr(watcher, "DEFAULT_HANDLES", ["@fallback"])
    stub_latest_snapshot("@fallback", make_snapshot("@fallback", [
        {"post_id": "fallback_only", "posted_at": "2026-05-23T00:00:00Z"},
    ]))
    result = _combined_snapshot(conn=None, handles=[])
    # The base dict came from the fallback snapshot — but the posts/
    # handles/last_check overrides apply.
    assert result["handles"] == []
    assert result["handle"] == ""  # ", ".join([])
    assert result["posts"] == []   # merged from snapshots=[], not the fallback
    assert result["saved_count"] == 0
