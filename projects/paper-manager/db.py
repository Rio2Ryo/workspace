"""SQLite-based session and job storage."""
import json
import os
import secrets
import sqlite3
import string
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

if os.environ.get("DATABASE_PATH"):
    DB_PATH = Path(os.environ["DATABASE_PATH"])
elif os.environ.get("VERCEL"):
    DB_PATH = Path("/tmp/paper-manager.db")
else:
    DB_PATH = Path(__file__).parent / "data" / "app.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                access_token TEXT,
                workspace_id TEXT,
                workspace_name TEXT,
                database_id TEXT,
                database_name TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS api_keys (
                api_key TEXT PRIMARY KEY,
                session_id TEXT,
                label TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                session_id TEXT,
                status TEXT DEFAULT 'pending',
                result TEXT,
                error TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS papers (
                paper_id TEXT PRIMARY KEY,
                session_id TEXT,
                job_id TEXT,
                title TEXT,
                authors TEXT,
                journal TEXT,
                year TEXT,
                volume TEXT,
                issue TEXT,
                pages TEXT,
                filename TEXT,
                summary TEXT,
                notion_page_id TEXT,
                notion_url TEXT,
                cinii_verified INTEGER DEFAULT 0,
                ndl_verified INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS papers_session ON papers(session_id);
            CREATE INDEX IF NOT EXISTS papers_created ON papers(created_at DESC);
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                notion_user_id TEXT UNIQUE NOT NULL,
                name TEXT DEFAULT '',
                email TEXT DEFAULT '',
                avatar_url TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS parent_child_links (
                link_id TEXT PRIMARY KEY,
                parent_user_id TEXT NOT NULL,
                child_user_id TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                UNIQUE(parent_user_id, child_user_id)
            );
            CREATE INDEX IF NOT EXISTS pcl_parent ON parent_child_links(parent_user_id);
            CREATE INDEX IF NOT EXISTS pcl_child ON parent_child_links(child_user_id);
            CREATE TABLE IF NOT EXISTS invite_codes (
                code TEXT PRIMARY KEY,
                parent_user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                consumed_by TEXT,
                consumed_at TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS inv_parent ON invite_codes(parent_user_id);
        """)
        # Migrations for existing DBs
        paper_cols = {r[1] for r in conn.execute("PRAGMA table_info(papers)").fetchall()}
        if "memo" not in paper_cols:
            conn.execute("ALTER TABLE papers ADD COLUMN memo TEXT DEFAULT ''")
        if "updated_at" not in paper_cols:
            conn.execute("ALTER TABLE papers ADD COLUMN updated_at TEXT")
        if "manually_edited" not in paper_cols:
            conn.execute("ALTER TABLE papers ADD COLUMN manually_edited INTEGER DEFAULT 0")
        session_cols = {r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()}
        if "column_mapping" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN column_mapping TEXT DEFAULT '{}'")
        if "scholar_list" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN scholar_list TEXT DEFAULT '[]'")
        if "user_id" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN user_id TEXT")


def get_session(session_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    return dict(row) if row else None


def save_session(session_id: str, data: dict):
    with _conn() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO sessions
                (session_id, access_token, workspace_id, workspace_name, database_id, database_name)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            session_id,
            data.get("access_token"),
            data.get("workspace_id"),
            data.get("workspace_name"),
            data.get("database_id"),
            data.get("database_name"),
        ))


def get_scholar_list(session_id: str) -> list:
    with _conn() as conn:
        row = conn.execute(
            "SELECT scholar_list FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    if not row or not row["scholar_list"]:
        return []
    try:
        return json.loads(row["scholar_list"])
    except Exception:
        return []


def save_scholar_list(session_id: str, scholars: list):
    with _conn() as conn:
        conn.execute(
            "UPDATE sessions SET scholar_list = ? WHERE session_id = ?",
            (json.dumps(scholars, ensure_ascii=False), session_id)
        )


def get_column_mapping(session_id: str) -> dict:
    with _conn() as conn:
        row = conn.execute(
            "SELECT column_mapping FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    if not row or not row["column_mapping"]:
        return {}
    try:
        return json.loads(row["column_mapping"])
    except Exception:
        return {}


def save_column_mapping(session_id: str, mapping: dict):
    with _conn() as conn:
        conn.execute(
            "UPDATE sessions SET column_mapping = ? WHERE session_id = ?",
            (json.dumps(mapping, ensure_ascii=False), session_id)
        )


def delete_session(session_id: str):
    with _conn() as conn:
        conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM api_keys WHERE session_id = ?", (session_id,))


def create_api_key(session_id: str, label: str = "default") -> str:
    api_key = f"pm_{uuid.uuid4().hex}"
    with _conn() as conn:
        conn.execute(
            "INSERT INTO api_keys (api_key, session_id, label) VALUES (?, ?, ?)",
            (api_key, session_id, label),
        )
    return api_key


def get_session_by_api_key(api_key: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("""
            SELECT s.* FROM sessions s
            JOIN api_keys k ON s.session_id = k.session_id
            WHERE k.api_key = ?
        """, (api_key,)).fetchone()
    return dict(row) if row else None


def create_job(session_id: str) -> str:
    job_id = uuid.uuid4().hex
    with _conn() as conn:
        conn.execute(
            "INSERT INTO jobs (job_id, session_id, status) VALUES (?, ?, 'pending')",
            (job_id, session_id),
        )
    return job_id


def update_job(job_id: str, status: str, result: Optional[dict] = None, error: Optional[str] = None):
    with _conn() as conn:
        conn.execute(
            "UPDATE jobs SET status = ?, result = ?, error = ? WHERE job_id = ?",
            (status, json.dumps(result) if result else None, error, job_id),
        )


def save_paper(session_id: str, job_id: str, meta: dict, filename: str,
               summary: str, notion_page_id: str, notion_url: str) -> str:
    paper_id = uuid.uuid4().hex
    authors = json.dumps(meta.get("authors") or [], ensure_ascii=False)
    with _conn() as conn:
        conn.execute("""
            INSERT INTO papers
                (paper_id, session_id, job_id, title, authors, journal, year,
                 volume, issue, pages, filename, summary, notion_page_id, notion_url,
                 cinii_verified, ndl_verified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            paper_id, session_id, job_id,
            meta.get("title"), authors, meta.get("journal"), meta.get("year"),
            meta.get("volume"), meta.get("issue"), meta.get("pages"),
            filename, summary, notion_page_id, notion_url,
            1 if meta.get("cinii_result") else 0,
            1 if meta.get("ndl_result") else 0,
        ))
    return paper_id


def list_papers(session_id: str, search: Optional[str] = None, limit: int = 50,
                sort: str = "newest", cinii_only: bool = False,
                ndl_only: bool = False, memo_only: bool = False) -> list:
    order = {
        "newest": "created_at DESC",
        "oldest": "created_at ASC",
        "year_desc": "CAST(year AS INTEGER) DESC, created_at DESC",
        "year_asc": "CAST(year AS INTEGER) ASC, created_at DESC",
    }.get(sort, "created_at DESC")

    conditions = ["session_id = ?"]
    params: list = [session_id]

    if search:
        q = f"%{search}%"
        conditions.append(
            "(title LIKE ? OR authors LIKE ? OR journal LIKE ? OR summary LIKE ? OR memo LIKE ?)"
        )
        params.extend([q, q, q, q, q])
    if cinii_only:
        conditions.append("cinii_verified = 1")
    if ndl_only:
        conditions.append("ndl_verified = 1")
    if memo_only:
        conditions.append("memo != '' AND memo IS NOT NULL")

    where = " AND ".join(conditions)
    params.append(limit)

    with _conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM papers WHERE {where} ORDER BY {order} LIMIT ?", params
        ).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        d["authors"] = json.loads(d["authors"]) if d.get("authors") else []
        result.append(d)
    return result


def get_paper(paper_id: str, session_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM papers WHERE paper_id = ? AND session_id = ?",
            (paper_id, session_id)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["authors"] = json.loads(d["authors"]) if d.get("authors") else []
    return d


def update_paper_meta(paper_id: str, session_id: str, fields: dict):
    allowed = {"title", "authors", "journal", "year", "volume", "issue", "pages", "filename"}
    sets = []
    params = []
    for k, v in fields.items():
        if k not in allowed:
            continue
        if k == "authors" and isinstance(v, list):
            v = json.dumps(v, ensure_ascii=False)
        sets.append(f"{k} = ?")
        params.append(v)
    if not sets:
        return
    sets.extend(["updated_at = datetime('now')", "manually_edited = 1"])
    params.extend([paper_id, session_id])
    with _conn() as conn:
        conn.execute(
            f"UPDATE papers SET {', '.join(sets)} WHERE paper_id = ? AND session_id = ?",
            params
        )


def update_paper_memo(paper_id: str, session_id: str, memo: str):
    with _conn() as conn:
        conn.execute(
            "UPDATE papers SET memo = ? WHERE paper_id = ? AND session_id = ?",
            (memo, paper_id, session_id)
        )


def list_related_papers(paper_id: str, session_id: str, authors: list, journal: str, limit: int = 5) -> list:
    """Return papers sharing an author or journal, excluding self."""
    with _conn() as conn:
        rows = []
        # Same author match (any author substring)
        for author in (authors or []):
            q = f"%{author}%"
            found = conn.execute("""
                SELECT * FROM papers
                WHERE session_id = ? AND paper_id != ? AND authors LIKE ?
                ORDER BY created_at DESC LIMIT ?
            """, (session_id, paper_id, q, limit)).fetchall()
            rows.extend(found)
        # Same journal match
        if journal:
            found = conn.execute("""
                SELECT * FROM papers
                WHERE session_id = ? AND paper_id != ? AND journal = ?
                ORDER BY created_at DESC LIMIT ?
            """, (session_id, paper_id, journal, limit)).fetchall()
            rows.extend(found)
    # Deduplicate by paper_id
    seen = set()
    result = []
    for row in rows:
        d = dict(row)
        if d["paper_id"] not in seen:
            seen.add(d["paper_id"])
            d["authors"] = json.loads(d["authors"]) if d.get("authors") else []
            result.append(d)
    return result[:limit]


def get_job(job_id: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    if d.get("result"):
        d["result"] = json.loads(d["result"])
    return d


# --- Users ---

def _user_public(row: sqlite3.Row) -> dict:
    return {
        "user_id": row["user_id"],
        "notion_user_id": row["notion_user_id"],
        "name": row["name"] or "",
        "email": row["email"] or "",
        "avatar_url": row["avatar_url"] or "",
    }


def get_or_create_user(notion_user_id: str, *, name: str = "", email: str = "",
                       avatar_url: str = "") -> dict:
    """Return {user_id, notion_user_id, name, email, avatar_url}.
    Updates name/email/avatar on existing row when non-empty values are provided.
    """
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE notion_user_id = ?", (notion_user_id,)
        ).fetchone()
        if row:
            updates = []
            params: list = []
            if name:
                updates.append("name = ?")
                params.append(name)
            if email:
                updates.append("email = ?")
                params.append(email)
            if avatar_url:
                updates.append("avatar_url = ?")
                params.append(avatar_url)
            if updates:
                params.append(row["user_id"])
                conn.execute(
                    f"UPDATE users SET {', '.join(updates)} WHERE user_id = ?",
                    params,
                )
                row = conn.execute(
                    "SELECT * FROM users WHERE user_id = ?", (row["user_id"],)
                ).fetchone()
            return _user_public(row)

        user_id = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO users (user_id, notion_user_id, name, email, avatar_url) "
            "VALUES (?, ?, ?, ?, ?)",
            (user_id, notion_user_id, name or "", email or "", avatar_url or ""),
        )
        row = conn.execute(
            "SELECT * FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
        return _user_public(row)


def get_user(user_id: str) -> Optional[dict]:
    """Return user row or None."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE user_id = ?", (user_id,)
        ).fetchone()
    return _user_public(row) if row else None


def get_user_by_session(session_id: str) -> Optional[dict]:
    """JOIN sessions.user_id -> users. Returns user row or None."""
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT u.* FROM users u
            JOIN sessions s ON s.user_id = u.user_id
            WHERE s.session_id = ?
            """,
            (session_id,),
        ).fetchone()
    return _user_public(row) if row else None


def link_session_to_user(session_id: str, user_id: str) -> None:
    """UPDATE sessions SET user_id = ? WHERE session_id = ?."""
    with _conn() as conn:
        conn.execute(
            "UPDATE sessions SET user_id = ? WHERE session_id = ?",
            (user_id, session_id),
        )


# --- Parent/Child ---

def _user_exists(conn: sqlite3.Connection, user_id: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM users WHERE user_id = ?", (user_id,)
    ).fetchone() is not None


def add_parent_child(parent_user_id: str, child_user_id: str) -> bool:
    """Returns True on success, False if parent_user_id == child_user_id,
    duplicate, or either user missing. Also reject if the parent is already
    someone else's child (no grandparent chains — a user with any parent
    cannot become a parent themselves) and if the child already has any parent.
    """
    if not parent_user_id or not child_user_id:
        return False
    if parent_user_id == child_user_id:
        return False
    with _conn() as conn:
        if not _user_exists(conn, parent_user_id):
            return False
        if not _user_exists(conn, child_user_id):
            return False
        # Parent must not already be somebody else's child
        if conn.execute(
            "SELECT 1 FROM parent_child_links WHERE child_user_id = ?",
            (parent_user_id,),
        ).fetchone():
            return False
        # Child must not already have any parent
        if conn.execute(
            "SELECT 1 FROM parent_child_links WHERE child_user_id = ?",
            (child_user_id,),
        ).fetchone():
            return False
        # Child must not already be some user's parent (no grandparent chains)
        if conn.execute(
            "SELECT 1 FROM parent_child_links WHERE parent_user_id = ?",
            (child_user_id,),
        ).fetchone():
            return False
        # Duplicate guard (covered above but keep explicit check)
        if conn.execute(
            "SELECT 1 FROM parent_child_links "
            "WHERE parent_user_id = ? AND child_user_id = ?",
            (parent_user_id, child_user_id),
        ).fetchone():
            return False
        try:
            conn.execute(
                "INSERT INTO parent_child_links (link_id, parent_user_id, child_user_id) "
                "VALUES (?, ?, ?)",
                (uuid.uuid4().hex, parent_user_id, child_user_id),
            )
        except sqlite3.IntegrityError:
            return False
    return True


def remove_parent_child(parent_user_id: str, child_user_id: str) -> None:
    """Delete the link. No-op if not found."""
    with _conn() as conn:
        conn.execute(
            "DELETE FROM parent_child_links "
            "WHERE parent_user_id = ? AND child_user_id = ?",
            (parent_user_id, child_user_id),
        )


def list_children(parent_user_id: str) -> list:
    """Return [{user_id, notion_user_id, name, email, avatar_url, linked_at}]
    sorted by linked_at desc.
    """
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT u.user_id, u.notion_user_id, u.name, u.email, u.avatar_url,
                   l.created_at AS linked_at
            FROM parent_child_links l
            JOIN users u ON u.user_id = l.child_user_id
            WHERE l.parent_user_id = ?
            ORDER BY l.created_at DESC
            """,
            (parent_user_id,),
        ).fetchall()
    return [
        {
            "user_id": r["user_id"],
            "notion_user_id": r["notion_user_id"],
            "name": r["name"] or "",
            "email": r["email"] or "",
            "avatar_url": r["avatar_url"] or "",
            "linked_at": r["linked_at"],
        }
        for r in rows
    ]


def list_parents(child_user_id: str) -> list:
    """Same shape. Since max one parent per child, list of 0 or 1."""
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT u.user_id, u.notion_user_id, u.name, u.email, u.avatar_url,
                   l.created_at AS linked_at
            FROM parent_child_links l
            JOIN users u ON u.user_id = l.parent_user_id
            WHERE l.child_user_id = ?
            ORDER BY l.created_at DESC
            """,
            (child_user_id,),
        ).fetchall()
    return [
        {
            "user_id": r["user_id"],
            "notion_user_id": r["notion_user_id"],
            "name": r["name"] or "",
            "email": r["email"] or "",
            "avatar_url": r["avatar_url"] or "",
            "linked_at": r["linked_at"],
        }
        for r in rows
    ]


