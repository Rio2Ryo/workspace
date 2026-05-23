"""Cross-location pin: qa-reports/migrations-down/*_DOWN.sql ===
second-brain/apps/api/src/db/migrations-down/down_NNNN.sql
at the executable-SQL level.

Why this exists
---------------
Down migrations live in TWO places:

  qa-reports/migrations-down/<NNNN>_<topic>_DOWN.sql
    Operator entry point via apply.sh (this directory's helper for
    rolling back a single migration against sqlite, miniflare, or
    remote D1).

  second-brain/apps/api/src/db/migrations-down/down_<NNNN>.sql
    Authoritative source-of-truth for `wrangler d1 execute --file`
    (the production rollback path documented in MIGRATION_ROLLBACK.md).

The two files use DIFFERENT header comments (apply.sh side leans
operational, submodule side leans schema-rationale) but their
EXECUTABLE SQL must produce the same rollback effect — otherwise an
operator gets different DB state depending on which path they took.
Today verified identical at the byte level (modulo comments); this
test pins that going forward.

Drift class this catches: a fix landing in one file (e.g., adding
`PRAGMA foreign_keys = OFF` before a DROP) that the other doesn't
mirror. The runtime test (test_down_idempotency_runtime.py) only
exercises the submodule side, so a divergent apply.sh path would
land broken without surfacing.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
APPLY_DIR = REPO_ROOT / "qa-reports" / "migrations-down"
SUBMODULE_DIR = REPO_ROOT / "second-brain" / "apps" / "api" / "src" / "db" / "migrations-down"


def _strip_comments_and_whitespace(sql: str) -> str:
    """Drop comment-only lines (anything starting with `--`) and
    collapse runs of whitespace. The result is the EXECUTABLE SQL —
    what the engine actually sees, modulo formatting.

    Pinned at byte level after normalisation so any change to a
    statement (added column, dropped IF EXISTS guard, etc.) trips
    the test. Comment edits are intentionally invisible.
    """
    no_comments = "\n".join(
        line for line in sql.split("\n")
        if not line.strip().startswith("--")
    )
    # Collapse all whitespace (incl. newlines) to single spaces so
    # `DROP TABLE x;\nDROP INDEX y;` matches `DROP TABLE x; DROP INDEX y;`.
    return re.sub(r"\s+", " ", no_comments).strip()


def _apply_dir_inventory() -> list[Path]:
    """All `*_DOWN.sql` files in the apply.sh directory, sorted."""
    return sorted(APPLY_DIR.glob("*_DOWN.sql"))


def _matching_submodule_path(apply_path: Path) -> Path:
    """Map qa-reports/0054_discord_watch_sources_DOWN.sql →
    second-brain/.../migrations-down/down_0054.sql"""
    m = re.match(r"^(\d{4})_", apply_path.name)
    assert m, f"unexpected filename shape: {apply_path.name}"
    return SUBMODULE_DIR / f"down_{m.group(1)}.sql"


# ── Tests ──────────────────────────────────────────────────────────────


def test_apply_dir_inventory_is_non_empty():
    # Sanity: scan helper found at least the 5 pairs the test ships
    # with (0048, 0052, 0054, 0055, 0056 — 0048+0052 added so the
    # MIGRATION_ROLLBACK.md atomic-wrap section's documented apply.sh
    # command actually finds its --migration file at incident time).
    # A future move/rename of the apply.sh dir without test update
    # would silently make every parametrized case vacuous.
    inv = _apply_dir_inventory()
    assert len(inv) >= 5, (
        f"expected at least 5 *_DOWN.sql files in {APPLY_DIR}; "
        f"got {len(inv)}. Either the dir moved or the inventory "
        f"shrank — investigate."
    )


def test_atomic_wrap_documented_migrations_have_apply_files():
    # 🔒 Pin the operational link between
    # MIGRATION_ROLLBACK.md §"Atomic rollback option" and apply.sh:
    # both 0048 and 0052 — the only two migrations the runbook
    # specifically tells operators to wrap-in-transaction — MUST
    # have a corresponding *_DOWN.sql in the apply.sh dir.
    #
    # Drift class caught: the runbook is updated to mention a new
    # non-idempotent migration NNNN without the operator getting a
    # working apply.sh path for it. Before this test landed, the
    # runbook said "apply.sh --migration 0048_..._DOWN.sql" but the
    # file didn't exist → ERROR: migration not found.
    inv_names = {p.name for p in _apply_dir_inventory()}
    required = {
        "0048_agent_states_team_columns_DOWN.sql",
        "0052_fk_constraints_DOWN.sql",
    }
    missing = required - inv_names
    assert not missing, (
        f"MIGRATION_ROLLBACK.md atomic-wrap section names "
        f"migrations whose apply.sh file is missing: {sorted(missing)}\n"
        f"Operators following the runbook would get "
        f"'ERROR: migration not found' from apply.sh.\n"
        f"Either add the file (preserving executable-SQL parity with "
        f"second-brain/apps/api/src/db/migrations-down/down_NNNN.sql) "
        f"or remove the runbook reference."
    )


@pytest.mark.parametrize(
    "apply_path", _apply_dir_inventory(),
    ids=lambda p: p.name,
)
def test_apply_sql_matches_submodule_sql(apply_path: Path):
    # 🔒 Headline pin: same executable SQL on both sides.
    submodule_path = _matching_submodule_path(apply_path)
    assert submodule_path.is_file(), (
        f"{apply_path.name} has no matching submodule down script at "
        f"{submodule_path}. Either:\n"
        f"  (a) submodule needs a down_NNNN.sql for this migration "
        f"      (apply.sh helper exists but production path missing)\n"
        f"  (b) apply.sh side is stale and should be removed"
    )
    apply_sql = _strip_comments_and_whitespace(
        apply_path.read_text(encoding="utf-8")
    )
    submodule_sql = _strip_comments_and_whitespace(
        submodule_path.read_text(encoding="utf-8")
    )
    assert apply_sql == submodule_sql, (
        f"Executable SQL diverges between:\n"
        f"  apply.sh side: {apply_path}\n"
        f"  submodule side: {submodule_path}\n\n"
        f"apply.sh executable SQL:\n  {apply_sql!r}\n\n"
        f"submodule executable SQL:\n  {submodule_sql!r}\n\n"
        f"Operator rollback via apply.sh would land DIFFERENT DB "
        f"state than rollback via `wrangler d1 execute --file`. "
        f"Reconcile by editing the stale file to match the canonical "
        f"side (submodule = production authoritative)."
    )


def test_every_pair_has_at_least_one_drop_statement():
    # Belt-and-braces: if the strip helper accidentally returns empty
    # strings for both files (regex bug), the equality check would
    # vacuously pass. Pin that the executable SQL is non-empty AND
    # contains a DROP — the defining shape of a down migration.
    for apply_path in _apply_dir_inventory():
        sql = _strip_comments_and_whitespace(
            apply_path.read_text(encoding="utf-8")
        )
        assert sql, f"{apply_path.name}: executable SQL is empty"
        assert "DROP" in sql.upper(), (
            f"{apply_path.name}: no DROP statement — every down "
            f"migration should drop something. Investigate."
        )
