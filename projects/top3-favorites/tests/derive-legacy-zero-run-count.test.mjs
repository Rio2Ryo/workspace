import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const scriptPath = new URL('../scripts/derive-legacy-zero-run-count.mjs', import.meta.url)

function run(args = [], env = {}) {
  return spawnSync('node', [scriptPath.pathname, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

test('[Script] derive-legacy-zero-run-count increments when usage-count is zero', () => {
  const r = run(['--usage-count=0', '--previous-zero-run-count=2'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), '3')
})

test('[Script] derive-legacy-zero-run-count resets to zero when usage-count is non-zero', () => {
  const r = run(['--usage-count=5', '--previous-zero-run-count=7'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), '0')
})

test('[Script] derive-legacy-zero-run-count supports env variables', () => {
  const r = run([], { LEGACY_CONTEXT_USAGE_COUNT: '0', PREVIOUS_ZERO_RUN_COUNT: '4' })
  assert.equal(r.status, 0)
  assert.equal(r.stdout.trim(), '5')
})

test('[Script] derive-legacy-zero-run-count validates non-negative integers', () => {
  const r = run(['--usage-count=-1'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /must be a non-negative integer/)
})