def is_parent_of(parent_user_id: str, child_user_id: str) -> bool:
    """Quick existence check."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM parent_child_links "
            "WHERE parent_user_id = ? AND child_user_id = ?",
            (parent_user_id, child_user_id),
        ).fetchone()
    return row is not None


# --- Invites ---

_INVITE_ALPHABET = "".join(
    ch for ch in (string.ascii_uppercase + string.digits)
    if ch not in {"0", "O", "1", "I"}
)


def _gen_invite_code() -> str:
    """8-char uppercase alphanum, non-ambiguous (no 0/O, 1/I). secrets-based."""
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(8))


def create_invite_code(parent_user_id: str, ttl_hours: int = 24 * 7) -> dict:
    """Insert a fresh code expiring after ttl_hours. Returns {code, expires_at}."""
    expires_at = (datetime.utcnow() + timedelta(hours=ttl_hours)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    with _conn() as conn:
        while True:
            code = _gen_invite_code()
            try:
                conn.execute(
                    "INSERT INTO invite_codes (code, parent_user_id, expires_at) "
                    "VALUES (?, ?, ?)",
                    (code, parent_user_id, expires_at),
                )
                break
            except sqlite3.IntegrityError:
                # Extremely unlikely collision — try again
                continue
    return {"code": code, "expires_at": expires_at}


def list_active_invites(parent_user_id: str) -> list:
    """Return unconsumed + unexpired codes sorted by created_at desc:
    [{code, expires_at, created_at}].
    """
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT code, expires_at, created_at
            FROM invite_codes
            WHERE parent_user_id = ?
              AND consumed_by IS NULL
              AND expires_at > ?
            ORDER BY created_at DESC
            """,
            (parent_user_id, now),
        ).fetchall()
    return [
        {"code": r["code"], "expires_at": r["expires_at"], "created_at": r["created_at"]}
        for r in rows
    ]


