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
    remote_state: str | None = None,
    deploy_fail: bool = False,
    no_url: bool = False,
) -> tuple[int, str]:
    state_path = sb / "state.json"
    if local_state is None:
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
