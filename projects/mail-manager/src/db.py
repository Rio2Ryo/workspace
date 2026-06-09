"""SQLite database layer for mail-manager."""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).parent.parent / "data" / "mail.db"


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db_conn(db_path: Path = DB_PATH):
    conn = get_connection(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: Path = DB_PATH):
    """Create tables if they don't exist."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with db_conn(db_path) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS threads (
                thread_id    TEXT PRIMARY KEY,
                subject      TEXT,
                participants TEXT,      -- JSON array of email addresses
                first_date   TEXT,
                last_date    TEXT,
                message_count INTEGER DEFAULT 0,
                summary      TEXT,
                theme        TEXT,
                importance   INTEGER,
                labels       TEXT,      -- JSON array
                synced_at    TEXT
            );

            CREATE TABLE IF NOT EXISTS messages (
                message_id   TEXT PRIMARY KEY,
                thread_id    TEXT REFERENCES threads(thread_id),
                subject      TEXT,
                sender       TEXT,
                recipients   TEXT,      -- JSON array
                date         TEXT,
                body_text    TEXT,
                body_html    TEXT,
                summary      TEXT,
                is_sent      INTEGER DEFAULT 0,
                synced_at    TEXT
            );

            CREATE TABLE IF NOT EXISTS attachments (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id   TEXT REFERENCES messages(message_id),
                filename     TEXT,
                mime_type    TEXT,
                size_bytes   INTEGER,
                saved_path   TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                message_id UNINDEXED,
                thread_id  UNINDEXED,
                subject,
                sender     UNINDEXED,
                date       UNINDEXED,
                body_text,
                summary,
                content='messages',
                content_rowid='rowid',
                tokenize='trigram'
            );

            CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
                INSERT INTO messages_fts(rowid, message_id, thread_id, subject, sender, date, body_text, summary)
                VALUES (new.rowid, new.message_id, new.thread_id, new.subject, new.sender, new.date, new.body_text, new.summary);
            END;

            CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
                INSERT INTO messages_fts(messages_fts, rowid, message_id, thread_id, subject, sender, date, body_text, summary)
                VALUES ('delete', old.rowid, old.message_id, old.thread_id, old.subject, old.sender, old.date, old.body_text, old.summary);
                INSERT INTO messages_fts(rowid, message_id, thread_id, subject, sender, date, body_text, summary)
                VALUES (new.rowid, new.message_id, new.thread_id, new.subject, new.sender, new.date, new.body_text, new.summary);
            END;
        """)


# ── threads ──────────────────────────────────────────────────────────────────

def upsert_thread(conn: sqlite3.Connection, thread: dict):
    conn.execute("""
        INSERT INTO threads (thread_id, subject, participants, first_date, last_date,
                             message_count, summary, theme, importance, labels, synced_at)
        VALUES (:thread_id, :subject, :participants, :first_date, :last_date,
                :message_count, :summary, :theme, :importance, :labels, :synced_at)
        ON CONFLICT(thread_id) DO UPDATE SET
            subject       = excluded.subject,
            participants  = excluded.participants,
            last_date     = excluded.last_date,
            message_count = excluded.message_count,
            synced_at     = excluded.synced_at
    """, thread)


def update_thread_summary(conn: sqlite3.Connection, thread_id: str, summary: str):
    conn.execute(
        "UPDATE threads SET summary = ? WHERE thread_id = ?",
        (summary, thread_id)
    )


def get_thread(conn: sqlite3.Connection, thread_id: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM threads WHERE thread_id = ?", (thread_id,)
    ).fetchone()


def list_threads(conn: sqlite3.Connection, limit: int = 50, offset: int = 0):
    return conn.execute(
        "SELECT * FROM threads ORDER BY last_date DESC LIMIT ? OFFSET ?",
        (limit, offset)
    ).fetchall()


# ── messages ─────────────────────────────────────────────────────────────────

def upsert_message(conn: sqlite3.Connection, msg: dict):
    conn.execute("""
        INSERT INTO messages (message_id, thread_id, subject, sender, recipients,
                              date, body_text, body_html, summary, is_sent, synced_at)
        VALUES (:message_id, :thread_id, :subject, :sender, :recipients,
                :date, :body_text, :body_html, :summary, :is_sent, :synced_at)
        ON CONFLICT(message_id) DO NOTHING
    """, msg)


def update_message_summary(conn: sqlite3.Connection, message_id: str, summary: str):
    conn.execute(
        "UPDATE messages SET summary = ? WHERE message_id = ?",
        (summary, message_id)
    )


def get_messages_for_thread(conn: sqlite3.Connection, thread_id: str):
    return conn.execute(
        "SELECT * FROM messages WHERE thread_id = ? ORDER BY date ASC",
        (thread_id,)
    ).fetchall()


# ── attachments ───────────────────────────────────────────────────────────────

def insert_attachment(conn: sqlite3.Connection, att: dict):
    conn.execute("""
        INSERT OR IGNORE INTO attachments (message_id, filename, mime_type, size_bytes, saved_path)
        VALUES (:message_id, :filename, :mime_type, :size_bytes, :saved_path)
    """, att)


def get_attachments_for_message(conn: sqlite3.Connection, message_id: str):
    return conn.execute(
        "SELECT * FROM attachments WHERE message_id = ?", (message_id,)
    ).fetchall()


# ── search ────────────────────────────────────────────────────────────────────

def search_messages(conn: sqlite3.Connection, query: str, limit: int = 20):
    """Full-text search using FTS5. Returns messages with thread info."""
    return conn.execute("""
        SELECT m.message_id, m.thread_id, m.subject, m.sender, m.date, m.summary,
               m.is_sent, t.subject AS thread_subject, t.summary AS thread_summary,
               snippet(messages_fts, 5, '[', ']', '...', 20) AS snippet
        FROM messages_fts
        JOIN messages m ON m.message_id = messages_fts.message_id
        JOIN threads  t ON t.thread_id  = m.thread_id
        WHERE messages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
    """, (query, limit)).fetchall()


def search_threads(conn: sqlite3.Connection, query: str, limit: int = 20):
    """Search threads by matching any message in the thread."""
    return conn.execute("""
        SELECT DISTINCT t.thread_id, t.subject, t.participants, t.first_date,
               t.last_date, t.message_count, t.summary, t.labels
        FROM messages_fts
        JOIN messages m ON m.message_id = messages_fts.message_id
        JOIN threads  t ON t.thread_id  = m.thread_id
        WHERE messages_fts MATCH ?
        ORDER BY t.last_date DESC
        LIMIT ?
    """, (query, limit)).fetchall()
