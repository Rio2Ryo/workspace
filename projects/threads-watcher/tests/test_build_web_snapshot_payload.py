"""Runtime validation tests for build_web_snapshot_payload.

The meta-lint in test_snapshot_contract_drift.py catches contract
drift at PR time (constants in 3 files must agree). This file
catches the symmetric runtime case: a caller (or a buggy
db.latest_snapshot) hands the builder an input dict that's missing
a required field.

Before this commit the builder raised `KeyError('handle')` (or
whichever key was accessed first). Operators reading the log saw
no indication that:
  (a) the failure was at the SNAPSHOT layer, not the SQL layer
  (b) which set of fields was expected

The new `MissingSnapshotInputError` (a KeyError subclass so
existing `except KeyError` paths still catch it) names the missing
fields explicitly.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from watcher_pure import (  # noqa: E402
    REQUIRED_INPUT_FIELDS,
    MissingSnapshotInputError,
    build_web_snapshot_payload,
)


def valid_input() -> dict:
    """Minimal valid input — every REQUIRED_INPUT_FIELDS key present
    plus the optional fields set to None (deploy.sh PRESENCE check
    accepts None — value validation is a separate concern)."""
    return {
        "handle": "@bmw_intokyo",
        "last_check": None,
        "saved_count": 0,
        "posts": [],
    }


# ── Happy path: validation lets valid input through ───────────────────


def test_valid_input_returns_full_payload() -> None:
    payload = build_web_snapshot_payload(
        snapshot=valid_input(),
        dry_run_alert=None,
        generated_at="2026-05-23T00:00:00Z",
    )
    assert payload["handle"] == "@bmw_intokyo"
    assert payload["saved_count"] == 0
    assert payload["snapshot_generated_at"] == "2026-05-23T00:00:00Z"


def test_extra_input_fields_are_tolerated() -> None:
    # Forward-compat: a future db.latest_snapshot adding a new field
    # must not break the builder. Only REQUIRED_INPUT_FIELDS are
    # mandatory; extras pass through unmentioned.
    snap = valid_input()
    snap["future_field_X"] = "anything"
    payload = build_web_snapshot_payload(
        snapshot=snap,
        dry_run_alert=None,
        generated_at="2026-05-23T00:00:00Z",
    )
    # The extra field is not part of the published payload (builder
    # is an explicit allowlist), but it must not crash the build.
    assert "future_field_X" not in payload


# ── Validation: missing required fields ───────────────────────────────


@pytest.mark.parametrize("missing_field", sorted(REQUIRED_INPUT_FIELDS))
def test_missing_any_single_required_field_raises_with_name(
    missing_field: str,
) -> None:
    snap = valid_input()
    del snap[missing_field]
    with pytest.raises(MissingSnapshotInputError) as exc:
        build_web_snapshot_payload(
            snapshot=snap,
            dry_run_alert=None,
            generated_at="2026-05-23T00:00:00Z",
        )
    # The missing field name appears in the message so log scrapers
    # and humans can fix the issue without re-running with a debugger.
    assert missing_field in str(exc.value)
    # The full required set is shown so the operator knows what the
    # complete contract looks like, not just the field they tripped.
    for required in REQUIRED_INPUT_FIELDS:
        assert required in str(exc.value)


def test_missing_multiple_fields_names_all_in_sorted_order() -> None:
    # When two callers regress at once (rare but real), all missing
    # fields must surface in the same run so the operator fixes the
    # whole gap, not one at a time.
    snap = valid_input()
    del snap["handle"]
    del snap["posts"]
    with pytest.raises(MissingSnapshotInputError) as exc:
        build_web_snapshot_payload(
            snapshot=snap,
            dry_run_alert=None,
            generated_at="2026-05-23T00:00:00Z",
        )
    msg = str(exc.value)
    assert "handle" in msg
    assert "posts" in msg
    # Sorted-list shape pins the deterministic message format that
    # alert templates / log greps can rely on. With dict-key ordering
    # the message would vary turn-to-turn on rebuilds — bad UX.
    # Confirm "handle" appears before "posts" (sorted).
    assert msg.index("handle") < msg.index("posts")


def test_empty_input_raises_naming_every_required_field() -> None:
    # The "callers pass an empty {}" failure mode (most likely cause:
    # JSON parse returns {} for a corrupt file). Must NOT raise a
    # cryptic `KeyError('handle')` — the error names ALL 4 expected
    # fields so the operator sees the full contract.
    with pytest.raises(MissingSnapshotInputError) as exc:
        build_web_snapshot_payload(
            snapshot={},
            dry_run_alert=None,
            generated_at="2026-05-23T00:00:00Z",
        )
    msg = str(exc.value)
    for required in REQUIRED_INPUT_FIELDS:
        assert required in msg


# ── Subclassing contract (don't break existing except paths) ──────────


def test_missing_snapshot_input_error_is_a_keyerror_subclass() -> None:
    # If existing call sites use `except KeyError`, they must still
    # catch MissingSnapshotInputError — replacing the named class with
    # a plain Exception would silently change which callers swallow
    # the failure.
    assert issubclass(MissingSnapshotInputError, KeyError)
    # Concrete `except KeyError` smoke check: the caught instance is
    # the same object, not a generic re-raise.
    snap = valid_input()
    del snap["handle"]
    caught: KeyError | None = None
    try:
        build_web_snapshot_payload(
            snapshot=snap,
            dry_run_alert=None,
            generated_at="2026-05-23T00:00:00Z",
        )
    except KeyError as e:
        caught = e
    assert caught is not None
    assert isinstance(caught, MissingSnapshotInputError)


# ── REQUIRED_INPUT_FIELDS is a subset of the builder's output keys ────


def test_required_input_fields_are_also_emitted_in_the_output() -> None:
    # Sanity invariant: if a field is required as input, it must also
    # appear in the output (otherwise the builder accesses it for
    # nothing and the requirement is vestigial). Catches a future
    # refactor that "simplifies" the constant without removing the
    # corresponding snapshot[...] access.
    output_keys = set(build_web_snapshot_payload(
        snapshot=valid_input(),
        dry_run_alert=None,
        generated_at="2026-05-23T00:00:00Z",
    ).keys())
    assert REQUIRED_INPUT_FIELDS <= output_keys
