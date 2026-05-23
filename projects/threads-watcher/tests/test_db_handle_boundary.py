"""Pin defensive handle normalization at every db.py public-function boundary.

After commits 3e08eaa (watcher.py) and bc2d4af (import_existing
shared helper) the in-app paths normalize handles before calling
into db.py. This file pins the LAST line of defense: every db.py
function that accepts `handle` normalizes it on entry, so a future
caller that forgets to (a direct sqlite3 user, a one-off script,
a refactor) cannot plant or query mixed-case rows that fragment
the data across normalize-aware and normalize-naive code paths.

Tested functions (all 6 db.py handle-taking publics):
  - get_seen_post_ids        (SELECT)
  - save_post_screenshot     (INSERT)
  - update_post_screenshot   (UPDATE)
  - record_check             (INSERT)
  - recent_stats             (SELECT)
  - latest_snapshot          (SELECT)

Property under test: each function treats `"BMW_intokyo"` /
`"@BMW_intokyo"` / `"@@bmw_intokyo"` / `"@bmw_intokyo"` as the
same canonical key. Writes land under @bmw_intokyo; reads find
those writes regardless of input form.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import (  # noqa: E402
    connect,
    get_seen_post_ids,
    init_db,
    latest_snapshot,
    record_check,
    recent_stats,
    save_post_screenshot,
    update_post_screenshot,
)


@pytest.fixture
def conn(tmp_path: Path) -> sqlite3.Connection:
    c = connect(tmp_path / "th.db")
    init_db(c)
    return c


# All 4 inputs that must collapse to the same canonical "@bmw_intokyo".
HANDLE_INPUTS = ["BMW_intokyo", "@BMW_intokyo", "@@bmw_intokyo", "@bmw_intokyo"]


# ── Write boundary ────────────────────────────────────────────────────


@pytest.mark.parametrize("input_handle", HANDLE_INPUTS)
def test_save_post_screenshot_normalizes_handle_on_insert(
    conn: sqlite3.Connection, input_handle: str
) -> None:
    save_post_screenshot(
        conn,
        handle=input_handle,
        post_id="abc",
        post_url="https://x/p/abc",
        first_seen_at="2026-05-23T00:00:00Z",
        captured_at="2026-05-23T00:00:00Z",
        screenshot_png=b"P" * 100,
        width=10,
        height=10,
    )
    stored = [r["handle"] for r in conn.execute("SELECT handle FROM posts")]
    assert stored == ["@bmw_intokyo"]


@pytest.mark.parametrize("input_handle", HANDLE_INPUTS)
def test_record_check_normalizes_handle_on_insert(
    conn: sqlite3.Connection, input_handle: str
) -> None:
    record_check(
        conn,
        handle=input_handle,
        checked_at="2026-05-23T00:00:00Z",
        found_count=1,
        new_count=0,
        status="ok",
    )
    stored = [r["handle"] for r in conn.execute("SELECT handle FROM checks")]
    assert stored == ["@bmw_intokyo"]


@pytest.mark.parametrize("input_handle", HANDLE_INPUTS)
def test_update_post_screenshot_matches_existing_via_canonical(
    conn: sqlite3.Connection, input_handle: str
) -> None:
    # Seed with the canonical form via the (now-defensive) save path.
    save_post_screenshot(
        conn,
        handle="@bmw_intokyo",
        post_id="abc",
        post_url="https://x/p/abc",
        first_seen_at="2026-05-23T00:00:00Z",
        captured_at="2026-05-23T00:00:00Z",
        screenshot_png=b"v1" * 50,
    )
    # Pre-fix: an operator passing mixed-case would UPDATE 0 rows
    # because the WHERE clause looked for the literal input. Now
    # the UPDATE finds the seeded row through any input variation.
    changed = update_post_screenshot(
        conn,
        handle=input_handle,
        post_id="abc",
        captured_at="2026-05-23T01:00:00Z",
        screenshot_png=b"v2" * 50,
    )
    assert changed is True
    row = conn.execute(
        "SELECT screenshot_png FROM posts WHERE handle = '@bmw_intokyo' AND post_id = 'abc'"
    ).fetchone()
    assert bytes(row["screenshot_png"]) == b"v2" * 50


# ── Read boundary ─────────────────────────────────────────────────────


@pytest.mark.parametrize("input_handle", HANDLE_INPUTS)
def test_get_seen_post_ids_finds_rows_regardless_of_input_case(
    conn: sqlite3.Connection, input_handle: str
) -> None:
    save_post_screenshot(
        conn,
        handle="@bmw_intokyo",
        post_id="abc",
        post_url="https://x/p/abc",
        first_seen_at="2026-05-23T00:00:00Z",
        captured_at="2026-05-23T00:00:00Z",
        screenshot_png=b"x" * 50,
    )
    assert get_seen_post_ids(conn, input_handle) == ["abc"]


@pytest.mark.parametrize("input_handle", HANDLE_INPUTS)
def test_recent_stats_aggregates_regardless_of_input_case(
    conn: sqlite3.Connection, input_handle: str
) -> None:
    # Use a long window (a year) so the test never flakes on the
    # SQL `datetime('now', '-N hours')` comparison.
    record_check(
        conn,
        handle="@bmw_intokyo",
        checked_at="2026-05-23T00:00:00Z",
        found_count=1,
        new_count=0,
        status="ok",
    )
    stats = recent_stats(conn, input_handle, window_hours=24 * 365)
    assert stats["total"] == 1
    assert stats["ok"] == 1


@pytest.mark.parametrize("input_handle", HANDLE_INPUTS)
def test_latest_snapshot_finds_posts_regardless_of_input_case(
    conn: sqlite3.Connection, input_handle: str
) -> None:
    save_post_screenshot(
        conn,
        handle="@bmw_intokyo",
        post_id="abc",
        post_url="https://x/p/abc",
        first_seen_at="2026-05-23T00:00:00Z",
        captured_at="2026-05-23T00:00:00Z",
        screenshot_png=b"x" * 50,
    )
    snap = latest_snapshot(conn, input_handle)
    # The returned `handle` field is the normalized form (the function
    # echoes back what it queried with).
    assert snap["handle"] == "@bmw_intokyo"
    assert snap["saved_count"] == 1
    assert snap["posts"][0]["post_id"] == "abc"


# ── Idempotency at the boundary ────────────────────────────────────────


def test_double_normalization_is_idempotent(conn: sqlite3.Connection) -> None:
    # Pre-normalized callers (today's watcher.py path) feed in
    # "@bmw_intokyo" — calling normalize_handle on it again must
    # return the same string. If a future refactor introduces a
    # non-idempotent transform (e.g., adding a prefix), the existing
    # callers' rows would break silently. This catches that class.
    from db import normalize_handle  # noqa: PLC0415

    canonical = "@bmw_intokyo"
    assert normalize_handle(normalize_handle(canonical)) == canonical
    assert normalize_handle(canonical) == canonical
