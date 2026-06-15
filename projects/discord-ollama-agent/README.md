# Discord Ollama Agent

Mac mini上のOllamaをDiscordから呼び出す最小構成です。

## 構成

```txt
Discord
  ↓
discord.js Bot
  ↓
Ollama HTTP API
  ↓
Local LLM
```

## セットアップ

```bash
cd /Users/umi/.openclaw/workspace/projects/discord-ollama-agent
cp .env.example .env
# .env の DISCORD_TOKEN を設定
npm start
```

Ollamaが起動していない場合:

```bash
npm run ollama
```

※このMac miniではHomebrew service起動だと応答が詰まるケースがあったため、MVP検証では上記の手動起動を使います。

## Discordでの使い方

- メンションして質問: `@Bot こんにちは`
- Prefixで質問: `!agent こんにちは`
- モデル一覧: `!agent models`
- モデル切替: `!agent model <model-name>`
- 現在モデル: `!agent current`
- 履歴リセット: `!agent reset`

## 現在Mac miniにあるOllamaモデル例

- `lukey03/qwen3.5-9b-abliterated:latest`
- `huihui_ai/deephermes3-abliterated:latest`
- `huihui_ai/deepseek-r1-abliterated:7b`
- `richardyoung/qwen3-14b-abliterated:latest`
- `tinyllama:latest`
- `openthinker:32b`
- `huihui_ai/deepseek-r1-abliterated:14b`
- `nomic-embed-text:latest`

## 注意

このMVPは発話中心です。shell実行、ファイル操作、外部投稿などのツール実行はまだ入れていません。
エージェント化する場合は、次にPermission Layerを追加して、危険操作を承認制にしてください。
