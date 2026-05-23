"""Cross-file meta-test: pin that the severity thresholds in the
dashboard JS (index.html) match the ones in the Discord payload
builder (discord_payload.py).

Why this exists
---------------
Two files independently encode "what counts as warning vs. critical":

  threads-watcher-status/index.html
    OI_WARN_S   = 3600        // open-incident yellow at 1h
    OI_ERR_S    = 24 * 3600   // open-incident red    at 24h
    MTTR_WARN_S = 3600        // mttr-summary yellow at 1h mean
    MTTR_ERR_S  = 24 * 3600   // mttr-summary red    at 24h mean

  discord_payload.py
    SEVERITY_WARN_S = 3600
    SEVERITY_ERR_S  = 24 * 3600

If an operator tunes MTTR_WARN_S to 1800s (yellower MTTR rows at
30 min) on the dashboard but forgets the Python side, an incident
with a 40-min mean will render YELLOW on the dashboard tab and
GREEN in the Discord embed for the same data. The operator sees
two surfaces disagree about the SAME incident and has no way to
tell which is the "real" verdict.

That hazard is exactly the cross-file drift problem the existing
_scheduled-handlers.ts registry solves on the second-brain side:
SINGLE SOURCE OF TRUTH for what gets logged across two test files.
The dashboard JS can't import from Python, so the cleanest closure
here is a meta-test that scans both files and pins the relation.

How to interpret a failure
--------------------------
  - If you intentionally diverged the thresholds (e.g., MTTR_WARN_S =
    1800 but OI_WARN_S = 3600), revisit how `_classify_severity` in
    discord_payload.py should track. Two reasonable rules:
      MIN: Discord card lights up as soon as the STRICTER widget
           would — operator-friendly (never miss a yellow).
      MAX: Discord card stays calm until both widgets would —
           less noisy for tunables tightened during incidents.
    Pick one, update this test's expected-relation, document why.
  - If you didn't mean to diverge, update the offending constant.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from discord_payload import SEVERITY_ERR_S, SEVERITY_WARN_S  # noqa: E402


# Path to the dashboard HTML — the JS lives inline so we parse the
# whole file. The HTML is hand-maintained, not bundled, so the
# constants we want to pin appear verbatim in source.
DASHBOARD_HTML = PROJECT_ROOT / "threads-watcher-status" / "index.html"


# ── JS literal evaluator (safe subset) ─────────────────────────────────


# Only digits, multiplication, whitespace. Refuses anything that could
# call a function or read a variable. Sufficient for `3600` and
# `24 * 3600` style expressions used in index.html.
_SAFE_JS_NUMBER_EXPR = re.compile(r"^[\d*\s+]+$")


def _eval_js_number(expr: str) -> int:
    """Evaluate a number-only JS expression like `24 * 3600` to a Python
    int. Refuses anything outside the [0-9*+ ] character set so this
    can't be tricked into running code if a future constant changes
    shape unexpectedly."""
    expr = expr.strip()
    if not _SAFE_JS_NUMBER_EXPR.match(expr):
        raise ValueError(f"refusing to eval non-numeric JS expression: {expr!r}")
    return int(eval(expr, {"__builtins__": {}}, {}))


# ── Dashboard constant extractor ───────────────────────────────────────


def _read_js_constant(name: str) -> int:
    """Extract `const NAME = <numeric expr>;` from the dashboard HTML.

    Pinned to `const NAME` (not `let` / `var`) because that's how
    the existing JS declares them — a future drift to `var` would
    trip the test, which is fine: pinning the declaration shape
    keeps the regex grep-deterministic."""
    html = DASHBOARD_HTML.read_text(encoding="utf-8")
    pattern = rf"const\s+{re.escape(name)}\s*=\s*([^;]+);"
    matches = re.findall(pattern, html)
    if not matches:
        raise AssertionError(
            f"dashboard JS constant `{name}` not found in {DASHBOARD_HTML}. "
            f"If you renamed it, update this test or restore the name."
        )
    if len(matches) > 1:
        # Defensive: two declarations of the same const in the same
        # script would be a JS SyntaxError; surface clearly here too.
        raise AssertionError(
            f"dashboard JS has multiple `const {name}` declarations "
            f"({len(matches)}): {matches!r}. Consolidate to one."
        )
    return _eval_js_number(matches[0])


# ── Tests ──────────────────────────────────────────────────────────────


class TestDashboardConstantsPresent:
    """Sanity: the four constants exist + parse to expected magnitudes.
    If a refactor moves them to a separate JS file, swap DASHBOARD_HTML
    and these tests will keep working — they're shape-agnostic."""

    @pytest.mark.parametrize("name", [
        "OI_WARN_S", "OI_ERR_S", "MTTR_WARN_S", "MTTR_ERR_S",
    ])
    def test_constant_extractable(self, name):
        value = _read_js_constant(name)
        assert value > 0, f"{name} parsed to non-positive value: {value}"

    def test_warn_less_than_err_oi(self):
        # Sanity: WARN must be a less-severe threshold than ERR.
        # A flipped pair would cause every incident past 1h to be
        # mis-classified as err immediately.
        assert _read_js_constant("OI_WARN_S") < _read_js_constant("OI_ERR_S")

    def test_warn_less_than_err_mttr(self):
        assert _read_js_constant("MTTR_WARN_S") < _read_js_constant("MTTR_ERR_S")


