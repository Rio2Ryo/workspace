"""Notion DB への論文登録クライアント。"""
from pathlib import Path
from typing import Optional

from notion_client import Client

from config import NOTION_TOKEN, NOTION_DATABASE_ID

_client = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(auth=NOTION_TOKEN)
    return _client


def _text(value: Optional[str]) -> list:
    """Notion rich_text プロパティ用ヘルパー。"""
    return [{"text": {"content": str(value or "")}}]


def _year_to_number(year) -> Optional[int]:
    try:
        return int(year)
    except (TypeError, ValueError):
        return None


def register_paper(meta: dict, summary: str, filename: Optional[str], pdf_path: Optional[Path]) -> str:
    """
    Notion の「文献管理」DBに論文を登録し、ページIDを返す。

    Notion DB の列構成（実際の列名に合わせて調整してください）:
    - タイトル (title) : ページタイトル
    - Year (number)
    - 雑誌名 (rich_text)
    - 執筆者 (rich_text)
    - メモ (rich_text)
    - タイプ (select)
    """
    client = get_client()

    # タイトル: ファイル名形式（生成できた場合）or 論文タイトル
    display_title = filename.replace(".pdf", "") if filename else (meta.get("title") or "タイトル不明")

    authors = meta.get("authors") or []
    authors_str = "・".join([a for a in authors if a and a != "わからない"]) or ""

    properties = {
        "タイトル": {
            "title": _text(display_title),
        },
        "雑誌名": {
            "rich_text": _text(meta.get("journal") or ""),
        },
        "執筆者": {
            "rich_text": _text(authors_str),
        },
        "メモ": {
            "rich_text": _text(summary[:2000]),  # Notion 上限 2000文字
        },
        "タイプ": {
            "select": {"name": "論文"},
        },
    }

    year = _year_to_number(meta.get("year"))
    if year:
        properties["Year"] = {"number": year}

    response = client.pages.create(
        parent={"database_id": NOTION_DATABASE_ID},
        properties=properties,
    )
    return response["id"]
