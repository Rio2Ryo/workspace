#!/usr/bin/env bash
# discord-ollama-agent 起動前チェック
set -euo pipefail
PASS=0; FAIL=0

ok()   { echo "✅ $1"; ((PASS++)) || true; }
fail() { echo "❌ $1"; ((FAIL++)) || true; }

echo "=== discord-ollama-agent preflight ==="

# 1. node が使えるか
node --version &>/dev/null && ok "node: $(node --version)" || fail "node が見つかりません"

# 2. .env が存在するか
[[ -f ".env" ]] && ok ".env 存在" || fail ".env が見つかりません（cp .env.example .env して DISCORD_TOKEN を設定）"

# 3. DISCORD_TOKEN が設定されているか（値は出力しない）
if [[ -f ".env" ]]; then
  TOKEN=$(grep -E '^DISCORD_TOKEN=' .env | cut -d= -f2-)
  if [[ -n "$TOKEN" && "$TOKEN" != "replace_me" ]]; then
    ok "DISCORD_TOKEN 設定済み（${#TOKEN}文字）"
  else
    fail "DISCORD_TOKEN が未設定または replace_me のまま"
  fi
fi

# 4. Ollama が localhost:11434 で動いているか
curl -sf http://127.0.0.1:11434/api/tags -o /dev/null && ok "Ollama 稼働中 (localhost:11434)" || fail "Ollama が応答しません。'ollama serve &' で起動してください"

# 5. 使用モデルが存在するか
if curl -sf http://127.0.0.1:11434/api/tags -o /tmp/_pf_tags.json 2>/dev/null; then
  MODEL_IN_ENV=$(grep -E '^OLLAMA_MODEL=' .env 2>/dev/null | cut -d= -f2- || echo "lukey03/qwen3.5-9b-abliterated:latest")
  if python3 -c "import json; d=json.load(open('/tmp/_pf_tags.json')); names=[m['name'] for m in d.get('models',[])]; exit(0 if '${MODEL_IN_ENV}' in names else 1)" 2>/dev/null; then
    ok "モデル '${MODEL_IN_ENV}' 確認済み"
  else
    fail "モデル '${MODEL_IN_ENV}' が見つかりません。'ollama pull ${MODEL_IN_ENV}' を実行してください"
  fi
fi

# 6. index.js の構文チェック
node --check src/index.js && ok "src/index.js 構文 OK" || fail "src/index.js に構文エラー"

echo ""
echo "=== 結果: ${PASS} passed / ${FAIL} failed ==="
[[ $FAIL -eq 0 ]] && echo "✅ 全チェック通過 — node src/index.js で起動可" && exit 0
echo "❌ 失敗があります。上記を修正してから起動してください。"
exit 1
