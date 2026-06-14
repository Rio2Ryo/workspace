# threads-watcher — db.py 単体テスト候補 (2026-05-17)

新規追加された `db.py` は純粋に SQLite を触る薄い層で、Playwright 不要 = pytest だけで完結する。Yakon 承認後に投入することで watcher の信頼性が大きく上がる。

## 1. テスト対象(優先度順)

| # | 関数 | 種別 | 値打ち |
|---|---|---|---|
| 1 | `save_post_screenshot` UNIQUE 制約 | 重複防止 | 高(同一投稿の二重保存防止の根幹) |
| 2 | `get_seen_post_ids` 順序保証 | 順序仕様 | 高(`run_once` の new_ids 計算の前提) |
| 3 | `record_check` + `latest_snapshot` 連携 | 監査ログ可視性 | 高(Vercel 状態表示の根拠) |
| 4 | `latest_snapshot` 公開フォーマット | sanitization 検証 | 高(BLOB/local_path 漏洩防止) |
| 5 | `init_db` 再実行冪等性 | 起動時の冪等性 | 中 |
| 6 | `connect` の WAL/foreign_keys プラグマ確認 | 設定確認 | 低 |

## 2. テストインフラ準備(承認後)

```bash
cd /Users/umi/.openclaw/workspace/projects/threads-watcher
source venv/bin/activate
pip install pytest
# → requirements.txt にも pytest 追加候補(prod 影響なし)
```

## 3. spec draft

**新規ファイル** `tests/test_db.py`(プロジェクト直下に `tests/` を新設、ルートは触らない):

