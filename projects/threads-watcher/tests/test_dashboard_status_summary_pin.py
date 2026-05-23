"""Cross-tool semantic pin: dashboard status-summary line === Discord
embed description line, for the same state.json.

Why this exists
---------------
discord_payload._build_description() produces the 1-line at-a-glance
summary that lands at the top of the Discord embed (commit 831705e).
The dashboard now renders the SAME format in
threads-watcher-status/index.html (#status-summary) so an operator
triaging from either surface reads the same words.

The format MUST stay aligned:
  GREEN  → "🟢 All healthy — watcher alive"
  YELLOW → "🟡 2 warnings"        (or " · 1 recovered")
  RED    → "🔴 1 warning · 3 recovered"

If Python adds a trailing emoji or rewords "All healthy", the dashboard
JS drifts silently — operator sees "🟢 All healthy" on the dashboard
but "🟢 healthy ✓" in Discord for the same state. Confusing, harder to
trust either surface.

This test is the same shape as test_severity_thresholds_pin.py: parse
the dashboard JS for format constants, assert they match what Python
emits for representative inputs. Catches drift in the source-of-truth
strings BOTH directions (Python changes → JS doesn't; JS changes →
Python doesn't).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from discord_payload import (  # noqa: E402
    COLOR_GREEN, COLOR_RED, COLOR_YELLOW,
    _build_description, _emoji_for,
)


DASHBOARD_HTML = PROJECT_ROOT / "threads-watcher-status" / "index.html"


@pytest.fixture(scope="module")
def html_source() -> str:
    return DASHBOARD_HTML.read_text(encoding="utf-8")


# ── Emoji glyph parity ─────────────────────────────────────────────────


class TestEmojiGlyphsAppearInDashboard:
    """All emoji glyphs used by Python's _emoji_for() must literally
    appear in the dashboard JS source — otherwise the JS branch for
    that severity can't render the same way."""

    @pytest.mark.parametrize("color", [COLOR_RED, COLOR_YELLOW, COLOR_GREEN])
    def test_color_emoji_appears_in_dashboard_js(self, html_source, color):
        py_emoji = _emoji_for(color)
        assert py_emoji in html_source, (
            f"Python _emoji_for(0x{color:06X}) produces {py_emoji!r}, "
            f"but that glyph is NOT in {DASHBOARD_HTML}. The dashboard "
            f"can't render the same at-a-glance summary as the Discord "
            f"embed. Add the glyph to the status-summary JS or update "
            f"_emoji_for to match the dashboard's choice."
        )


# ── Format-token parity ────────────────────────────────────────────────


class TestFormatTokensAppearInDashboard:
    """The literal format strings — what comes BETWEEN the emoji and the
    count — must appear in both sources. Counts come from data so we
    can't pin the full literal, but the wrapping words can be."""

    def test_green_phrase_appears_verbatim(self, html_source):
        # GREEN renders literally "All healthy — watcher alive" — the
        # whole phrase is hardcoded both sides, so we can pin the exact
        # substring.
        py = _build_description([], [], COLOR_GREEN)
        # py == "🟢 All healthy — watcher alive"
        signature = "All healthy — watcher alive"
        assert signature in py
        assert signature in html_source, (
            f"Python GREEN summary uses the phrase {signature!r}, but "
            f"the dashboard JS doesn't have it. Operator sees different "
            f"wording on the two surfaces for an all-healthy state."
        )

    def test_warning_token_appears_for_count_renders(self, html_source):
        # The word "warning" (used in "1 warning", "2 warnings") must
        # appear in the JS so the dashboard can stitch the count line
        # together. Pin both stems — singular AND the plural-suffix
        # logic — so a future "warns" rename catches here.
        assert "warning" in html_source

    def test_recovered_token_appears(self, html_source):
        # Similarly for the recovered count tail.
        assert "recovered" in html_source


# ── Severity threshold ↔ aggregate computation parity ──────────────────


class TestSeverityComputationConsistency:
    """Python uses SEVERITY_WARN_S / SEVERITY_ERR_S in _classify_severity.
    Dashboard uses inline SUM_WARN_S / SUM_ERR_S in the status-summary
    JS. These must agree on the boundary values, otherwise the
    classification disagrees on borderline incidents (e.g., 1h-old
    open: dashboard says GREEN but Discord says YELLOW)."""

    def test_dashboard_aggregate_uses_3600_warn_threshold(self, html_source):
        # 🔒 The aggregate-computation block uses literal numbers. Pin
        # that the JS uses the same 3600 / 86400 boundaries as Python
        # (which holds via test_severity_thresholds_pin.py for the
        # per-row OI_/MTTR_ constants — this is the aggregate analogue).
        import re
        # Look for "SUM_WARN_S = 3600" pattern. Allow whitespace
        # variants but require the exact value.
        pattern = re.compile(r"SUM_WARN_S\s*=\s*3600\b")
        assert pattern.search(html_source), (
            f"Dashboard status-summary aggregate is missing SUM_WARN_S "
            f"= 3600. Either it drifted, or the JS block was removed. "
            f"Either way the dashboard severity disagrees with Python."
        )

    def test_dashboard_aggregate_uses_24h_err_threshold(self, html_source):
        import re
        # 24 * 3600 = 86400. Allow either form (JS author may write
        # `24 * 3600` for readability — that's what we use today).
        pattern = re.compile(r"SUM_ERR_S\s*=\s*(?:86400\b|24\s*\*\s*3600\b)")
        assert pattern.search(html_source), (
            "Dashboard status-summary aggregate missing SUM_ERR_S = "
            "24 * 3600 (or 86400). See test_severity_thresholds_pin.py "
            "for the per-row analogue; this is the aggregate version."
        )


# ── Reference renders (proof of life for the format strings) ───────────


class TestPythonReferenceOutputs:
    """Pin the exact Python outputs so a future _build_description edit
    that breaks the format surfaces here too. The dashboard JS is then
    cross-checked against these via the substring assertions above."""

    def test_green_zero_open_zero_mttr(self):
        assert _build_description([], [], COLOR_GREEN) == "🟢 All healthy — watcher alive"

    def test_yellow_one_warning(self):
        assert _build_description(
            [{"handle": "@x"}], [], COLOR_YELLOW,
        ) == "🟡 1 warning"

    def test_yellow_two_warnings_plural(self):
        assert _build_description(
            [{"handle": "@a"}, {"handle": "@b"}], [], COLOR_YELLOW,
        ) == "🟡 2 warnings"

    def test_red_mixed(self):
        assert _build_description(
            [{"handle": "@a"}],
            [{"handle": "@r1"}, {"handle": "@r2"}],
            COLOR_RED,
        ) == "🔴 1 warning · 2 recovered"
