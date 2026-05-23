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


# ── MTTR summary widget (added 2026-05-23 after 63cf649 wired
#    mttr_summary into state.json) ─────────────────────────────────────


def test_mttr_summary_card_section_exists(html: str):
    # The card itself starts hidden (display:none) so a fresh log
    # without closed incidents doesn't show an empty table; JS reveals
    # it when mttr.length > 0.
    assert _has_id(html, "mttr-summary"), (
        "index.html must declare <section id=\"mttr-summary\"> for the "
        "MTTR widget that consumes state.json's mttr_summary field."
    )


def test_mttr_table_anchors_exist(html: str):
    # JS targets these IDs to populate the per-handle rows.
    assert _has_id(html, "mttr-table")
    assert _has_id(html, "mttr-tbody")


def test_mttr_card_starts_hidden(html: str):
    # `display:none` initially. Operator with zero closed incidents
    # doesn't see an empty header — the widget appears only when
    # there's content.
    import re
    m = re.search(
        r'id="mttr-summary"[^>]*style="([^"]*)"',
        html,
    )
    assert m is not None, "mttr-summary section must have an inline style attribute"
    assert "display:none" in m.group(1).replace(" ", ""), (
        f"mttr-summary section must start with display:none. "
        f"Got style={m.group(1)!r}"
    )


def test_js_reads_mttr_summary_from_payload(html: str):
    # JS must consume `data.mttr_summary` (the field name pinned by
    # build_web_snapshot_payload). A typo here means the widget never
    # populates regardless of how many incidents land in the log.
    # (The `_js_reads` helper checks `rs.<field>` shapes; this field
    # is on the top-level `data` object, so use a direct substring.)
    assert "data.mttr_summary" in html, (
        "JS must read data.mttr_summary from the state.json payload."
    )


def test_js_handles_non_array_mttr_summary_defensively(html: str):
    # The JS guard `Array.isArray(data.mttr_summary) ? data.mttr_summary : []`
    # protects against a malformed/older state.json that has the field
    # but wrong type. Pin it so a future "cleanup" that removes the
    # guard fails here.
    assert "Array.isArray(data.mttr_summary)" in html, (
        "JS must Array.isArray-guard data.mttr_summary so an older "
        "state.json (missing field or wrong type) can't NPE the dashboard."
    )


def test_mttr_table_renders_expected_columns(html: str):
    # Pin the column headers — operator script consumers (screenshot
    # parsers, accessibility tests) depend on the visible labels.
    for col in ["handle", "incidents", "mean", "median", "max"]:
        # Use a permissive substring check; the table THEAD contains
        # <th>{col}</th> with possible attributes.
        assert col in html, f"MTTR table missing column header for {col!r}"


# ── open_incidents widget (added 2026-05-23, still-warning state) ──────


def test_open_incidents_card_section_exists(html: str):
    assert _has_id(html, "open-incidents"), (
        "index.html must declare <section id=\"open-incidents\"> for the "
        "still-warning incidents widget."
    )


def test_open_incidents_table_anchors_exist(html: str):
    assert _has_id(html, "open-incidents-table")
    assert _has_id(html, "open-incidents-tbody")


def test_open_incidents_card_starts_hidden(html: str):
    import re
    m = re.search(r'id="open-incidents"[^>]*style="([^"]*)"', html)
    assert m is not None
    assert "display:none" in m.group(1).replace(" ", "")


def test_js_reads_open_incidents_from_payload(html: str):
    assert "data.open_incidents" in html, (
        "JS must read data.open_incidents from the state.json payload."
    )


def test_js_handles_non_array_open_incidents_defensively(html: str):
    assert "Array.isArray(data.open_incidents)" in html


def test_open_incidents_table_renders_expected_columns(html: str):
    # The 4 column headers — operator + accessibility-script contract.
    for col in ["handle", "open since", "elapsed", "current bucket"]:
        assert col in html, f"open-incidents table missing column {col!r}"


# ── auto-refresh (dashboard re-fetches state.json on interval) ─────────


def test_setinterval_present_for_auto_refresh(html: str):
    # Without setInterval the dashboard freezes at load time — elapsed
    # times stop ticking, mttr_summary stays empty even after a
    # recovered event lands in sync.log. Pin the interval call.
    assert "setInterval(tick" in html, (
        "Dashboard must call setInterval(tick, ...) to re-fetch state.json. "
        "Without it the open-incidents elapsed column freezes at page-load."
    )


