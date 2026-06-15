作成物:
- `/Users/umi/.openclaw/workspace/out/local.preview.html`
- `/Users/umi/.openclaw/workspace/out/local.editable.pptx`
- `/Users/umi/.openclaw/workspace/out/local.outline.json`
- `/Users/umi/.openclaw/workspace/out/local.image-prompts.md`

検証結果:
- ok: true
- slides: outline 1 / HTML 1 / PPTX 1
- image prompts: 1
- notes: 1
- PPTX images: 0 (none)
- PPTX special elements: 0 (none)
- screenshot: not generated

使い方:
```bash
node slide-tool/scripts/verify.mjs /Users/umi/.openclaw/workspace/out local
node slide-tool/scripts/suggest-manifest-policy.mjs /Users/umi/.openclaw/workspace/out local --format markdown
```

次に試す依頼例:
```text
この資料「Local Brief」を、相手と目的に合わせてトーン調整して。HTML previewとeditable PPTXを再生成し、検証レポートも付けて。
```

