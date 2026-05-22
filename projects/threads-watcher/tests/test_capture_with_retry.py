"""Tests for capture_with_retry — the exponential-backoff wrapper that
hardens watcher.run_once against transient Threads / Chromium failures.

Before this helper, `_screenshot_post` raising once caused the watcher
to record a partial_error and move on; the post was retried on the
next run only if it was still visible on the profile, so any post that
scrolled out before the next successful run was lost forever.

Real Playwright/Chromium is not exercised here. The retry decision,
sleep accounting, and error aggregation are exercised against synthetic
callables that fail/succeed on demand.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from watcher_pure import (  # noqa: E402
    RetryPolicy,
    WatchIterationTimeout,
    capture_with_retry,
    delay_for_attempt,
    should_retry,
)


# ── should_retry (pure decision table) ──────────────────────────────────


def test_should_retry_true_when_attempt_below_max_and_exc_retryable():
    assert should_retry(1, 3, RuntimeError("timeout")) is True


def test_should_retry_false_when_attempt_equals_max():
    # attempt is 1-indexed; attempt == max means "this was the last one"
    assert should_retry(3, 3, RuntimeError("timeout")) is False


def test_should_retry_false_for_typeerror_at_any_attempt():
    # TypeError almost always means the code is wrong, not the network.
    # Retrying just delays the fix.
    assert should_retry(1, 3, TypeError("bad arg")) is False
    assert should_retry(2, 3, TypeError("bad arg")) is False


def test_should_retry_false_for_keyerror_attributeerror_valueerror():
    assert should_retry(1, 3, KeyError("missing")) is False
    assert should_retry(1, 3, AttributeError("None has no x")) is False
    assert should_retry(1, 3, ValueError("bad input")) is False


# ── delay_for_attempt (pure exponential backoff) ────────────────────────


def test_delay_for_attempt_1_is_initial_delay():
    assert delay_for_attempt(1, RetryPolicy()) == 1.0


def test_delay_for_attempt_2_doubles_with_default_backoff():
    assert delay_for_attempt(2, RetryPolicy()) == 2.0


def test_delay_for_attempt_3_quadruples_with_default_backoff():
    assert delay_for_attempt(3, RetryPolicy()) == 4.0


def test_delay_for_attempt_respects_custom_backoff():
    p = RetryPolicy(initial_delay_s=0.5, backoff=3.0)
    assert delay_for_attempt(1, p) == 0.5
    assert delay_for_attempt(2, p) == 1.5
    assert delay_for_attempt(3, p) == 4.5


def test_delay_for_attempt_zero_or_negative_is_zero():
    # Defensive: a 0-th attempt has no meaning. Returning 0 here avoids
    # math.pow domain weirdness and a future signed-int bug from
    # propagating into a real sleep.
    assert delay_for_attempt(0, RetryPolicy()) == 0.0
    assert delay_for_attempt(-1, RetryPolicy()) == 0.0


# ── capture_with_retry (composite behaviour) ────────────────────────────


def _make_sleep_recorder() -> tuple[list[float], "callable"]:
    calls: list[float] = []
    return calls, lambda s: calls.append(s)


def test_returns_result_immediately_on_first_success():
    sleeps, sleep_fn = _make_sleep_recorder()
    result, errs = capture_with_retry(lambda: "ok", sleep_fn=sleep_fn)
    assert result == "ok"
    assert errs == []
    assert sleeps == []  # no retry, no sleep


def test_retries_then_succeeds_returns_result_and_partial_error_log():
    sleeps, sleep_fn = _make_sleep_recorder()
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError(f"transient #{calls['n']}")
        return "captured"

    result, errs = capture_with_retry(flaky, sleep_fn=sleep_fn)
    assert result == "captured"
    assert calls["n"] == 3
    # Two failures recorded with attempt-numbered prefixes
    assert errs == [
        "attempt 1/3: transient #1",
        "attempt 2/3: transient #2",
    ]
    # Sleep called twice (between attempts 1→2 and 2→3) with backoff sequence
    assert sleeps == [1.0, 2.0]


def test_all_attempts_fail_returns_none_with_full_error_log():
    sleeps, sleep_fn = _make_sleep_recorder()

    def always_fails():
        raise RuntimeError("network down")

    result, errs = capture_with_retry(always_fails, sleep_fn=sleep_fn)
    assert result is None
    assert len(errs) == 3  # default max_attempts
    assert all("network down" in e for e in errs)
    # Sleeps happen between attempts only — N-1 = 2
    assert sleeps == [1.0, 2.0]


def test_non_retryable_exception_breaks_loop_immediately():
    sleeps, sleep_fn = _make_sleep_recorder()
    calls = {"n": 0}

    def buggy():
        calls["n"] += 1
        raise TypeError("programmer error")

    result, errs = capture_with_retry(buggy, sleep_fn=sleep_fn)
    assert result is None
    assert calls["n"] == 1  # no retry attempted
    assert len(errs) == 1
    assert "programmer error" in errs[0]
    assert sleeps == []  # no sleep happened


def test_custom_policy_max_attempts_one_means_no_retry_at_all():
    sleeps, sleep_fn = _make_sleep_recorder()
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        raise RuntimeError("nope")

    result, errs = capture_with_retry(
        flaky,
        policy=RetryPolicy(max_attempts=1),
        sleep_fn=sleep_fn,
    )
    assert result is None
    assert calls["n"] == 1
    assert len(errs) == 1
    assert errs[0].startswith("attempt 1/1:")
    assert sleeps == []


def test_custom_policy_changes_backoff_sequence():
    sleeps, sleep_fn = _make_sleep_recorder()

    def always_fails():
        raise RuntimeError("x")

    capture_with_retry(
        always_fails,
        policy=RetryPolicy(max_attempts=4, initial_delay_s=0.1, backoff=10.0),
        sleep_fn=sleep_fn,
    )
    # 3 sleeps (between 4 attempts), each multiplied by backoff^(attempt-1)
    assert sleeps == [0.1, 1.0, 10.0]


def test_watchdog_timeout_propagates_and_is_not_retried():
    # WatchIterationTimeout means the SIGALRM watchdog fired — run_once
    # is over budget. capture_with_retry must re-raise it, NOT record it
    # and retry: the alarm is one-shot, so swallowing it here defeats
    # the watchdog (the run would continue past its deadline).
    sleeps, sleep_fn = _make_sleep_recorder()

    def times_out():
        raise WatchIterationTimeout("run_once for @a exceeded 180s")

    with pytest.raises(WatchIterationTimeout):
        capture_with_retry(
            times_out,
            policy=RetryPolicy(max_attempts=3, initial_delay_s=0.1),
            sleep_fn=sleep_fn,
        )
    # No retry sleep — it aborted on the first occurrence.
    assert sleeps == []


def test_returns_falsy_results_unchanged_not_treated_as_failure():
    # A capture_fn that returns 0, '', or [] is still a success — only
    # raised exceptions trigger retry. Pin so a future refactor that
    # adds `if not result: retry` doesn't sneak in.
    sleeps, sleep_fn = _make_sleep_recorder()
    for falsy in (0, "", [], False, None):
        result, errs = capture_with_retry(lambda v=falsy: v, sleep_fn=sleep_fn)
        assert result == falsy
        assert errs == []
    assert sleeps == []
