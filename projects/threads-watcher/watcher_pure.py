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
from typing import Any, Callable


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
