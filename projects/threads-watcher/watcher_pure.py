"""Playwright-free helpers from watcher.py.

Three functions in watcher.py are *pure* (or duck-typed against a Page
protocol) and have no business pulling in playwright at import time —
but until now they lived next to the browser-driving code, so importing
them for a unit test triggered `import playwright`, which broke in any
environment without it. Splitting them out lets the tests run in a bare
Python venv (no Chromium, no playwright wheel).

The originals remain re-exported from watcher.py so callers don't churn.

What lives here:
- extract_post_ids_from_hrefs: regex parse Threads /post/<id> from anchors
- collect_post_ids_until_stable: SPA-hydration-aware poller
- combine_error_messages: audit-log message merger
- _extract_post_ids: thin wrapper that pulls hrefs from a Page-like object
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, TypeVar


class WatchIterationTimeout(Exception):
    """run_once exceeded RUN_ONCE_TIMEOUT_S — raised by the SIGALRM
    watchdog. An Exception (not BaseException) so run_watch_tick's
    `except Exception` catches it and the loop continues.

    Lives here (not watcher.py) so capture_with_retry can re-raise it
    without importing the playwright-bound watcher module.
    """


def extract_post_ids_from_hrefs(hrefs: list[str | None], handle: str) -> list[str]:
    """Pure helper: extract unique Threads post IDs from anchor hrefs.

    Threads post URLs look like /@<handle>/post/<id>. We intentionally use
    href regex extraction rather than DOM selectors so a layout change is
    less likely to break detection.

    Returns IDs in first-seen (input) order, deduped, filtering out other
    handles' posts and unparseable hrefs.
    """
    handle_no_at = handle.lstrip("@")
    pattern = re.compile(rf"/@{re.escape(handle_no_at)}/post/([A-Za-z0-9_-]+)")
    seen: list[str] = []
    seen_set: set[str] = set()
    for href in hrefs:
        if not href:
            continue
        m = pattern.search(href)
        if not m:
            continue
        pid = m.group(1)
        if pid not in seen_set:
            seen_set.add(pid)
            seen.append(pid)
    return seen


def _extract_post_ids(page: Any, handle: str) -> list[str]:
    """Browser-side wrapper. Pulls hrefs from the live page, then delegates
    extraction to the pure helper above (so the regex logic stays testable).

    `page` is anything that exposes `eval_on_selector_all(selector, js)` —
    real callers pass a playwright Page; tests pass a duck-typed FakePage.
    """
    hrefs: list[str | None] = page.eval_on_selector_all(
        "a[href*='/post/']",
        "els => els.map(e => e.getAttribute('href'))",
    )
    return extract_post_ids_from_hrefs(hrefs, handle)


def collect_post_ids_until_stable(
    page: Any,
    handle: str,
    *,
    min_wait_ms: int = 7_500,
    max_wait_ms: int = 15_000,
    poll_ms: int = 750,
    now: Callable[[], float] = time.monotonic,
) -> list[str]:
    """Collect profile post IDs after the Threads SPA has hydrated.

    A single selector read right after ``domcontentloaded`` is flaky on Threads:
    the profile initially exposes only a few anchors, then the remaining visible
    post links are attached by client-side hydration.  The watcher previously
    captured that early partial state (for example 4 instead of 15), so keep
    sampling until the set stops growing briefly or the bounded wait expires.

    `poll_ms` and `now` are injected so tests can drive the loop deterministically.
    `page` is duck-typed: anything with `eval_on_selector_all` + `wait_for_timeout`.
    """
    started = now()
    min_deadline = started + (min_wait_ms / 1000)
    deadline = started + (max_wait_ms / 1000)
    best: list[str] = []
    stable_reads = 0
    while True:
        current = _extract_post_ids(page, handle)
        if len(current) > len(best):
            best = current
            stable_reads = 0
        else:
            stable_reads += 1

        if now() >= min_deadline and stable_reads >= 3 and best:
            return best
        if now() >= deadline:
            return best or current
        page.wait_for_timeout(poll_ms)


T = TypeVar("T")


@dataclass(frozen=True)
class RetryPolicy:
    """How aggressively to retry a flaky capture.

    Defaults: 3 attempts total (1 initial + 2 retries), starting at 1s and
    doubling. Sums to ~3s of added latency in the worst case before giving
    up — small enough to not stretch the run_once budget meaningfully, big
    enough to ride out a typical Threads transient.
    """

    max_attempts: int = 3
    initial_delay_s: float = 1.0
    backoff: float = 2.0


# Exceptions that almost always mean "the code is wrong, not the network."
# Retrying them just delays the failure. Keep this small and conservative —
# adding new types here weakens the safety net.
_NON_RETRYABLE: tuple[type[BaseException], ...] = (
    TypeError,
    ValueError,
    KeyError,
    AttributeError,
)


def should_retry(attempt: int, max_attempts: int, exc: BaseException) -> bool:
    """Pure decision: is one more attempt justified?

    `attempt` is 1-indexed (the one that just failed).
    """
    if attempt >= max_attempts:
        return False
    if isinstance(exc, _NON_RETRYABLE):
        return False
    return True


def delay_for_attempt(attempt: int, policy: RetryPolicy) -> float:
    """Pure: exponential backoff for the *next* sleep before attempt+1.

    delay = initial_delay_s * (backoff ** (attempt - 1)).
    So with defaults: attempt 1 → 1.0s, attempt 2 → 2.0s, attempt 3 → 4.0s.
    """
    if attempt < 1:
        return 0.0
    return policy.initial_delay_s * (policy.backoff ** (attempt - 1))


def capture_with_retry(
    capture_fn: Callable[[], T],
    *,
    policy: RetryPolicy = RetryPolicy(),
    sleep_fn: Callable[[float], None] = time.sleep,
) -> tuple[T | None, list[str]]:
    """Retry a flaky capture up to policy.max_attempts.

    Returns ``(result, attempt_errors)``:
      - On success: ``(<callable's result>, errors_for_attempts_that_failed)``
      - On total failure: ``(None, errors_for_all_attempts)``

    Each error string is prefixed with ``"attempt N/M: "`` so the audit log
    can show how many attempts were spent. ``sleep_fn`` is injected for
    deterministic tests; production passes ``time.sleep``.
    """
    errors: list[str] = []
    for attempt in range(1, policy.max_attempts + 1):
        try:
            result = capture_fn()
            return result, errors
        except WatchIterationTimeout:
            # The SIGALRM watchdog fired — run_once is over budget.
            # Swallowing it here (recording an error + retrying with a
            # sleep) would defeat the watchdog entirely: the alarm is
            # one-shot, so it never gets another chance to cut the run
            # off. Propagate so run_once aborts as intended.
            raise
        except Exception as exc:  # noqa: BLE001 — record every failure + re-decide
            # `Exception`, not `BaseException`: KeyboardInterrupt and
            # SystemExit are process-termination signals, not flaky
            # captures — retrying (record + sleep) them is wrong. They
            # are BaseException-not-Exception, so they propagate here.
            errors.append(f"attempt {attempt}/{policy.max_attempts}: {exc}")
            if not should_retry(attempt, policy.max_attempts, exc):
                break
            sleep_fn(delay_for_attempt(attempt, policy))
    return None, errors


@dataclass(frozen=True)
class CaptureOutcome:
    """Result of processing one post in watcher.run_once's loop.

    The caller folds these fields into shared run-scoped state
    (`new_count`, `capture_errors`, `status`) and replays the log lines
    to stdout/stderr. Keeping the outcome a pure value lets us unit-test
    the entire per-post decision without booting Chromium.
    """

    new_inserted: bool
    """True if a new row landed in the posts table this iteration."""

    capture_error: str | None
    """When non-None, append to the run-level capture_errors list. Already
    pid-prefixed so the audit log read makes sense out of context."""

    became_partial_error: bool
    """When True, the caller should flip the run-level status to
    'partial_error'. Decoupled from capture_error so we can in theory
    record an error message without escalating status, though right now
    they always travel together."""

    info_log: list[str] = field(default_factory=list)
    """Lines for stdout (saved/skip success paths)."""

    error_log: list[str] = field(default_factory=list)
    """Lines for stderr (capture exhausted, DB write failed)."""


def process_post_capture(
    *,
    pid: str,
    handle: str,
    project_root: Path,
    screenshot_fn: Callable[[], dict[str, Any]],
    save_fn: Callable[..., bool],
    now_iso_fn: Callable[[], str],
    retry_policy: "RetryPolicy" = None,  # type: ignore[assignment]
    sleep_fn: Callable[[float], None] = time.sleep,
) -> CaptureOutcome:
    """Capture-and-persist one post; return the outcome as a value.

    `screenshot_fn` is the already-bound network/Chromium step (no args).
    It returns the dict produced by watcher._screenshot_post (post_url,
    png bytes, path, width, height).

    `save_fn` is the already-bound DB writer (`save_post_screenshot`
    with `conn` pre-applied). It returns True if a new row was inserted,
    False on duplicate.

    `now_iso_fn` is called *twice*: once for first_seen_at before the
    retry loop, once for captured_at right before the DB insert. The
    captured_at timestamp therefore reflects when the capture actually
    landed, not when the post was first noticed.
    """
    if retry_policy is None:
        retry_policy = RetryPolicy()

    first_seen_at = now_iso_fn()
    captured, attempt_errors = capture_with_retry(
        screenshot_fn, policy=retry_policy, sleep_fn=sleep_fn,
    )

    if captured is None:
        last = attempt_errors[-1] if attempt_errors else "unknown"
        return CaptureOutcome(
            new_inserted=False,
            capture_error=(
                f"{pid}: capture exhausted retries [{'; '.join(attempt_errors)}]"
            ),
            became_partial_error=True,
            error_log=[
                f"[error] failed to capture {pid} after {len(attempt_errors)} attempt(s): {last}"
            ],
        )

    try:
        local_rel_path = str(Path(captured["path"]).relative_to(project_root))
        inserted = save_fn(
            handle=handle,
            post_id=pid,
            post_url=captured["post_url"],
            first_seen_at=first_seen_at,
            captured_at=now_iso_fn(),
            screenshot_png=captured["png"],
            width=captured["width"],
            height=captured["height"],
            local_path=local_rel_path,
            post_text=captured.get("post_text"),
            posted_at=captured.get("posted_at"),
        )
    except Exception as e:  # noqa: BLE001 — must catch sqlite errors
        return CaptureOutcome(
            new_inserted=False,
            capture_error=f"{pid}: db write failed: {e}",
            became_partial_error=True,
            error_log=[f"[error] DB write failed for {pid}: {e}"],
        )

    if inserted:
        retry_note = (
            f" (after {len(attempt_errors)} retry/retries)" if attempt_errors else ""
        )
        return CaptureOutcome(
            new_inserted=True,
            capture_error=None,
            became_partial_error=False,
            info_log=[
                f"[saved-db] {pid} bytes={len(captured['png'])} local={local_rel_path}{retry_note}"
            ],
        )

    return CaptureOutcome(
        new_inserted=False,
        capture_error=None,
        became_partial_error=False,
        info_log=[f"[skip] {pid} already exists in DB"],
    )


def combine_error_messages(base: str | None, capture_errors: list[str]) -> str | None:
    """Merge an optional base reason with per-post capture failures.

    `base` is the partial-result reason from `judge_partial_error` (may be None).
    `capture_errors` is a list of "post_id: <exception str>" entries collected
    while iterating new posts. Either, both, or neither may be present.

    Returns the combined audit-log message, or None when there's nothing to say.
    Without this, per-post failures previously vanished from `checks.error`.
    """
    if not capture_errors:
        return base
    failure_summary = "capture_failures: " + "; ".join(capture_errors)
    if base:
        return f"{base} | {failure_summary}"
    return failure_summary


# Private post fields that must NEVER reach the public state.json:
# raw screenshot bytes (privacy + payload size) and local filesystem
# paths (info disclosure). Mirrors sync_guards.FORBIDDEN_POST_KEYS and
# deploy.sh's FORBIDDEN_KEYS_CSV — the same set, enforced at three
# layers: this generator chokepoint, sync.py's snapshot_sanity_check,
# and deploy.sh's pre-flight / post-deploy verify.
FORBIDDEN_POST_KEYS = frozenset({"screenshot_png", "local_path"})


def _sanitize_post(post: Any) -> Any:
    """Return a copy of `post` with forbidden private keys removed.

    The browser-safe `screenshot_path` (a relative URL added by
    watcher._write_web_snapshot_from_db) is intentionally kept — only
    the raw bytes / host path are stripped. Non-dict entries pass
    through untouched so a malformed posts list can't crash the build.
    """
    if not isinstance(post, dict):
        return post
    return {k: v for k, v in post.items() if k not in FORBIDDEN_POST_KEYS}


def build_web_snapshot_payload(
    snapshot: dict[str, Any],
    dry_run_alert: dict | None,
    generated_at: str,
) -> dict[str, Any]:
    """Pure builder for the threads-watcher-status/state.json payload.

    Extracted from watcher._write_web_snapshot_from_db so the public
    snapshot shape is testable without importing playwright (which
    pulls in browser binaries). The thin file-writer in watcher.py
    just calls this + writes; all field-presence / sanitisation logic
    is here.

    Sanitisation: each post is passed through `_sanitize_post`, which
    drops FORBIDDEN_POST_KEYS. The DB projection (db.latest_snapshot)
    already selects only safe columns, so this is defence-in-depth —
    a future `SELECT *` regression, or a caller that hand-builds a
    snapshot, still cannot leak screenshot bytes / host paths to the
    public page through this chokepoint.

    `dry_run_alert` is either None (no active streak — UI hides the
    banner) or {pending_ticks, since, delta}. Surfaces sync.py's
    "promote to --confirm" signal, previously only visible via
    `grep ALERT logs/sync.log`.
    """
    return {
        "handle": snapshot["handle"],
        "handles": snapshot.get("handles"),
        "last_check": snapshot["last_check"],
        "saved_count": snapshot["saved_count"],
        "posts": [_sanitize_post(p) for p in snapshot["posts"]],
        "recent_stats": snapshot.get("recent_stats"),
        "recent_stats_by_window": snapshot.get("recent_stats_by_window"),
        "sync_state": snapshot.get("sync_state"),
        "dry_run_alert": dry_run_alert,
        "snapshot_generated_at": generated_at,
    }
