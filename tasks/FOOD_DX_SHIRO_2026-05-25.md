# 食品受発注 DX — Shiro 管理メモ 2026-05-25

## 管理スレッド
- 新スレッド: `food-dx-shiro` (`1508278506281369610`)
- 元スレッド: <https://discord.com/channels/1221012768954515497/1485809323220144211/1506075219935367189>

## 現状
- ローカル実体: `/Users/umi/.openclaw/workspace/food-dx-qwen/food-dx-system`
- Git: `main`
- Remote: 未設定
- Frontend: `http://localhost:3000/`
- API: `http://localhost:4000/`
- デモ認証情報: `demo@example.com / demo1234`
- `/inventory`: 404確認済み

## 既存記憶との差分
- 2026-03-19 メモでは GitHub: `https://github.com/Rio2Ryo/food-dx-system`
- 2026-03-19 メモでは 公開URL: `https://food-dx-system.common-gifted-tokyo.workers.dev`
- 2026-04-03 メモでは 旧公開版デモ: `demo@foodflow.local / DemoFoodFlow2026!`
- 今回のローカル実体は remote 未設定のため、既存公開版/旧GitHubとの差分確認を最初に行う。

## 優先順
1. モックデータ投入: 発注10件程度、売上推移、カテゴリ比率
2. 日本語化後の実画面E2E: `/orders`, `/analytics`, `/dashboard`, `/login`
3. ナビ構造統一: orders系左サイドバーに寄せる案を確認
4. Orders空状態CTA整理
5. GitHub remote / デプロイURLの有無確認。未設定なら作成・設定・デプロイは確認後に進める

## 判断基準
- 自走: ローカル調査、モックデータ実装、UI修正、E2E、スクショ取得、差分整理
- 確認対象: GitHub remote作成、本番deploy、既存公開URLの上書き、秘密値投入、課金発生

