#!/usr/bin/env python3
"""Quick preflight check — run before first sync to verify all prerequisites."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "data"

OK = "\033[32m✓\033[0m"
NG = "\033[31m✗\033[0m"
WA = "\033[33m!\033[0m"

results = []

def check(label, passed, fix=None):
    results.append(passed)
    mark = OK if passed else NG
    print(f"  {mark}  {label}")
    if not passed and fix:
        print(f"       → {fix}")

print("\n=== mail-manager preflight check ===\n")

# 1. credentials.json
creds = DATA / "credentials.json"
check(
    "data/credentials.json",
    creds.exists(),
    "Google Cloud Console → APIs & Services → Credentials\n"
    "       → OAuth 2.0 Client ID (Desktop) → Download JSON\n"
    f"       → cp ~/Downloads/client_secret_*.json {creds}"
)

# 2. Python deps
try:
    import google.auth, google_auth_oauthlib, googleapiclient, google.genai
    check("Python deps (google-auth, google-genai, etc.)", True)
except ImportError as e:
    check("Python deps", False, f"pip install -r requirements.txt  [{e}]")

# 3. GEMINI_API_KEY
key = os.getenv("GEMINI_API_KEY", "")
check(
    f"GEMINI_API_KEY {'(set)' if key else '(not set)'}",
    bool(key),
    "export GEMINI_API_KEY=your_key_here"
)

# 4. token.json (optional — auto-generated on first sync)
token = DATA / "token.json"
print(f"  {OK if token.exists() else WA}  data/token.json {'(present)' if token.exists() else '(missing — will be created on first sync)'}")

# 5. DB
db = DATA / "mail.db"
print(f"  {OK if db.exists() else WA}  data/mail.db {'(present)' if db.exists() else '(missing — will be created on first sync)'}")

print()
if all(results):
    print("All checks passed. Ready to run:")
    print("  python main.py sync --max 5 --no-summary")
else:
    failed = sum(1 for r in results if not r)
    print(f"{failed} check(s) failed. Fix the items marked ✗ above, then re-run this script.")
print()
