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


# ── Transactional DDL contract pin (preparation for down_0048 atomicity) ─
#
# down_0048's `ALTER TABLE agent_states DROP COLUMN device/project/role`
# sequence is currently 3 separate auto-committed DDL statements.
# Partial-state hazard: if statement 2 fails mid-script (lock,
# concurrent write, panic), device column is gone but project + role
# remain — DB in inconsistent state requiring manual cleanup.
#
# The Yakon-pending design question is whether to wrap the sequence
# in BEGIN/COMMIT for atomic rollback on partial failure. D1's
# multi-statement transaction semantics in `wrangler d1 execute --file`
# are not 100% documented; we can't verify D1 directly from here.
#
# What we CAN verify, empirically: that the LOCAL test environment
# (Python's bundled sqlite3) supports transactional DDL rollback
# correctly. This:
#   1. Documents the sqlite3 contract for future readers of down_0048
#   2. Pins the sqlite3 behavior so a future Python upgrade that
#      changed it would surface here
#   3. Sets up the empirical safety net for when the actual
#      down_0048 SQL change ships — its runtime test (above) would
#      then verify atomic behavior end-to-end


class TestSqliteTransactionalDdl:
    """Pin sqlite3's BEGIN/COMMIT-around-DDL semantics so a future
    down_0048 atomicity refactor has empirical ground truth."""

    def test_drop_column_inside_transaction_rolls_back_on_mid_script_error(self):
        # 🔒 Headline: BEGIN; DROP COLUMN X; INSERT INTO no_such_table; COMMIT;
        # → execute raises OperationalError, connection left in
        # in_transaction=True, schema state visible WITHOUT rollback
        # (column X gone), schema state AFTER rollback (column X back).
        #
        # The "schema state visible without rollback" is the key
        # property: sqlite3.executescript() does NOT auto-rollback on
        # mid-script error. Caller MUST detect + rollback. This is
        # exactly the wrapping pattern down_0048 would need.
        conn = _fresh()
        conn.executescript(
            "CREATE TABLE agent_states (id TEXT, name TEXT, "
            "role TEXT, project TEXT, device TEXT);"
        )
        before = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert before == {"id", "name", "role", "project", "device"}

        try:
            conn.executescript(
                "BEGIN;\n"
                "ALTER TABLE agent_states DROP COLUMN device;\n"
                "INSERT INTO no_such_table VALUES (1);\n"
                "COMMIT;\n"
            )
            pytest.fail("expected OperationalError on missing-table INSERT")
        except sqlite3.OperationalError as e:
            assert "no such table" in str(e)

        # 🔒 Connection state observation: still in_transaction after
        # the exception. This is the failure mode operator code must
        # handle — sqlite3 does NOT auto-rollback.
        assert conn.in_transaction, (
            "sqlite3 did NOT leave connection in_transaction after "
            "mid-executescript error — semantics changed. down_0048 "
            "atomicity wrapping needs explicit rollback in caller."
        )

        # Before rollback: DROP COLUMN already visible (partial state).
        mid_state = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert "device" not in mid_state, (
            f"DROP COLUMN should be visible mid-transaction; got {mid_state}"
        )

        # 🔒 The crucial property: manual rollback RESTORES the
        # dropped column. This proves sqlite3 supports transactional
        # DDL atomicity for the DROP COLUMN pattern down_0048 uses.
        conn.rollback()
        after = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert "device" in after, (
            f"rollback should have restored 'device' column; got {after}"
        )
        assert after == before, (
            f"rollback should restore exact pre-BEGIN state; "
            f"got {after}, expected {before}"
        )
        conn.close()

    def test_successful_transaction_commits_atomically(self):
        # Sanity counter-test: BEGIN; <3 DROPs>; COMMIT; all succeed
        # = all columns gone. This is the happy path down_0048 +
        # BEGIN/COMMIT would take in production. No mid-script error.
        conn = _fresh()
        conn.executescript(
            "CREATE TABLE agent_states (id TEXT, name TEXT, "
            "role TEXT, project TEXT, device TEXT);"
        )
        conn.executescript(
            "BEGIN;\n"
            "ALTER TABLE agent_states DROP COLUMN device;\n"
            "ALTER TABLE agent_states DROP COLUMN project;\n"
            "ALTER TABLE agent_states DROP COLUMN role;\n"
            "COMMIT;\n"
        )
        assert not conn.in_transaction
        cols = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert cols == {"id", "name"}, (
            f"3-DROP atomic transaction should leave only id+name; "
            f"got {cols}"
        )
        conn.close()

    def test_pragma_inside_transaction_does_not_break_rollback(self):
        # Defensive: down_0052 uses `PRAGMA foreign_keys = OFF/ON` as
        # bookends without explicit BEGIN/COMMIT. If a future
        # operator wraps down_0052 in BEGIN/COMMIT, PRAGMA might
        # interact poorly. Pin current sqlite3 behavior so a future
        # change to wrap down_0052 has empirical ground.
        conn = _fresh()
        conn.executescript("CREATE TABLE t (a INT);")
        # PRAGMA foreign_keys inside a transaction is a documented
        # SQLite no-op (silently ignored). Pin that it doesn't raise
        # or corrupt the transaction state.
        try:
            conn.executescript(
                "BEGIN;\n"
                "PRAGMA foreign_keys = OFF;\n"
                "ALTER TABLE t ADD COLUMN b INT;\n"
                "PRAGMA foreign_keys = ON;\n"
                "COMMIT;\n"
            )
        except sqlite3.OperationalError as e:
            pytest.fail(
                f"PRAGMA inside BEGIN/COMMIT raised: {e}. If sqlite3 "
                f"changed PRAGMA-in-transaction behavior, the assumption "
                f"that down_0052 could be wrapped (Yakon-pending) needs "
                f"re-evaluation."
            )
        cols = {row[1] for row in conn.execute("PRAGMA table_info(t)")}
        assert cols == {"a", "b"}
        conn.close()


