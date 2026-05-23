"""Cross-layer drift lint for the state.json publication contract.

The contract has three independent enforcement points:

  1. watcher_pure.FORBIDDEN_POST_KEYS — chokepoint sanitizer that
     drops private keys from each post before they hit the JSON.
  2. sync_guards.FORBIDDEN_POST_KEYS — pre-publish guard run by
     sync.py that walks the full tree.
  3. threads-watcher-status/deploy.sh:FORBIDDEN_KEYS_CSV — pre/post-
     deploy verification run independently of the watcher.

A developer who adds a 4th private field (say `auth_cookie`) needs
to update ALL THREE in lockstep. Today the constants happen to
agree by hand-maintained convention; nothing in CI catches drift.
The exact same hazard for the required-fields list — `deploy.sh`'s
REQUIRED_FIELDS_CSV exists alongside `build_web_snapshot_payload`'s
hand-maintained output dict literal, with no test asserting they
agree.

This file pins all three layers in lockstep so the next field
addition trips one explicit, named test instead of silently shipping
a payload that the deploy gate later rejects (or worse, the deploy
script gets relaxed to match a broken payload).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync_guards import FORBIDDEN_POST_KEYS as SG_FORBIDDEN  # noqa: E402
from watcher_pure import (  # noqa: E402
    FORBIDDEN_POST_KEYS as WP_FORBIDDEN,
    build_web_snapshot_payload,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEPLOY_SH = PROJECT_ROOT / "threads-watcher-status" / "deploy.sh"


def _parse_csv_line(varname: str) -> frozenset[str]:
    """Extract `VAR="a,b,c"` from deploy.sh and return frozenset({"a","b","c"})."""
    src = DEPLOY_SH.read_text()
    m = re.search(rf'^{varname}="([^"]+)"', src, re.MULTILINE)
    if m is None:
        raise AssertionError(f"deploy.sh has no {varname}=\"...\" line")
    return frozenset(m.group(1).split(","))


# ── FORBIDDEN_POST_KEYS three-way agreement ───────────────────────────


def test_watcher_pure_and_sync_guards_forbidden_keys_agree() -> None:
    # The two Python copies live in modules that import each other
    # through nothing — easy to forget. Pin equality.
    assert WP_FORBIDDEN == SG_FORBIDDEN, (
        f"FORBIDDEN_POST_KEYS drift between watcher_pure.py and sync_guards.py:\n"
        f"  watcher_pure:  {sorted(WP_FORBIDDEN)}\n"
        f"  sync_guards:   {sorted(SG_FORBIDDEN)}"
    )


def test_deploy_sh_forbidden_csv_agrees_with_python_constants() -> None:
    # deploy.sh runs OUTSIDE the Python venv (independently runnable on
    # any operator's laptop). It hardcodes the same set via CSV. A
    # mismatch means an operator running deploy.sh would see a
    # different verdict than sync.py's pre-publish gate.
    deploy_set = _parse_csv_line("FORBIDDEN_KEYS_CSV")
    assert deploy_set == WP_FORBIDDEN, (
        f"FORBIDDEN_POST_KEYS drift between Python constants and deploy.sh CSV:\n"
        f"  Python:    {sorted(WP_FORBIDDEN)}\n"
        f"  deploy.sh: {sorted(deploy_set)}"
    )


# ── REQUIRED_FIELDS agreement with build_web_snapshot_payload ─────────


def _sample_snapshot_input() -> dict:
    """Minimal-but-valid input dict for build_web_snapshot_payload so
    we can introspect its output key set."""
    return {
        "handle": "@bmw_intokyo",
        "handles": ["@bmw_intokyo"],
        "last_check": {
            "checked_at": "2026-05-23T00:00:00Z",
            "status": "ok",
            "found_count": 0,
            "new_count": 0,
            "error": None,
        },
        "saved_count": 0,
        "posts": [],
        "recent_stats": {"window_hours": 24, "total": 0},
        "recent_stats_by_window": {"1": {}, "24": {}, "168": {}},
        "sync_state": {"last_commit_sha": None},
    }


def test_deploy_sh_required_fields_are_all_emitted_by_builder() -> None:
    # The hard direction: every field deploy.sh REQUIRES must actually
    # come out of build_web_snapshot_payload. Otherwise the pre-flight
    # check would fail every deploy AND sync.py would have happily
    # written the broken payload up to that point.
    deploy_required = _parse_csv_line("REQUIRED_FIELDS_CSV")
    emitted = set(build_web_snapshot_payload(
        snapshot=_sample_snapshot_input(),
        dry_run_alert=None,
        generated_at="2026-05-23T00:00:00Z",
    ).keys())
    missing = deploy_required - emitted
    assert missing == set(), (
        f"deploy.sh requires fields that build_web_snapshot_payload does NOT emit:\n"
        f"  missing: {sorted(missing)}\n"
        f"  emitted: {sorted(emitted)}\n"
        f"Either teach the builder to emit them, or remove from deploy.sh REQUIRED_FIELDS_CSV."
    )


def test_builder_does_not_emit_forbidden_keys_at_top_level() -> None:
    # Defense in depth — the per-post sanitizer drops forbidden keys
    # from posts[i], but the top-level dict should never grow a
    # forbidden key either. Pre-fix sanity wasn't enforced — the
    # builder literally constructs the dict by hand, so a careless
    # `**snapshot` would leak everything.
    payload = build_web_snapshot_payload(
        snapshot=_sample_snapshot_input(),
        dry_run_alert=None,
        generated_at="2026-05-23T00:00:00Z",
    )
    leaked = WP_FORBIDDEN & set(payload.keys())
    assert leaked == set(), (
        f"build_web_snapshot_payload top-level keys include FORBIDDEN_POST_KEYS: {sorted(leaked)}"
    )


# ── Live state.json sanity (regression guard against the live file) ───


def test_live_state_json_passes_all_three_layers() -> None:
    # Belt-and-braces: load the actually-shipped state.json and assert
    # the three-layer contract holds. Catches the rare class where the
    # code-level lints pass (because constants agree) but the LIVE
    # file diverged due to some out-of-band edit.
    live = PROJECT_ROOT / "threads-watcher-status" / "state.json"
    if not live.exists():
        pytest.skip("no live state.json on this clone")
    payload = json.loads(live.read_text(encoding="utf-8"))

    # Three-layer #1: no forbidden top-level key.
    assert WP_FORBIDDEN & set(payload.keys()) == set()
    # Three-layer #2: every deploy-required field is present.
    required = _parse_csv_line("REQUIRED_FIELDS_CSV")
    assert required - set(payload.keys()) == set(), (
        f"live state.json missing fields: {sorted(required - set(payload.keys()))}"
    )
    # Three-layer #3: per-post, no forbidden key (walks shallowly —
    # sync_guards.snapshot_sanity_check does the deep walk).
    for i, post in enumerate(payload.get("posts", [])):
        leaked = WP_FORBIDDEN & set(post.keys())
        assert leaked == set(), f"posts[{i}] leaked forbidden keys: {sorted(leaked)}"