def test_refresh_url_param_honored(html: str):
    # ?refresh=0 disables, ?refresh=N sets cadence. Pin the URL-param
    # plumbing so a future "always 60s" hardcode is caught.
    assert "URLSearchParams" in html and "'refresh'" in html, (
        "Dashboard must read ?refresh URL param (operator dial for "
        "tightening / disabling auto-refresh during debug)."
    )


def test_refresh_zero_disables_interval(html: str):
    # `if (REFRESH_SEC > 0)` guard so operator can ?refresh=0 to
    # freeze the dashboard for screenshot work without code edit.
    import re
    assert re.search(r"REFRESH_SEC\s*>\s*0", html), (
        "setInterval must be gated by `if (REFRESH_SEC > 0)` so "
        "?refresh=0 disables auto-refresh."
    )


def test_posts_render_only_on_first_tick(html: str):
    # 🔒 renderTabs/renderPosts bind click handlers — re-running on
    # every refresh would wipe the operator's expanded panels. Pin
    # the `if (firstTick) renderTabs()` guard.
    import re
    pattern = re.compile(
        r"if\s*\(\s*firstTick\s*\)\s*\{\s*\n\s*renderTabs\(\)\s*;\s*\n\s*renderPosts\(\)\s*;"
    )
    assert pattern.search(html), (
        "renderTabs/renderPosts must be guarded by `if (firstTick)` so "
        "auto-refresh doesn't wipe the expanded screenshot panels"
    )


def test_silent_failure_on_subsequent_ticks(html: str):
    # First-time fetch failure shows error in posts list (operator
    # recognises outage). Subsequent network blips stay silent —
    # operator sees stale data + the snapshot_generated_at timestamp.
    import re
    pattern = re.compile(
        r"if\s*\(\s*firstTick\s*\)\s*\{[\s\S]{0,500}snapshot load failed"
    )
    assert pattern.search(html), (
        "The error renderer must be wrapped in `if (firstTick)` so "
        "transient blips on auto-refresh don't flash an error every tick"
    )


# ── open_incidents row severity (elapsed-based triage colors) ──────────


def test_oi_warn_and_oi_err_css_classes_defined(html: str):
    # Two severity classes for open-incident rows. Pin both so a
    # CSS cleanup that drops one breaks here, not in operator
    # incident response.
    assert "tr.oi-warn" in html, "oi-warn CSS rule missing"
    assert "tr.oi-err" in html, "oi-err CSS rule missing"


def test_oi_thresholds_present_in_js(html: str):
    # Thresholds: OI_WARN_S=3600 (1h), OI_ERR_S=24*3600 (24h).
    # Operator triage at a glance — pin so a future refactor that
    # silently changes the thresholds trips here.
    import re
    assert re.search(r"OI_WARN_S\s*=\s*3600\b", html), (
        "OI_WARN_S must be 3600 (1 hour) — pins operator triage threshold"
    )
    assert re.search(r"OI_ERR_S\s*=\s*24\s*\*\s*3600\b", html), (
        "OI_ERR_S must be 24 * 3600 (24 hours) — pins stuck-regime threshold"
    )


def test_oi_severity_applied_via_classname(html: str):
    # The JS must apply `tr.className = 'oi-warn'` or 'oi-err' based
    # on elapsedS comparison. Pin the assignment so a future tweak
    # that drops the styling silently still trips a test.
    assert "tr.className = 'oi-err'" in html, (
        "Open-incident row must get className='oi-err' when elapsed >= 24h"
    )
    assert "tr.className = 'oi-warn'" in html, (
        "Open-incident row must get className='oi-warn' when elapsed >= 1h"
    )


def test_oi_err_takes_priority_over_oi_warn_in_js(html: str):
    # The branch ordering matters: must check >= OI_ERR_S FIRST
    # (else-if OI_WARN_S). Otherwise a 25h-old incident would be
    # styled as merely warn instead of err. Pin the branch order.
    import re
    pattern = re.compile(
        r"if\s*\(\s*elapsedS\s*>=\s*OI_ERR_S\s*\)[\s\S]{0,200}else if\s*\(\s*elapsedS\s*>=\s*OI_WARN_S",
    )
    assert pattern.search(html), (
        "elapsed-threshold branch must check OI_ERR_S first, then "
        "OI_WARN_S — otherwise a 24h+ incident incorrectly styles as warn"
    )
