# Slide Tool Acceptance Checklist Template

slide-toolで作った資料成果物を配布・共有する前に使う共通チェックリスト。

## 対象成果物

- `README.md` または配布メモ
- 生成元: outline JSON / Markdown / HTML / SVG など
- 最終成果物: PPTX / HTML / SVG / PDF / PNG など
- 生成メモ: コマンド、検証結果、制約

## 受け入れ条件

- [ ] 目的と想定読者が明記されている
- [ ] 生成物一覧が明記されている
- [ ] 各スライドまたは各セクションの狙いが明記されている
- [ ] 次に改善するなら何を変えるかが明記されている
- [ ] 外部公開を行っていない
- [ ] 課金APIを実行していない
- [ ] 本番設定を変更していない
- [ ] 秘密値を含んでいない

## Deck成果物の場合

- [ ] outline JSONが存在する
- [ ] HTML previewが存在する
- [ ] PPTXが存在する
- [ ] image promptsが存在する
- [ ] `node slide-tool/scripts/studio.mjs <input> --out <out-dir> --name <name> --verify` で生成している
- [ ] `node slide-tool/scripts/verify.mjs <out-dir> <name>` が成功する
- [ ] acceptance manifestが存在する
- [ ] `node slide-tool/scripts/verify-discord-report.mjs <out-dir>/discord-report.md --delivery-message <out-dir>/delivery-message.md --delivery-manifest <out-dir>/<name>.acceptance.manifest.json` が成功する
- [ ] Discord report の期待値は `reportSummaryBundle` / `reportSummaryContext` の flat 指定で記録されている
- [ ] ネストした reportSummary ブロックではなく、bundle と context の flat 指定で期待値を書いている
- [ ] `npm run verify:shipping-docs` が成功する
- [ ] outline / HTML / PPTX / prompt の件数が一致する
- [ ] Discord reportとdelivery-messageに同じ納品QA行が入っている

## 納品QA行

Discord report / delivery-message / acceptance manifest の `qaLines` に以下を残す。

- [ ] `delivery readiness: ready`
- [ ] `reasons: none`
- [ ] `manifest verification: ok`
- [ ] `manifest verification scope: manifest-only`
- [ ] `checked artifacts:`
- [ ] `checked artifact types:`
- [ ] `identity checks: report ready`
- [ ] `visual QA:`
- [ ] `PPTX images: 0 (none)`
- [ ] `PPTX special elements: 0 (none)`
- [ ] `PPTX hidden text: 0`
- [ ] `reportSummaryBundle` / `reportSummaryContext` を使った期待値の補足メモがある
- [ ] `verify:shipping-docs` の結果を貼っている

## Onepager成果物の場合

- [ ] HTMLまたはSVGが存在する
- [ ] 必須セクションが全て含まれている
- [ ] SVGがある場合は `xmllint --noout <file.svg>` が成功する
- [ ] `node slide-tool/scripts/verify-onepager.mjs <out-dir> <name>` が成功する
- [ ] PPTXへ変換した場合は `references/html-svg-to-pptx.md` の方式と検証チェックに従っている

## 画像previewが作れない場合

- [ ] 理由を生成メモに書く
- [ ] 代替確認としてHTML/SVGの必須文言、ファイルサイズ、構造検証を行う
- [ ] 画像生成や外部APIが必要な作業は事前確認に回す

## 検証ログ欄

```bash
# command
```

```json
{
  "ok": true
}
```

## 次アクション欄

- 次に改善するなら:
- Yakon判断が必要なら:
