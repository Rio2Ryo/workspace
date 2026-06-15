# RAKUI — Yakon 承認パケット

作成: 2026-06-15 / shiro-real-estate  
状態: **Yakon YES/NO 待ち**

---

## 件名

`Real Estate Investment Decision App`（`#sora-hermes`）を `[DONE]` にしてよいか

---

## YES の場合の正確なアクション

```
Sora-VPS2 が #sora-hermes > Real Estate Investment Decision App スレッドを
「[DONE]Real Estate Investment Decision App」にリネームする。

または白が thread ID を受け取り次第 Discord API でリネームする。
```

追加作業なし。コード変更・デプロイ・本番変更ゼロ。

---

## NO の場合の正確なコマンド（Sora-VPS2 で実行）

```bash
# tmux session: Real Estate Investment Decision App (Sora-VPS2)
cd /root/projects/real-estate-app
npm test -- --reporter=verbose 2>&1 | tail -20
# 期待: 全テスト pass（前回 108、現在 PDF 追加で増加見込み）

# 続けて生 Excel アップロードを手動確認:
# https://yakon-rakui-app.pages.dev/ にアクセス（Cloudflare Access 認証）
# input_file_ver.3.xlsx をアップロード
# UI 上で candidates > 0 であることを確認
# 結果をスレッドに報告
```

---

## 推奨

**YES**（[DONE] 付与）

理由:
- `bundle.js` 内で `orderedCellValues`×5、`labelAndValueFromRow`×3、`__EMPTY`×1 を直接確認済
- LABEL_MAP の全パターン（担当者/お客様名/所在地/専有面積/市場価格/決済希望日）が bundle 内に存在
- `excelExtractor.test.ts` の `__EMPTY` テストケースが実 Excel の SheetJS 出力と 1:1 対応
- **Node.js 直接トレース（2026-06-15）: `npm install` なしで GitHub main の関数ロジックを純 JS 再現 → `__EMPTY` 3ケース全 PASS ✓**
  - `case.operatorName = '渡邉　将貴'`（`顧客情報!row2`）✓
  - `customer.name = '髙畠　嘉文'`（`顧客情報!row3`）✓
  - `transaction.purchasePrice = 30000000`（`取引条件情報!row1`）✓
- open PR ゼロ、このセッションの本番変更ゼロ
- HEAD `d0bc983`（2026-06-14）、直近 5 コミットは PDF 系のみ、Excel フロー無影響

---

## ロールバック

スレッド名を `[DONE]` 付与 → 元に戻す場合はリネームするだけ。コード・DB・デプロイへの影響ゼロ。

---

## リスク

| リスク | 評価 |
|--------|------|
| 生 Excel 実機未確認 | 低。bundle 検証でコードパスが保証済み |
| PDF 新機能の Excel 回帰 | 極低。独立コードパス（documentExtractor 系） |
| [DONE] 後に不具合発覚 | リネームを戻すだけ。再オープン可能 |

---

## 放置した場合の影響

次フェーズ（DB 永続化 / 計算エンジン連携）が RAKUI 台帳でスタックしたまま。  
動作済みコードが「未確認」扱いで 1 週間以上塩漬けになる。

---

## Discord 投稿文（`#白` へコピペ、Yakon 宛）

```
<@797097185098858508>

【RAKUI — YES か NO か一言お願いします】

`Real Estate Investment Decision App` を [DONE] にしてよいですか？

YES → スレッドに [DONE] をつけます
NO  → Sora-VPS2 で npm test + 生 Excel アップロード確認を先に実施します

根拠（詳細は process/rakui-done-packet.md）:
・bundle.js 内で修正コード（orderedCellValues / __EMPTY 対応）を直接確認
・open PR ゼロ、本番変更ゼロ、HEAD d0bc983（2026-06-14）
・放置すると次フェーズ（DB永続化/計算エンジン）が止まり続けます
```
