import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  appForbiddenPatterns,
  appRequiredPatterns,
  docs,
  forbiddenDocPatterns,
  helperContractCases,
  importPreviewManualHeadings,
  manualAutomatedLinkContracts,
  readmeCommandContractGroups,
  readmeLinkContracts,
  requiredDocPatterns,
  importPreviewContractCases,
  contractMessageLimits,
} from './qa-current-contract.config.mjs'
import {
  collectFiles,
  collectSpecUrlsByNamePredicate,
  findBeforeEachOffenders,
} from './qa-current-contract.utils.mjs'
import { contractMessage, missingItemsMessage } from './qa-contract-message.mjs'

const root = new URL('..', import.meta.url)
const appPath = new URL('src/App.tsx', `${root}/`)
const importPreviewTestsPath = new URL('tests/import-preview/', `${root}/`)

test('[App] current implementation uses API-backed structured form, not legacy localStorage or natural parsing', async () => {
  const appSource = await readFile(appPath, 'utf8')

  for (const { pattern, message } of appRequiredPatterns) {
    assert.match(appSource, pattern, message)
  }

  for (const { pattern, message } of appForbiddenPatterns) {
    assert.doesNotMatch(appSource, pattern, message)
  }
})

test('[Docs] QA manuals and QA result docs match the current implementation contract', async () => {
  for (const relativePath of docs) {
    const markdown = await readFile(new URL(relativePath, `${root}/`), 'utf8')

    for (const { pattern, message } of requiredDocPatterns) {
      assert.match(markdown, pattern, `${relativePath} ${message}`)
    }

    for (const { pattern, message } of forbiddenDocPatterns) {
      assert.doesNotMatch(markdown, pattern, `${relativePath}: ${message}`)
    }
  }
})

test('[Docs] QA coverage docs do not leave API load failure recovery as manual-only when E2E covers it', async () => {
  const apiLoadRetrySpec = await readFile(new URL('tests/api-load-retry.e2e.spec.ts', `${root}/`), 'utf8')
  const coverage = await readFile(new URL('docs/AUTOMATED_QA_COVERAGE.md', `${root}/`), 'utf8')
  const qaResult = await readFile(new URL('docs/QA_RESULT.md', `${root}/`), 'utf8')

  assert.match(apiLoadRetrySpec, /status:\s*503/, contractMessage({ scope: 'Docs', rule: 'api-load-retry failure injection', expected: 'spec injects initial 503 failure', fix: 'ensure tests/api-load-retry.e2e.spec.ts stubs status: 503 once' }))
  assert.match(apiLoadRetrySpec, /データを再読み込み/, contractMessage({ scope: 'Docs', rule: 'api-load-retry recovery assertion', expected: 'spec verifies データを再読み込み flow', fix: 'assert retry UI text and recovery path in tests/api-load-retry.e2e.spec.ts' }))
  assert.match(coverage, /tests\/api-load-retry\.e2e\.spec\.ts/, contractMessage({ scope: 'Docs', rule: 'coverage listing for api-load-retry', expected: 'docs/AUTOMATED_QA_COVERAGE.md includes tests/api-load-retry.e2e.spec.ts', fix: 'add missing spec path to coverage doc' }))
  assert.doesNotMatch(
    coverage,
    /API停止やネットワーク障害など、ローカルpreviewでは再現しにくい障害注入/,
    contractMessage({ scope: 'Docs', rule: 'no manual-only fallback for api-load-retry', expected: 'coverage doc does not mark API failure recovery as manual-only', fix: 'remove outdated manual-only note once E2E exists' }),
  )
  assert.doesNotMatch(
    qaResult,
    /`\/api\/items` 取得失敗時の体感確認/,
    contractMessage({ scope: 'Docs', rule: 'qa result reflects automated API failure recovery', expected: 'QA_RESULT has no unresolved manual residual for /api/items load failure', fix: 'update QA_RESULT to reflect api-load-retry coverage' }),
  )
})

test('[Manual] manual checklist includes import preview categories aligned with automated QA structure', async () => {
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')

  for (const heading of importPreviewManualHeadings) {
    assert.ok(markdown.includes(heading), contractMessage({ scope: 'Manual', rule: 'import preview category heading exists', expected: heading, fix: 'add missing heading under 4.2 import preview section in docs/MANUAL_TEST_CHECKLIST.md' }))
  }
})

