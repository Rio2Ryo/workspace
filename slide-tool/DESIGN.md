# slide-tool 設計メモ

## 要件整理

### ユーザー価値

文章や粗い要件を渡すだけで、資料の骨子とPowerPointファイルが手元にできる状態を目指す。Ryoさんの用途では「ゼロから綺麗な資料を作る」より、まず叩き台を高速に作り、構成・論点・見積・提案の抜け漏れを発見できることが重要。

### 入力

- 自由文
- Markdown
- 箇条書き要件
- 議事録やメモ

### 出力

- スライド構成JSON
- `.pptx`
- 将来的にはPDF/PNGプレビュー

### 最小機能

1. 入力テキストを読み込む
2. タイトル・セクション・箇条書きを抽出する
3. 表紙、目的、構成、詳細、次アクションのスライドへ整形する
4. `pptxgenjs` でPPTXを生成する

## アーキテクチャ

```text
input.md
  -> parser
  -> outline JSON
  -> renderer
  -> pptx
```

### parser

PoCではMarkdownの `#` / `##` / `-` を使った単純抽出。LLM接続時も、最終的には同じoutline JSONへ寄せる。

### outline JSON

```json
{
  "title": "資料タイトル",
  "subtitle": "補足",
  "slides": [
    {
      "type": "title|section|summary",
      "title": "スライドタイトル",
      "bullets": ["要点1", "要点2"],
      "notes": "話す内容"
    }
  ]
}
```

### renderer

`pptxgenjs` の編集可能テキスト中心で生成する。既存の `create_estimate_pptx_v2.js` の方針を踏襲し、以下を標準にする。

- 日本語フォント: `Yu Gothic`
- 横長16:9
- 文字は `fit: 'shrink'`
- 余白とカードを固定寸法で管理
- 1スライドあたりの情報量を制限

## 技術比較

### Node.js + pptxgenjs

- 長所: 既存依存あり、編集可能PPTX、JSでアプリ化しやすい
- 短所: 複雑な自動レイアウトは自前実装が必要
- 判定: PoC採用

### Python + python-pptx

- 長所: Python処理との相性、既存生成スクリプトあり
- 短所: root依存がNodeより薄い、将来Web化時の統合は追加判断が必要
- 判定: 代替候補

### SVG/HTML -> PNG -> PPTX

- 長所: 見た目を作り込みやすい
- 短所: PowerPoint上の文字編集性が低い
- 判定: polished版の第2出力として有効

## 最小PoC計画

### Phase 0: 今回

- `slide-tool/` 作成
- README/設計メモ作成
- MarkdownからPPTXを作る最小プロトタイプ作成
- サンプル入力でローカル生成確認

### Phase 1: 構成生成の品質改善

- outline JSON schemaを固定
- 入力の種類に応じてテンプレートを切り替える
- 「目的」「相手」「決裁ポイント」「次アクション」を必須スロット化

### Phase 2: LLM接続

- 外部API利用は事前確認が必要。
- まずはローカルLLMや手動JSON入力でも動く設計にしておく。
- API接続時はコスト上限、ログ保存範囲、秘密情報の扱いを明記する。

### Phase 3: 検証自動化

- PPTX生成後にPNG/PDFへレンダリング
- テキスト溢れ、空白過多、ページ数、タイトル欠落をチェック
- 既存の資料生成パターンと比較する

## リスクと対策

- 構成が薄い: outline JSONに必須項目を設ける
- 見た目が弱い: editable版とpolished版を分ける
- 文字溢れ: bullets数、文字数、フォントサイズを制限
- 外部APIコスト: PoCでは未使用。接続前に確認
- 機密情報: 入力ファイルはローカル扱い。外部送信しない
