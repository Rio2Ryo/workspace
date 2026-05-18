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
  e2eHelperCategoryContract,
  requiredDocPatterns,
  importPreviewContractCases,
  contractMessageLimits,
  deepFreezeSkipTypeRules,
  scopeDescriptionContract,
  scopeLimitRules,
} from './qa-current-contract.config.mjs'
import {
  analyzeDuplicates,
  analyzeEnumList,
  assertDeepFrozen,
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

test('[App] contract configs are deeply frozen (recursive guard against nested drift)', async () => {
  const skipByType = (value) => {
    if (deepFreezeSkipTypeRules.includes('function') && typeof value === 'function') return true
    if (deepFreezeSkipTypeRules.includes('RegExp') && value instanceof RegExp) return true
    return false
  }

  assertDeepFrozen(contractMessageLimits, {
    label: 'contractMessageLimits',
    skip: skipByType,
  })
  assertDeepFrozen(scopeDescriptionContract, {
    label: 'scopeDescriptionContract',
    skip: skipByType,
  })
  assertDeepFrozen(scopeLimitRules, {
    label: 'scopeLimitRules',
    skip: skipByType,
  })
  assertDeepFrozen(importPreviewContractCases, {
    label: 'importPreviewContractCases',
    skip: skipByType,
  })
  assertDeepFrozen(helperContractCases, {
    label: 'helperContractCases',
    skip: skipByType,
  })
  assertDeepFrozen(directMutationContractCases, {
    label: 'directMutationContractCases',
    skip: skipByType,
  })
  assertDeepFrozen(manualAutomatedLinkContracts, {
    label: 'manualAutomatedLinkContracts',
    skip: skipByType,
  })
  assertDeepFrozen(readmeLinkContracts, {
    label: 'readmeLinkContracts',
    skip: skipByType,
  })
  assertDeepFrozen(readmeCommandContractGroups, {
    label: 'readmeCommandContractGroups',
    skip: skipByType,
  })
  assertDeepFrozen(requiredDocPatterns, {
    label: 'requiredDocPatterns',
    skip: skipByType,
  })
  assertDeepFrozen(forbiddenDocPatterns, {
    label: 'forbiddenDocPatterns',
    skip: skipByType,
  })
  assertDeepFrozen(appRequiredPatterns, {
    label: 'appRequiredPatterns',
    skip: skipByType,
  })
  assertDeepFrozen(appForbiddenPatterns, {
    label: 'appForbiddenPatterns',
    skip: skipByType,
  })
  assertDeepFrozen(importPreviewManualHeadings, {
    label: 'importPreviewManualHeadings',
    skip: skipByType,
  })
  assertDeepFrozen(docs, {
    label: 'docs',
    skip: skipByType,
  })
})


test('[App] deepFreezeSkipTypeRules follows allowed-value contract (allowed-only, unique, sorted)', async () => {
  const allowed = new Set(['function', 'RegExp'])
  const { invalid, duplicates, unsorted } = analyzeEnumList(deepFreezeSkipTypeRules, {
    allowed,
    locale: 'en',
  })

  assert.deepEqual(
    invalid,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'deepFreezeSkipTypeRules allowed values',
      fix: 'keep deepFreezeSkipTypeRules entries within [function, RegExp]',
      items: invalid,
    }),
  )
  assert.deepEqual(
    duplicates,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'deepFreezeSkipTypeRules uniqueness',
      fix: 'remove duplicate entries from deepFreezeSkipTypeRules',
      items: duplicates,
    }),
  )
  assert.deepEqual(
    unsorted,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'deepFreezeSkipTypeRules sorted order',
      fix: 'sort deepFreezeSkipTypeRules in ascending en locale order',
      items: unsorted,
    }),
  )
})

test('[App] scopeLimitRules IDs follow naming and uniqueness contract', async () => {
  const idPattern = /^scope-[a-z0-9]+(?:-[a-z0-9]+)*$/
  const ids = scopeLimitRules.map((rule) => rule.id)
  const missing = ids.filter((id) => typeof id !== 'string' || id.length === 0)
  const malformed = ids.filter((id) => typeof id === 'string' && !idPattern.test(id))
  const duplicated = analyzeDuplicates(ids)

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
})

test('[App] scopeLimitRules descriptions follow style, shape, length, and language policy', async () => {
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

test('[App] scopeDescriptionContract vocabulary lists are unique and sorted', async () => {
  const targetTerms = [...scopeDescriptionContract.allowedTargets]
  const purposeTerms = [...scopeDescriptionContract.allowedPurposes]
  const {
    duplicates: duplicatedTargetTerms,
    unsorted: unsortedTargetTerms,
  } = analyzeEnumList(targetTerms, { locale: 'en' })
  const {
    duplicates: duplicatedPurposeTerms,
    unsorted: unsortedPurposeTerms,
  } = analyzeEnumList(purposeTerms, { locale: 'en' })

  assert.deepEqual(
    duplicatedTargetTerms,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeDescriptionContract allowedTargets uniqueness',
      fix: 'deduplicate allowedTargets entries in scopeDescriptionContract',
      items: duplicatedTargetTerms,
    }),
  )
  assert.deepEqual(
    duplicatedPurposeTerms,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeDescriptionContract allowedPurposes uniqueness',
      fix: 'deduplicate allowedPurposes entries in scopeDescriptionContract',
      items: duplicatedPurposeTerms,
    }),
  )
  assert.deepEqual(
    unsortedTargetTerms,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeDescriptionContract allowedTargets sorted order',
      fix: 'sort allowedTargets in ascending en locale order',
      items: unsortedTargetTerms,
    }),
  )
  assert.deepEqual(
    unsortedPurposeTerms,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeDescriptionContract allowedPurposes sorted order',
      fix: 'sort allowedPurposes in ascending en locale order',
      items: unsortedPurposeTerms,
    }),
  )
})

