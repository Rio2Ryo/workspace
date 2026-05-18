"""Import existing local screenshot PNGs into the SQLite DB.

This is a one-time/backfill helper. The live watcher writes directly to DB;
this script is only for screenshots captured before DB persistence existed.
"""

from __future__ import annotations

import argparse
import re
import struct
from datetime import datetime, timezone
from pathlib import Path

from db import DEFAULT_DB_FILE, connect, init_db, save_post_screenshot

PROJECT_ROOT = Path(__file__).resolve().parent
SCREENSHOTS_DIR = PROJECT_ROOT / "screenshots"
FILENAME_RE = re.compile(r"^(?P<post_id>[A-Za-z0-9_-]+)__(?P<ts>\d{8}T\d{6}Z)\.png$")
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _iso_from_compact(value: str) -> str:
    dt = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _png_dimensions(data: bytes) -> tuple[int | None, int | None]:
    if len(data) >= 24 and data.startswith(PNG_SIG):
        return struct.unpack(">II", data[16:24])
    return None, None


def import_existing(handle: str) -> tuple[int, int]:
    handle = handle if handle.startswith("@") else f"@{handle}"
    handle_no_at = handle.lstrip("@")
    source_dir = SCREENSHOTS_DIR / handle_no_at
    conn = connect(DEFAULT_DB_FILE)
    init_db(conn)
    inserted = 0
    skipped = 0
    for path in sorted(source_dir.glob("*.png")):
        m = FILENAME_RE.match(path.name)
        if not m:
            skipped += 1
            continue
        post_id = m.group("post_id")
        captured_at = _iso_from_compact(m.group("ts"))
        data = path.read_bytes()
        width, height = _png_dimensions(data)
        ok = save_post_screenshot(
            conn,
            handle=handle,
            post_id=post_id,
            post_url=f"https://www.threads.com/@{handle_no_at}/post/{post_id}",
            first_seen_at=captured_at,
            captured_at=captured_at,
            screenshot_png=data,
            width=width,
            height=height,
            local_path=str(path.relative_to(PROJECT_ROOT)),
        )
        if ok:
            inserted += 1
        else:
            skipped += 1
    conn.close()
    return inserted, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description="Import local screenshots into threads_watcher.db")
    parser.add_argument("--handle", default="@hal.lifedesign")
    args = parser.parse_args()
    inserted, skipped = import_existing(args.handle)
    print(f"[import-existing] inserted={inserted} skipped={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
