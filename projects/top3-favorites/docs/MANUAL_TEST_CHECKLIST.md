# top3-favorites 手動確認チェックリスト

対象: 現行 top3-favorites 実装の受け入れ確認
前提: 実装変更はこのチェックでは行わない。登録は `タグ / 場所 / 順位 / 店舗名 / メモ` の構造化フォームで行い、保存・取得は `/api/items` 経由で確認する。

---

## 0. 事前準備

- [ ] アプリを起動し、トップ画面が表示される
- [ ] ブラウザDevToolsで Console に致命的エラーがない
  - 自動確認: `tests/startup-console-health.e2e.spec.ts` が初期表示時の `console.error` / `pageerror` 不在を検証する
- [ ] 必要に応じて `/api/items` のテストデータを削除して初期状態から開始

---

## 1. 構造化フォーム入力（基本）

- [ ] **正常入力（メモあり）**
  - 入力: `タグ: ラーメン`, `場所: 松戸`, `順位: 1`, `店舗名: とみ田`, `メモ: 濃厚つけ麺`
  - 期待: 1件追加、`1位: とみ田`、タグ表示、場所表示、メモ表示

- [ ] **正常入力（メモなし）**
  - 入力: `タグ: カフェ`, `場所: 渋谷`, `順位: 2`, `店舗名: 茶亭`, `メモ: 空`
  - 期待: 追加され、メモ欄は `（メモなし）`
  - 自動確認: `tests/memo-empty-fallback.e2e.spec.ts` が空メモ登録後の `（メモなし）` 表示を検証する

- [ ] **順位選択**
  - 入力: 順位を `3位` にして保存
  - 期待: `3位` として保存
  - 自動確認: `tests/rank-selection-preserved.e2e.spec.ts` と `tests/api-rank-selection-preserved.e2e.spec.ts` がUI保存・API保存の両方で3位保持を検証する

- [ ] **必須入力不足**
  - 入力: タグまたは店舗名を空にして保存
  - 期待: 追加されず `タグと店舗名は必須です。` が表示される
  - 自動確認: `tests/error-clears-stale-success-notice.e2e.spec.ts` が必須入力不足時のエラー表示と古い成功通知のクリアを検証する

---

## 2. タグ絞り込み

- [ ] 検索欄で `店名/タグ/場所/メモ` それぞれ部分一致検索が効く
  - 自動確認: `tests/top3.e2e.spec.ts` と `tests/search-memo-contains.e2e.spec.ts` が店名・メモ検索を含む検索導線を検証する
- [ ] タグチップ押下で該当データのみ表示される
  - 自動確認: `tests/tag-chip-region-a11y-and-uniqueness.e2e.spec.ts` が検索タグ領域のタグチップ押下で該当タグのみ表示し、他タグを隠すことを検証する
- [ ] `クリア` で全件表示に戻る
  - 自動確認: `tests/tag-clear-label-contract.e2e.spec.ts` と `tests/clear-tag-filter-syncs-registration-tag.e2e.spec.ts` がクリア表示・全件復帰・登録フォーム側タグ同期解除を検証する

---

## 3. Google Mapsリンク

- [ ] 各アイテムの `Maps` を押すと新規タブでGoogle Maps検索が開く
  - 自動確認: `tests/maps-link-new-tab-contract.e2e.spec.ts` と `tests/maps-link-query.e2e.spec.ts` が新規タブ属性と検索URL構成を検証する
- [ ] URLクエリに `店名 + 場所 + タグ` が含まれる
  - 自動確認: `tests/maps-link-query.e2e.spec.ts` がGoogle Maps検索URLのqueryに店舗名・場所・タグが含まれることを検証する
- [ ] インポートJSON内の `mapsUrl` は信用せず、現在の店舗情報からMaps検索URLを再生成する
  - 自動確認: `tests/maps-link-import-safety.e2e.spec.ts` がインポート由来の外部URLを無視し、店舗名・場所・タグからGoogle Maps検索URLを作ることを検証する

---

## 4. `/api/items` 保存 / サンプルデータ投入（重要）

- [ ] **永続化確認**
  - 手順: 追加後に再読み込みする
  - 期待: `/api/items` から取得したデータが一覧に復元される
  - 自動確認: `tests/create-persists-after-reload-and-api.e2e.spec.ts` が新規追加後のreload復元とAPI保存内容を検証する