def revoke_invite(code: str, parent_user_id: str) -> bool:
    """Delete if owned by this parent and not yet consumed. Returns True on success."""
    with _conn() as conn:
        cur = conn.execute(
            "DELETE FROM invite_codes "
            "WHERE code = ? AND parent_user_id = ? AND consumed_by IS NULL",
            (code, parent_user_id),
        )
        return cur.rowcount > 0


def consume_invite(code: str, child_user_id: str) -> Optional[dict]:
    """Atomically consume a valid, unexpired, unconsumed code. Reject if child
    would become its own parent or if child is already some user's parent
    (no grandparent chains). On success mark code consumed, create
    parent_child_links row, return {parent_user_id}. On failure return None.
    Use a transaction.
    """
    if not code or not child_user_id:
        return None
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = _conn()
    try:
        conn.isolation_level = None  # manual transaction control
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """
            SELECT code, parent_user_id, expires_at, consumed_by
            FROM invite_codes
            WHERE code = ?
            """,
            (code,),
        ).fetchone()
        if not row:
            conn.execute("ROLLBACK")
            return None
        if row["consumed_by"] is not None:
            conn.execute("ROLLBACK")
            return None
        if row["expires_at"] <= now:
            conn.execute("ROLLBACK")
            return None
        parent_user_id = row["parent_user_id"]
        if parent_user_id == child_user_id:
            conn.execute("ROLLBACK")
            return None
        # Both users must exist
        if not _user_exists(conn, parent_user_id):
            conn.execute("ROLLBACK")
            return None
        if not _user_exists(conn, child_user_id):
            conn.execute("ROLLBACK")
            return None
        # Child must not already have a parent
        if conn.execute(
            "SELECT 1 FROM parent_child_links WHERE child_user_id = ?",
            (child_user_id,),
        ).fetchone():
            conn.execute("ROLLBACK")
            return None
        # Child must not already be a parent (no grandparent chains)
        if conn.execute(
            "SELECT 1 FROM parent_child_links WHERE parent_user_id = ?",
            (child_user_id,),
        ).fetchone():
            conn.execute("ROLLBACK")
            return None
        # Parent must not itself be someone else's child
        if conn.execute(
            "SELECT 1 FROM parent_child_links WHERE child_user_id = ?",
            (parent_user_id,),
        ).fetchone():
            conn.execute("ROLLBACK")
            return None
        # Duplicate guard
        if conn.execute(
            "SELECT 1 FROM parent_child_links "
            "WHERE parent_user_id = ? AND child_user_id = ?",
            (parent_user_id, child_user_id),
        ).fetchone():
            conn.execute("ROLLBACK")
            return None
        try:
            conn.execute(
                "INSERT INTO parent_child_links (link_id, parent_user_id, child_user_id) "
                "VALUES (?, ?, ?)",
                (uuid.uuid4().hex, parent_user_id, child_user_id),
            )
            conn.execute(
                "UPDATE invite_codes SET consumed_by = ?, consumed_at = ? "
                "WHERE code = ? AND consumed_by IS NULL",
                (child_user_id, now, code),
            )
        except sqlite3.IntegrityError:
            conn.execute("ROLLBACK")
            return None
        conn.execute("COMMIT")
        return {"parent_user_id": parent_user_id}
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except Exception:
            pass
        return None
    finally:
        conn.close()


