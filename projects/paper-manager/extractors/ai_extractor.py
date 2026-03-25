"""Claude API を使ってPDFテキストから論文メタデータを抽出する。"""
import json
import re
from typing import Optional

import anthropic

from config import ANTHROPIC_API_KEY

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

METADATA_PROMPT = """以下は学術論文PDFの先頭数ページのテキストです。
このテキストから論文のメタデータを抽出し、JSONで返してください。

抽出するフィールド:
- title: 論文タイトル（日本語または英語）
- authors: 執筆者名のリスト（例: ["田中太郎", "鈴木花子"]）
- journal: 雑誌名/論文集名
- volume: 巻（数字のみ、なければ null）
- issue: 号（数字のみ、なければ null）
- pages: 頁（例: "45-67" または "45" のみ）
- year: 発行年（西暦4桁、なければ null）
- doi: DOI（なければ null）

重要なルール:
- 不明なフィールドは "わからない" を返す（nullではなく文字列）
- 適当な値を補完しない
- テキストから読み取れる情報のみを使う
- 必ずJSONのみを返す（説明文不要）

PDFテキスト:
{text}
"""

SUMMARY_PROMPT = """以下は学術論文PDFのテキストです。
この論文の内容を3〜5行の日本語で要約してください。
要点（研究目的・方法・結論）を簡潔にまとめること。

PDFテキスト:
{text}
"""


def extract_metadata(pdf_text: str) -> dict:
    """Claude API でメタデータを抽出する。"""
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": METADATA_PROMPT.format(text=pdf_text[:8000]),
            }
        ],
    )
    raw = message.content[0].text.strip()
    # JSONブロックを抽出
    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        raise ValueError(f"JSONが見つかりませんでした: {raw[:200]}")
    return json.loads(json_match.group())


def generate_summary(pdf_text: str) -> str:
    """Claude API で論文要約を生成する。"""
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": SUMMARY_PROMPT.format(text=pdf_text[:12000]),
            }
        ],
    )
    return message.content[0].text.strip()