- [ ] **サンプルデータ投入（UI）**
  - 手順: `サンプルをDB保存` を押す
  - 期待: サンプル3件が保存され、再読み込み後も一覧へ反映される
  - 自動確認: `tests/sample-data-persists-after-reload-and-api.e2e.spec.ts` がサンプル3件のUI表示・reload復元・API保存内容を検証する

- [ ] **API取得失敗耐性**
  - 手順: API停止またはネットワーク失敗を再現できる環境でトップ画面を開く
  - 期待: アプリがクラッシュせず、データ取得失敗メッセージが表示される
  - 自動確認: `tests/api-load-retry.e2e.spec.ts` が初回取得失敗→再読み込み復旧を検証する

### 4.1 JSONエクスポート/インポート（重要）

- [ ] **JSONエクスポート成功**
  - 手順: データが1件以上ある状態で `JSONエクスポート` を押す
  - 期待: `top3-favorites-*.json` がダウンロードされる
  - 自動確認: `tests/import-export.e2e.spec.ts` と `tests/export-download-roundtrip.e2e.spec.ts` が実ダウンロードファイル名・JSON内容・roundtrip素材としての再利用を検証する

- [ ] **JSONインポート成功（正常データ）**
  - 手順: エクスポートしたJSONを `JSONインポート` で読み込み、確認プレビューで反映する
  - 期待: 件数メッセージが表示され、一覧がJSON内容に置き換わる
  - 自動確認: `tests/import-export.e2e.spec.ts` がエクスポートJSONを再インポートしてプレビュー確認後に一覧へ反映されることを検証する

- [ ] **JSONインポート失敗（配列以外）**
  - 手順: `{ "foo": 1 }` のようなJSONを読み込む
  - 期待: 反映されずエラー表示、既存データは保持される
  - 自動確認: `tests/import-fail-closed-matrix.e2e.spec.ts` が配列以外のJSONを拒否し既存データを保持することを検証する

- [ ] **JSONインポート失敗（不正要素混在）**
  - 手順: 配列内に `id` 欠損・`rank: 4`・空タグなど不正要素を1件混ぜる
  - 期待: 全体を反映しない（fail-closed）、既存データは保持される
  - 自動確認: `tests/import-fail-closed-matrix.e2e.spec.ts`、`tests/import-export-rank-validation.e2e.spec.ts`、`tests/import-validation-error-details.e2e.spec.ts` が不正要素・rank範囲外・重複ID/行番号付きエラーを検証する

- [ ] **JSONインポート失敗（壊れたJSON）**
  - 手順: パース不能な文字列を `.json` として読み込む
  - 期待: エラー表示、既存データは保持される
  - 自動確認: `tests/import-broken-json.e2e.spec.ts` と `tests/import-fail-closed-matrix.e2e.spec.ts` がパース不能JSONのエラー表示・既存データ保持・プレビュー破棄を検証する

### 4.2 インポート確認パネル（import preview）

#### 4.2.1 direction（追加/保持/削除予定）
- [ ] `+追加 / ±保持 / -削除予定` の方向メトリクスが表示される
- [ ] 値が `0` のメトリクスは弱調表示（通常項目より目立たない）になる
  - 自動確認: `tests/import-preview/direction/import-preview-direction-metrics.e2e.spec.ts`、`tests/import-preview/direction/import-preview-direction-a11y-labels.e2e.spec.ts`、`tests/import-preview/summary/import-preview-zero-metrics-muted.e2e.spec.ts` が方向メトリクス・読み上げ名・0件弱調を検証する

#### 4.2.2 live（読み上げ要約）
- [ ] `aria-live="polite"` の更新領域で、差分要約が更新される
- [ ] 差分なし時は `差分なし。インポート後N件。` が読める
- [ ] 正規化除外がある時は `正規化除外N件（例: 店名）` を含む
  - 自動確認: `tests/import-preview/live/import-preview-live-region-updates.e2e.spec.ts`、`tests/import-preview/live/import-preview-live-summary-concise.e2e.spec.ts`、`tests/import-preview/live/import-preview-live-summary-includes-excluded-name.e2e.spec.ts` がlive region更新・差分なし要約・除外名入り要約を検証する

