"""Integration tests for threads-watcher-status/deploy.sh — the final
link in the auto-sync chain (publish-if-delta.sh -> deploy.sh).

deploy.sh runs `vercel --prod` and then verifies the deployed payload.
Its logic had no coverage: the pre-flight schema guard (refuses to
deploy a state.json that lost a required field — would silently
regress the public UI), the vercel-failure handling, and the
post-deploy verification that classifies missing-fields vs
unparseable-body.

Sandbox stubs `vercel` on PATH; `python3` (the JSON parser deploy.sh
shells out to) runs for real.
"""

from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEPLOY_SH = PROJECT_ROOT / "threads-watcher-status" / "deploy.sh"

REQUIRED_FIELDS = [
    "handle", "last_check", "saved_count", "recent_stats",
    "recent_stats_by_window", "sync_state", "snapshot_generated_at",
]


def _valid_state(generated_at: str = "2026-05-22T10:00:00Z") -> dict:
    return {
        "handle": "@h",
        "last_check": None,
        "saved_count": 0,
        "recent_stats": {},
        "recent_stats_by_window": {},
        "sync_state": {},
        "snapshot_generated_at": generated_at,
    }


def _write_exec(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _make_sandbox(tmp_path: Path) -> Path:
    sb = tmp_path / "sandbox"
    sb.mkdir()
    (sb / "stub-bin").mkdir()
    shutil.copy(DEPLOY_SH, sb / "deploy.sh")
    (sb / "deploy.sh").chmod(0o755)

    # Stub vercel: `--prod` prints a deploy URL (or fails / prints no
    # URL per flag files); `curl` echoes the controlled remote payload.
    _write_exec(sb / "stub-bin" / "vercel", (
        "#!/bin/sh\n"
        'case "$1" in\n'
        "  --prod)\n"
        '    if [ -f .vercel-deploy-fail ]; then echo "deploy blew up"; exit 1; fi\n'
        '    if [ -f .vercel-no-url ]; then echo "done — but no url line"; exit 0; fi\n'
        "    echo 'Production: https://threads-watcher-status-abc123.vercel.app'\n"
        "    exit 0 ;;\n"
        "  curl)\n"
        "    cat .vercel-remote-state 2>/dev/null\n"
        "    exit 0 ;;\n"
        "esac\n"
        "exit 0\n"
    ))
    return sb


def _run(
    sb: Path,
    *,
    local_state: dict | None,
    local_state_raw: str | None = None,
    remote_state: str | None = None,
    deploy_fail: bool = False,
    no_url: bool = False,
) -> tuple[int, str]:
    state_path = sb / "state.json"
    if local_state_raw is not None:
        # Write the file verbatim — used to exercise corrupt / non-object
        # JSON that json.dumps(local_state) could never produce.
        state_path.write_text(local_state_raw, encoding="utf-8")
    elif local_state is None:
        state_path.unlink(missing_ok=True)
    else:
        state_path.write_text(json.dumps(local_state), encoding="utf-8")

    for marker, flag in [(".vercel-deploy-fail", deploy_fail), (".vercel-no-url", no_url)]:
        p = sb / marker
        p.unlink(missing_ok=True)
        if flag:
            p.write_text("", encoding="utf-8")

    remote_path = sb / ".vercel-remote-state"
    if remote_state is None:
        remote_path.unlink(missing_ok=True)
    else:
        remote_path.write_text(remote_state, encoding="utf-8")

    env = dict(os.environ)
    env["PATH"] = f"{sb / 'stub-bin'}:{env['PATH']}"
    proc = subprocess.run(
        ["bash", "deploy.sh"],
        cwd=str(sb), env=env, capture_output=True, text=True, timeout=30,
    )
    return proc.returncode, proc.stdout + proc.stderr


@pytest.fixture
def sandbox(tmp_path: Path) -> Path:
    return _make_sandbox(tmp_path)


# ── pre-flight schema guard (exit 1) ──────────────────────────────────


def test_missing_local_state_aborts(sandbox: Path) -> None:
    code, out = _run(sandbox, local_state=None)
    assert code == 1
    assert "not found" in out


def test_local_state_missing_a_required_field_aborts(sandbox: Path) -> None:
    # Dropping sync_state must block the deploy — shipping it would
    # regress the public UI to an older payload shape.
    incomplete = _valid_state()
    del incomplete["sync_state"]
    code, out = _run(sandbox, local_state=incomplete)
    assert code == 1
    assert "missing required fields" in out
    assert "sync_state" in out


def test_local_state_invalid_json_aborts_with_clear_message(sandbox: Path) -> None:
    # A corrupt state.json must be diagnosed as invalid JSON, not
    # misreported as "missing required fields" (the old 2>&1 folded the
    # Python traceback into the field list).
    code, out = _run(sandbox, local_state=None, local_state_raw="{not valid json")
    assert code == 1
    assert "not valid JSON" in out
    assert "missing required fields" not in out


def test_local_state_non_object_aborts_with_clear_message(sandbox: Path) -> None:
    # Valid JSON whose top level is a list must be rejected as
    # not-an-object, not crash the `k not in data` check into a
    # misleading all-fields-missing report.
    code, out = _run(sandbox, local_state=None, local_state_raw="[]")
    assert code == 1
    assert "not a JSON object" in out


def test_complete_local_state_passes_preflight(sandbox: Path) -> None:
    # A full payload + a healthy deploy + matching remote → exit 0.
    code, out = _run(
        sandbox,
        local_state=_valid_state("2026-05-22T11:00:00Z"),
        remote_state=json.dumps(_valid_state("2026-05-22T11:00:00Z")),
    )
    assert code == 0
    assert "pre-flight OK" in out
    assert "old → new" in out


# ── vercel deploy failure (exit 2) ────────────────────────────────────


def test_vercel_prod_failure_surfaces_exit_2(sandbox: Path) -> None:
    code, out = _run(sandbox, local_state=_valid_state(), deploy_fail=True)
    assert code == 2
    assert "vercel --prod exited" in out


def test_vercel_printing_no_url_surfaces_exit_2(sandbox: Path) -> None:
    code, out = _run(sandbox, local_state=_valid_state(), no_url=True)
    assert code == 2
    assert "didn't print a deployment URL" in out


# ── post-deploy verification (exit 3) ─────────────────────────────────


def test_remote_missing_fields_surfaces_exit_3(sandbox: Path) -> None:
    # Deploy went through, but the deployed state.json lost a field.
    incomplete = _valid_state()
    del incomplete["recent_stats_by_window"]
    code, out = _run(
        sandbox, local_state=_valid_state(), remote_state=json.dumps(incomplete),
    )
    assert code == 3
    assert "deployed state.json missing fields" in out
    assert "recent_stats_by_window" in out


def test_remote_unparseable_body_surfaces_exit_3(sandbox: Path) -> None:
    code, out = _run(
        sandbox, local_state=_valid_state(), remote_state="<html>not json</html>",
    )
    assert code == 3
    assert "didn't parse" in out


def test_verify_strips_vercel_curl_progress_noise_before_json(sandbox: Path) -> None:
    # `vercel curl` prints "Retrieving project…" + a progress meter to
    # stdout before the body; deploy.sh strips everything before the
    # first '{'. Pin that a leading noise line does not break the
    # verify.
    noisy = "Retrieving project…\n  % Total\n" + json.dumps(_valid_state())
    code, out = _run(sandbox, local_state=_valid_state(), remote_state=noisy)
    assert code == 0
    assert "post-deploy OK" in out


# ── pre-flight privacy guard: forbidden private fields (exit 1) ────────
#
# deploy.sh is the LAST gate before the public Vercel page. sync.py's
# snapshot_sanity_check rejects forbidden keys, but deploy.sh is
# independently runnable and the watcher may rewrite state.json between
# sync.py's check and the deploy — so deploy.sh must re-verify that no
# screenshot_png / local_path key reaches the public payload.


def test_local_state_with_leaked_screenshot_bytes_aborts(sandbox: Path) -> None:
    # screenshot_png (raw image bytes) must never reach the public page.
    # The payload carries every required field, so the schema check
    # passes — only the privacy check can stop it.
    leaky = _valid_state()
    leaky["posts"] = [{"id": "p1", "screenshot_png": "iVBORw0KGgo="}]
    code, out = _run(sandbox, local_state=leaky)
    assert code == 1
    assert "forbidden private field" in out
    assert "screenshot_png" in out


def test_local_state_with_nested_local_path_aborts(sandbox: Path) -> None:
    # A local filesystem path leaked anywhere in the tree (not just
    # posts[i]) — here under last_check.error — is information
    # disclosure and must block the deploy.
    leaky = _valid_state()
    leaky["last_check"] = {"error": {"local_path": "/Users/umi/.openclaw/x.png"}}
    code, out = _run(sandbox, local_state=leaky)
    assert code == 1
    assert "forbidden private field" in out
    assert "local_path" in out


def test_local_state_string_value_named_like_a_key_does_not_false_positive(
    sandbox: Path,
) -> None:
    # Only dict KEYS trip the guard. A string VALUE that merely contains
    # the text 'local_path' (e.g. a human-readable error message) is
    # legitimate and must deploy cleanly.
    ok = _valid_state()
    ok["last_check"] = {"status": "error", "message": "failed to read local_path for post"}
    code, out = _run(sandbox, local_state=ok, remote_state=json.dumps(ok))
    assert code == 0
    assert "pre-flight OK" in out


# ── post-deploy privacy guard: forbidden field on the live page (exit 3) ─


def test_remote_state_with_leaked_field_surfaces_exit_3(sandbox: Path) -> None:
    # The local payload is clean but the live deployment exposes a
    # private field — the post-deploy verify must catch it.
    leaky_remote = _valid_state()
    leaky_remote["posts"] = [{"id": "p1", "local_path": "/Users/umi/x.png"}]
    code, out = _run(
        sandbox, local_state=_valid_state(), remote_state=json.dumps(leaky_remote),
    )
    assert code == 3
    assert "forbidden private field" in out
    assert "local_path" in out
