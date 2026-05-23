"""Unit tests for watcher.py handle normalization helpers.

Pre-existing code coverage: `_parse_handles`, `_parse_notify_handles`,
and `_normalize_handle` had zero direct test coverage. This file pins
their contract and catches three latent bugs:

  1. `_normalize_handle("")` returns "@" — a malformed handle that
     would leak into Discord notify URLs and screenshot filenames
     if an empty token ever bypassed the upstream `if h.strip()`
     filter (e.g., via direct call from a refactor).
  2. `_normalize_handle("@@foo")` returns "@@foo" — paste errors
     produce a handle that doesn't equal `_normalize_handle("foo")`.
  3. `_normalize_handle("Foo")` ≠ `_normalize_handle("foo")` — but
     Threads handles ARE case-insensitive (the URL
     threads.com/@Foo and /@foo resolve to the same profile), so
     an operator setting THREADS_WATCHER_NOTIFY_HANDLES=BMW_intokyo
     would silently fail to match incoming handle "bmw_intokyo" at
     line 84 of watcher.py and never get notified.

Live state was verified before fixing: all rows in posts.handle and
all entries in state.json are already lowercase, so making the
normalizer lowercase is a strict improvement — no live data shift.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from watcher import _normalize_handle, _parse_handles, _parse_notify_handles  # noqa: E402


# ── _normalize_handle ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Bare handle → @ prefix added.
        ("bmw_intokyo", "@bmw_intokyo"),
        # Already prefixed → unchanged shape.
        ("@bmw_intokyo", "@bmw_intokyo"),
        # Mixed case → lowercased (bug #3 fix). Threads handles are
        # case-insensitive at the URL level, so set membership must
        # not depend on the operator's env-var capitalization.
        ("BMW_intokyo", "@bmw_intokyo"),
        ("@BMW_intokyo", "@bmw_intokyo"),
        ("@HAL.lifeDesign", "@hal.lifedesign"),
        # Paste error: double-@. Without the strip, "@@foo" wouldn't
        # equal "@foo" so set membership would silently miss (bug #2).
        ("@@bmw_intokyo", "@bmw_intokyo"),
        ("@@@bmw_intokyo", "@bmw_intokyo"),
        # Empty input → empty string, NOT the malformed "@" the old
        # code returned. Callers already filter empties before calling
        # but the function is now safe under any future refactor (bug #1).
        ("", ""),
        ("@", ""),
        ("@@", ""),
    ],
)
def test_normalize_handle(raw: str, expected: str) -> None:
    assert _normalize_handle(raw) == expected


# ── _parse_handles (operator CLI / env-var entry) ─────────────────────


def test_parse_handles_comma_separated() -> None:
    assert _parse_handles("foo,bar,baz") == ["@foo", "@bar", "@baz"]


def test_parse_handles_strips_whitespace_around_tokens() -> None:
    # Operators routinely add spaces after commas; tolerate it.
    assert _parse_handles("foo , bar , baz") == ["@foo", "@bar", "@baz"]


def test_parse_handles_lowercases_via_normalize() -> None:
    # The whole point of channelling through _normalize_handle: env
    # casing variations all converge to the canonical form.
    assert _parse_handles("BMW_intokyo,@FooBar") == ["@bmw_intokyo", "@foobar"]


def test_parse_handles_empty_input_falls_back_to_default() -> None:
    # Empty raw must NOT produce an empty list (which would silently
    # stop watching every handle); it falls back to DEFAULT_HANDLES so
    # an operator forgetting to set --handle still gets the production
    # configuration's monitoring set.
    from watcher import DEFAULT_HANDLES  # noqa: PLC0415

    result = _parse_handles("")
    assert result == list(DEFAULT_HANDLES)
    assert len(result) > 0


def test_parse_handles_whitespace_only_falls_back_to_default() -> None:
    from watcher import DEFAULT_HANDLES  # noqa: PLC0415

    assert _parse_handles("   ") == list(DEFAULT_HANDLES)
    assert _parse_handles(",,") == list(DEFAULT_HANDLES)


def test_parse_handles_dedup_NOT_applied_returns_list() -> None:
    # Distinct from _parse_notify_handles (which dedups via set). The
    # ordered-list shape matters because run_watch iterates and the
    # operator may want a deliberate priority order — preserve.
    assert _parse_handles("foo,foo,bar") == ["@foo", "@foo", "@bar"]


# ── _parse_notify_handles (set semantics for membership test) ─────────


def test_parse_notify_handles_returns_set() -> None:
    # Set, not list — the call site at watcher.py:84 uses `in` for
    # membership; dedup matters less than the type signature.
    result = _parse_notify_handles("foo,bar,baz")
    assert isinstance(result, set)
    assert result == {"@foo", "@bar", "@baz"}


def test_parse_notify_handles_dedups() -> None:
    assert _parse_notify_handles("foo,foo,bar,@foo") == {"@foo", "@bar"}


def test_parse_notify_handles_empty_returns_empty_set() -> None:
    # Distinct from _parse_handles: empty notify env means "no filter
    # — notify on every handle that has a target set", NOT "use a
    # default list". Pin this so the two functions stay distinct.
    assert _parse_notify_handles("") == set()
    assert _parse_notify_handles(",,") == set()
    assert _parse_notify_handles("   ") == set()


def test_parse_notify_handles_lowercases() -> None:
    # The actual bug fix: env `BMW_intokyo` must match incoming
    # `bmw_intokyo` once both run through the normalizer.
    assert _parse_notify_handles("BMW_intokyo,@HAL.lifeDesign") == {
        "@bmw_intokyo",
        "@hal.lifedesign",
    }


def test_notify_membership_check_is_case_insensitive() -> None:
    # End-to-end of bug #3: assemble the same shape watcher.py:84
    # uses and assert the comparison succeeds across cases.
    notify_handles = _parse_notify_handles("BMW_intokyo")
    incoming_from_db = "@bmw_intokyo"
    incoming_uppercase = "@BMW_intokyo"
    # Both must be considered "in" the configured notify set.
    assert _normalize_handle(incoming_from_db) in notify_handles
    assert _normalize_handle(incoming_uppercase) in notify_handles
