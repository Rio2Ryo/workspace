import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const scriptPath = new URL('../scripts/summarize-qa-failure.mjs', import.meta.url)

function run(args = []) {
  return spawnSync('node', [scriptPath.pathname, ...args], {
    encoding: 'utf8',
    env: process.env,
  })
}

function createLog(content) {
  const dir = mkdtempSync(join(tmpdir(), 'qa-fail-'))
  const p = join(dir, 'qa-full.log')
  writeFileSync(p, content, 'utf8')
  return p
}

test('[Script] summarize-qa-failure extracts first failing test and contract meta (markdown)', () => {
  const log = createLog([
    'ok 1 - [App][behavior] passes',
    'not ok 2 - [App][config-quality] sample failure',
    '  error: [Contract][App] foo | rule: bar baz | expected: x | fix: y',
    '# Subtest: next',
  ].join('\n'))
  const r = run([`--log=${log}`, '--format=markdown'])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /firstFailingTest: \[App\]\[config-quality\] sample failure/)
  assert.match(r.stdout, /contractScope: App/)
  assert.match(r.stdout, /contractRule: bar baz/)
})

test('[Script] summarize-qa-failure supports json format', () => {
  const log = createLog([
    'not ok 1 - [Docs][integrity] stale path',
    '  error: [Contract][Docs] x | rule: stale docs path | expected: none | fix: clean',
  ].join('\n'))
  const r = run([`--log=${log}`, '--format=json'])
  assert.equal(r.status, 0)
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.firstFailingTest, '[Docs][integrity] stale path')
  assert.equal(parsed.contractScope, 'Docs')
  assert.equal(parsed.contractRule, 'stale docs path')
})

test('[Script] summarize-qa-failure handles no failures', () => {
  const log = createLog(['ok 1 - all good'].join('\n'))
  const r = run([`--log=${log}`])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /firstFailingTest: \(none\)/)
})

test('[Script] summarize-qa-failure rejects unknown format', () => {
  const log = createLog(['ok 1 - all good'].join('\n'))
  const r = run([`--log=${log}`, '--format=xml'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /format must be one of/)
})
