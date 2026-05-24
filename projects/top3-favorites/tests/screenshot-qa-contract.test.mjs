import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const coverageDoc = await readFile(new URL('../docs/AUTOMATED_QA_COVERAGE.md', import.meta.url), 'utf8')
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8')

test('[QA][screenshots] package exposes automated screenshot smoke capture and includes it in full verification', () => {
  assert.equal(
    packageJson.scripts['test:screenshots'],
    'playwright test tests/screenshot-smoke.e2e.spec.ts',
    'package.json should expose a focused screenshot smoke command',
  )
  assert.match(
    packageJson.scripts['test:full'],
    /pnpm test:screenshots/,
    'pnpm test:full should include screenshot smoke capture so visual QA does not remain manual-only',
  )
})

test('[QA][screenshots] coverage docs name the automated screenshot smoke spec and command', () => {
  assert.match(
    coverageDoc,
    /tests\/screenshot-smoke\.e2e\.spec\.ts/,
    'AUTOMATED_QA_COVERAGE should document the screenshot smoke spec',
  )
  assert.match(
    coverageDoc,
    /pnpm test:screenshots/,
    'AUTOMATED_QA_COVERAGE should document the focused screenshot smoke command',
  )
  assert.doesNotMatch(
    coverageDoc,
    /スクリーンショット取得$/m,
    'screenshot capture should not be documented as wholly manual-only once an automated smoke artifact exists',
  )
})

test('[QA][screenshots] README gives reviewers the screenshot command', () => {
  assert.match(
    readme,
    /pnpm test:screenshots/,
    'README should tell reviewers how to capture current UI screenshots locally',
  )
})