test('[Manual] manual checklist uses the current import preview toggle aria-label namespace', async () => {
  const appSource = await readFile(appPath, 'utf8')
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')

  assert.match(
    appSource,
    /aria-label={`インポート詳細:/,
    contractMessage({ scope: 'App', rule: 'import preview aria-label namespace', expected: 'aria-label starts with インポート詳細:', fix: 'prefix toggle aria-label values with インポート詳細:' }),
  )
  assert.match(
    markdown,
    /`aria-label` は `インポート詳細:`/,
    contractMessage({ scope: 'Manual', rule: 'manual checklist reflects current aria-label prefix', expected: 'manual checklist references インポート詳細: prefix', fix: 'update naming section in docs/MANUAL_TEST_CHECKLIST.md' }),
  )
  assert.doesNotMatch(
    markdown,
    /トグルの `aria-label` は `インポート確認:`/,
    contractMessage({ scope: 'Manual', rule: 'manual checklist avoids deprecated aria-label prefix', expected: 'no インポート確認: expectation for toggle prefix', fix: 'remove outdated prefix instruction from docs/MANUAL_TEST_CHECKLIST.md' }),
  )
})

test('[Manual] manual checklist marks browser-console and API-failure checks as automated where possible', async () => {
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')
  const coverageDoc = await readFile(new URL('docs/AUTOMATED_QA_COVERAGE.md', `${root}/`), 'utf8')

  for (const { pattern, message } of manualAutomatedLinkContracts.manualChecklistChecks) {
    assert.match(markdown, pattern, message)
  }

  for (const { pattern, message } of manualAutomatedLinkContracts.coverageChecks) {
    assert.match(coverageDoc, pattern, message)
  }
})

test(`[README] ${readmeLinkContracts.title}`, async () => {
  const readme = await readFile(new URL('README.md', `${root}/`), 'utf8')

  for (const { pattern, message } of readmeLinkContracts.checks) {
    assert.match(readme, pattern, message)
  }
})

for (const { title, commands } of readmeCommandContractGroups) {
  test(`[README] ${title}`, async () => {
    const readme = await readFile(new URL('README.md', `${root}/`), 'utf8')

    for (const command of commands) {
      assert.ok(readme.includes(command), contractMessage({ scope: 'README', rule: 'staged verification command is documented', expected: command, fix: 'add command to README verification section' }))
    }
  })
}

test('[E2E-Helper] import preview specs use shared reset helpers in beforeEach hooks', async () => {
  const specs = await collectFiles(importPreviewTestsPath, (name) => name.endsWith('.e2e.spec.ts'))
  const offenders = []

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const beforeEachBlocks = source.match(/test\.beforeEach\([\s\S]*?\n\}\)/g) ?? []

    for (const block of beforeEachBlocks) {
      if (importPreviewContractCases.inlineResetChecks.some(({ pattern }) => pattern.test(block))) {
        offenders.push(specUrl.pathname.replace(root.pathname, ''))
        break
      }
    }
  }

  const message = importPreviewContractCases.inlineResetChecks[0].message
  assert.deepEqual(offenders.sort(), [], missingItemsMessage({ scope: 'E2E-Helper', rule: message, fix: 'replace inline reset with shared helper', items: offenders, limit: contractMessageLimits.e2eHelper }))
})

test('[E2E-Helper] import preview specs import reset helpers directly from tests/e2e-helpers.ts', async () => {
  const specs = await collectFiles(importPreviewTestsPath, (name) => name.endsWith('.e2e.spec.ts'))
  const offenders = []

  for (const specUrl of specs) {
    const source = await readFile(specUrl, 'utf8')
    const { forbiddenPattern, requiredPattern } = importPreviewContractCases.helperImportChecks
    if (source.includes(forbiddenPattern) || !source.includes(requiredPattern)) {
      offenders.push(specUrl.pathname.replace(root.pathname, ''))
    }
  }

  const { message } = importPreviewContractCases.helperImportChecks
  assert.deepEqual(
    offenders.sort(),
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: message,
      fix: 'import reset helpers directly from ../../e2e-helpers',
      items: offenders,
      limit: contractMessageLimits.e2eHelper,
    }),
  )
})

test('[E2E-Helper] resetItemsByDelete is an asserted atomic reset alias, not a per-row delete loop', async () => {
  const helperSource = await readFile(new URL('tests/e2e-helpers.ts', `${root}/`), 'utf8')

  assert.match(
    helperSource,
    /export async function resetItemsByDelete[\s\S]*resetItemsByReplace\(request\)/,
    'delete-named reset helper should delegate to the asserted atomic replace reset to avoid full-suite dirty-state flake',
  )
  assert.doesNotMatch(
    helperSource,
    /for \(const item of data\.items\)[\s\S]*request\.delete/,
    'reset helper must not perform unasserted per-row DELETE loops',
  )
})

for (const { title, predicate, blockPattern, messagePrefix } of helperContractCases) {
  test(`[E2E-Helper] ${title}`, async () => {
    const specs = await collectSpecUrlsByNamePredicate(root, predicate)
    const offenders = await findBeforeEachOffenders(root, specs, blockPattern)

    assert.deepEqual(
      offenders,
      [],
      missingItemsMessage({ scope: 'E2E-Helper', rule: messagePrefix, fix: 'replace inline reset with shared helper in beforeEach', items: offenders, limit: contractMessageLimits.e2eHelper }),
    )
  })
}
