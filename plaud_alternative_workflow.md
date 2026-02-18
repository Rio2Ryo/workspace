# PLAUD代替統合 - 手動+半自動ワークフロー

## 背景
- PLAUD OAuth承認待ち期間中の並行運用フローの策定
- Zapier/Make/n8nは公式統合なし（調査済み）

## 方針
- 手動での音声ファイル取得 + 自動化スクリプトによる処理
- Cloudflare Workers AI（Whisper）とSecond Brain APIの連携

## フローの全体像

```
1. PLAUDアプリから音声ファイルをローカルにダウンロード（手動）
2. スクリプト実行: npm run transcribe <file_path>（半自動）
   ├─ Cloudflare Workers AIで文字起こし
   ├─ Workers AIで要約生成
   └─ Second Brain APIで保存
3. 確認と完了通知
```

## 実装計画

### エンドポイント（Second Brain側）
```
POST /api/uploads/audio
- 音声ファイルアップロード（m4a, mp3, wav, opus, webm）
- 一時ストレージに保存

POST /api/transcribe-and-save
- Whisper APIで文字起こし
- Workers AIで要約生成
- Second Brainに保存
```

### ローカルスクリプト
```javascript
// transcribe.mjs
import { readFileSync } from 'fs';
import { uploadAudio, transcribeAndSave } from './lib/plaud.js';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node transcribe.mjs <audio_file>');
  process.exit(1);
}

(async () => {
  const buffer = readFileSync(filePath);
  const result = await transcribeAndSave(buffer);
  console.log('Saved:', result.id);
})();
```

## 技術仕様

### Cloudflare Workers AI
- **文字起こし**: `@cf/openai/whisper-tiny` または OpenAI Whisper API
- **要約**: `@cf/meta/llama-3.1-8b-instruct` または GPT-4o-mini

### Second Brain API
- **認証**: API TokenまたはBearer Token
- **データ構造**: 既存のdocs/tasksスキーマに準拠

## 次のステップ
1. Wrangler Secretの投入状況確認（現在401 UNAUTHORIZED）
2. エンドポイントの実装
3. ローカルスクリプトの作成とテスト