```python
"""db.py の単体テスト。インメモリ SQLite で完結。"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from db import (
    connect,
    get_seen_post_ids,
    init_db,
    latest_snapshot,
    record_check,
    save_post_screenshot,
)


@pytest.fixture
def conn(tmp_path: Path) -> sqlite3.Connection:
    db_path = tmp_path / "test.db"
    c = connect(db_path)
    init_db(c)
    yield c
    c.close()


def test_init_db_is_idempotent(conn: sqlite3.Connection) -> None:
    # 2 回呼んでもエラーにならない
    init_db(conn)
    init_db(conn)
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert {"posts", "checks"} <= tables


def test_save_post_screenshot_inserts_then_dedupes(conn: sqlite3.Connection) -> None:
    png = b"\x89PNG\r\n\x1a\nfakebody"
    ok1 = save_post_screenshot(
        conn, handle="@h", post_id="p1", post_url="https://x/p/p1",
        first_seen_at="2026-05-17T00:00:00Z", captured_at="2026-05-17T00:00:00Z",
        screenshot_png=png, width=100, height=200, local_path="screenshots/h/p1.png",
    )
    ok2 = save_post_screenshot(
        conn, handle="@h", post_id="p1", post_url="https://x/p/p1",
        first_seen_at="2026-05-17T00:00:01Z", captured_at="2026-05-17T00:00:01Z",
        screenshot_png=png, width=100, height=200, local_path="screenshots/h/p1.png",
    )
    assert ok1 is True
    assert ok2 is False  # UNIQUE で skip
    rows = conn.execute("SELECT COUNT(*) FROM posts WHERE handle=? AND post_id=?", ("@h", "p1")).fetchone()
    assert rows[0] == 1


def test_get_seen_post_ids_orders_by_insertion(conn: sqlite3.Connection) -> None:
    for pid in ("a", "b", "c"):
        save_post_screenshot(
            conn, handle="@h", post_id=pid, post_url=f"https://x/p/{pid}",
            first_seen_at="2026-05-17T00:00:00Z", captured_at="2026-05-17T00:00:00Z",
            screenshot_png=b"png", width=None, height=None, local_path=None,
        )
    assert get_seen_post_ids(conn, "@h") == ["a", "b", "c"]


def test_record_check_appends_audit_row(conn: sqlite3.Connection) -> None:
    record_check(conn, handle="@h", checked_at="2026-05-17T00:00:00Z",
                 found_count=5, new_count=2, status="ok", error=None)
    record_check(conn, handle="@h", checked_at="2026-05-17T00:01:00Z",
                 found_count=5, new_count=0, status="partial_error", error="dom warn")
    rows = conn.execute("SELECT status, error FROM checks ORDER BY id ASC").fetchall()
    assert [(r["status"], r["error"]) for r in rows] == [
        ("ok", None),
        ("partial_error", "dom warn"),
    ]


def test_latest_snapshot_excludes_blob_and_keeps_audit(conn: sqlite3.Connection) -> None:
    save_post_screenshot(
        conn, handle="@h", post_id="p1", post_url="https://x/p/p1",
        first_seen_at="2026-05-17T00:00:00Z", captured_at="2026-05-17T00:00:00Z",
        screenshot_png=b"\x89PNG_BIG", width=1280, height=2400,
        local_path="screenshots/h/p1.png",
    )
    record_check(conn, handle="@h", checked_at="2026-05-17T00:00:01Z",
                 found_count=1, new_count=1, status="ok", error=None)
    snap = latest_snapshot(conn, "@h")
    assert snap["handle"] == "@h"
    assert snap["saved_count"] == 1
    assert snap["last_check"]["status"] == "ok"
    assert snap["last_check"]["new_count"] == 1
    # 公開フォーマットに BLOB と local_path が混入していないこと
    for post in snap["posts"]:
        assert "screenshot_png" not in post
        assert "local_path" not in post  # latest_snapshot は local_path を SELECT していない
        assert post["screenshot_size_bytes"] == len(b"\x89PNG_BIG")


def test_latest_snapshot_orders_posts_newest_first(conn: sqlite3.Connection) -> None:
    save_post_screenshot(
        conn, handle="@h", post_id="old", post_url="https://x/p/old",
        first_seen_at="2026-05-17T00:00:00Z", captured_at="2026-05-17T00:00:00Z",
        screenshot_png=b"png", width=None, height=None, local_path=None,
    )
    save_post_screenshot(
        conn, handle="@h", post_id="new", post_url="https://x/p/new",
        first_seen_at="2026-05-17T01:00:00Z", captured_at="2026-05-17T01:00:00Z",
        screenshot_png=b"png", width=None, height=None, local_path=None,
    )
    snap = latest_snapshot(conn, "@h")
    assert [p["post_id"] for p in snap["posts"]] == ["new", "old"]


def test_connect_enables_wal_and_fk(conn: sqlite3.Connection) -> None:
    journal = conn.execute("PRAGMA journal_mode").fetchone()[0]
    fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    assert journal.lower() == "wal"
    assert fk == 1
```

## 4. 実行手順(承認後)

```bash
cd /Users/umi/.openclaw/workspace/projects/threads-watcher
source venv/bin/activate
pip install pytest
mkdir -p tests
# (上記 spec を tests/test_db.py に保存)
pytest tests/ -v
# 期待: 7 passed
```

## 5. 追加候補(本書スコープ外、将来検討)

- `import_existing_screenshots.py` の `_iso_from_compact` と `_png_dimensions` 単体テスト(純粋関数)
- watcher.py の `_extract_post_ids` regex 単体テスト(現状は Playwright Page インスタンス依存だが、`page.eval_on_selector_all` を切り離せばテスト可能)
- E2E 統合テスト: モック Threads ページに対する `--once` の round-trip(複雑度高、Playwright モック必要)

## 6. 承認が必要な最小項目

1. `requirements.txt` に `pytest` 追加可否(prod 影響なし、ローカル開発依存のみ)
2. `tests/test_db.py` を投入してよいか(WIP 主担当が同名ファイルを書いてないか確認)
3. CI 連携の要否(現状 threads-watcher に CI 設定なし)

---

**スコープ外**: 本書のテスト案は **db.py のみ**を対象とする。`watcher.py` の Playwright 部分や `import_existing_screenshots.py` の取込ロジックは別 PR が望ましい(影響範囲分離)。
