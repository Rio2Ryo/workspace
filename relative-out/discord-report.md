作成物:
- `/Users/umi/.openclaw/workspace/relative-out/sample.preview.html`
- `/Users/umi/.openclaw/workspace/relative-out/sample.editable.pptx`
- `/Users/umi/.openclaw/workspace/relative-out/sample.outline.json`
- `/Users/umi/.openclaw/workspace/relative-out/sample.image-prompts.md`

検証結果:
- ok: true
- slides: outline 7 / HTML 7 / PPTX 7
- image prompts: 7
- notes: 7
- PPTX images: 0 (none)
- PPTX special elements: 0 (none)
- screenshot: not generated

使い方:
```bash
node slide-tool/scripts/verify.mjs /Users/umi/.openclaw/workspace/relative-out sample
node slide-tool/scripts/suggest-manifest-policy.mjs /Users/umi/.openclaw/workspace/relative-out sample --format markdown
```

次に試す依頼例:
```text
この資料「AIでスライドを作る最新ワークフロー」を、相手と目的に合わせてトーン調整して。HTML previewとeditable PPTXを再生成し、検証レポートも付けて。
```