test('[App] scopeLimitRules descriptions use allowed vocabulary and avoid dead vocabulary', async () => {
  const targetTerms = [...scopeDescriptionContract.allowedTargets]
  const purposeTerms = [...scopeDescriptionContract.allowedPurposes]
  const allowedTargets = new Set(targetTerms)
  const allowedPurposes = new Set(purposeTerms)
  const usedTargets = new Set()
  const usedPurposes = new Set()

  const disallowedVocabulary = scopeLimitRules
    .map(({ id, description }) => ({ id, description: String(description ?? '') }))
    .map(({ id, description }) => {
      const m = /^Controls\s(.+)\sfor\s(.+)$/.exec(description.trim())
      if (!m) return `${id ?? '(missing-id)'} -> ${description}`
      const [, target, purpose] = m
      usedTargets.add(target)
      usedPurposes.add(purpose)
      if (!allowedTargets.has(target) || !allowedPurposes.has(purpose)) {
        return `${id ?? '(missing-id)'} -> target:${target} | purpose:${purpose}`
      }
      return null
    })
    .filter(Boolean)

  const unusedAllowedTargets = Array.from(allowedTargets)
    .filter((target) => !usedTargets.has(target))
    .sort((a, b) => a.localeCompare(b, 'en'))
  const unusedAllowedPurposes = Array.from(allowedPurposes)
    .filter((purpose) => !usedPurposes.has(purpose))
    .sort((a, b) => a.localeCompare(b, 'en'))

  assert.deepEqual(
    disallowedVocabulary,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeLimitRules description allowed vocabulary',
      fix: 'use only allowed target/purpose terms from scopeDescriptionContract',
      items: disallowedVocabulary,
    }),
  )
  assert.deepEqual(
    unusedAllowedTargets,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeDescriptionContract allowedTargets dead vocabulary',
      fix: 'remove unused target terms or use them in scopeLimitRules descriptions',
      items: unusedAllowedTargets,
    }),
  )
  assert.deepEqual(
    unusedAllowedPurposes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'scopeDescriptionContract allowedPurposes dead vocabulary',
      fix: 'remove unused purpose terms or use them in scopeLimitRules descriptions',
      items: unusedAllowedPurposes,
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

test('[E2E-Helper] allowed category dictionary is unique, sorted, and kebab-case', async () => {
  const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const allowedList = [...e2eHelperCategoryContract.allowed]
  const { duplicates, unsorted } = analyzeEnumList(allowedList, { locale: 'en' })
  const empty = allowedList.filter((v) => v.trim().length === 0)
  const malformed = allowedList.filter((v) => !kebab.test(v))

  assert.deepEqual(
    empty,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'e2eHelperCategoryContract.allowed non-empty values',
      fix: 'remove empty category strings from e2eHelperCategoryContract.allowed',
      items: empty,
    }),
  )
  assert.deepEqual(
    malformed,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'e2eHelperCategoryContract.allowed kebab-case',
      fix: 'rename allowed category labels to kebab-case format',
      items: malformed,
    }),
  )
  assert.deepEqual(
    duplicates,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'e2eHelperCategoryContract.allowed uniqueness',
      fix: 'deduplicate entries in e2eHelperCategoryContract.allowed',
      items: duplicates,
    }),
  )
  assert.deepEqual(
    unsorted,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'e2eHelperCategoryContract.allowed sorted order',
      fix: 'sort e2eHelperCategoryContract.allowed in ascending en locale order',
      items: unsorted,
    }),
  )
})

test('[E2E-Helper] contract case categories follow naming contract (allowed, non-empty, kebab-case)', async () => {
  const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const allowed = new Set(e2eHelperCategoryContract.allowed)
  const categories = [
    ...helperContractCases.map(({ category }) => String(category ?? '')),
    ...directMutationContractCases.map(({ category }) => String(category ?? '')),
  ]

  const empty = categories.filter((v) => v.trim().length === 0)
  const invalidAllowed = categories.filter((v) => !allowed.has(v))
  const malformed = categories.filter((v) => !kebab.test(v))

  assert.deepEqual(
    empty,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'contract case category presence',
      fix: 'set non-empty category on every helper/direct-mutation contract case',
      items: empty,
    }),
  )
  assert.deepEqual(
    invalidAllowed,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'contract case category allowed set',
      fix: 'use only allowed categories: api-delete, before-each-reset',
      items: invalidAllowed,
    }),
  )
  assert.deepEqual(
    malformed,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'contract case category kebab-case',
      fix: 'rename categories to kebab-case format',
      items: malformed,
    }),
  )
})

test('[E2E-Helper][beforeEach-reset] import preview specs use shared reset helpers in beforeEach hooks', async () => {
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

test('[E2E-Helper][import-path] import preview specs import reset helpers directly from tests/e2e-helpers.ts', async () => {
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

for (const { category, title, predicate, blockPattern, messagePrefix } of helperContractCases) {
  test(`[E2E-Helper][${category}] ${title}`, async () => {
    const specs = await collectSpecUrlsByNamePredicate(root, predicate)
    const offenders = await findBeforeEachOffenders(root, specs, blockPattern)

    assert.deepEqual(
      offenders,
      [],
      missingItemsMessage({ scope: 'E2E-Helper', rule: messagePrefix, fix: 'replace inline reset with shared helper in beforeEach', items: offenders }),
    )
  })
}

for (const { category, title, predicate, pattern, messagePrefix } of directMutationContractCases) {
  test(`[E2E-Helper][${category}] ${title}`, async () => {
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
