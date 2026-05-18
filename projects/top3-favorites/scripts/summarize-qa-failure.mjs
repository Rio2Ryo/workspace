#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

function getArg(args, key, fallback = null) {
  const prefix = `--${key}=`
  const found = args.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function extractFirstFailureBlock(logText) {
  const lines = logText.split(/\r?\n/)
  const idx = lines.findIndex((l) => /^not ok\s+\d+\s+-\s+/.test(l))
  if (idx < 0) return null

  const title = lines[idx].replace(/^not ok\s+\d+\s+-\s+/, '').trim()
  let bodyEnd = lines.length
  for (let i = idx + 1; i < lines.length; i += 1) {
    if (/^# Subtest: /.test(lines[i]) || /^ok\s+\d+\s+-\s+/.test(lines[i]) || /^not ok\s+\d+\s+-\s+/.test(lines[i])) {
      bodyEnd = i
      break
    }
  }
  const block = lines.slice(idx, bodyEnd).join('\n')
  return { title, block }
}

function extractContractMeta(block) {
  const scopeMatch = block.match(/\[Contract\]\[([^\]]+)\]/)
  const ruleMatch = block.match(/\|\s*rule:\s*([^|\n]+)/)
  return {
    scope: scopeMatch ? scopeMatch[1].trim() : null,
    rule: ruleMatch ? ruleMatch[1].trim() : null,
  }
}

function buildSummary({ title, scope, rule }) {
  const parts = ['# qa-full-nightly failure quick summary', '']
  parts.push(`- firstFailingTest: ${title ?? '(none)'}`)
  parts.push(`- contractScope: ${scope ?? '(n/a)'}`)
  parts.push(`- contractRule: ${rule ?? '(n/a)'}`)
  return parts.join('\n')
}

try {
  const args = process.argv.slice(2)
  const logPath = getArg(args, 'log', 'qa-full.log')
  const format = getArg(args, 'format', 'markdown')

  const text = await readFile(logPath, 'utf8')
  const fail = extractFirstFailureBlock(text)
  const meta = fail ? extractContractMeta(fail.block) : { scope: null, rule: null }

  const payload = {
    firstFailingTest: fail?.title ?? null,
    contractScope: meta.scope,
    contractRule: meta.rule,
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(payload, null, 2))
  } else if (format === 'markdown') {
    process.stdout.write(buildSummary({ title: payload.firstFailingTest, scope: payload.contractScope, rule: payload.contractRule }))
  } else {
    throw new Error(`format must be one of: markdown, json (received "${format}")`)
  }
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[summarize-qa-failure] ${msg}\n`)
  process.exit(1)
}
