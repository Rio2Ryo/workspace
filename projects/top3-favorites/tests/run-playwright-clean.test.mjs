import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildPlaywrightArgs, dynamicPreviewPort, previewCleanupCommands, resolvePreviewPort, staleProcessCleanupPatterns } from '../scripts/run-playwright-clean.mjs'

test('clean Playwright runner exposes explicit pre/post preview-port cleanup', () => {
  assert.deepEqual(previewCleanupCommands({ port: 4180 }), [
    'lsof -tiTCP:4180 -sTCP:LISTEN',
    'kill <pids>',
    'wait-port-empty 4180',
  ])
})

test('clean Playwright runner scans stale Playwright and preview process families before retrying full E2E', () => {
  assert.deepEqual(staleProcessCleanupPatterns(), [
    'playwright test',
    'pnpm exec playwright',
    'scripts/preview-local.mjs',
    'node scripts/run-playwright-clean.mjs',
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

test('clean Playwright runner uses a dynamic default port to avoid loopback TIME_WAIT exhaustion between E2E runs', () => {
  assert.equal(dynamicPreviewPort({ pid: 8123 }), 4323)
  assert.equal(resolvePreviewPort({}, { pid: 8123 }), 4323)
  assert.equal(resolvePreviewPort({ PORT: '4180' }, { pid: 8123 }), 4180)
  assert.equal(resolvePreviewPort({ E2E_PREVIEW_PORT: '4999', PORT: '4180' }, { pid: 8123 }), 4999)
})

test('clean Playwright runner starts preview itself and disables Playwright webServer probing', async () => {
  const source = await readFile(new URL('../scripts/run-playwright-clean.mjs', import.meta.url), 'utf8')
  assert.match(source, /startPreviewServer\(port/, 'clean runner should wait for the preview stdout readiness marker itself')
  assert.match(source, /HOST=::1/, 'clean runner should use IPv6 loopback to avoid IPv4 TIME_WAIT exhaustion')
  assert.match(source, /HOST:\s*'::1'/, 'clean runner should pass the same IPv6 host to Playwright baseURL')
  assert.match(source, /PLAYWRIGHT_EXTERNAL_SERVER:\s*'1'/, 'clean runner should skip Playwright webServer HTTP probing after starting preview')
})

test('clean Playwright runner runs stale-process cleanup before and after Playwright', async () => {
  const source = await readFile(new URL('../scripts/run-playwright-clean.mjs', import.meta.url), 'utf8')
  const runBody = source.match(/export async function runPlaywrightClean[\s\S]*?\n}/)?.[0] || ''
  const cleanupCalls = [...runBody.matchAll(/cleanupStaleProcessFamilies\(/g)]
  assert.equal(cleanupCalls.length, 2, 'runPlaywrightClean should call cleanupStaleProcessFamilies once before and once after running Playwright')
})

test('package exposes clean E2E command for flaky-stale-server recovery', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.scripts['test:e2e:clean'], 'node scripts/run-playwright-clean.mjs')
  assert.equal(packageJson.scripts['test:e2e-clean-script'], 'node --test tests/run-playwright-clean.test.mjs')
  assert.match(packageJson.scripts['test:full'], /pnpm test:e2e-clean-script/)
  assert.match(packageJson.scripts['test:full'], /pnpm test:e2e:clean/)
})

test('screenshot smoke runs through the clean IPv6 runner instead of Playwright IPv4 webServer probing', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(
    packageJson.scripts['test:screenshots'],
    'node scripts/run-playwright-clean.mjs tests/screenshot-smoke.e2e.spec.ts',
  )
})
