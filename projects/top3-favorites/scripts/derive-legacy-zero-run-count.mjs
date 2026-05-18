#!/usr/bin/env node

function parseIntArg(value, name) {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer: received "${value}"`)
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

  const usageCount = parseIntArg(getArg(args, 'usage-count') ?? process.env.LEGACY_CONTEXT_USAGE_COUNT, 'usage-count') ?? 0
  const previousZeroRunCount =
    parseIntArg(getArg(args, 'previous-zero-run-count') ?? process.env.PREVIOUS_ZERO_RUN_COUNT, 'previous-zero-run-count') ?? 0

  const zeroRunCount = usageCount === 0 ? previousZeroRunCount + 1 : 0
  process.stdout.write(String(zeroRunCount))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[derive-legacy-zero-run-count] ${message}\n`)
  process.exit(1)
}
