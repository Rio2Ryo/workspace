# threads-watcher 受け入れチェックリスト

PoC が「実用可」と判断できる最小条件と、運用前に確認すべき項目。各項目は破壊操作なしで実行できる。

## 1. ローカル収集スクリプト

- [x] `python watcher.py --once` がエラーなく完走する
- [x] 同一 handle で 2 回目以降の実行は重複保存を行わない(`seen_post_ids` で dedupe)
- [x] `state.json` に `seen_post_ids` / `last_checked_at` が正しく書き込まれる
- [x] `screenshots/<handle>/<post_id>__<ts>.png` が生成される
- [x] `--watch --interval` ループモードが動作する(60 秒未満は 60 にクランプ)
- [x] DOM セレクタが壊れた時は `[warn] no post links found` を stderr に出して非クラッシュ終了
- [ ] **未検証**: 同一 handle で 24h 以上連続運転した場合のメモリリーク / Chromium ゾンビプロセス
- [ ] **未検証**: Threads 側に bot 検知された場合の挙動(現状は static UA 固定)

## 2. 静的ステータスページ(Vercel)

- [x] 本番 alias `https://threads-watcher-status.vercel.app/` が 200 を返す
- [x] `/state.json` が CORS 許可 + 60s キャッシュで配信される(`vercel.json` で設定)
- [x] ページが client-side で `state.json` を fetch して `handle` / `last_checked_at` / `post_ids` を表示
- [x] `<meta name="robots" content="noindex,nofollow">` で SEO 拾われない
- [x] 投稿画像は配信しない(post ID のみで第三者著作物の再配布を回避)
- [x] post id 一覧はクリックで `https://www.threads.com/@<handle>/post/<id>` へ遷移(public 既存ページ)

## 3. データ同期(現状の限界として明示)

- [x] `watcher.py` 実行ごとに `threads-watcher-status/state.json` を自動更新
- [ ] **手動コミット/push 待ち**: Vercel に反映するには別途 `git commit && git push` 必要
- [ ] **観測例**(2026-05-17 ヘルスチェック):
  - ローカル snapshot: 18 posts / `2026-05-17T10:07:19Z`
  - 本番 snapshot: 15 posts / `2026-05-16T03:11:51Z`
  - = 3 件の新規投稿はローカルでは検出済だが Vercel 未反映
- 自動同期化(cron + git push)は **Yakon 承認待ち**(自動 push の運用承認が必要)

## 4. 安全性 / 倫理

- [x] ログイン操作なし
- [x] 投稿/DM/通知/フォロー等の能動操作なし
- [x] スクショ本体は外部配信せず、ローカル `screenshots/` に閉じる
- [x] 公開アカウントの公開投稿のみが観測対象
- [x] User-Agent は実在のブラウザ識別子を使用(なりすましでなく標準的識別)
- [ ] **未明示**: 監視頻度の上限合意(現状 `--interval 60` 以上を強制、推奨は 10 分 = 600s)
- [ ] **未明示**: 他人 handle に切替えた場合の事前同意確認フロー

## 5. 障害復旧

- [x] state.json が破損しても警告ログ後に空 dict から再開
- [x] スクショ失敗 1 件は個別 except でループ継続
- [ ] **未テスト**: Chromium バイナリ消失時のリカバリ手順(`playwright install chromium` 再実行)
- [ ] **未テスト**: Vercel デプロイがロールバック必要になった場合の手順
  - 推奨: Vercel ダッシュボードから前 deployment を Promote(白判断不可、Yakon 承認領域)

## 6. モニタリング / アラート(現状ギャップ)

- [ ] DOM 構造変更で post id 検出ゼロが続いた場合のアラート: **未実装**
- [ ] Chromium プロセス異常終了の検知: **未実装**
- [ ] Vercel snapshot が一定時間更新されない場合のアラート: **未実装**

→ 全て次フェーズ実装候補。現状は人手チェック前提。

## 7. 引き継ぎ条件(運用開始判定)

以下が満たされたら「PoC → 運用」段階移行可能と判断:

1. Yakon が自動 push 運用を承認(セクション 3 のギャップ解消)
2. 監視頻度の上限合意(セクション 4)
3. 最小モニタリング 1 つ実装(セクション 6 のいずれか)
4. README に運用条件(対象 handle / 頻度 / 連絡先)が明記される

現状は **PoC 段階**。本書はこの条件を満たすまでの作業項目チェックリスト。
