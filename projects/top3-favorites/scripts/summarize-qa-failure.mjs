#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

function getArg(args, key, fallback = null) {
  const prefix = `--${key}=`
  const found = args.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function extractFirstFailureBlock(logText) {
  const lines = logText.split(/\r?\n/)
  const tapIdx = lines.findIndex((l) => /^not ok\s+\d+\s+-\s+/.test(l))
  const playwrightIdx = lines.findIndex((l) => /^\s+✘\s+\d+\s+\[[^\]]+\]\s+›\s+/.test(l))

  const candidates = [tapIdx, playwrightIdx].filter((idx) => idx >= 0)
  if (candidates.length === 0) return null

  const idx = Math.min(...candidates)
  const isTap = idx === tapIdx
  const title = isTap
    ? lines[idx].replace(/^not ok\s+\d+\s+-\s+/, '').trim()
    : lines[idx].replace(/^\s+✘\s+\d+\s+/, '').replace(/\s+\([^)]*\)$/, '').trim()

  let bodyEnd = lines.length
  for (let i = idx + 1; i < lines.length; i += 1) {
    if (/^# Subtest: /.test(lines[i]) || /^ok\s+\d+\s+-\s+/.test(lines[i]) || /^not ok\s+\d+\s+-\s+/.test(lines[i]) || /^\s+[✓✘]\s+\d+\s+\[[^\]]+\]\s+›\s+/.test(lines[i])) {
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

function buildFocusedCommand({ title, scope }) {
  if (title) {
    const specMatch = title.match(/(tests\/[^\s:]+\.e2e\.spec\.ts)(?::\d+:\d+)?/)
    if (specMatch) return `pnpm test:e2e -- ${specMatch[1]}`
  }

  if (scope === 'Docs') return 'pnpm test:qa-docs'
  if (scope === 'App' || scope === 'Manual' || scope === 'README' || scope === 'E2E-Helper') return 'pnpm test:qa-current'
  if (scope === 'Script') return 'pnpm test:qa-failure-summary-script'
  return 'pnpm test:full'
}

function buildSummary({ title, scope, rule, focusedCommand }) {
  const parts = ['# qa-full-nightly failure quick summary', '']
  parts.push(`- firstFailingTest: ${title ?? '(none)'}`)
  parts.push(`- contractScope: ${scope ?? '(n/a)'}`)
  parts.push(`- contractRule: ${rule ?? '(n/a)'}`)
  parts.push(`- focusedCommand: ${focusedCommand}`)
  return parts.join('\n')
}

try {
  const args = process.argv.slice(2)
  const logPath = getArg(args, 'log', 'qa-full.log')
  const format = getArg(args, 'format', 'markdown')

  const text = await readFile(logPath, 'utf8')
  const fail = extractFirstFailureBlock(text)
  const meta = fail ? extractContractMeta(fail.block) : { scope: null, rule: null }

  const focusedCommand = buildFocusedCommand({ title: fail?.title ?? null, scope: meta.scope })

  const payload = {
    firstFailingTest: fail?.title ?? null,
    contractScope: meta.scope,
    contractRule: meta.rule,
    focusedCommand,
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(payload, null, 2))
  } else if (format === 'markdown') {
    process.stdout.write(buildSummary({
      title: payload.firstFailingTest,
      scope: payload.contractScope,
      rule: payload.contractRule,
      focusedCommand: payload.focusedCommand,
    }))
  } else {
    throw new Error(`format must be one of: markdown, json (received "${format}")`)
  }
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[summarize-qa-failure] ${msg}\n`)
  process.exit(1)
}
