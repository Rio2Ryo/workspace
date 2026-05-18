#!/usr/bin/env node

function parseNonNegativeInteger(value, label) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer: received "${value}"`)
  }
  return n
}

function getArg(args, key) {
  const prefix = `--${key}=`
  const found = args.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

try {
  const args = process.argv.slice(2)
  const previousZeroRunCountRaw = getArg(args, 'previous-zero-run-count') ?? process.env.PREVIOUS_ZERO_RUN_COUNT ?? '0'
  const lastLegacyUsageCountRaw = getArg(args, 'last-legacy-context-usage-count') ?? process.env.LAST_LEGACY_CONTEXT_USAGE_COUNT ?? '0'
  const format = getArg(args, 'format') ?? 'export'

  const previousZeroRunCount = parseNonNegativeInteger(previousZeroRunCountRaw, 'previous-zero-run-count')
  const lastLegacyUsageCount = parseNonNegativeInteger(lastLegacyUsageCountRaw, 'last-legacy-context-usage-count')

  const nextZeroRunCount = lastLegacyUsageCount === 0 ? previousZeroRunCount + 1 : 0

  if (format === 'plain') {
    process.stdout.write(String(nextZeroRunCount))
  } else if (format === 'export') {
    process.stdout.write(`QA_LEGACY_ZERO_RUN_COUNT=${nextZeroRunCount}`)
  } else if (format === 'github-output') {
    process.stdout.write(`legacy_zero_run_count=${nextZeroRunCount}`)
  } else {
    throw new Error(`format must be one of: plain, export, github-output (received "${format}")`)
  }
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[derive-legacy-zero-run-env] ${msg}\n`)
  process.exit(1)
}
