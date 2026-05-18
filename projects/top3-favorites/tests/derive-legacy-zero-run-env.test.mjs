import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const scriptPath = new URL('../scripts/derive-legacy-zero-run-env.mjs', import.meta.url)

function run(args = [], env = {}) {
  return spawnSync('node', [scriptPath.pathname, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

test('[Script] derive-legacy-zero-run-env increments when last usage is zero', () => {
  const r = run(['--previous-zero-run-count=2', '--last-legacy-context-usage-count=0'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), 'QA_LEGACY_ZERO_RUN_COUNT=3')
})

test('[Script] derive-legacy-zero-run-env resets when last usage is non-zero', () => {
  const r = run(['--previous-zero-run-count=7', '--last-legacy-context-usage-count=5'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), 'QA_LEGACY_ZERO_RUN_COUNT=0')
})

test('[Script] derive-legacy-zero-run-env supports env vars', () => {
  const r = run([], { PREVIOUS_ZERO_RUN_COUNT: '4', LAST_LEGACY_CONTEXT_USAGE_COUNT: '0' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), 'QA_LEGACY_ZERO_RUN_COUNT=5')
})

test('[Script] derive-legacy-zero-run-env validates non-negative integers', () => {
  const r = run(['--previous-zero-run-count=-1', '--last-legacy-context-usage-count=0'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /must be a non-negative integer/)
})

test('[Script] derive-legacy-zero-run-env supports plain format', () => {
  const r = run(['--previous-zero-run-count=2', '--last-legacy-context-usage-count=0', '--format=plain'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), '3')
})

test('[Script] derive-legacy-zero-run-env supports github-output format', () => {
  const r = run(['--previous-zero-run-count=2', '--last-legacy-context-usage-count=0', '--format=github-output'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), 'legacy_zero_run_count=3')
})

test('[Script] derive-legacy-zero-run-env rejects unknown format', () => {
  const r = run(['--format=unknown'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /format must be one of/)
})
