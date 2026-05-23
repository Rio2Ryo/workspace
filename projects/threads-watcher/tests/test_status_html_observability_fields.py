"""Contract test for the threads-watcher-status/index.html dashboard:
the JS must render every observability field that recent_stats now
emits, with matching DOM anchors.

Why this exists
---------------
The recent_stats observability extension (partial_error_rate +
top_partial_error_reason) is only useful if the dashboard actually
RENDERS those fields. The 2026-05-23 sticky-regime regression went
unnoticed for ~5 days largely because the dashboard surfaced only
success_rate / counts and not the dominant-error signature. The
data was always in the JSON; nothing in the UI displayed it.

This test catches:
  - JS uses `data.foo` but no `<span id="foo">` to write into
  - HTML adds `<span id="bar">` but JS never populates it
  - A future refactor that drops one side without the other
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INDEX_HTML = PROJECT_ROOT / "threads-watcher-status" / "index.html"


@pytest.fixture(scope="module")
def html() -> str:
    return INDEX_HTML.read_text(encoding="utf-8")


def _has_id(html: str, dom_id: str) -> bool:
    # Loose match — any HTML element with `id="<dom_id>"`.
    return bool(re.search(rf'\bid\s*=\s*"{re.escape(dom_id)}"', html))


def _js_reads(html: str, field: str) -> bool:
    # The JS reads `rs.<field>` (the recent_stats object). Pin both
    # `.field` access AND any quoted lookup so a future refactor to
    # bracket syntax still trips.
    return f"rs.{field}" in html or f"['{field}']" in html or f'["{field}"]' in html


def test_partial_error_rate_has_dom_anchor(html: str):
    # The DOM element the JS writes into. Without this, the JS
    # `getElementById('rs-partial-rate').textContent = …` is a no-op
    # against a null element and crashes the entire script.
    assert _has_id(html, "rs-partial-rate"), (
        "index.html must declare `<span id=\"rs-partial-rate\">` so the "
        "JS can render the partial_error_rate field."
    )


def test_partial_error_rate_is_read_by_js(html: str):
    # The JS must actually consume the field from the JSON payload.
    assert _js_reads(html, "partial_error_rate"), (
        "JS must read rs.partial_error_rate from the JSON payload."
    )


def test_top_partial_error_reason_has_dom_anchors(html: str):
    # The reason cell + the row wrapper (the row is toggled visible
    # only when there IS a reason, hidden when total partial_error=0).
    assert _has_id(html, "rs-top-reason"), (
        "index.html must declare `<span id=\"rs-top-reason\">` for the "
        "reason text cell."
    )
    assert _has_id(html, "rs-top-reason-row"), (
        "index.html must declare `id=\"rs-top-reason-row\"` for the "
        "toggleable row wrapper (hidden when no partial_error in window)."
    )


def test_top_partial_error_reason_is_read_by_js(html: str):
    assert _js_reads(html, "top_partial_error_reason"), (
        "JS must read rs.top_partial_error_reason from the JSON payload."
    )


def test_top_reason_row_starts_hidden(html: str):
    # Default `display:none` so the row only appears when there's a
    # reason to display. Otherwise an empty "—" row sits on the
    # dashboard regardless of whether the data is meaningful.
    m = re.search(
        r'id="rs-top-reason-row"[^>]*style="([^"]*)"',
        html,
    )
    assert m is not None, "rs-top-reason-row must have an inline style attribute"
    assert "display:none" in m.group(1).replace(" ", ""), (
        f"rs-top-reason-row must start with display:none so it stays "
        f"hidden until JS sets it. Got style={m.group(1)!r}"
    )


def test_partial_error_rate_visual_threshold_present(html: str):
    # Operator-visible cue: high partial_error_rate gets the `err`
    # class for red text. Without a threshold the metric is just text
    # and the 92.9% case looks the same as the 5% case.
    # Pin: the JS has at least one `>=` comparison against a numeric
    # threshold for peRate that adds the .err class.
    pattern = re.compile(
        r"peRate\s*>=?\s*0\.\d+[\s\S]{0,200}classList\.add\(['\"]err['\"]\)"
    )
    assert pattern.search(html) is not None, (
        "JS must threshold partial_error_rate and add .err class when "
        "the rate is high (sticky-regime visual cue)."
    )


def test_recent_stats_card_section_exists(html: str):
    # Sanity — the existing card structure that holds the new rows.
    # If this regresses, the new rows might be orphaned in a
    # different layout location.
    assert _has_id(html, "recent-stats")
    assert _has_id(html, "rs-total")
    assert _has_id(html, "rs-rate")
    assert _has_id(html, "rs-partial")  # existing count field
