# AIアニメ — Yakon承認リクエスト

**作成**: 2026-06-09 by Shiro (shiro-ai-anime tmux session / Claude Code)  
**対象スレッド**: `#kataomoi-ao › AIアニメ`  
**Director AI**: Ao-VPS (`<@1467862100310364243>`)

---

## 現状サマリー

ローカル成果物は完成済み。Discord Missing Accessのため当セッションから該当スレッドへの投稿が不可。
生成API実行・公開にはYakon明示承認が必要。

---

## ローカル完成済み成果物

```
artifacts/kataomoi-anime/
  package.md              ← コンセプト / スクリプト / SB / 全プロンプト / コスト見積 / 停止条件
  subtitles.srt           ← 日本語字幕 SRT (15ショット)
  subtitles_en.srt        ← 英語字幕 SRT (15ショット)
  narration-script.txt    ← ナレーション全文 + 収録仕様
  shot-prompts/
    s01_tokyo_aerial.txt  ← S01〜S15 各ショット個別プロンプト (15ファイル)
    s02_exhibition_hall.txt
    s03_kenji_portrait.txt
    s04_aoi_profile.txt
    s05_card_exchange.txt
    s06_nfc_touch.txt     ← 【最重要ショット】NFCタッチ スローモーション
    s07_ui_hologram.txt
    s08_network_map.txt
    s09_digital_twin.txt
    s10_timelapse.txt
    s11_split_screen.txt
    s12_reunion.txt
    s13_network_grand.txt
    s14_logo_city.txt
    s15_end_card.txt
  music-prompts/
    bgm_act1_lofi.txt
    bgm_act2_nfc_magic.txt
    bgm_act3_resolution.txt
```

**有料API・外部公開は一切未実施。プロンプト/設計のみ完成。**

---

## 次アクションの選択肢（Yakon判断待ち）

### Option A — 生成実行を承認する（推奨）
- **内容**: Ao-VPS（または白）が上記プロンプトを使い、有料生成APIを実行開始
- **推奨生成順**: S06（NFCタッチ）→ S03（Kenji）→ 全ショット → BGM → ナレーション → 編集
- **コスト上限**: $30 USD（package.md 停止条件参照）
- **外部公開**: この時点では不可（Yakon最終承認後のみ）
- **担当**: Ao-VPS が `#kataomoi-ao › AIアニメ` スレッドで実行
- **リスク**: API課金発生（上限$30）、再生成で追加費用の可能性あり

### Option B — 試作1ショットのみ承認する
- **内容**: S06（NFCタッチ、最重要ショット）1本のみ生成してスタイル確認
- **コスト**: ~$2-3（Runway Gen-3 × 3試行）
- **用途**: 全量生成前のビジュアルスタイルlock
- **リスク**: 低（少額、外部公開なし）

### Option C — 承認保留 / 次フェーズで実施
- **内容**: ローカル成果物を保持したまま生成は行わない
- **成果物**: package.md + 全プロンプトファイルで準備完了状態を維持
- **リスク**: 0（費用発生なし、公開なし）

---

## Discord投稿ブロッカー（Yakonへの転送依頼）

当セッション（shiro-ai-anime / Claude Code macOS）は `#kataomoi-ao` チャンネルへの
Discord Missing Accessにより投稿不可。

**転送依頼**: 以下のいずれかでAoへ届けてください。
1. Yakon本人が `#kataomoi-ao › AIアニメ` スレッドに概要を投稿
2. Ao-VPS (`<@1467862100310364243>`) に白から `#白` 経由で転送メンション
3. 次回Discord accessが取れるClaude Codeセッションに本ファイルを参照させて投稿

---

## 公開チェックリスト（生成後、公開前に必須）

- [ ] 全ショットのキャラクター一貫性確認（同一人物に見えるか）
- [ ] 実在人物に似た顔がないか確認
- [ ] 著作権フリーBGM確認（Suno/CC0ライセンス記録）
- [ ] KATAOMOI社内レビュー（Ao / Yakon）完了
- [ ] テロップ誤字確認（日本語・英語）
- [ ] SNS用尺（15s / 30s / 60s）の3バージョン確認
- [ ] URL・CTAが最新か確認
- [ ] **Yakon最終承認** ← 公開前に必須

---

_破壊操作・本番変更・課金増・外部公開はYakon承認前に実行しない。_
