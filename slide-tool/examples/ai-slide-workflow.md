# AIでスライドを作る最新ワークフロー

Audience: Yakonさん / OpenClawメンバー
Tone: 実務的、少し未来感、高品質な資料制作の標準化
Thesis: これからの資料作成は「いきなりPPTX」ではなく、会話から構成を固め、HTML/Artifactで見た目と流れを確認し、最後に編集可能PPTXへ落とすのが速い。

## なぜ今変えるか

- GammaやCanvaだけに閉じると、最終PPTXの編集性や社内運用に制約が出る
- PPTX直生成だけだと、会話しながら構成や見た目を試す速度が落ちる
- Artifact/HTML firstなら、Discord上の自然文から構成と見た目を素早く反復できる

## 標準フロー

- Discord自然文を受ける
- 要件、相手、目的、制約、納品形式を抽出する
- outline JSONに変換する
- HTML/Artifact風プレビューで流れと見た目を確認する
- GPT Image 2向けに表紙、図解、アイコン、キービジュアルのプロンプトを作る
- 本文は編集可能なPPTXとして生成する
- 修正ループ後に納品する

## ツールの使い分け

- Canva: ブランド素材、手動仕上げ、SNS/営業資料への展開
- Gamma: 速い初期案、Web共有、ざっくり構成探索
- Presenton: ローカル/OSS寄り、PPTX/PDF出力、検証環境
- Plus AI: Google SlidesやPowerPoint上で編集ワークフローを維持したい時
- Claude Design/Artifacts: 会話しながらHTML/デザイン案を詰める時
- GPT Image 2: 表紙、図解、キービジュアル、アイコン、質感の作成

## 内製フローの役割分担

- Shiro Slide Studio: 要件抽出、outline JSON、HTML preview、PPTX生成、検証ログ
- GPT Image 2: 画像素材の生成指示。API実行は承認後
- Canva/Gamma: 必要時の外部仕上げ候補。外部公開や課金は事前確認
- PowerPoint: 最終編集と納品

## 品質基準

- 1スライド1メッセージ
- 本文テキストは編集可能に残す
- 画像は背景ではなく、意味のある主役または補助素材として使う
- PPTX内部のスライド数、HTML preview、画像プロンプトを必ず確認する
- 外部API、公開、課金、本番設定変更は実行前に止める

## 次に試す依頼

- このDiscordスレッドで自然文のまま依頼する
- 足りない情報はShiroが最小限だけ質問する
- まずHTML previewで方向性を見て、PPTXを修正する