class TestPythonConstantsMatchDashboard:
    """The headline pin: a tune-up on one side without the other
    causes the Discord embed color to disagree with the dashboard tab
    for the SAME incident. This test makes that drift impossible to
    land silently."""

    def test_open_incidents_warn_threshold_matches(self):
        js = _read_js_constant("OI_WARN_S")
        assert SEVERITY_WARN_S == js, (
            f"discord_payload.SEVERITY_WARN_S ({SEVERITY_WARN_S}s) does "
            f"not match dashboard OI_WARN_S ({js}s). Operator tuning one "
            f"without the other → embed color disagrees with dashboard "
            f"row color for the same incident. See module docstring for "
            f"resolution paths."
        )

    def test_open_incidents_err_threshold_matches(self):
        js = _read_js_constant("OI_ERR_S")
        assert SEVERITY_ERR_S == js, (
            f"discord_payload.SEVERITY_ERR_S ({SEVERITY_ERR_S}s) does "
            f"not match dashboard OI_ERR_S ({js}s)."
        )

    def test_mttr_warn_threshold_matches(self):
        # Today MTTR_WARN_S == OI_WARN_S; if they diverge, see the
        # module docstring for the MIN-vs-MAX decision before
        # weakening this assertion.
        js = _read_js_constant("MTTR_WARN_S")
        assert SEVERITY_WARN_S == js, (
            f"discord_payload.SEVERITY_WARN_S ({SEVERITY_WARN_S}s) does "
            f"not match dashboard MTTR_WARN_S ({js}s). If you tuned the "
            f"MTTR threshold separately from the open-incident one, "
            f"decide how the Python embed-color should track (MIN vs MAX) "
            f"before changing this test."
        )

    def test_mttr_err_threshold_matches(self):
        js = _read_js_constant("MTTR_ERR_S")
        assert SEVERITY_ERR_S == js, (
            f"discord_payload.SEVERITY_ERR_S ({SEVERITY_ERR_S}s) does "
            f"not match dashboard MTTR_ERR_S ({js}s)."
        )


# ── Helper unit tests (the test infrastructure itself) ────────────────


class TestEvalJsNumber:
    def test_simple_integer(self):
        assert _eval_js_number("3600") == 3600

    def test_multiplication(self):
        assert _eval_js_number("24 * 3600") == 86400

    def test_strips_whitespace(self):
        assert _eval_js_number("  60  *  60  ") == 3600

    def test_refuses_function_call(self):
        # Critical: do NOT eval anything that could escape the
        # whitelisted character set, even if discord_payload's
        # threshold values are themselves trusted today.
        with pytest.raises(ValueError, match="refusing to eval"):
            _eval_js_number("Math.floor(3600)")

    def test_refuses_variable_reference(self):
        with pytest.raises(ValueError, match="refusing to eval"):
            _eval_js_number("MINUTE * 60")