#### 4.2.3 tags（影響タグ）
- [ ] 影響タグが多い場合、先頭表示 + `ほかN件` で折りたたまれる
- [ ] `影響タグを全件表示` / `影響タグを折りたたむ` で開閉できる
  - 自動確認: `tests/import-preview/tags/import-preview-tags-collapsed.e2e.spec.ts`、`tests/import-preview/tags/import-preview-tags-expand-toggle.e2e.spec.ts`、`tests/import-preview/tags/import-preview-tags-deterministic-order.e2e.spec.ts` が影響タグの折りたたみ・開閉・安定順序を検証する

#### 4.2.4 terms（差分用語説明）
- [ ] 初期状態では差分用語説明は非表示
- [ ] `差分用語の詳細説明を表示` で開き、`削除予定` と `正規化除外` の意味差が読める
  - 自動確認: `tests/import-preview/terms/import-preview-terms-helper-toggle.e2e.spec.ts`、`tests/import-preview/terms/import-preview-terms-helper-text.e2e.spec.ts`、`tests/import-preview/terms/import-preview-terms-helper-toggle-a11y.e2e.spec.ts` が用語説明の初期非表示・説明文・a11yトグルを検証する

#### 4.2.5 naming（a11y命名）
- [ ] import preview 内トグルの `aria-label` は `インポート詳細:` プレフィックスで統一され、パネル本体の `インポート確認` ラベルと衝突しない
- [ ] トグルは `aria-expanded` が開閉に応じて更新される
  - 自動確認: `tests/import-preview/naming/import-preview-toggle-aria-label-consistency.e2e.spec.ts`、`tests/import-preview/naming/import-preview-toggle-testid-contract.e2e.spec.ts`、`tests/import-preview/summary/import-preview-expand-toggles-a11y.e2e.spec.ts` がトグル命名・testid・aria-expandedを検証する

#### 4.2.6 summary（件数サマリ）
- [ ] `現在N件 → インポート後M件` と影響サマリ（追加/保持/削除予定/正規化除外）が表示される
- [ ] 同一JSON再インポート時に `差分なし（このインポートでデータ変更はありません）` が表示される
  - 自動確認: `tests/import-preview/summary/import-preview-summary.e2e.spec.ts`、`tests/import-preview/summary/import-preview-math-consistency.e2e.spec.ts`、`tests/import-preview/summary/import-preview-excluded-names-tag-context.e2e.spec.ts` が件数サマリ・数式整合・除外名/タグ文脈を検証する

---

## 5. 編集/削除

- [ ] 編集ボタンで既存値が編集フォームに入る
- [ ] 編集保存で一覧表示が更新される
  - 自動確認: `tests/edit-form-accessibility.e2e.spec.ts` が編集フォームの既存値表示・入力欄のa11y名・保存後の一覧/API反映を検証する
- [ ] 編集キャンセルで編集モードを抜ける
  - 自動確認: `tests/edit-form-accessibility.e2e.spec.ts` と `tests/edit-cancel-clears-stale-notice.e2e.spec.ts` がキャンセル後の一覧復帰と古い成功通知のクリアを検証する
- [ ] 削除で対象のみ消える
- [ ] 削除後に再読み込みしても削除結果が維持される
  - 自動確認: `tests/delete-confirmation.e2e.spec.ts` と `tests/delete-persists-after-reload-and-api.e2e.spec.ts` が削除確認・対象削除・reload/API永続化を検証する

---

## 6. 順位繰り下げ（重要）

- [ ] 同一タグで `1位/2位/3位` が存在する状態を作る
- [ ] 既存 `1位` に新しい `1位` 相当データを追加（または編集）
- [ ] 期待: 既存1位→2位、既存2位→3位、既存3位はTop3外になる
- [ ] 再読み込み後も順位が維持される
  - 自動確認: `tests/rebalance-persists-after-reload-and-api.e2e.spec.ts` がTop3繰り下げ・4件目除外・reload/API永続化を検証する

---

## 7. タグ重複・表示

- [ ] 同じタグを複数件登録してもタグチップが重複表示されない
- [ ] タグチップ押下後に新規登録フォームのタグ欄が同期する
  - 自動確認: `tests/top3.e2e.spec.ts` と `tests/search-tag-select-syncs-registration-tag.e2e.spec.ts` がタグチップ表示と選択タグの登録フォーム同期を検証する
