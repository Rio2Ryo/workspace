# AIアニメ 生成実行ガイド — Ao-VPS向け
# 使用開始条件: Yakon明示承認済みであること

**作品**: 「片思いから、両思いへ。」（約76秒 / 15ショット）  
**予算上限**: $30 USD（超えた時点で即停止・Yakon報告）  
**公開条件**: 全ショット完成 + Ao/Yakonレビュー承認後のみ  
**生成ファイル格納先**: `artifacts/kataomoi-anime/generated/`

---

## Phase 0 — 準備 ✅ 完了済み（Shiro pre-built 2026-06-12）

以下のディレクトリとテンプレートファイルは既に作成済み。**Phase 0はスキップしてPhase 1から開始すること。**

```
generated/
  images/       ← 画像・動画出力先
  video/        ← 編集済み動画出力先
  audio/        ← BGM・ナレーション出力先
    license.txt ← BGMライセンス記録テンプレート（要記入）
  seeds/
    seeds.txt   ← シード記録テンプレート（各ショット生成後に記入）
  budget.txt    ← 予算トラッカーテンプレート（各API呼び出し後に記入）
```

- `generated/budget.txt` を各API呼び出し後に更新すること（上限$30）
- `generated/seeds/seeds.txt` に各ショットのシードを記録すること（キャラ一貫性のため）

---

## Phase 1 — スタイル確認（優先2ショット）/ コスト ~$3-5

**目的**: 全量生成前にビジュアルスタイルをlock

### Step 1-A: S06 NFCタッチ（最重要ショット）
- ツール: **Runway Gen-3 Alpha**
- プロンプト: `shot-prompts/s06_nfc_touch.txt` 参照
- 設定: Motion Level 7/10, Duration 5s
- 試行上限: 3回（3回連続で意図した光演出が出ない → Phase停止・Yakon確認）
- 合格基準: 黄金の光粒子バーストが接触点から広がる、スローモーション感、マクロレンズ質感

### Step 1-B: S09 分身AI
- ツール: **Runway Gen-3 Alpha** または **Midjourney v7**（静止画ベース）
- プロンプト: `shot-prompts/s09_digital_twin.txt` 参照
- 試行上限: 3回
- 合格基準: 光粒子で構成された半透明シルエット、ビジネスマン本体と共存

**Step 1完了判定**: 両ショットがスタイル基準を満たしたら seed記録 → Phase 2へ

---

## Phase 2 — キャラクター固定（2ショット）/ コスト ~$2-3

### Step 2-A: S03 Kenjiポートレート
- ツール: **Runway Gen-3 Alpha**
- プロンプト: `shot-prompts/s03_kenji_portrait.txt` 参照
- 合格基準: 20代後半日本人男性、黒スーツ白シャツ、眼鏡なし → 以降の全Kenjiショットでseed再利用

### Step 2-B: S04 Aoi横顔
- ツール: **Runway Gen-3 Alpha**
- プロンプト: `shot-prompts/s04_aoi_profile.txt` 参照
- 合格基準: 30代前半日本人女性、濃紺スーツ → 以降の全Aoiショットでseed再利用

---

## Phase 3 — 残13ショット生成 / コスト ~$8-12

生成順（依存関係の少ない順）:

| 順 | Shot | ツール | ファイル |
|---|---|---|---|
| 1 | S01 東京俯瞰 | Midjourney v7 → Runway Extend | s01_tokyo_aerial.txt |
| 2 | S02 展示会ホール | Midjourney v7 → Runway Extend | s02_exhibition_hall.txt |
| 3 | S05 名刺交換 | Runway Gen-3 (Kenji/Aoiのseed引継) | s05_card_exchange.txt |
| 4 | S07 UIホログラム | Runway Gen-3 ワイド | s07_ui_hologram.txt |
| 5 | S08 ネットワークマップ | Sora / Hailuo | s08_network_map.txt |
| 6 | S10 タイムラプス | Pika 2.0 | s10_timelapse.txt |
| 7 | S11 分割スクリーン | Runway Gen-3 | s11_split_screen.txt |
| 8 | S12 再会・握手 | Runway Gen-3 (Kenji/Aoiのseed引継) | s12_reunion.txt |
| 9 | S13 人脈マップ全景 | Sora / Hailuo | s13_network_grand.txt |
| 10 | S14 KATAOMOIロゴ×夜景 | Midjourney v7 → After Effects | s14_logo_city.txt |
| 11 | S15 エンドカード | After Effects / CapCut | s15_end_card.txt |

**各ショット完了後**: シード・ツール・試行回数・費用を `generated/seeds/seeds.txt` に記録

---

## Phase 4 — BGM生成 / コスト ~$0.15-0.50

- ツール: **Suno Pro** または **Udio**
- プロンプト: `music-prompts/` の3ファイル参照
- 各トラック 3〜5試行、気に入った版をダウンロード保存
- ライセンス確認: Suno生成はCC0相当 → ライセンス種別を `generated/audio/license.txt` に記録

---

## Phase 5 — ナレーション収録 / コスト ~$0.36

- ツール: **ElevenLabs**（または VOICEVOX 無料代替）
- スクリプト: `narration-script.txt` 参照
- Voice profile: 男性30代前半、Speed 0.85x
- ElevenLabs推定: ~120文字 × $0.003 ≈ $0.36

---

## Phase 6 — 編集・合成 / コスト $0

ツール: **CapCut**（無料）または **DaVinci Resolve**（無料）

編集チェックリスト:
- [ ] 15ショットをタイムライン順（S01〜S15）に配置
- [ ] BGM 3トラックをActごとに配置（Act1: S01-05, Act2: S06-10, Act3: S11-15）
- [ ] ナレーション音声を合わせる（`narration-script.txt` タイムコード参照）
- [ ] 字幕オーバーレイ（`subtitles.srt` 参照）
- [ ] SNS用3バージョン書き出し: 15s / 30s / 60s（本編）

---

## Phase 7 — レビュー前チェック（公開前必須）

```
[ ] 全ショットのキャラクター一貫性確認（Kenji/Aoiが同一人物に見えるか）
[ ] 実在人物に似た顔がないか確認
[ ] BGMライセンス記録済み（generated/audio/license.txt）
[ ] テロップ誤字確認（日本語・英語）
[ ] console/レンダリングエラーなし
[ ] 予算合計が$30以内（generated/budget.txt確認）
```

**Ao / Yakon最終レビュー → 承認後のみSNS公開**

---

## 停止ゲート一覧

| 条件 | アクション |
|---|---|
| 予算累計 > $30 | 即停止、Yakon報告 |
| 単一API > $15 | 即停止 |
| S06: 3試行連続でNFC光演出失敗 | 手動コンポジット案をYakonへ |
| キャラ崩れ3試行連続 | 停止・seed変更・Yakon確認 |
| 実在人物に類似した顔が出た | 即再生成 |
| SNS公開指示 | Yakon明示承認なしには絶対に実施しない |

---

_最終更新: 2026-06-12 by Shiro / No API calls in this file / 承認前実行禁止_
