"""Unit tests for the SPA-hydration-aware post-id collector.

The real call samples a live Playwright page every ~750 ms and waits up to
15 s for the set of post links to stop growing. Here we substitute a tiny
FakePage that returns scripted hrefs across iterations and inject a
controllable monotonic clock, so each test runs in microseconds and the
guard logic (`stable_reads >= 3`, `min_wait`, `max_wait`) is verified
without touching Playwright or wall time.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from watcher import collect_post_ids_until_stable  # noqa: E402


HANDLE = "@hal.lifedesign"


class FakePage:
    """Mimics the subset of playwright.sync_api.Page used by the collector."""

    def __init__(self, scripted_hrefs: list[list[str]]):
        self._reads = list(scripted_hrefs)
        self._last = scripted_hrefs[-1] if scripted_hrefs else []
        self.read_count = 0
        self.wait_calls: list[int] = []

    def eval_on_selector_all(self, _selector: str, _js: str) -> list[str]:
        self.read_count += 1
        if self._reads:
            return self._reads.pop(0)
        return list(self._last)  # repeat last forever

    def wait_for_timeout(self, ms: int) -> None:
        self.wait_calls.append(ms)


class FakeClock:
    """Each `tick()` advances by `step_ms`; passed via the `now` injection."""

    def __init__(self, step_ms: int = 1000):
        self._t = 0.0
        self._step = step_ms / 1000.0

    def __call__(self) -> float:
        t = self._t
        self._t += self._step
        return t


def _hrefs(handle: str, ids: list[str]) -> list[str]:
    h = handle.lstrip("@")
    return [f"/@{h}/post/{pid}" for pid in ids]


# ───────────────────────────────────────────────────────────────────────


def test_returns_grown_set_once_stable_and_past_min_wait() -> None:
    """4 anchors → 15 anchors (hydration) → 15 → 15 → 15 should return 15-set."""
    page = FakePage([
        _hrefs(HANDLE, [f"p{i}" for i in range(4)]),    # initial partial
        _hrefs(HANDLE, [f"p{i}" for i in range(15)]),   # hydrated
        _hrefs(HANDLE, [f"p{i}" for i in range(15)]),   # stable 1
        _hrefs(HANDLE, [f"p{i}" for i in range(15)]),   # stable 2
        _hrefs(HANDLE, [f"p{i}" for i in range(15)]),   # stable 3 → return
    ])
    clock = FakeClock(step_ms=1000)  # each now() call advances 1s
    result = collect_post_ids_until_stable(
        page, HANDLE,
        min_wait_ms=1_500, max_wait_ms=10_000, poll_ms=0, now=clock,
    )
    assert len(result) == 15
    assert result[0] == "p0"


def test_returns_empty_when_handle_never_has_posts_after_max_wait() -> None:
    """All reads return [] — should hit max_wait deadline and return []."""
    page = FakePage([[] for _ in range(20)])
    clock = FakeClock(step_ms=200)
    result = collect_post_ids_until_stable(
        page, HANDLE,
        min_wait_ms=500, max_wait_ms=1_000, poll_ms=0, now=clock,
    )
    assert result == []


def test_keeps_growing_set_until_max_wait_returns_largest_so_far() -> None:
    """Set keeps growing past max_wait — return the largest observed."""
    page = FakePage([
        _hrefs(HANDLE, [f"p{i}" for i in range(3)]),
        _hrefs(HANDLE, [f"p{i}" for i in range(6)]),
        _hrefs(HANDLE, [f"p{i}" for i in range(9)]),
        _hrefs(HANDLE, [f"p{i}" for i in range(12)]),
        _hrefs(HANDLE, [f"p{i}" for i in range(20)]),
    ])
    clock = FakeClock(step_ms=600)  # advances 0.6s per now() call → max=2s hit fast
    result = collect_post_ids_until_stable(
        page, HANDLE,
        min_wait_ms=10_000, max_wait_ms=2_000, poll_ms=0, now=clock,
    )
    # Must be the largest grown set seen before max_wait fired
    assert len(result) >= 6
    assert result[0] == "p0"


def test_min_wait_blocks_early_return_even_when_stable() -> None:
    """3 stable reads immediately, but min_wait must elapse first."""
    page = FakePage([
        _hrefs(HANDLE, ["only"]),
        _hrefs(HANDLE, ["only"]),
        _hrefs(HANDLE, ["only"]),
        _hrefs(HANDLE, ["only"]),
        _hrefs(HANDLE, ["only"]),
    ])
    # Each now() call moves time +100ms; min_wait_ms=500 means
    # we need ~5 now() calls before min_deadline is met.
    clock = FakeClock(step_ms=100)
    result = collect_post_ids_until_stable(
        page, HANDLE,
        min_wait_ms=500, max_wait_ms=10_000, poll_ms=0, now=clock,
    )
    assert result == ["only"]
    # Should have polled at least a few times before returning
    assert page.read_count >= 3


def test_filters_other_handles_posts() -> None:
    """A mix of two handles should only return ours, even when polling."""
    other = "/@other.user/post/THEIRS"
    page = FakePage([
        [other],
        [other, *_hrefs(HANDLE, ["MINE_1", "MINE_2"])],
        _hrefs(HANDLE, ["MINE_1", "MINE_2"]),
        _hrefs(HANDLE, ["MINE_1", "MINE_2"]),
        _hrefs(HANDLE, ["MINE_1", "MINE_2"]),
    ])
    clock = FakeClock(step_ms=400)
    result = collect_post_ids_until_stable(
        page, HANDLE,
        min_wait_ms=300, max_wait_ms=5_000, poll_ms=0, now=clock,
    )
    assert result == ["MINE_1", "MINE_2"]


def test_invokes_wait_for_timeout_with_poll_ms() -> None:
    """The injected poll_ms must be honoured (real run uses 750ms)."""
    page = FakePage([
        _hrefs(HANDLE, ["a"]),
        _hrefs(HANDLE, ["a"]),
        _hrefs(HANDLE, ["a"]),
        _hrefs(HANDLE, ["a"]),
        _hrefs(HANDLE, ["a"]),
    ])
    clock = FakeClock(step_ms=200)
    collect_post_ids_until_stable(
        page, HANDLE,
        min_wait_ms=400, max_wait_ms=5_000, poll_ms=123, now=clock,
    )
    assert page.wait_calls, "wait_for_timeout should have been called at least once"
    assert all(ms == 123 for ms in page.wait_calls)


def test_zero_then_grow_resets_stable_reads_counter() -> None:
    """A late growth restarts the stability window."""
    page = FakePage([
        _hrefs(HANDLE, ["a"]),                       # best = [a]
        _hrefs(HANDLE, ["a"]),                       # stable 1
        _hrefs(HANDLE, ["a", "b"]),                  # grew → reset stable
        _hrefs(HANDLE, ["a", "b"]),                  # stable 1
        _hrefs(HANDLE, ["a", "b"]),                  # stable 2
        _hrefs(HANDLE, ["a", "b"]),                  # stable 3 → return
    ])
    clock = FakeClock(step_ms=1_500)  # >> min_wait so it's only stable_reads that gates
    result = collect_post_ids_until_stable(
        page, HANDLE,
        min_wait_ms=1_000, max_wait_ms=20_000, poll_ms=0, now=clock,
    )
    assert result == ["a", "b"]
