"""論文ファイル名を生成・リネームするユーティリティ。"""
import re
from pathlib import Path
from typing import Optional


def _authors_str(authors: list) -> str:
    """著者リストを「田中・鈴木」形式に変換。"""
    valid = [a for a in authors if a and a != "わからない"]
    if not valid:
        return "わからない"
    return "・".join(valid)


def _pages_str(pages: Optional[str]) -> str:
    """頁表記を生成。例: '45-67' → '45-67頁'"""
    if not pages or pages == "わからない":
        return "わからない"
    return f"{pages}頁"


def _volume_issue_str(volume: Optional[str], issue: Optional[str]) -> str:
    """巻号表記を生成。巻なし → 号のみ。"""
    parts = []
    if volume and volume not in ("わからない", "null", "None", ""):
        parts.append(f"{volume}巻")
    if issue and issue not in ("わからない", "null", "None", ""):
        parts.append(f"{issue}号")
    return "".join(parts) if parts else "わからない"


def generate_filename(meta: dict) -> Optional[str]:
    """
    メタデータから正式ファイル名を生成する。
    不明フィールドがある場合は None を返してログに残す。
    """
    authors = _authors_str(meta.get("authors") or [])
    title = meta.get("title", "わからない")
    journal = meta.get("journal", "わからない")
    vol_issue = _volume_issue_str(meta.get("volume"), meta.get("issue"))
    pages = _pages_str(meta.get("pages"))
    year = meta.get("year", "わからない")

    unknowns = []
    for label, val in [
        ("著者", authors),
        ("タイトル", title),
        ("雑誌名", journal),
        ("巻号", vol_issue),
        ("頁", pages),
        ("年", str(year) if year else "わからない"),
    ]:
        if val == "わからない":
            unknowns.append(label)

    if unknowns:
        print(f"  [警告] 不明フィールドがあるためリネーム不可: {', '.join(unknowns)}")
        return None

    # ファイル名に使えない文字を除去（改行・スラッシュ等）
    def sanitize(s: str) -> str:
        return re.sub(r'[\r\n/\\:*?"<>|]', "", str(s))

    name = (
        f"{sanitize(authors)}「{sanitize(title)}」"
        f"{sanitize(journal)}{sanitize(vol_issue)}{sanitize(pages)}"
        f"（{sanitize(str(year))}）.pdf"
    )
    return name


def rename_pdf(pdf_path: Path, new_name: str, dest_dir: Path) -> Path:
    """PDFを新しい名前で dest_dir に移動する。"""
    dest_dir.mkdir(parents=True, exist_ok=True)
    new_path = dest_dir / new_name

    # 同名ファイルが既にある場合は連番付与
    if new_path.exists():
        stem = new_path.stem
        suffix = new_path.suffix
        i = 1
        while new_path.exists():
            new_path = dest_dir / f"{stem}_{i}{suffix}"
            i += 1

    pdf_path.rename(new_path)
    return new_path
