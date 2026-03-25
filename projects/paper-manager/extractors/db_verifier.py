"""CiNii Research / NDL デジタルコレクション API でメタデータを照合・精査する。"""
import urllib.parse
from typing import Optional

import requests

from config import CINII_APPID

CINII_API = "https://cir.nii.ac.jp/opensearch/articles"
NDL_API = "https://iss.ndl.go.jp/api/opensearch"

HEADERS = {"User-Agent": "paper-manager/0.1 (research tool)"}
TIMEOUT = 10


def _cinii_search(title: str, author: Optional[str] = None) -> Optional[dict]:
    """CiNii Research で論文タイトル検索し、最上位ヒットのメタデータを返す。"""
    params = {
        "title": title,
        "format": "json",
        "count": 1,
    }
    if author:
        params["creator"] = author
    if CINII_APPID:
        params["appid"] = CINII_APPID

    try:
        res = requests.get(CINII_API, params=params, headers=HEADERS, timeout=TIMEOUT)
        res.raise_for_status()
        data = res.json()
        items = data.get("items", [])
        if not items:
            return None
        item = items[0]
        # CiNii レスポンス構造をフラット化
        return {
            "title": item.get("dc:title", [{}])[0].get("@value") if item.get("dc:title") else None,
            "authors": [a.get("@value") for a in item.get("dc:creator", []) if a.get("@value")],
            "journal": item.get("prism:publicationName"),
            "volume": item.get("prism:volume"),
            "issue": item.get("prism:number"),
            "pages": item.get("prism:pageRange"),
            "year": item.get("prism:publicationDate", "")[:4] or None,
            "doi": item.get("dc:identifier", [{}])[0].get("@value") if item.get("dc:identifier") else None,
            "source": "CiNii",
        }
    except Exception as e:
        print(f"  [CiNii] エラー: {e}")
        return None


def _ndl_search(title: str, author: Optional[str] = None) -> Optional[dict]:
    """NDL デジコレ API で検索し、最上位ヒットのメタデータを返す。"""
    params = {
        "title": title,
        "mediatype": 1,  # 本・雑誌
        "cnt": 1,
    }
    if author:
        params["creator"] = author

    try:
        res = requests.get(NDL_API, params=params, headers=HEADERS, timeout=TIMEOUT)
        res.raise_for_status()
        # NDL は OpenSearch RSS/XML を返す
        import xml.etree.ElementTree as ET
        root = ET.fromstring(res.content)
        ns = {
            "dc": "http://purl.org/dc/elements/1.1/",
            "dcndl": "http://ndl.go.jp/dcndl/terms/",
            "prism": "http://prismstandard.org/namespaces/basic/2.0/",
        }
        items = root.findall(".//item")
        if not items:
            return None
        item = items[0]

        def get(tag):
            el = item.find(tag, ns)
            return el.text.strip() if el is not None and el.text else None

        return {
            "title": get("dc:title"),
            "authors": [el.text.strip() for el in item.findall("dc:creator", ns) if el.text],
            "journal": get("dcndl:publicationName") or get("dc:source"),
            "volume": get("prism:volume"),
            "issue": get("prism:number"),
            "pages": get("prism:pageRange"),
            "year": (get("dc:date") or "")[:4] or None,
            "doi": get("prism:doi"),
            "source": "NDL",
        }
    except Exception as e:
        print(f"  [NDL] エラー: {e}")
        return None


def verify_metadata(ai_meta: dict) -> dict:
    """
    CiNii と NDL で照合し、AIが抽出したメタデータを精査して返す。
    信頼度の高いフィールドで上書きする。
    """
    title = ai_meta.get("title", "")
    if title == "わからない" or not title:
        print("  [検索] タイトル不明のためDB照合をスキップ")
        return ai_meta

    authors = ai_meta.get("authors", [])
    first_author = authors[0] if authors and authors[0] != "わからない" else None

    print(f"  [CiNii] 検索中: {title[:40]}")
    cinii = _cinii_search(title, first_author)
    print(f"  [NDL]   検索中: {title[:40]}")
    ndl = _ndl_search(title, first_author)

    verified = dict(ai_meta)

    for db_result in [cinii, ndl]:
        if not db_result:
            continue
        source = db_result.get("source", "DB")
        # 不明フィールドをDBの値で補完（ただし確認済みの値は上書きしない）
        for field in ["journal", "volume", "issue", "pages", "year", "doi"]:
            if verified.get(field) in (None, "わからない", "") and db_result.get(field):
                print(f"  [{source}] {field} を補完: {db_result[field]}")
                verified[field] = db_result[field]
        # 著者もAIが取れていなければ補完
        if (not verified.get("authors") or verified["authors"] == ["わからない"]) and db_result.get("authors"):
            verified["authors"] = db_result["authors"]
            print(f"  [{source}] authors を補完: {db_result['authors']}")

    verified["cinii_result"] = cinii
    verified["ndl_result"] = ndl
    return verified
