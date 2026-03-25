"""PDF からテキストを抽出する。"""
from pathlib import Path

import fitz  # PyMuPDF


def extract_text(pdf_path: Path, max_pages: int = 10) -> str:
    """先頭 max_pages ページのテキストを抽出して返す。"""
    doc = fitz.open(str(pdf_path))
    pages = min(len(doc), max_pages)
    texts = []
    for i in range(pages):
        page = doc[i]
        texts.append(page.get_text())
    doc.close()
    return "\n".join(texts)
