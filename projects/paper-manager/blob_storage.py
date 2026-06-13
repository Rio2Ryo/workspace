"""Vercel Blob storage uploader."""
import os
from pathlib import Path
from typing import Optional

import requests

BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
BLOB_BASE_URL = "https://blob.vercel-storage.com"


def upload_pdf(pdf_path: Path, filename: str) -> Optional[str]:
    """
    Upload a PDF to Vercel Blob and return the public URL.
    Returns None if BLOB_READ_WRITE_TOKEN is not set or upload fails.
    """
    if not BLOB_TOKEN:
        return None

    safe_name = filename.replace(" ", "_")
    upload_url = f"{BLOB_BASE_URL}/{safe_name}"

    try:
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        resp = requests.put(
            upload_url,
            data=pdf_bytes,
            headers={
                "Authorization": f"Bearer {BLOB_TOKEN}",
                "Content-Type": "application/pdf",
                "x-content-type": "application/pdf",
            },
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("url")
    except Exception:
        return None
