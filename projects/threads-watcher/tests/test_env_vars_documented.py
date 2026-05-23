"""README ↔ source consistency pin for THREADS_WATCHER_* env vars.

Why this exists
---------------
Operator-facing env vars accumulated across recent commits without
landing in a discoverable spot:
  - THREADS_WATCHER_SIGNIFICANT_BUCKET_DELTA (2ce832b)
  - THREADS_WATCHER_HEARTBEAT_SEC (b8424f0)
  - THREADS_WATCHER_DISCORD_WEBHOOK_URL (785a75d)
  - 3 NOTIFY_* env vars (older, also undocumented in README)
  - THREADS_WATCHER_INTERVAL / BASELINE_LOOKBACK_DAYS (shell side)

Pre-this-commit README only mentioned INTERVAL. Operator running
`grep THREADS_WATCHER_ projects/threads-watcher/README.md` got 1
hit out of 8. Runbook-driven incident response had no central
reference — operator had to grep the source themselves.

This test pins the bidirectional contract:
  - Every THREADS_WATCHER_* env var read by code MUST appear in
    the README env vars table (else operator can't discover it).
  - Every env var listed in the README MUST exist in code (else
    operator runbook hallucinates a knob that does nothing).

Catches drift in both directions at PR time, so the README stays
trustworthy as the operator runbook.
"""

from __future__ import annotations

import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
README = PROJECT_ROOT / "README.md"


# ── Source scan ────────────────────────────────────────────────────────


# Match any reference to a THREADS_WATCHER_* var:
#   - Python: "THREADS_WATCHER_HEARTBEAT_SEC" string literal
#     (covers ENV_HEARTBEAT_SEC = "..." pattern + direct
#      os.environ.get("...") calls)
#   - Shell: ${THREADS_WATCHER_INTERVAL:-60} / -n "${THREADS_WATCHER_*}"
_ENV_NAME_RE = re.compile(r"THREADS_WATCHER_[A-Z_]+")

# Files NOT to scan — test fixtures, output logs, this test itself.
_SKIP_PATH_PARTS = {
    "tests",         # test files mention env vars in assertions
    ".venv", "venv", # virtualenvs
    "logs",          # runtime output
    "node_modules",
    ".pytest_cache",
    "__pycache__",
    "threads-watcher-status",  # static dashboard / state files
}


def _is_source_file(path: Path) -> bool:
    """Production source: top-level .py + launchd-managed shell.
    Exclude tests, output, vendor. Matches the same scope as the
    pre-commit hook's threads-watcher pattern."""
    if any(part in _SKIP_PATH_PARTS for part in path.parts):
        return False
    return path.suffix in {".py", ".sh"}


def _scan_source_for_env_names() -> set[str]:
    """Walk every production source file, regex-extract all
    THREADS_WATCHER_* names. Returns the unique set."""
    found: set[str] = set()
    for path in PROJECT_ROOT.rglob("*"):
        if not path.is_file() or not _is_source_file(path):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for match in _ENV_NAME_RE.findall(text):
            found.add(match)
    return found


# ── README scan ────────────────────────────────────────────────────────


def _scan_readme_for_env_names() -> set[str]:
    """Extract every THREADS_WATCHER_* mentioned in the README.
    Markdown table cells, code blocks, prose — all sources count
    (the operator might find the var in any of those)."""
    text = README.read_text(encoding="utf-8")
    return set(_ENV_NAME_RE.findall(text))


# ── Tests ──────────────────────────────────────────────────────────────


def test_every_code_referenced_env_var_is_documented_in_readme():
    # 🔒 The headline pin: a new env var lands in code → must also
    # land in README before commit. Caught at PR time, before
    # operator hits the undocumented knob.
    in_code = _scan_source_for_env_names()
    in_readme = _scan_readme_for_env_names()
    missing = in_code - in_readme
    assert not missing, (
        f"{len(missing)} env var(s) read by code but not documented "
        f"in README.md:\n  " + "\n  ".join(sorted(missing)) + "\n\n"
        f"Add a row to the 'env vars' table in README.md describing "
        f"each one (default, range, what it controls, source file). "
        f"This test pins the operator-runbook discoverability contract."
    )


def test_every_readme_env_var_is_actually_used_in_code():
    # 🔒 Inverse direction: README hallucination. If the README
    # promises a knob that no code actually reads, the operator
    # sets it, expects behaviour, gets nothing.
    in_code = _scan_source_for_env_names()
    in_readme = _scan_readme_for_env_names()
    stale = in_readme - in_code
    assert not stale, (
        f"{len(stale)} env var(s) documented in README.md but no "
        f"longer referenced in code:\n  " + "\n  ".join(sorted(stale)) + "\n\n"
        f"Either restore the code reference (the env was supposed "
        f"to do something) or remove the row from README.md (the "
        f"env was renamed/removed). README must not promise dead knobs."
    )


def test_minimum_known_env_set_present():
    # Sanity: belt-and-braces that the scan isn't broken. We KNOW
    # at least these 4 should exist at the time this test ships —
    # if zero of them surface, _scan_source_for_env_names is broken.
    in_code = _scan_source_for_env_names()
    known = {
        "THREADS_WATCHER_INTERVAL",
        "THREADS_WATCHER_HEARTBEAT_SEC",
        "THREADS_WATCHER_SIGNIFICANT_BUCKET_DELTA",
        "THREADS_WATCHER_DISCORD_WEBHOOK_URL",
    }
    missing_from_scan = known - in_code
    assert not missing_from_scan, (
        f"Source-scan helper is broken — known env vars not found:\n  "
        + "\n  ".join(sorted(missing_from_scan))
    )


def test_readme_env_table_exists_with_anchor():
    # Cheap doc-shape sanity: the section header survives. Catches
    # a refactor that accidentally splits the table apart so
    # operators can't find it via Ctrl-F on "環境変数".
    text = README.read_text(encoding="utf-8")
    assert "## 環境変数" in text, (
        "README.md missing the '## 環境変数' section header. "
        "Operators discover the env-var table by scanning section "
        "headings — this is the entry point."
    )