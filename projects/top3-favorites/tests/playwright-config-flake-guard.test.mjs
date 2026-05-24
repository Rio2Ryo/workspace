import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const configSource = await readFile(new URL('../playwright.config.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('[E2E][flake-guard] Playwright retries transient navigation aborts instead of failing the full QA run immediately', () => {
  assert.match(configSource, /retries:\s*1\b/, 'playwright.config.ts should set retries: 1 for transient page.goto net::ERR_ABORTED flakes')
  assert.doesNotMatch(configSource, /navigationTimeout:\s*10_000\b/, 'playwright.config.ts must not add an overly short global navigation timeout that creates false failures before retries can help')
  assert.match(configSource, /timeout:\s*60_000\b/, 'playwright.config.ts should give recovery retries room inside each E2E test timeout')
  assert.match(configSource, /timeout:\s*120_000\b/, 'playwright.config.ts should allow the local build+preview server enough time to become ready')
  assert.match(configSource, /PLAYWRIGHT_EXTERNAL_SERVER[\s\S]*\?[\s\S]*undefined/, 'playwright.config.ts should let the clean runner skip Playwright webServer probing when it starts preview itself')
})

test('[E2E][flake-guard] full verification includes the Playwright flake guard contract', () => {
  assert.equal(packageJson.scripts['test:playwright-config-flake-guard'], 'node --test tests/playwright-config-flake-guard.test.mjs')
  assert.match(packageJson.scripts['test:full'], /pnpm test:playwright-config-flake-guard/)
})
