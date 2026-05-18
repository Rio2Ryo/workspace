import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildPlaywrightArgs, previewCleanupCommands } from '../scripts/run-playwright-clean.mjs'

test('clean Playwright runner exposes explicit pre/post preview-port cleanup', () => {
  assert.deepEqual(previewCleanupCommands({ port: 4180 }), [
    'lsof -tiTCP:4180 -sTCP:LISTEN',
    'kill <pids>',
    'wait-port-empty 4180',
  ])
})

test('clean Playwright runner forwards shard/reporter arguments without swallowing them', () => {
  assert.deepEqual(buildPlaywrightArgs(['--shard=3/4', '--reporter=line']), [
    'exec',
    'playwright',
    'test',
    '--shard=3/4',
    '--reporter=line',
  ])
})

test('package exposes clean E2E command for flaky-stale-server recovery', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.scripts['test:e2e:clean'], 'node scripts/run-playwright-clean.mjs')
  assert.equal(packageJson.scripts['test:e2e-clean-script'], 'node --test tests/run-playwright-clean.test.mjs')
  assert.match(packageJson.scripts['test:full'], /pnpm test:e2e-clean-script/)
  assert.match(packageJson.scripts['test:full'], /pnpm test:e2e:clean/)
})
