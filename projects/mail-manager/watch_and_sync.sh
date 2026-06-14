#!/bin/bash
# credentials.json が置かれたら自動で sync を実行する
TARGET="/Users/umi/.openclaw/workspace/projects/mail-manager/data/credentials.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== mail-manager watch_and_sync ==="
echo "配置先: $TARGET"
echo "このターミナルを開いたまま、Finderで credentials.json をドロップしてください"
echo ""
echo "待機中..."

while true; do
  if [ -f "$TARGET" ]; then
    echo ""
    echo "✓ credentials.json を検知しました！"
    echo "sync を開始します (--max 5 --no-summary) ..."
    echo ""
    cd "$SCRIPT_DIR"
    python3 main.py sync --max 5 --no-summary
    echo ""
    echo "=== 完了 ==="
    break
  fi
  sleep 2
done
