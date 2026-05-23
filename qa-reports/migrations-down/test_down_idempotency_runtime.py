"""Runtime execution proof: down_0048 / down_0052 second-run behaviour.

Why this exists
---------------
`apps/api/src/tests/down-script-idempotency-lint.test.ts` statically
classifies these two down scripts as non-idempotent (correctly — they
use ALTER TABLE DROP COLUMN and the recreate-dance pattern without
IF NOT EXISTS guards). The lint then requires each header to
DOCUMENT what re-running does.

But the header docs are unverified prose. If the SQL has drifted
since the doc was written (e.g., column order changed, a fix made
something accidentally idempotent), the operator runbook becomes
misleading at the worst time. Yakon's multi-turn pending policy
decision ("make these idempotent or keep them loud-error") needs
EMPIRICAL second-run evidence, not just doc claims.

This test EXECUTES each down script against stdlib sqlite3
(Python 3.13 ships SQLite >= 3.51, well past the 3.35 ALTER TABLE
DROP COLUMN cutoff), runs it twice, and asserts:
  - first run: succeeds, schema mutation lands as intended
  - second run: produces the specific outcome documented in the
    header (or surfaces divergence as a separate failure)

Output is operator-actionable runbook truth — the test itself
becomes the recovery guide.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

import pytest


WORKSPACE = Path(__file__).resolve().parent.parent.parent
DOWN_DIR = WORKSPACE / "second-brain" / "apps" / "api" / "src" / "db" / "migrations-down"


def _fresh() -> sqlite3.Connection:
    return sqlite3.connect(":memory:")


# ── down_0048 (ALTER TABLE DROP COLUMN) ───────────────────────────────


# Minimal precondition: agent_states with the 3 team columns. The
# real 0045 has more columns, but down_0048's DROP COLUMN is
# column-scoped — anything beyond role/project/device is irrelevant
# to the idempotency question.
AGENT_STATES_AFTER_0048 = """
CREATE TABLE agent_states (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT ''
);
"""


class TestDown0048Idempotency:
    """ALTER TABLE DROP COLUMN — SQLite has no IF EXISTS form."""

    @pytest.fixture
    def conn(self):
        c = _fresh()
        c.executescript(AGENT_STATES_AFTER_0048)
        yield c
        c.close()

    @pytest.fixture
    def down_sql(self):
        return (DOWN_DIR / "down_0048.sql").read_text(encoding="utf-8")

    def test_first_run_drops_team_columns(self, conn, down_sql):
        conn.executescript(down_sql)
        cols = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert "role" not in cols
        assert "project" not in cols
        assert "device" not in cols
        # Belt-and-braces: untouched columns survive.
        assert "id" in cols
        assert "name" in cols

    def test_second_run_errors_with_no_such_column(self, conn, down_sql):
        # 🔒 Pin: empirical evidence of the documented failure mode.
        conn.executescript(down_sql)
        with pytest.raises(sqlite3.OperationalError) as exc:
            conn.executescript(down_sql)
        msg = str(exc.value).lower()
        assert "no such column" in msg
        # The down script DROPs in order: device, project, role.
        # The first re-run statement to fail is `DROP COLUMN device`.
        assert "device" in msg, (
            f"Header claims second run errors specifically on `device` "
            f"(the first DROP in down_0048.sql). Got: {exc.value!r}. "
            f"If SQLite output changed, update header docs in the same diff."
        )

    def test_documented_error_phrase_matches_sqlite_output(self, conn, down_sql):
        # 🔒 Cross-check: every quoted error phrase in the header MUST
        # be a substring of the actual SQLite output. Operator looks
        # at header at incident time for the expected message; if
        # SQLite says something different, the header is a liar.
        header = down_sql.split("\n\n")[0]  # comment block before SQL
        quoted = re.findall(r'"([^"]+)"', header)
        # Filter to the error-claim quotes (heuristic: contains
        # "no such" or "Error").
        err_quoted = [q for q in quoted if re.search(r"no such|error", q, re.I)]
        assert err_quoted, (
            f"down_0048 header has no quoted error phrase. Test cannot "
            f"verify header-vs-reality alignment. Quote the expected "
            f"sqlite error in the header."
        )
        conn.executescript(down_sql)
        try:
            conn.executescript(down_sql)
            pytest.fail("expected OperationalError on second run")
        except sqlite3.OperationalError as e:
            actual = str(e)
        matched = [q for q in err_quoted if q.lower() in actual.lower()]
        assert matched, (
            f"down_0048 header quotes {err_quoted!r} as the expected "
            f"second-run error, but actual SQLite output is {actual!r}. "
            f"Header is misleading the operator runbook — fix header OR "
            f"investigate SQLite version drift."
        )


# ── down_0052 (CREATE + rename dance) ──────────────────────────────────


# All 5 tables the down script touches, in their 0052-forward shape.
# Need the schema BEFORE down_0052 runs: post-0052 means FKs present,
# but the down script's INSERT SELECT * works on column order/count
# match, not on constraint presence — so the no-FK shape used by
# down_0052's CREATE _old IS what we need both sides to match.
# (FKs are removed by the down; we mimic the "FK already dropped"
# state to isolate the re-run question.)
TABLES_BEFORE_DOWN_0052 = """
CREATE TABLE task_time_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  stopped_at TEXT,
  duration_sec INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE saved_views (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
  name TEXT NOT NULL, entity_type TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}', sort_json TEXT NOT NULL DEFAULT '{}',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_name TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  promoted_to_id TEXT, promoted_to_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE automation_rules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'ws_default',
  name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  trigger_type TEXT NOT NULL, condition TEXT NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL, action_config TEXT NOT NULL DEFAULT '{}',
  run_count INTEGER NOT NULL DEFAULT 0, last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE notification_preferences (
  user_name TEXT NOT NULL, workspace_id TEXT NOT NULL,
  mention INTEGER NOT NULL DEFAULT 1, task_update INTEGER NOT NULL DEFAULT 1,
  comment INTEGER NOT NULL DEFAULT 1, automation INTEGER NOT NULL DEFAULT 1,
  weekly_digest INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_name, workspace_id)
);
"""


class TestDown0052Idempotency:
    """CREATE TABLE foo_old (...) without IF NOT EXISTS + rename dance."""

    @pytest.fixture
    def conn(self):
        c = _fresh()
        c.executescript(TABLES_BEFORE_DOWN_0052)
        yield c
        c.close()

    @pytest.fixture
    def down_sql(self):
        return (DOWN_DIR / "down_0052.sql").read_text(encoding="utf-8")

    def test_first_run_completes_all_five_tables(self, conn, down_sql):
        conn.executescript(down_sql)
        tables = {
            row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        # All 5 target tables present (no _old leftovers).
        for name in ["task_time_logs", "saved_views", "inbox_items",
                     "automation_rules", "notification_preferences"]:
            assert name in tables, f"{name} missing after down_0052"
            assert f"{name}_old" not in tables, (
                f"{name}_old leaked — rename-dance left intermediate table"
            )

    def test_second_run_actual_outcome_captured(self, conn, down_sql):
        # 🔒 Header CLAIMS second run errors with "no such table:
        # task_time_logs" at the DROP step. But re-reading the SQL:
        # first-run rename leaves task_time_logs PRESENT (as the
        # renamed _old). Second run's CREATE _old succeeds (no
        # existing _old), INSERT SELECT works, DROP works, RENAME
        # works — could actually be idempotent.
        # Test captures EMPIRICAL truth so the policy decision uses
        # facts not assumptions.
        conn.executescript(down_sql)
        try:
            conn.executescript(down_sql)
            outcome = "second_run_succeeded"
            err_msg = None
        except sqlite3.OperationalError as e:
            outcome = "second_run_errored"
            err_msg = str(e)

        # Either outcome is valid INFORMATION for the policy decision,
        # but the test fails LOUDLY in either case to force a
        # deliberate update of the down_0052.sql header docs:
        if outcome == "second_run_errored":
            pytest.fail(
                f"down_0052 SECOND RUN ERRORED with: {err_msg!r}\n\n"
                f"Update down_0052.sql header if it doesn't already "
                f"quote this exact error. Operator runbook depends "
                f"on the header matching this empirical truth."
            )
        # If we reach here, second run actually succeeded silently —
        # surface that as a contradicition with the header claim.
        header_claims_error = "no such table" in down_sql.lower()
        assert not header_claims_error, (
            f"🔒 down_0052 SECOND RUN ACTUALLY SUCCEEDED — schema:\n"
            f"  {sorted(row[0] for row in conn.execute('SELECT name FROM sqlite_master WHERE type=\"table\"'))}\n\n"
            f"But the header claims it errors with 'no such table'. "
            f"This is operator-misleading runbook drift. Either:\n"
            f"  (a) Update down_0052.sql header to reflect empirical reality:\n"
            f"      'Idempotent: yes (re-run is a no-op in steady state)' OR\n"
            f"      'Idempotent: partial (re-run completes but duplicates rows)'\n"
            f"  (b) Investigate what changed since the header was written.\n"
            f"This is the objective evidence Yakon needs for the\n"
            f"down_0048/0052 idempotency policy decision."
        )


# ── Idempotent down scripts: runtime proof of pattern-match classification ─
#
# The static lint classifies these 9 as idempotent based on shape
# (DROP TABLE/INDEX IF EXISTS, no rename-dance, no DROP COLUMN). This
# class is the runtime counterpart — actually executes each one twice
# against a minimal stub schema and pins that:
#   1. First run drops the target tables (the script does what it
#      claims to do).
#   2. Second run completes silently (the pattern-match
#      classification holds at runtime, not just at compile time).
#
# Catches regressions like: a future down script that ADDS a non-
# idempotent statement after the DROPs (e.g., an `ALTER TABLE` for
# cleanup), passes the pattern-match lint because the offending
# statement type isn't checked, but breaks at runtime on re-run.


# Pinned set: idempotent_today from down-script-idempotency-lint.test.ts.
# This MUST stay in sync with the apps/api lint's `expectedIdempotent`
# Set — if a script is removed from one place it should be removed
# from the other (with a deliberate cross-reference in the PR).
IDEMPOTENT_DOWN_SCRIPTS = [
    "down_0049.sql", "down_0050.sql", "down_0051.sql",
    "down_0053.sql", "down_0054.sql", "down_0055.sql",
    "down_0056.sql", "down_0057.sql", "down_0058.sql",
]


def _extract_drop_table_targets(sql: str) -> list[str]:
    """Pull every `DROP TABLE [IF EXISTS] <name>` target out of an
    idempotent down script. The minimal stub schema only needs these
    tables to exist — DROP INDEX IF EXISTS on a missing index is a
    no-op, doesn't need preconditions."""
    matches = re.findall(
        r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)\s*;",
        sql, re.IGNORECASE,
    )
    return matches


def _build_stub_schema(table_names: list[str]) -> str:
    """Minimal stub: just an empty table with a single column for each
    name. Doesn't need to match the real schema — DROP TABLE doesn't
    care about column structure, just that the table exists. Skips
    duplicates so a script that touches the same table twice (rare,
    but defensive) doesn't fail with `table foo already exists`."""
    seen: set[str] = set()
    stmts: list[str] = []
    for name in table_names:
        if name in seen:
            continue
        seen.add(name)
        stmts.append(f"CREATE TABLE {name} (id INTEGER PRIMARY KEY);")
    return "\n".join(stmts)


class TestIdempotentDownScriptsRuntime:
    """Empirical pin: every script the static lint calls idempotent
    actually IS idempotent when sqlite3 runs it twice."""

    @pytest.mark.parametrize("script_name", IDEMPOTENT_DOWN_SCRIPTS)
    def test_pinned_idempotent_script_actually_runs_twice_silently(
        self, script_name,
    ):
        path = DOWN_DIR / script_name
        assert path.is_file(), f"missing pinned script: {path}"
        sql = path.read_text(encoding="utf-8")
        targets = _extract_drop_table_targets(sql)
        # Two legitimate cases here:
        #   - Script has DROP TABLE targets → build stub schema with
        #     those tables, verify first run drops them.
        #   - Script is index-only (e.g., down_0057 reverts a
        #     standalone CREATE INDEX) → no stub needed; the DROP
        #     INDEX IF EXISTS clauses are no-ops on empty DB and that
        #     IS the idempotency proof. Don't surface as a failure.

        conn = _fresh()
        try:
            if targets:
                conn.executescript(_build_stub_schema(targets))
            # First run — must succeed and remove every target table
            # (or no-op cleanly when index-only).
            conn.executescript(sql)
            after_first = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            for t in targets:
                assert t not in after_first, (
                    f"{script_name}: first run did not drop {t!r}. "
                    f"Remaining tables: {sorted(after_first)}"
                )
            # 🔒 Second run — MUST complete silently (this is the
            # idempotent claim). Any OperationalError = the
            # pattern-match classification disagrees with runtime.
            try:
                conn.executescript(sql)
            except sqlite3.OperationalError as e:
                pytest.fail(
                    f"{script_name}: classifier says idempotent, but "
                    f"second sqlite3 invocation errored: {e!r}. "
                    f"Either:\n"
                    f"  (a) Update down-script-idempotency-lint.test.ts "
                    f"to remove this from expectedIdempotent + add an "
                    f"'Idempotent: no' marker to the header + describe "
                    f"the re-run failure mode (the test you're reading "
                    f"shipped with that contract for the non-idempotent "
                    f"down_0048/0052).\n"
                    f"  (b) Fix the script (probably a missing IF EXISTS "
                    f"on a newly-added DROP statement)."
                )
            # Sanity: second run leaves the schema in the same target-
            # tables-gone state as the first run.
            after_second = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            assert after_first == after_second, (
                f"{script_name}: second run mutated the schema in a way "
                f"the first didn't. First-after: {sorted(after_first)}. "
                f"Second-after: {sorted(after_second)}"
            )
        finally:
            conn.close()

    def test_pinned_idempotent_set_matches_disk_inventory(self):
        # If a NEW down script lands and the workspace test isn't
        # updated to include it, the test only knows about the 9 pinned
        # ones — the new script could be non-idempotent and the contract
        # would silently miss it. Pin: every disk down_NNNN.sql with
        # NNNN >= 49 (the lint's COVERAGE_FLOOR + 1, since 0048 is
        # non-idempotent) and != 52 (also non-idempotent) MUST be in
        # the pinned set above. Forces a deliberate inventory update
        # at PR time.
        disk = sorted(
            p.name for p in DOWN_DIR.glob("down_*.sql")
            if p.name not in {"down_0048.sql", "down_0052.sql"}
        )
        pinned = sorted(IDEMPOTENT_DOWN_SCRIPTS)
        missing = [d for d in disk if d not in pinned]
        assert not missing, (
            f"New down script(s) not pinned in IDEMPOTENT_DOWN_SCRIPTS: "
            f"{missing}. If the script is intentionally idempotent, add "
            f"it to the pinned set. If it's intentionally non-idempotent, "
            f"add a TestDown<NNNN>Idempotency class above following the "
            f"pattern used by 0048/0052."
        )


# ── Sanity: SQLite version supports ALTER TABLE DROP COLUMN ───────────


def test_runtime_sqlite_supports_drop_column():
    # SQLite >= 3.35 supports DROP COLUMN. Python 3.13 ships SQLite
    # ~3.51 today. Pin the check so a future ancient-Python regression
    # surfaces here instead of midway through the 0048 tests.
    major, minor, _patch = (int(p) for p in sqlite3.sqlite_version.split("."))
    assert (major, minor) >= (3, 35), (
        f"SQLite version {sqlite3.sqlite_version} is below 3.35; "
        f"ALTER TABLE DROP COLUMN unsupported. Cannot run this test "
        f"file. Upgrade Python (which bundles SQLite) before retrying."
    )