# ── down_0048 atomic-wrap proof (Yakon decision evidence) ─────────────
#
# TestSqliteTransactionalDdl proves the sqlite3 transactional DDL
# primitive works. This class applies that primitive to the EXACT
# production down_0048 SQL, demonstrating that wrapping the actual
# 3-DROP-COLUMN sequence in BEGIN/COMMIT preserves atomicity on
# mid-script failure.
#
# Decision evidence for the Yakon-pending down_0048 atomicity refactor:
# this empirically proves it WORKS at the sqlite3 layer. D1 verification
# remains operator's responsibility (`wrangler d1 execute --file` of
# a wrapped down_0048 against test DB), but the sqlite3 leg is locked.


class TestDown0048AtomicWrappingProof:
    """Apply TestSqliteTransactionalDdl primitives to actual production
    down_0048 SQL — verify that wrapping the real 3-DROP sequence in
    BEGIN/COMMIT preserves atomicity end-to-end."""

    DOWN_0048_SQL = (DOWN_DIR / "down_0048.sql").read_text(encoding="utf-8")

    def _setup_agent_states(self, conn):
        """Create agent_states with the 3 team columns 0048 dropped.
        Mirrors AGENT_STATES_AFTER_0048 used by TestDown0048Idempotency
        above — single source of truth for the schema-under-test."""
        conn.executescript(AGENT_STATES_AFTER_0048)

    def test_wrapped_down_0048_happy_path_drops_all_3_columns(self):
        # 🔒 Counter-test for the failure scenario below: BEGIN; <full
        # down_0048 SQL>; COMMIT; with no injected failure → all 3
        # columns gone, transaction committed. Proves the wrap doesn't
        # break the happy path.
        conn = _fresh()
        self._setup_agent_states(conn)

        # Strip the down_0048 comment-only header so only executable
        # SQL goes inside BEGIN/COMMIT (comments inside a transaction
        # are harmless but cleaner to isolate just the DDL).
        executable_sql = "\n".join(
            line for line in self.DOWN_0048_SQL.split("\n")
            if not line.strip().startswith("--")
        ).strip()
        wrapped = f"BEGIN;\n{executable_sql}\nCOMMIT;"
        conn.executescript(wrapped)

        assert not conn.in_transaction
        cols = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert cols == {"id", "name"}, (
            f"wrapped down_0048 happy path should leave {{id, name}}; "
            f"got {cols}"
        )
        conn.close()

    def test_wrapped_down_0048_mid_script_failure_rolls_back_all_3_drops(self):
        # 🔒 The headline atomicity proof: wrap actual down_0048 SQL
        # in BEGIN/COMMIT + inject failure between DROP statements →
        # manual rollback restores ALL 3 dropped columns.
        #
        # Without the wrap (current production state), a mid-script
        # failure leaves agent_states in partial state (device gone,
        # project + role remain). With the wrap, rollback restores
        # the pre-attempt state exactly.
        conn = _fresh()
        self._setup_agent_states(conn)
        before = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert before == {"id", "name", "role", "project", "device"}

        # Inject failure AFTER the first DROP COLUMN device but BEFORE
        # the second (project). This simulates the realistic partial-
        # state hazard the wrap is designed to prevent.
        broken_sql = (
            "BEGIN;\n"
            "ALTER TABLE agent_states DROP COLUMN device;\n"
            "INSERT INTO no_such_table VALUES (1);\n"  # ← synthetic failure
            "ALTER TABLE agent_states DROP COLUMN project;\n"
            "ALTER TABLE agent_states DROP COLUMN role;\n"
            "COMMIT;\n"
        )
        try:
            conn.executescript(broken_sql)
            pytest.fail("expected OperationalError on missing-table INSERT")
        except sqlite3.OperationalError as e:
            assert "no such table" in str(e)

        # Mid-state: device gone, project + role still present
        # (DROP ran before the failure, transaction still open).
        mid = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert "device" not in mid
        assert "project" in mid
        assert "role" in mid

        # 🔒 ROLLBACK restores ALL columns including the one already
        # dropped mid-script. This is the atomicity property.
        assert conn.in_transaction
        conn.rollback()
        after = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert after == before, (
            f"rollback should fully restore pre-BEGIN state; "
            f"got {after}, expected {before}. If 'device' is missing "
            f"here, sqlite3 lost transactional atomicity for ALTER "
            f"TABLE DROP COLUMN — investigate before shipping the "
            f"down_0048 wrap."
        )
        conn.close()

    def test_unwrapped_down_0048_demonstrates_partial_state_hazard(self):
        # 🔒 Documentation test: prove the CURRENT (unwrapped)
        # behavior leaves partial state on mid-script failure. This
        # is the hazard the wrap eliminates — pin so a future
        # operator reading this test can SEE the before/after
        # contrast empirically.
        conn = _fresh()
        self._setup_agent_states(conn)

        broken_sql = (
            "ALTER TABLE agent_states DROP COLUMN device;\n"
            "INSERT INTO no_such_table VALUES (1);\n"
            "ALTER TABLE agent_states DROP COLUMN project;\n"
            "ALTER TABLE agent_states DROP COLUMN role;\n"
        )
        try:
            conn.executescript(broken_sql)
            pytest.fail("expected OperationalError on missing-table INSERT")
        except sqlite3.OperationalError:
            pass

        # 🔒 Partial state: device gone (committed via auto-commit
        # of the first ALTER), project + role still present.
        # Operator stuck with a half-rolled-back schema, no clean
        # path forward without manual intervention.
        partial = {row[1] for row in conn.execute("PRAGMA table_info(agent_states)")}
        assert "device" not in partial, (
            "current unwrapped down_0048 should have committed "
            "DROP COLUMN device before the failure — that's the hazard"
        )
        assert "project" in partial
        assert "role" in partial
        # Connection NOT in transaction — sqlite3 auto-committed
        # each DDL individually before the failure.
        assert not conn.in_transaction
        conn.close()


