#!/usr/bin/env node
import fs from 'node:fs'

const text = fs.readFileSync(0, 'utf8').trim()
const failures = []

if (!text) failures.push('empty message')

const numbered = text.split('\n').filter((line) => /^\s*\d+[.)、]/.test(line))
if (numbered.length > 1) {
  const nums = numbered.map((line) => Number(line.match(/^\s*(\d+)/)?.[1]))
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) failures.push(`numbering is not sequential: ${nums.join(',')}`)
  }
}

const hasUserAction = /Yakonさんがやること|Ryoさんがやること|あなたがやること|確認だけ|なし/.test(text)
const looksLikeReport = /報告|完了|ブロッカー|判断|承認|実装|検証|テスト|deploy|push/.test(text)
if (looksLikeReport && !hasUserAction) failures.push('report lacks explicit user-action line')

if (/state=|decisionKind=|risk=|verifier=|needs-refine|Yakon確認:\s*(必須|required)/i.test(text)) {
  failures.push('raw loop/verifier fields are not user-facing report format')
}

if (/Yakon確認.*必須|Yakon confirmation.*required/i.test(text)) {
  const hasConcreteAsk = /Yakonさんがやること[:：]\s*(なし|[^\n]+)/.test(text)
  if (!hasConcreteAsk) failures.push('required confirmation is not converted into a concrete Yakon action')
}

if (/再投入|安全な一手|管理アクション|原因分析→仮説→実装→テスト→結果報告/.test(text)) {
  failures.push('contains generic keeper/template wording')
}

if (/^\s*[-*]\s*$/.test(text)) failures.push('empty bullet exists')

if (failures.length) {
  console.error('message-quality-check failed:')
  for (const f of failures) console.error(`- ${f}`)
  process.exit(1)
}
console.log('message-quality-check passed')
