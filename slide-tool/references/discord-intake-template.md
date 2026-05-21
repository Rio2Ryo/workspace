# Discord自然文入力テンプレート

## Shiroが最初に抽出する項目

```yaml
topic: ""
audience: ""
decisionToUnlock: ""
slideCount: ""
tone: ""
mustInclude: []
mustAvoid: []
sourceMaterial: []
outputFormat:
  htmlPreview: true
  editablePptx: true
  imagePrompts: true
verification:
  runStudioVerify: true
  acceptanceManifest: true
  verifyDiscordReport: true
  verifyFlatReportSummary: true
  verifyShippingDocs: true
  reportSummaryBundle: true
  reportSummaryContext: true
  # ネストした reportSummary ブロックは使わない。bundle と context を flat に分けて書く。
deliveryGate:
  deliveryMessage: true
  deliveryManifest: true
  requiredQaLines:
    - "delivery readiness: ready"
    - "reasons: none"
    - "checked artifact types:"
    - "visual QA:"
    - "PPTX images: 0 (none)"
externalUse:
  publish: false
  paidApi: false
  productionChange: false
```

## 足りない時の最小質問

1. 誰に見せる資料ですか？
2. 見た人に何を決めてほしいですか？
3. トーンは「営業/提案」「社内意思決定」「投資家向け」「カジュアル説明」のどれに近いですか？
4. `--verify` で acceptance manifest / Discord report / delivery-message まで検証してよいですか？
5. `verify-shipping-docs` で shipping 物に旧ネスト表現が残っていないかと delivery gates が崩れていないか確認してよいですか？

## Discordでの依頼例

```text
Shiro Slide Studioで、AIでスライドを作る最新ワークフローをYakonさん向けに6枚で作って。
Gamma/Canva/GPT Image 2/Claude Design/Presentonも比較に入れて。
トーンは実務的、でも少し未来感。
まずHTML previewとeditable PPTX、画像生成プロンプトまで。外部APIは使わないで。
生成は --verify 付きで、acceptance manifest、Discord report、delivery-messageまで作って。
verify-discord-report.mjs が通り、delivery readiness: ready になる状態で納品して。
```

## 修正依頼例

```text
2枚目をもっと経営判断っぽくして。Gamma批判には寄せず、内製フローの強みに寄せて。
表紙はもっと高級感、本文は編集可能なままで。
```