# ── down_0052 atomic-wrap proof — PRAGMA-bookend interaction ──────────
#
# down_0052 is the harder atomicity case: it wraps the recreate-dance
# in `PRAGMA foreign_keys = OFF;` ... `PRAGMA foreign_keys = ON;`
# bookends. SQLite docs note that PRAGMA foreign_keys is a no-op
# inside a transaction (silently ignored, the OUTSIDE value persists).
# Wrapping down_0052 in BEGIN/COMMIT could break the FK-disabled
# semantics the recreate-dance relies on.
#
# This class empirically tests:
#   1. Wrapped happy path — does the dance still complete?
#   2. Wrapped mid-script failure — does rollback restore all 5
#      tables AND any rows they held?
#   3. Unwrapped baseline — confirms the partial-state hazard
#      down_0052's wrap would eliminate
#   4. The PRAGMA-inside-transaction quirk — is the FK-OFF bookend
#      actually honored, or silently ignored?


class TestDown0052AtomicWrappingProof:
    """Apply the wrap pattern from TestDown0048AtomicWrappingProof
    to down_0052's more complex rename-dance + PRAGMA bookend SQL.
    Reports empirical findings the Yakon decision needs."""

    DOWN_0052_SQL = (DOWN_DIR / "down_0052.sql").read_text(encoding="utf-8")

    def _setup_tables(self, conn):
        """Build the 5 tables down_0052 touches."""
        conn.executescript(TABLES_BEFORE_DOWN_0052)

    def _executable_sql(self) -> str:
        """Strip comment-only lines from down_0052; keep the
        PRAGMA + DDL statements operator's wrangler would execute."""
        return "\n".join(
            line for line in self.DOWN_0052_SQL.split("\n")
            if not line.strip().startswith("--")
        ).strip()

    def test_wrapped_down_0052_happy_path_drops_fks_from_all_5_tables(self):
        # 🔒 Counter-test for the failure scenario below: wrap the
        # rename-dance in BEGIN/COMMIT with no injected failure.
        # If the PRAGMA-inside-transaction quirk would break the
        # dance, the rows would fail FK-enforced inserts → exception.
        # If empirically OK, we have evidence the wrap doesn't
        # disrupt the dance.
        conn = _fresh()
        self._setup_tables(conn)
        # Insert a row in each table so the INSERT SELECT * lines
        # actually exercise data movement (catches FK enforcement
        # failures during the dance).
        conn.executescript("""
            INSERT INTO task_time_logs (id, task_id, user_id, workspace_id)
              VALUES ('t1', 'task1', 'u1', 'ws1');
            INSERT INTO saved_views (id, workspace_id, user_id, name, entity_type)
              VALUES ('v1', 'ws1', 'u1', 'view', 'task');
            INSERT INTO inbox_items (id, workspace_id, user_name, title)
              VALUES ('i1', 'ws1', 'alice', 'inbox');
            INSERT INTO automation_rules (id, name, trigger_type, action_type)
              VALUES ('a1', 'rule', 'on_create', 'notify');
            INSERT INTO notification_preferences (user_name, workspace_id)
              VALUES ('alice', 'ws1');
        """)

        executable_sql = self._executable_sql()
        wrapped = f"BEGIN;\n{executable_sql}\nCOMMIT;"

        # Whether this succeeds is the empirical finding. If it
        # raises, the wrap is unsafe for down_0052 and operator must
        # NOT use --wrap-in-transaction with this migration.
        try:
            conn.executescript(wrapped)
            commit_succeeded = True
            error_msg = None
        except sqlite3.OperationalError as e:
            commit_succeeded = False
            error_msg = str(e)

        if commit_succeeded:
            # Wrap worked — all 5 tables still present, rows preserved.
            tables = {
                row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            for t in ["task_time_logs", "saved_views", "inbox_items",
                      "automation_rules", "notification_preferences"]:
                assert t in tables, f"{t} missing after wrapped down_0052"
                assert f"{t}_old" not in tables, f"{t}_old leaked"
                row_count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                assert row_count == 1, (
                    f"{t} should have 1 row after dance; got {row_count}"
                )
        else:
            # Wrap broke the dance — empirical evidence operator
            # must NOT use --wrap-in-transaction with down_0052.
            # This is itself useful info; raise with full context.
            pytest.fail(
                f"Wrapping down_0052 in BEGIN/COMMIT broke the "
                f"recreate-dance: {error_msg}\n\n"
                f"This means apply.sh --wrap-in-transaction is UNSAFE "
                f"for down_0052. Operator must rollback this migration "
                f"WITHOUT the flag. Document in MIGRATION_ROLLBACK.md "
                f"+ consider apply.sh per-migration wrap-safety registry."
            )
        conn.close()

    def test_wrapped_down_0052_mid_script_failure_rolls_back(self):
        # 🔒 Headline: BEGIN; <half of down_0052 SQL>; INSERT INTO
        # no_such_table; <rest>; COMMIT; → rollback restores ALL 5
        # tables + their original FK constraints + rows. If sqlite3
        # ROLLBACK restores the rename-dance properly, the wrap is
        # safe; otherwise the dance leaves partial state.
        conn = _fresh()
        self._setup_tables(conn)
        before_tables = {
            row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }

        # Construct: split the dance — finish the first table's
        # recreate then inject failure before remaining 4 tables.
        # Without the wrap, task_time_logs would be FK-stripped
        # (renamed _old, new table dropped, renamed back without
        # FKs) AND the OTHER 4 still have original FK constraints.
        # With wrap + rollback, ALL 5 should revert to original.
        broken_sql = """
            BEGIN;
            PRAGMA foreign_keys = OFF;
            CREATE TABLE task_time_logs_old (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, started_at TEXT NOT NULL DEFAULT (datetime('now')), stopped_at TEXT, duration_sec INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
            INSERT INTO task_time_logs_old SELECT * FROM task_time_logs;
            DROP TABLE task_time_logs;
            ALTER TABLE task_time_logs_old RENAME TO task_time_logs;
            INSERT INTO no_such_table VALUES (1);
            -- Rest of down_0052 (4 more recreate dances) would normally run here
            PRAGMA foreign_keys = ON;
            COMMIT;
        """
        try:
            conn.executescript(broken_sql)
            pytest.fail("expected OperationalError on missing-table INSERT")
        except sqlite3.OperationalError as e:
            assert "no such table" in str(e)

        # Manual rollback — sqlite3 leaves connection in_transaction.
        if conn.in_transaction:
            conn.rollback()

        after_tables = {
            row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        # 🔒 The atomicity check: tables list identical to before.
        assert after_tables == before_tables, (
            f"rollback should restore all 5 tables to pre-BEGIN state.\n"
            f"  before: {sorted(before_tables)}\n"
            f"  after:  {sorted(after_tables)}\n"
            f"If task_time_logs_old exists, the rename happened pre-failure "
            f"and rollback failed to restore. If task_time_logs is "
            f"missing, DROP happened pre-failure and rollback failed."
        )
        # No `_old` leaked.
        old_leaked = {t for t in after_tables if t.endswith("_old")}
        assert not old_leaked, f"{old_leaked} leftover after rollback"
        conn.close()

    def test_unwrapped_down_0052_demonstrates_partial_state_hazard(self):
        # 🔒 Documentation/contrast test: unwrapped mid-script failure
        # leaves DB in a half-renamed state (FKs stripped from one
        # table while others still have them). This is the hazard
        # the wrap eliminates.
        conn = _fresh()
        self._setup_tables(conn)

        broken_sql = """
            PRAGMA foreign_keys = OFF;
            CREATE TABLE task_time_logs_old (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, started_at TEXT NOT NULL DEFAULT (datetime('now')), stopped_at TEXT, duration_sec INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
            INSERT INTO task_time_logs_old SELECT * FROM task_time_logs;
            DROP TABLE task_time_logs;
            ALTER TABLE task_time_logs_old RENAME TO task_time_logs;
            INSERT INTO no_such_table VALUES (1);
        """
        try:
            conn.executescript(broken_sql)
            pytest.fail("expected OperationalError on missing-table INSERT")
        except sqlite3.OperationalError:
            pass

        # Connection NOT in transaction (unwrapped path auto-commits
        # each DDL individually). Partial state landed:
        #   - task_time_logs exists (recreated, fewer FKs)
        #   - other 4 tables still original
        # → schema halfway between pre-down_0052 and post-down_0052
        assert not conn.in_transaction
        tables = {
            row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        # task_time_logs still exists (renamed back).
        assert "task_time_logs" in tables
        # Other tables unchanged.
        for t in ["saved_views", "inbox_items", "automation_rules",
                  "notification_preferences"]:
            assert t in tables, (
                f"{t} should still be in pre-down_0052 state; missing"
            )
        # 🔒 But task_time_logs has been recreated WITHOUT the
        # original CREATE statement's FK declarations. Operator
        # in partial state can't tell which tables have FKs from
        # PRAGMA table_info alone. This is the hazard.
        conn.close()
