import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  appForbiddenPatterns,
  appRequiredPatterns,
  docs,
  forbiddenDocPatterns,
  directMutationContractCases,
  helperContractCases,
  importPreviewManualHeadings,
  manualAutomatedLinkContracts,
  readmeCommandContractGroups,
  readmeLinkContracts,
  requiredDocPatterns,
  importPreviewContractCases,
  scopeLimitRules,
} from './qa-current-contract.config.mjs'
import {
  collectFiles,
  collectSpecUrlsByNamePredicate,
  findBeforeEachOffenders,
  findScopeRuleOverlaps,
} from './qa-current-contract.utils.mjs'
import { contractMessage, missingItemsMessage } from './qa-contract-message.mjs'

const root = new URL('..', import.meta.url)
const appPath = new URL('src/App.tsx', `${root}/`)
const importPreviewTestsPath = new URL('tests/import-preview/', `${root}/`)
const contractTestPaths = [
  new URL('tests/qa-current-contract.test.mjs', `${root}/`),
  new URL('tests/qa-coverage-doc.test.mjs', `${root}/`),
]

test('[App] current implementation uses API-backed structured form, not legacy localStorage or natural parsing', async () => {
  const appSource = await readFile(appPath, 'utf8')

  for (const { pattern, message } of appRequiredPatterns) {
    assert.match(appSource, pattern, message)
  }

  for (const { pattern, message } of appForbiddenPatterns) {
    assert.doesNotMatch(appSource, pattern, message)
  }
})

test('[App] scopeLimitRules do not produce overlapping matches across QA contract test suites', async () => {
  const overlaps = await findScopeRuleOverlaps(contractTestPaths, scopeLimitRules)

  assert.deepEqual(
    overlaps,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules overlap check',
      fix: 'tighten regex patterns in scopeLimitRules to avoid multi-match collisions',
      items: overlaps,
    }),
  )
})

test('[App] scopeLimitRules ids follow naming contract (scope- prefix, kebab-case, unique)', async () => {
  const idPattern = /^scope-[a-z0-9]+(?:-[a-z0-9]+)*$/
  const ids = scopeLimitRules.map((rule) => rule.id)
  const missing = ids.filter((id) => typeof id !== 'string' || id.length === 0)
  const malformed = ids.filter((id) => typeof id === 'string' && !idPattern.test(id))
  const missingDescription = scopeLimitRules
    .filter(({ description }) => typeof description !== 'string' || description.trim().length === 0)
    .map(({ id }) => id ?? '(missing-id)')
  const malformedDescription = scopeLimitRules
    .filter(({ description }) => typeof description === 'string' && !/^Controls\s/.test(description.trim()))
    .map(({ id, description }) => `${id ?? '(missing-id)'} -> ${description ?? '(missing-description)'}`)
  const malformedDescriptionStructure = scopeLimitRules
    .filter(({ description }) => typeof description === 'string' && !/^Controls\s.+\sfor\s.+/.test(description.trim()))
    .map(({ id, description }) => `${id ?? '(missing-id)'} -> ${description ?? '(missing-description)'}`)
  const overlongDescription = scopeLimitRules
    .filter(({ description }) => typeof description === 'string' && description.trim().length > 90)
    .map(({ id, description }) => `${id ?? '(missing-id)'} (${description.trim().length} chars)`)
  const nonEnglishDescription = scopeLimitRules
    .filter(({ description }) => typeof description === 'string' && /[^\x20-\x7E]/.test(description))
    .map(({ id, description }) => `${id ?? '(missing-id)'} -> ${description ?? '(missing-description)'}`)
  const seen = new Set()
  const duplicated = []
  for (const id of ids) {
    if (seen.has(id)) duplicated.push(id)
    seen.add(id)
  }

  assert.deepEqual(
    missing,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules id existence',
      fix: 'add non-empty string id to every scopeLimitRules entry',
      items: missing,
    }),
  )
  assert.deepEqual(
    malformed,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules id naming format',
      fix: 'rename ids to scope-<kebab-case> format',
      items: malformed,
    }),
  )
  assert.deepEqual(
    duplicated,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules id uniqueness',
      fix: 'ensure each scopeLimitRules id is unique',
      items: duplicated,
    }),
  )
  assert.deepEqual(
    missingDescription,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules description presence',
      fix: 'add non-empty description to each scopeLimitRules entry',
      items: missingDescription,
    }),
  )
  assert.deepEqual(
    malformedDescription,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules description style',
      fix: 'start each description with "Controls ..." to keep logs consistent',
      items: malformedDescription,
    }),
  )
  assert.deepEqual(
    overlongDescription,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules description max length',
      fix: 'keep each description within 90 characters to avoid wrapped overlap logs',
      items: overlongDescription,
    }),
  )
  assert.deepEqual(
    malformedDescriptionStructure,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules description semantic shape',
      fix: 'use "Controls <target> for <purpose>" format for every scope rule description',
      items: malformedDescriptionStructure,
    }),
  )
  assert.deepEqual(
    nonEnglishDescription,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules description language policy',
      fix: 'keep descriptions ASCII English to avoid mixed-language overlap logs',
      items: nonEnglishDescription,
    }),
  )
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
  assert.deepEqual(offenders.sort(), [], missingItemsMessage({ scope: 'E2E-Helper', rule: message, fix: 'replace inline reset with shared helper', items: offenders }))
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
      missingItemsMessage({ scope: 'E2E-Helper', rule: messagePrefix, fix: 'replace inline reset with shared helper in beforeEach', items: offenders }),
    )
  })
}

for (const { title, predicate, pattern, messagePrefix } of directMutationContractCases) {
  test(`[E2E-Helper] ${title}`, async () => {
    const specs = await collectSpecUrlsByNamePredicate(root, predicate)
    const offenders = []

    for (const specUrl of specs) {
      const source = await readFile(specUrl, 'utf8')
      if (pattern.test(source)) {
        offenders.push(specUrl.pathname.replace(root.pathname, ''))
      }
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      missingItemsMessage({ scope: 'E2E-Helper', rule: messagePrefix, fix: 'replace direct per-row mutation with resetItemsByReplace helper', items: offenders }),
    )
  })
}