# --- Access-scoped queries ---

def session_ids_for_user(user_id: str) -> list:
    """All session_ids whose sessions.user_id = user_id."""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT session_id FROM sessions WHERE user_id = ?", (user_id,)
        ).fetchall()
    return [r["session_id"] for r in rows]


def list_papers_by_user(user_id: str, q: str = "", sort: str = "newest",
                        limit: int = 1000) -> list:
    """Papers where session_id IN (session_ids_for_user(user_id)).
    Same filter/sort semantics as list_papers. Add `user_id` to result rows.
    """
    session_ids = session_ids_for_user(user_id)
    if not session_ids:
        return []

    order = {
        "newest": "created_at DESC",
        "oldest": "created_at ASC",
        "year_desc": "CAST(year AS INTEGER) DESC, created_at DESC",
        "year_asc": "CAST(year AS INTEGER) ASC, created_at DESC",
    }.get(sort, "created_at DESC")

    placeholders = ",".join("?" for _ in session_ids)
    conditions = [f"session_id IN ({placeholders})"]
    params: list = list(session_ids)

    if q:
        like = f"%{q}%"
        conditions.append(
            "(title LIKE ? OR authors LIKE ? OR journal LIKE ? "
            "OR summary LIKE ? OR memo LIKE ?)"
        )
        params.extend([like, like, like, like, like])

    where = " AND ".join(conditions)
    params.append(limit)

    with _conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM papers WHERE {where} ORDER BY {order} LIMIT ?",
            params,
        ).fetchall()

    result = []
    for row in rows:
        d = dict(row)
        d["authors"] = json.loads(d["authors"]) if d.get("authors") else []
        d["user_id"] = user_id
        result.append(d)
    return result
