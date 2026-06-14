#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: extract-visible-copy.mjs <file.tsx>');
  process.exit(1);
}
const src = fs.readFileSync(file, 'utf8');
const items = [];
const looksUserFacing = (text) => /[ぁ-んァ-ヶ一-龠🌙✨💞📋🔮🌿🪞💬🌱🍒🗂️💌]/.test(text);
const looksLikeCode = (text) => /(?:const |useState|useMemo|getCompatibility|Record<|=>|;)/.test(text);
const clean = (text) => text.replace(/\$\{[^}]+\}/g, '{…}').replace(/\\n/g, ' / ').replace(/\s+/g, ' ').trim();

for (const m of src.matchAll(/>([^<>{}\n][^<>{}]*)</g)) {
  const text = clean(m[1]);
  if (text && looksUserFacing(text) && !looksLikeCode(text)) items.push(text);
}
for (const m of src.matchAll(/['`]([^'`\n]*(?:占い|相性|会話|結果|コピー|入力|読む|見る|詳し|科学|診断|文化|送れる|ヒント|注意|保存|参考|根拠|更新|表示中|メモ)[^'`\n]*)['`]/g)) {
  const text = clean(m[1]);
  if (text && looksUserFacing(text) && !looksLikeCode(text)) items.push(text);
}
const unique = [...new Set(items)].sort((a, b) => b.length - a.length);
console.log(`copy_blocks=${unique.length}`);
console.log('\nLONGEST');
for (const text of unique.slice(0, 20)) console.log(`${text.length}\t${text}`);
console.log('\nALL');
for (const text of unique) console.log(`- ${text}`);
