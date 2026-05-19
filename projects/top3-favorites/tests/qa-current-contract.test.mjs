import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
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
  e2eHelperMessagePrefixContract,
  requiredDocPatterns,
  importPreviewContractCases,
  contractMessageLimits,
  deepFreezeSkipTypeRules,
  missingItemsContextKeyContract,
  legacyPromotionKeys,
  legacyPromotionRemovalContract,
  scopeDescriptionContract,
  scopeLimitRules,
  qaTestTitleSubscopeContract,
} from './qa-current-contract.config.mjs'
import {
  analyzeDuplicates,
  analyzeEnumList,
  assertDeepFrozen,
  collectBracketScopeAndSubscopePairs,
  collectContextKeyUsageByScopeFromSource,
  collectContextObjectKeysFromSource,
  collectFiles,
  collectSpecUrlsByNamePredicate,
  findBeforeEachOffenders,
  findScopeRuleOverlaps,
} from './qa-current-contract.utils.mjs'
import { configuredObservedOverview, contractMessage, missingItemsMessage } from './qa-contract-message.mjs'

const root = new URL('..', import.meta.url)
const appPath = new URL('src/App.tsx', `${root}/`)
const importPreviewTestsPath = new URL('tests/import-preview/', `${root}/`)
const contractTestPaths = [
  new URL('tests/qa-current-contract.test.mjs', `${root}/`),
  new URL('tests/qa-coverage-doc.test.mjs', `${root}/`),
]

function parseNonNegativeIntegerOrDefault(value, fallback) {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  const n = Number(value)
  if (Number.isInteger(n) && n >= 0) return n
  return fallback
}

async function collectDirectoryNames(dirUrl, predicate) {
  let entries
  try {
    entries = await readdir(dirUrl, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  const matches = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const childUrl = new URL(`${entry.name}/`, dirUrl)
    if (predicate(entry.name)) {
      matches.push(childUrl.pathname.replace(root.pathname, ''))
    }
    matches.push(...await collectDirectoryNames(childUrl, predicate))
  }

  return matches.sort((a, b) => a.localeCompare(b, 'en'))
}

test('[App][config-quality] QA runs do not leave local state directories in the repo', async () => {
  const stateDirs = await collectDirectoryNames(root, (name) => name === '.qa-state')

  assert.deepEqual(
    stateDirs,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'no local QA state directories in repository tree',
      fix: 'delete .qa-state directories and keep QA contract tests deterministic/read-only',
      items: stateDirs,
    }),
  )
})

test('[App][config-quality] QA test title subscope contract is enforced across qa-current + qa-docs', async () => {
  const pairs = [
    ...(await collectBracketScopeAndSubscopePairs(new URL('tests/qa-current-contract.test.mjs', `${root}/`))),
    ...(await collectBracketScopeAndSubscopePairs(new URL('tests/qa-coverage-doc.test.mjs', `${root}/`))),
  ]

  const allowedByScope = qaTestTitleSubscopeContract.allowedByScope
  const unknownScope = []
  const invalidSubscope = []
  const usedByScope = new Map()

  const markUsed = (scope, subscope) => {
    const used = usedByScope.get(scope) ?? new Set()
    used.add(subscope)
    usedByScope.set(scope, used)
  }

  for (const pair of pairs) {
    const [scope, subscope] = pair.split('::')
    const allowed = allowedByScope[scope]
    if (!allowed) {
      unknownScope.push(pair)
      continue
    }
    markUsed(scope, subscope)

    if (!allowed.includes(subscope)) {
      invalidSubscope.push(pair)
    }
  }

  for (const category of e2eHelperCategoryContract.allowed) {
    markUsed('E2E-Helper', category)
  }

  const observedScopes = Array.from(usedByScope.keys()).sort((a, b) => a.localeCompare(b, 'en'))
  const configuredScopes = Object.keys(allowedByScope).sort((a, b) => a.localeCompare(b, 'en'))

  const missingScopeMappings = observedScopes.filter((scope) => !configuredScopes.includes(scope))
  const extraScopeMappings = configuredScopes.filter((scope) => !observedScopes.includes(scope))
  const scopeOverview = {
    configured: configuredScopes,
    observed: observedScopes,
  }

  const deadSubscope = []
  const deadScope = []
  const missingSubscopeMappings = []
  const extraSubscopeMappings = []
  const subscopeOverviewByScope = []
  for (const [scope, allowed] of Object.entries(allowedByScope)) {
    const used = usedByScope.get(scope) ?? new Set()
    if (used.size === 0) deadScope.push(scope)
    subscopeOverviewByScope.push(`${scope}{${configuredObservedOverview(allowed, Array.from(used))}}`)
    for (const name of allowed) {
      if (!used.has(name)) deadSubscope.push(`${scope}::${name}`)
    }
    for (const observed of used) {
      if (!allowed.includes(observed)) {
        missingSubscopeMappings.push(`${scope}::${observed}`)
      }
    }
    for (const configured of allowed) {
      if (!used.has(configured)) {
        extraSubscopeMappings.push(`${scope}::${configured}`)
      }
    }
  }
  deadScope.sort((a, b) => a.localeCompare(b, 'en'))
  deadSubscope.sort((a, b) => a.localeCompare(b, 'en'))
  missingSubscopeMappings.sort((a, b) => a.localeCompare(b, 'en'))
  extraSubscopeMappings.sort((a, b) => a.localeCompare(b, 'en'))
  subscopeOverviewByScope.sort((a, b) => a.localeCompare(b, 'en'))
  const subscopeOverview = subscopeOverviewByScope.join(' | ')

  assert.deepEqual(
    unknownScope,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title scope contract (known scopes)',
      fix: 'add missing scope mapping to qaTestTitleSubscopeContract.allowedByScope',
      items: unknownScope,
    }),
  )
  assert.deepEqual(
    missingScopeMappings,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title scope dictionary completeness (configured covers observed)',
      fix: 'add missing observed scope keys to qaTestTitleSubscopeContract.allowedByScope',
      context: scopeOverview,
      items: missingScopeMappings,
    }),
  )
  assert.deepEqual(
    extraScopeMappings,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title scope dictionary exactness (no extra configured scopes)',
      fix: 'remove configured scope keys that are not observed in qa-current/qa-docs tests',
      context: scopeOverview,
      items: extraScopeMappings,
    }),
  )
  assert.deepEqual(
    invalidSubscope,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title subscope contract (allowed values per scope)',
      fix: 'rename test subscopes or extend qaTestTitleSubscopeContract.allowedByScope',
      items: invalidSubscope,
    }),
  )
  assert.deepEqual(
    missingSubscopeMappings,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title subscope dictionary completeness (configured covers observed per scope)',
      fix: 'add missing observed subscopes into qaTestTitleSubscopeContract.allowedByScope.<scope>',
      context: subscopeOverview,
      items: missingSubscopeMappings,
    }),
  )
  assert.deepEqual(
    extraSubscopeMappings,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title subscope dictionary exactness (no extra configured subscope per scope)',
      fix: 'remove configured subscopes not observed in qa-current/qa-docs tests',
      context: subscopeOverview,
      items: extraSubscopeMappings,
    }),
  )
  assert.deepEqual(
    deadScope,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title scope dead dictionary entries',
      fix: 'remove unused scope keys from qaTestTitleSubscopeContract.allowedByScope or add matching tests',
      items: deadScope,
    }),
  )
  assert.deepEqual(
    deadSubscope,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title subscope dead dictionary entries',
      fix: 'remove unused subscopes from qaTestTitleSubscopeContract.allowedByScope or add matching tests',
      items: deadSubscope,
    }),
  )
})

test('[App][config-quality] QA title subscope dictionaries are non-empty, unique, sorted, and kebab-case', async () => {
  const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const scopeEntries = Object.entries(qaTestTitleSubscopeContract.allowedByScope)
  const emptyScopes = scopeEntries.filter(([scope]) => String(scope).trim().length === 0).map(([scope]) => scope)

  assert.deepEqual(
    emptyScopes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'QA title subscope dictionary scope keys are non-empty',
      fix: 'remove empty scope keys from qaTestTitleSubscopeContract.allowedByScope',
      items: emptyScopes,
    }),
  )

  for (const [scope, list] of scopeEntries) {
    const items = [...list]
    const empty = items.filter((v) => v.trim().length === 0)
    const malformed = items.filter((v) => !kebab.test(v))
    const { duplicates, unsorted } = analyzeEnumList(items, { locale: 'en' })

    assert.deepEqual(
      empty,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: `QA title subscope dictionary non-empty (${scope})`,
        fix: `remove empty subscopes in qaTestTitleSubscopeContract.allowedByScope.${scope}`,
        items: empty,
      }),
    )
    assert.deepEqual(
      malformed,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: `QA title subscope dictionary kebab-case (${scope})`,
        fix: `rename subscopes to kebab-case in qaTestTitleSubscopeContract.allowedByScope.${scope}`,
        items: malformed,
      }),
    )
    assert.deepEqual(
      duplicates,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: `QA title subscope dictionary uniqueness (${scope})`,
        fix: `deduplicate subscopes in qaTestTitleSubscopeContract.allowedByScope.${scope}`,
        items: duplicates,
      }),
    )
    assert.deepEqual(
      unsorted,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: `QA title subscope dictionary sorted order (${scope})`,
        fix: `sort subscopes in qaTestTitleSubscopeContract.allowedByScope.${scope} with en locale order`,
        items: unsorted,
      }),
    )
  }
})

test('[App][config-quality] missingItemsMessage context key dictionary and usage follow contract', async () => {
  assert.equal(
    Object.isFrozen(missingItemsContextKeyContract),
    true,
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract freeze guard',
      expected: 'missingItemsContextKeyContract is frozen',
      fix: 'freeze missingItemsContextKeyContract in tests/qa-current-contract.config.mjs',
    }),
  )
  assert.equal(
    Object.isFrozen(missingItemsContextKeyContract.allowed),
    true,
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowed freeze guard',
      expected: 'missingItemsContextKeyContract.allowed is frozen',
      fix: 'freeze missingItemsContextKeyContract.allowed in tests/qa-current-contract.config.mjs',
    }),
  )

  const lowerCamel = /^[a-z][a-zA-Z0-9]*$/
  const allowedList = [...missingItemsContextKeyContract.allowed]
  const allowed = new Set(allowedList)
  const { duplicates, unsorted } = analyzeEnumList(allowedList, { locale: 'en' })
  const emptyAllowed = allowedList.filter((k) => k.trim().length === 0)
  const nonAsciiAllowed = allowedList.filter((k) => /[^\x20-\x7E]/.test(k))

  const allowedSortModes = [...missingItemsContextKeyContract.allowedContextSortModes]
  const allowedSortModeSet = new Set(allowedSortModes)
  const { duplicates: duplicatedSortModes, unsorted: unsortedSortModes } = analyzeEnumList(allowedSortModes, { locale: 'en' })
  const emptySortModes = allowedSortModes.filter((k) => k.trim().length === 0)
  const nonAsciiSortModes = allowedSortModes.filter((k) => /[^\x20-\x7E]/.test(k))
  const invalidSortModes = allowedSortModes.filter((m) => !['key', 'valueCountDesc'].includes(m))

  const qaCurrentSource = await readFile(new URL('tests/qa-current-contract.test.mjs', `${root}/`), 'utf8')
  const qaDocsSource = await readFile(new URL('tests/qa-coverage-doc.test.mjs', `${root}/`), 'utf8')

  const usedSortModes = Array.from(new Set([
    ...Array.from(qaCurrentSource.matchAll(/contextSortMode\s*:\s*['"]([^'"]+)['"]/g)).map((m) => m[1]),
    ...Array.from(qaDocsSource.matchAll(/contextSortMode\s*:\s*['"]([^'"]+)['"]/g)).map((m) => m[1]),
    'key',
  ])).sort((a, b) => a.localeCompare(b, 'en'))
  const deadSortModes = allowedSortModes.filter((m) => !usedSortModes.includes(m)).sort((a, b) => a.localeCompare(b, 'en'))
  const usageByScope = new Map()
  const mergeUsage = (incoming) => {
    for (const [key, scopes] of incoming.entries()) {
      const acc = usageByScope.get(key) ?? new Set()
      for (const s of scopes) acc.add(s)
      usageByScope.set(key, acc)
    }
  }
  mergeUsage(await collectContextKeyUsageByScopeFromSource(qaCurrentSource))
  mergeUsage(await collectContextKeyUsageByScopeFromSource(qaDocsSource))

  const keys = [
    ...await collectContextObjectKeysFromSource(qaCurrentSource),
    ...await collectContextObjectKeysFromSource(qaDocsSource),
  ]
  const uniqueKeys = Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b, 'en'))
  const malformed = uniqueKeys.filter((k) => !lowerCamel.test(k))
  const unknown = uniqueKeys.filter((k) => !allowed.has(k))
  const legacyContextKeysUsed = uniqueKeys
    .filter((k) => legacyPromotionKeys.includes(k))
    .sort((a, b) => a.localeCompare(b, 'en'))
  const deadAllowedKeys = allowedList.filter((k) => !uniqueKeys.includes(k)).sort((a, b) => a.localeCompare(b, 'en'))

  assert.deepEqual(
    emptyAllowed,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowed non-empty entries',
      fix: 'remove empty entries from missingItemsContextKeyContract.allowed',
      items: emptyAllowed,
    }),
  )
  assert.deepEqual(
    duplicates,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowed uniqueness',
      fix: 'remove duplicate keys from missingItemsContextKeyContract.allowed',
      items: duplicates,
    }),
  )
  assert.deepEqual(
    unsorted,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowed sorted order',
      fix: 'sort missingItemsContextKeyContract.allowed in ascending en locale order',
      items: unsorted,
    }),
  )
  assert.deepEqual(
    nonAsciiAllowed,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowed ASCII policy',
      fix: 'keep missingItemsContextKeyContract.allowed keys ASCII-only',
      items: nonAsciiAllowed,
    }),
  )

  assert.deepEqual(
    emptySortModes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowedContextSortModes non-empty entries',
      fix: 'remove empty entries from missingItemsContextKeyContract.allowedContextSortModes',
      items: emptySortModes,
    }),
  )
  assert.deepEqual(
    duplicatedSortModes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowedContextSortModes uniqueness',
      fix: 'remove duplicate entries from missingItemsContextKeyContract.allowedContextSortModes',
      items: duplicatedSortModes,
    }),
  )
  assert.deepEqual(
    unsortedSortModes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowedContextSortModes sorted order',
      fix: 'sort missingItemsContextKeyContract.allowedContextSortModes in ascending en locale order',
      items: unsortedSortModes,
    }),
  )
  assert.deepEqual(
    nonAsciiSortModes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowedContextSortModes ASCII policy',
      fix: 'keep missingItemsContextKeyContract.allowedContextSortModes ASCII-only',
      items: nonAsciiSortModes,
    }),
  )
  assert.deepEqual(
    invalidSortModes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowedContextSortModes allowed values',
      fix: 'keep context sort mode values within [key, valueCountDesc]',
      items: invalidSortModes,
    }),
  )
  const deadSortModesThreshold = missingItemsContextKeyContract.promotionThresholds.deadSortModes
  const deadSortModesMode = missingItemsContextKeyContract.promotionModes.deadSortModes
  const shouldPromoteDeadSortModes = deadSortModes.length <= deadSortModesThreshold
  if (deadSortModesMode === 'enforce') {
    assert.deepEqual(
      deadSortModes,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: 'missingItemsContextKeyContract.allowedContextSortModes dead modes',
        fix: 'remove unused sort modes from allowedContextSortModes or add matching usage in tests',
        context: {
          deadSortModeCount: String(deadSortModes.length),
          promotionModeDeadSortModes: deadSortModesMode,
          promotionThresholdDeadSortModes: String(deadSortModesThreshold),
          usedSortModes,
        },
        items: deadSortModes,
      }),
    )
  }

  assert.deepEqual(
    malformed,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsMessage context key naming policy',
      fix: 'rename context keys to lowerCamelCase in qa-current/qa-docs tests',
      items: malformed,
    }),
  )
  assert.deepEqual(
    unknown,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsMessage context key allowed set',
      fix: 'add new keys to missingItemsContextKeyContract.allowed or rename context keys',
      items: unknown,
    }),
  )
  const legacyContextUsageCount = legacyContextKeysUsed.length
  const envZeroRunRaw = process.env[legacyPromotionRemovalContract.observedZeroRunCountEnv]
  const observedZeroRunCount = parseNonNegativeIntegerOrDefault(envZeroRunRaw, 0)
  const zeroRunCount = legacyContextUsageCount === 0 ? Math.max(1, observedZeroRunCount) : 0
  const shouldPromoteLegacyRemoval =
    legacyContextUsageCount <= legacyPromotionRemovalContract.promoteWhenLegacyContextUsageCountLte &&
    zeroRunCount >= legacyPromotionRemovalContract.consecutiveZeroRunsToEnforce

  if (legacyPromotionRemovalContract.enforceRemoval) {
    assert.deepEqual(
      legacyContextKeysUsed,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: 'legacy promotion context keys must not be used',
        fix: 'replace legacy context keys with promotionMode*/promotionThreshold* keys',
        context: {
          enforceRemoval: String(legacyPromotionRemovalContract.enforceRemoval),
          legacyContextUsageCount: String(legacyContextUsageCount),
          promoteWhenLegacyContextUsageCountLte: String(
            legacyPromotionRemovalContract.promoteWhenLegacyContextUsageCountLte,
          ),
          observedZeroRunCount: String(observedZeroRunCount),
          zeroRunCount: String(zeroRunCount),
          consecutiveZeroRunsToEnforce: String(legacyPromotionRemovalContract.consecutiveZeroRunsToEnforce),
        },
        items: legacyContextKeysUsed,
      }),
    )
  } else {
    assert.equal(
      shouldPromoteLegacyRemoval,
      false,
      missingItemsMessage({
        scope: 'App',
        rule: 'legacy promotion keys removal promotion trigger',
        fix: 'set legacyPromotionRemovalContract.enforceRemoval=true when legacy context usage count is at or below threshold and zero-run requirement is satisfied',
        context: {
          enforceRemoval: String(legacyPromotionRemovalContract.enforceRemoval),
          legacyContextUsageCount: String(legacyContextUsageCount),
          promoteWhenLegacyContextUsageCountLte: String(
            legacyPromotionRemovalContract.promoteWhenLegacyContextUsageCountLte,
          ),
          observedZeroRunCount: String(observedZeroRunCount),
          zeroRunCount: String(zeroRunCount),
          consecutiveZeroRunsToEnforce: String(legacyPromotionRemovalContract.consecutiveZeroRunsToEnforce),
        },
        items: legacyContextKeysUsed,
      }),
    )
  }

  assert.equal(
    typeof missingItemsContextKeyContract.enforceDeadScopePriority,
    'boolean',
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.enforceDeadScopePriority type guard',
      expected: 'boolean flag',
      fix: 'set enforceDeadScopePriority to true/false boolean in tests/qa-current-contract.config.mjs',
    }),
  )
  assert.equal(
    typeof missingItemsContextKeyContract.promoteWhenDeadScopeCountLte,
    'number',
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.promoteWhenDeadScopeCountLte type guard',
      expected: 'number threshold',
      fix: 'set promoteWhenDeadScopeCountLte to a non-negative number in tests/qa-current-contract.config.mjs',
    }),
  )
  assert.equal(
    Number.isInteger(missingItemsContextKeyContract.promoteWhenDeadScopeCountLte),
    true,
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.promoteWhenDeadScopeCountLte integer policy',
      expected: 'integer threshold',
      fix: 'set promoteWhenDeadScopeCountLte to an integer (e.g., 0)',
    }),
  )
  assert.equal(
    missingItemsContextKeyContract.promoteWhenDeadScopeCountLte >= 0,
    true,
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.promoteWhenDeadScopeCountLte non-negative policy',
      expected: '>= 0',
      fix: 'set promoteWhenDeadScopeCountLte to a non-negative integer',
    }),
  )

  assert.equal(
    typeof missingItemsContextKeyContract.promotionThresholds,
    'object',
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.promotionThresholds type guard',
      expected: 'object map',
      fix: 'set promotionThresholds to an object in tests/qa-current-contract.config.mjs',
    }),
  )
  assert.equal(
    typeof missingItemsContextKeyContract.promotionModes,
    'object',
    contractMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.promotionModes type guard',
      expected: 'object map',
      fix: 'set promotionModes to an object in tests/qa-current-contract.config.mjs',
    }),
  )

  assert.deepEqual(
    [...legacyPromotionKeys],
    ['enforceDeadScopePriority', 'promoteWhenDeadScopeCountLte'],
    missingItemsMessage({
      scope: 'App',
      rule: 'legacyPromotionKeys contract',
      fix: 'keep legacyPromotionKeys stable while migration to promotionModes/promotionThresholds is in progress',
      items: [...legacyPromotionKeys],
    }),
  )

  const legacyInAllowed = legacyPromotionKeys.filter((k) => allowedList.includes(k)).sort((a, b) =>
    a.localeCompare(b, 'en'),
  )
  assert.deepEqual(
    legacyInAllowed,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'legacy promotion keys must not appear in allowed context dictionary',
      fix: 'remove legacy keys from missingItemsContextKeyContract.allowed to avoid new context usage',
      items: legacyInAllowed,
    }),
  )

  assert.equal(
    typeof legacyPromotionRemovalContract.enforceRemoval,
    'boolean',
    contractMessage({
      scope: 'App',
      rule: 'legacyPromotionRemovalContract.enforceRemoval type guard',
      expected: 'boolean flag',
      fix: 'set legacyPromotionRemovalContract.enforceRemoval to true/false boolean',
    }),
  )
  assert.equal(
    Number.isInteger(legacyPromotionRemovalContract.promoteWhenLegacyContextUsageCountLte),
    true,
    contractMessage({
      scope: 'App',
      rule: 'legacyPromotionRemovalContract.promoteWhenLegacyContextUsageCountLte integer policy',
      expected: 'integer threshold',
      fix: 'set promoteWhenLegacyContextUsageCountLte to an integer (e.g., 0)',
    }),
  )
  assert.equal(
    legacyPromotionRemovalContract.promoteWhenLegacyContextUsageCountLte >= 0,
    true,
    contractMessage({
      scope: 'App',
      rule: 'legacyPromotionRemovalContract.promoteWhenLegacyContextUsageCountLte non-negative policy',
      expected: '>= 0',
      fix: 'set promoteWhenLegacyContextUsageCountLte to a non-negative integer',
    }),
  )
  assert.equal(
    Number.isInteger(legacyPromotionRemovalContract.consecutiveZeroRunsToEnforce),
    true,
    contractMessage({
      scope: 'App',
      rule: 'legacyPromotionRemovalContract.consecutiveZeroRunsToEnforce integer policy',
      expected: 'integer count',
      fix: 'set consecutiveZeroRunsToEnforce to an integer (e.g., 1)',
    }),
  )
  assert.equal(
    legacyPromotionRemovalContract.consecutiveZeroRunsToEnforce >= 1,
    true,
    contractMessage({
      scope: 'App',
      rule: 'legacyPromotionRemovalContract.consecutiveZeroRunsToEnforce minimum policy',
      expected: '>= 1',
      fix: 'set consecutiveZeroRunsToEnforce to 1 or more',
    }),
  )
  assert.equal(
    typeof legacyPromotionRemovalContract.observedZeroRunCountEnv,
    'string',
    contractMessage({
      scope: 'App',
      rule: 'legacyPromotionRemovalContract.observedZeroRunCountEnv type guard',
      expected: 'string env var name',
      fix: 'set observedZeroRunCountEnv to a non-empty environment variable name',
    }),
  )
  assert.equal(
    legacyPromotionRemovalContract.observedZeroRunCountEnv.trim().length > 0,
    true,
    contractMessage({
      scope: 'App',
      rule: 'legacyPromotionRemovalContract.observedZeroRunCountEnv non-empty policy',
      expected: 'non-empty env var name',
      fix: 'set observedZeroRunCountEnv to a non-empty environment variable name',
    }),
  )

  const thresholdKeys = Object.keys(missingItemsContextKeyContract.promotionThresholds).sort((a, b) => a.localeCompare(b, 'en'))
  const modeKeys = Object.keys(missingItemsContextKeyContract.promotionModes).sort((a, b) => a.localeCompare(b, 'en'))
  assert.deepEqual(
    thresholdKeys,
    modeKeys,
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract promotion key parity',
      fix: 'keep promotionThresholds and promotionModes key sets aligned',
      context: {
        thresholdKeys,
        modeKeys,
      },
      items: [],
    }),
  )

  const allowedPromotionModes = new Set(['observe', 'enforce'])
  for (const [k, v] of Object.entries(missingItemsContextKeyContract.promotionThresholds)) {
    assert.equal(
      Number.isInteger(v),
      true,
      contractMessage({
        scope: 'App',
        rule: `missingItemsContextKeyContract.promotionThresholds.${k} integer policy`,
        expected: 'integer threshold',
        fix: `set promotionThresholds.${k} to an integer (e.g., 0)`,
      }),
    )
    assert.equal(
      v >= 0,
      true,
      contractMessage({
        scope: 'App',
        rule: `missingItemsContextKeyContract.promotionThresholds.${k} non-negative policy`,
        expected: '>= 0',
        fix: `set promotionThresholds.${k} to a non-negative integer`,
      }),
    )
  }
  for (const [k, v] of Object.entries(missingItemsContextKeyContract.promotionModes)) {
    assert.equal(
      allowedPromotionModes.has(v),
      true,
      contractMessage({
        scope: 'App',
        rule: `missingItemsContextKeyContract.promotionModes.${k} allowed values`,
        expected: 'observe|enforce',
        fix: `set promotionModes.${k} to observe or enforce`,
      }),
    )
  }

  const scopePriority = [...missingItemsContextKeyContract.scopePriority]
  const expectedScopePriority = ['App', 'Docs', 'Manual', 'README', 'E2E-Helper']
  const { duplicates: duplicatedScopePriority } = analyzeEnumList(scopePriority, { locale: 'en' })
  const emptyScopePriority = scopePriority.filter((s) => s.trim().length === 0)
  const invalidScopePriority = scopePriority.filter((s) => !expectedScopePriority.includes(s))
  const deadScopePriority = scopePriority.filter((s) => {
    const scopes = Array.from(usageByScope.values()).flatMap((v) => Array.from(v))
    return !scopes.includes(s)
  }).sort((a, b) => a.localeCompare(b, 'en'))

  assert.deepEqual(
    emptyScopePriority,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.scopePriority non-empty entries',
      fix: 'remove empty entries from missingItemsContextKeyContract.scopePriority',
      items: emptyScopePriority,
    }),
  )
  assert.deepEqual(
    duplicatedScopePriority,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.scopePriority uniqueness',
      fix: 'remove duplicate entries from missingItemsContextKeyContract.scopePriority',
      items: duplicatedScopePriority,
    }),
  )
  assert.deepEqual(
    invalidScopePriority,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.scopePriority allowed set',
      fix: 'align scopePriority entries with qaTestTitleSubscopeContract.allowedByScope keys',
      context: { expectedScopePriority },
      items: invalidScopePriority,
    }),
  )
  assert.deepEqual(
    scopePriority,
    expectedScopePriority,
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.scopePriority order policy',
      fix: 'keep scopePriority order consistent with qaTestTitleSubscopeContract.allowedByScope key order',
      context: {
        configured: scopePriority,
        expected: expectedScopePriority,
      },
      items: [],
    }),
  )
  const deadScopeThreshold =
    missingItemsContextKeyContract.promotionThresholds?.deadScopePriority ??
    missingItemsContextKeyContract.promoteWhenDeadScopeCountLte
  const deadScopeMode =
    missingItemsContextKeyContract.promotionModes?.deadScopePriority ??
    (missingItemsContextKeyContract.enforceDeadScopePriority ? 'enforce' : 'observe')
  const shouldPromoteDeadScope = deadScopePriority.length <= deadScopeThreshold

  if (deadScopeMode === 'enforce') {
    assert.deepEqual(
      deadScopePriority,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: 'missingItemsContextKeyContract.scopePriority dead scope entries',
        fix: 'remove unused scopes from scopePriority or add matching context usage in tests',
        context: {
          usedScopes: Array.from(new Set(Array.from(usageByScope.values()).flatMap((v) => Array.from(v)))).sort((a, b) =>
            a.localeCompare(b, 'en'),
          ),
        },
        items: deadScopePriority,
      }),
    )
  } else {
    assert.equal(
      shouldPromoteDeadScope,
      false,
      missingItemsMessage({
        scope: 'App',
        rule: 'missingItemsContextKeyContract.scopePriority promotion trigger',
        fix: 'set promotionModes.deadScopePriority=enforce when dead scope count is at or below the promotion threshold',
        context: {
          promotionModeDeadScopePriority: deadScopeMode,
          deadScopeCount: String(deadScopePriority.length),
          promotionThresholdDeadScopePriority: String(deadScopeThreshold),
          deadScopes: deadScopePriority,
        },
        items: deadScopePriority,
      }),
    )
  }

  const scopeRank = new Map(scopePriority.map((s, i) => [s, i]))
  const usageSummary = Object.fromEntries(
    Array.from(usageByScope.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'en'))
      .map(([key, scopes]) => {
        const sortedScopes = Array.from(scopes).sort((a, b) => {
          const ra = scopeRank.has(a) ? scopeRank.get(a) : Number.MAX_SAFE_INTEGER
          const rb = scopeRank.has(b) ? scopeRank.get(b) : Number.MAX_SAFE_INTEGER
          if (ra !== rb) return ra - rb
          return a.localeCompare(b, 'en')
        })
        return [key, `${sortedScopes.join(', ')} (count=${sortedScopes.length})`]
      }),
  )

  const deadAllowedKeysThreshold = missingItemsContextKeyContract.promotionThresholds.deadAllowedKeys
  const deadAllowedKeysMode = missingItemsContextKeyContract.promotionModes.deadAllowedKeys
  const shouldPromoteDeadAllowedKeys = deadAllowedKeys.length <= deadAllowedKeysThreshold
  if (deadAllowedKeysMode === 'enforce') {
    assert.deepEqual(
      deadAllowedKeys,
      [],
      missingItemsMessage({
        scope: 'App',
        rule: 'missingItemsContextKeyContract.allowed dead keys',
        fix: 'remove unused keys from missingItemsContextKeyContract.allowed or add matching context usage',
        context: {
          ...usageSummary,
          deadAllowedKeyCount: String(deadAllowedKeys.length),
          promotionModeDeadAllowedKeys: deadAllowedKeysMode,
          promotionThresholdDeadAllowedKeys: String(deadAllowedKeysThreshold),
          scopePriorityDeadScopes: deadScopePriority.join(', '),
        },
        contextSortMode: 'valueCountDesc',
        items: deadAllowedKeys,
      }),
    )
  } else {
    assert.equal(
      shouldPromoteDeadAllowedKeys,
      false,
      missingItemsMessage({
        scope: 'App',
        rule: 'missingItemsContextKeyContract.allowed dead keys promotion trigger',
        fix: 'set promotionModes.deadAllowedKeys=enforce when dead key count is at or below the promotion threshold',
        context: {
          deadAllowedKeyCount: String(deadAllowedKeys.length),
          promotionModeDeadAllowedKeys: deadAllowedKeysMode,
          promotionThresholdDeadAllowedKeys: String(deadAllowedKeysThreshold),
        },
        items: deadAllowedKeys,
      }),
    )
  }
})

test('[App][behavior] current implementation uses API-backed structured form, not legacy localStorage or natural parsing', async () => {
  const appSource = await readFile(appPath, 'utf8')

  for (const { pattern, message } of appRequiredPatterns) {
    assert.match(appSource, pattern, message)
  }

  for (const { pattern, message } of appForbiddenPatterns) {
    assert.doesNotMatch(appSource, pattern, message)
  }
})

test('[App][config-quality] scopeLimitRules do not produce overlapping matches across QA contract test suites', async () => {
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

test('[App][config-quality] contract configs are deeply frozen (recursive guard against nested drift)', async () => {
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


test('[App][config-quality] deepFreezeSkipTypeRules follows allowed-value contract (allowed-only, unique, sorted)', async () => {
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

test('[App][config-quality] scopeLimitRules IDs follow naming and uniqueness contract', async () => {
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

test('[App][config-quality] scopeLimitRules descriptions follow style, shape, length, and language policy', async () => {
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

test('[App][config-quality] scopeDescriptionContract vocabulary lists are unique and sorted', async () => {
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

test('[App][config-quality] scopeLimitRules descriptions use allowed vocabulary and avoid dead vocabulary', async () => {
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

test('[Docs][consistency] QA manuals and QA result docs match the current implementation contract', async () => {
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

test('[Docs][coverage-link] QA coverage docs do not leave API load failure recovery as manual-only when E2E covers it', async () => {
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

test('[Manual][structure] manual checklist includes import preview categories aligned with automated QA structure', async () => {
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')

  for (const heading of importPreviewManualHeadings) {
    assert.ok(markdown.includes(heading), contractMessage({ scope: 'Manual', rule: 'import preview category heading exists', expected: heading, fix: 'add missing heading under 4.2 import preview section in docs/MANUAL_TEST_CHECKLIST.md' }))
  }
})

test('[Manual][a11y] manual checklist uses the current import preview toggle aria-label namespace', async () => {
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

test('[Manual][a11y] manual checklist uses current normalization-exclusion store-name terminology', async () => {
  const appSource = await readFile(appPath, 'utf8')
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')
  const summarySection = markdown.slice(markdown.indexOf('#### 4.2.6 summary（件数サマリ）'), markdown.indexOf('---', markdown.indexOf('#### 4.2.6 summary（件数サマリ）')))

  assert.match(
    appSource,
    /正規化除外予定の店舗:/,
    contractMessage({ scope: 'App', rule: 'import preview excluded-name label terminology', expected: 'App renders 正規化除外予定の店舗:', fix: 'keep excluded-name preview label explicit about normalization exclusion' }),
  )
  assert.match(
    appSource,
    /excludedNameReasonLabels[\s\S]*正規化除外予定の店舗:/,
    contractMessage({ scope: 'App', rule: 'import preview excluded-name reason labels', expected: 'App renders excluded store preview with inline Top3-out reason labels', fix: 'keep excludedNameReasonLabels connected to the visible excluded-store preview' }),
  )
  assert.match(
    summarySection,
    /正規化除外がある時は `正規化除外予定の店舗: 店名（タグ名でTop3外: N位相当）` が表示される/,
    contractMessage({ scope: 'Manual', rule: 'manual checklist reflects excluded-name reason labels', expected: 'summary checklist expects inline Top3-out reason labels', fix: 'update docs/MANUAL_TEST_CHECKLIST.md import preview summary item to show 店名（タグ名でTop3外: N位相当）' }),
  )
  assert.doesNotMatch(
    summarySection,
    /正規化除外がある時は `正規化除外予定の店舗: 店名` が表示される/,
    contractMessage({ scope: 'Manual', rule: 'manual checklist avoids reasonless excluded-name label', expected: 'no reasonless excluded-store preview wording after inline reasons shipped', fix: 'replace stale 店名-only excluded-store preview wording with 店名（タグ名でTop3外: N位相当）' }),
  )
  assert.doesNotMatch(
    summarySection,
    /正規化除外がある時は `除外予定の店舗: 店名` が表示される/,
    contractMessage({ scope: 'Manual', rule: 'manual checklist avoids stale excluded-name label', expected: 'no stale 除外予定の店舗 label in summary checklist', fix: 'replace stale excluded-store preview wording with 正規化除外予定の店舗' }),
  )
})

function manualChecklistItemBlock(markdown, itemText) {
  const itemIndex = markdown.indexOf(`- [ ] ${itemText}`)
  assert.notEqual(itemIndex, -1, contractMessage({ scope: 'Manual', rule: 'manual checklist item exists', expected: itemText, fix: 'restore the exact manual checklist item before validating its automated link' }))
  const nextItemIndex = markdown.indexOf('\n- [ ] ', itemIndex + 1)
  return nextItemIndex === -1 ? markdown.slice(itemIndex) : markdown.slice(itemIndex, nextItemIndex)
}

test('[Manual][automation-link] import preview summary child items have direct automated links', async () => {
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')
  const childContracts = [
    {
      item: '`現在N件 → インポート後M件` と影響サマリ（追加/保持/削除予定/正規化除外）が表示される',
      specs: [
        'tests/import-preview/summary/import-preview-summary.e2e.spec.ts',
        'tests/import-preview/summary/import-preview-math-consistency.e2e.spec.ts',
      ],
    },
    {
      item: '同一JSON再インポート時に `差分なし（このインポートでデータ変更はありません）` が表示される',
      specs: [
        'tests/import-no-change-badge.e2e.spec.ts',
        'tests/import-preview/live/import-preview-live-summary-concise.e2e.spec.ts',
      ],
    },
    {
      item: '正規化除外がある時は `正規化除外予定の店舗: 店名（タグ名でTop3外: N位相当）` が表示される',
      specs: [
        'tests/import-excluded-reasons-preview.e2e.spec.ts',
        'tests/import-preview/summary/import-preview-excluded-names-normalized-context.e2e.spec.ts',
        'tests/import-preview/summary/import-preview-excluded-names-tag-context.e2e.spec.ts',
      ],
    },
    {
      item: '正規化除外予定の店舗が多い場合、先頭表示 + `ほかN件` で折りたたまれる',
      specs: ['tests/import-preview/summary/import-preview-excluded-names-collapsed.e2e.spec.ts'],
    },
    {
      item: '`除外店舗名を全件表示` / `除外店舗名を折りたたむ` で開閉できる',
      specs: [
        'tests/import-preview/summary/import-preview-excluded-names-collapsed.e2e.spec.ts',
        'tests/import-preview/summary/import-preview-expand-toggles-a11y.e2e.spec.ts',
      ],
    },
  ]

  for (const { item, specs } of childContracts) {
    const block = manualChecklistItemBlock(markdown, item)
    assert.match(block, /自動確認:/, contractMessage({ scope: 'Manual', rule: 'child checklist item has direct automated link', expected: item, fix: 'add an indented 自動確認 line directly under this manual checklist item' }))
    for (const spec of specs) {
      assert.ok(block.includes(`\`${spec}\``), contractMessage({ scope: 'Manual', rule: 'child checklist item cites authoritative spec', expected: spec, fix: 'add the focused E2E path to the child item 自動確認 line' }))
    }
  }
})

test('[Manual][automation-link] edit/delete child items have direct automated links', async () => {
  const markdown = await readFile(new URL('docs/MANUAL_TEST_CHECKLIST.md', `${root}/`), 'utf8')
  const childContracts = [
    {
      item: '編集ボタンで既存値が編集フォームに入る',
      specs: ['tests/edit-form-accessibility.e2e.spec.ts'],
    },
    {
      item: '編集保存で一覧表示が更新される',
      specs: ['tests/edit-form-accessibility.e2e.spec.ts'],
    },
    {
      item: '削除で対象のみ消える',
      specs: ['tests/delete-confirmation.e2e.spec.ts'],
    },
    {
      item: '削除後に再読み込みしても削除結果が維持される',
      specs: ['tests/delete-persists-after-reload-and-api.e2e.spec.ts'],
    },
  ]

  for (const { item, specs } of childContracts) {
    const block = manualChecklistItemBlock(markdown, item)
    assert.match(block, /自動確認:/, contractMessage({ scope: 'Manual', rule: 'edit/delete child checklist item has direct automated link', expected: item, fix: 'add an indented 自動確認 line directly under this edit/delete manual checklist item' }))
    for (const spec of specs) {
      assert.ok(block.includes(`\`${spec}\``), contractMessage({ scope: 'Manual', rule: 'edit/delete child checklist item cites authoritative spec', expected: spec, fix: 'add the focused E2E path to the child item 自動確認 line' }))
    }
  }
})

test('[Manual][automation-link] manual checklist marks browser-console, API-failure, and import/export checks as automated where possible', async () => {
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

test('[App][config-quality] full verification script includes lightweight QA automation scripts documented in README', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', `${root}/`), 'utf8'))
  const scripts = packageJson.scripts ?? {}
  const fullScript = scripts['test:full'] ?? ''
  const documentedLightweightQaCommands = readmeCommandContractGroups
    .flatMap(({ commands }) => commands)
    .filter((command) => {
      const scriptName = command.replace(/^pnpm\s+/, '')
      return scriptName.startsWith('test:legacy-') || scriptName === 'test:qa-failure-summary-script'
    })

  const missingFromFull = documentedLightweightQaCommands.filter((command) => !fullScript.includes(command))

  assert.deepEqual(
    missingFromFull,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'test:full includes documented lightweight QA commands',
      fix: 'add missing lightweight QA scripts to package.json test:full before E2E/build',
      context: { fullScript },
      items: missingFromFull,
    }),
  )
})

test('[App][config-quality] GitHub Actions wires derive-legacy-zero-run output to QA_LEGACY_ZERO_RUN_COUNT', async () => {
  const workflow = await readFile(new URL('.github/workflows/qa-current.yml', `${root}/`), 'utf8')

  assert.match(
    workflow,
    /jobs:\n\s+derive-legacy-zero-run:/,
    contractMessage({
      scope: 'App',
      rule: 'qa-current workflow has derive job',
      expected: 'derive-legacy-zero-run job exists',
      fix: 'add derive-legacy-zero-run job in .github/workflows/qa-current.yml',
    }),
  )

  assert.match(
    workflow,
    /node scripts\/derive-legacy-zero-run-env\.mjs --format=github-output/,
    contractMessage({
      scope: 'App',
      rule: 'qa-current workflow derives legacy zero-run via script',
      expected: 'derive script runs with --format=github-output',
      fix: 'run scripts/derive-legacy-zero-run-env.mjs --format=github-output in derive job',
    }),
  )

  assert.match(
    workflow,
    /outputs:\n\s+legacy_zero_run_count:\s+\$\{\{ steps\.derive\.outputs\.legacy_zero_run_count \}\}/,
    contractMessage({
      scope: 'App',
      rule: 'derive job exports legacy_zero_run_count output',
      expected: 'derive job output is wired from steps.derive.outputs.legacy_zero_run_count',
      fix: 'add derive job outputs.legacy_zero_run_count mapping',
    }),
  )

  assert.match(
    workflow,
    /env:\n\s+QA_LEGACY_ZERO_RUN_COUNT:\s+\$\{\{ needs\.derive-legacy-zero-run\.outputs\.legacy_zero_run_count \}\}/,
    contractMessage({
      scope: 'App',
      rule: 'qa-current job receives QA_LEGACY_ZERO_RUN_COUNT from derive output',
      expected: 'QA_LEGACY_ZERO_RUN_COUNT is mapped from needs.derive-legacy-zero-run.outputs.legacy_zero_run_count',
      fix: 'set qa-current job env.QA_LEGACY_ZERO_RUN_COUNT from derive output',
    }),
  )
})

test('[README] README explains nightly failure artifact triage with focusedCommand', async () => {
  const readme = await readFile(new URL('README.md', `${root}/`), 'utf8')

  assert.match(
    readme,
    /qa-full-nightly-failure-summary/,
    contractMessage({
      scope: 'README',
      rule: 'README names nightly failure summary artifact',
      expected: 'qa-full-nightly-failure-summary is documented',
      fix: 'document the nightly failure summary artifact in README',
    }),
  )

  assert.match(
    readme,
    /focusedCommand/,
    contractMessage({
      scope: 'README',
      rule: 'README explains focusedCommand triage field',
      expected: 'focusedCommand field is documented',
      fix: 'document that nightly failure summaries include focusedCommand',
    }),
  )

  assert.match(
    readme,
    /artifact.*focusedCommand.*再現/s,
    contractMessage({
      scope: 'README',
      rule: 'README describes artifact to focused-command reproduction flow',
      expected: 'artifact -> focusedCommand -> local reproduction flow is documented',
      fix: 'add a short nightly failure triage flow to README',
    }),
  )
})

test('[App][config-quality] GitHub Actions nightly workflow runs test:full, receives derived env, and uploads failure artifacts', async () => {
  const workflow = await readFile(new URL('.github/workflows/qa-full-nightly.yml', `${root}/`), 'utf8')

  assert.match(
    workflow,
    /on:\n\s+schedule:/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly workflow has schedule trigger',
      expected: 'schedule trigger exists',
      fix: 'add schedule trigger to .github/workflows/qa-full-nightly.yml',
    }),
  )

  assert.match(
    workflow,
    /- run: pnpm test:full/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly executes full regression suite',
      expected: 'pnpm test:full run step exists',
      fix: 'add pnpm test:full step in qa-full-nightly workflow',
    }),
  )

  assert.match(
    workflow,
    /env:\n\s+QA_LEGACY_ZERO_RUN_COUNT:\s+\$\{\{ needs\.derive-legacy-zero-run\.outputs\.legacy_zero_run_count \}\}/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly receives QA_LEGACY_ZERO_RUN_COUNT from derive output',
      expected: 'env wiring from derive job output',
      fix: 'set QA_LEGACY_ZERO_RUN_COUNT from needs.derive-legacy-zero-run.outputs.legacy_zero_run_count',
    }),
  )

  const qaFullJobStart = workflow.indexOf('  qa-full:')
  const qaFullJob = qaFullJobStart >= 0 ? workflow.slice(qaFullJobStart) : ''

  assert.match(
    qaFullJob,
    /\n\s+timeout-minutes:\s+15\n/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly full regression job has bounded runtime',
      expected: 'qa-full job has timeout-minutes: 15',
      fix: 'add timeout-minutes: 15 to the qa-full job so hung E2E does not require manual triage',
    }),
  )

  assert.match(
    workflow,
    /- run: pnpm test:full \| tee qa-full\.log/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly captures full run log',
      expected: 'pnpm test:full uses tee qa-full.log',
      fix: 'pipe full test run to qa-full.log for failure artifact generation',
    }),
  )

  assert.match(
    workflow,
    /uses:\s+actions\/upload-artifact@v4[\s\S]*name:\s+qa-full-nightly-failure-summary/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly uploads failure summary artifact',
      expected: 'upload-artifact step named qa-full-nightly-failure-summary exists',
      fix: 'add failure-only artifact upload for qa-full.log and qa-full-failure-summary.md',
    }),
  )

  assert.match(
    workflow,
    /node scripts\/summarize-qa-failure\.mjs --log=qa-full\.log --format=markdown/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly builds markdown failure summary via script',
      expected: 'summarize-qa-failure markdown invocation exists',
      fix: 'add script invocation to generate qa-full-failure-summary.md',
    }),
  )

  assert.match(
    workflow,
    /node scripts\/summarize-qa-failure\.mjs --log=qa-full\.log --format=json/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly builds json failure summary via script',
      expected: 'summarize-qa-failure json invocation exists',
      fix: 'add script invocation to generate qa-full-failure-summary.json',
    }),
  )

  assert.match(
    workflow,
    /cat qa-full-failure-summary\.md >> "\$GITHUB_STEP_SUMMARY"/,
    contractMessage({
      scope: 'App',
      rule: 'qa-full-nightly appends failure summary to job summary',
      expected: 'job summary append step exists',
      fix: 'append qa-full-failure-summary.md to $GITHUB_STEP_SUMMARY on failure',
    }),
  )

})

test('[E2E-Helper][config-quality] allowed category dictionary is unique, sorted, and kebab-case', async () => {
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

test('[E2E-Helper][config-quality] contract case categories follow naming contract (allowed, non-empty, kebab-case)', async () => {
  const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const allowed = new Set(e2eHelperCategoryContract.allowed)
  const categories = [
    ...helperContractCases.map(({ category }) => String(category ?? '')),
    ...directMutationContractCases.map(({ category }) => String(category ?? '')),
    String(importPreviewContractCases.inlineResetCategory ?? ''),
    String(importPreviewContractCases.helperImportCategory ?? ''),
  ]

  const empty = categories.filter((v) => v.trim().length === 0)
  const invalidAllowed = categories.filter((v) => !allowed.has(v))
  const malformed = categories.filter((v) => !kebab.test(v))
  const usedCategories = new Set(categories)
  const deadCategories = [...allowed].filter((category) => !usedCategories.has(category)).sort((a, b) => a.localeCompare(b, 'en'))

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
      fix: `use only allowed categories: ${e2eHelperCategoryContract.allowed.join(', ')}`,
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
  assert.deepEqual(
    deadCategories,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'e2eHelperCategoryContract.allowed dead categories',
      fix: 'remove unused categories from allowed set or add matching contract cases',
      items: deadCategories,
    }),
  )
})

test(`[E2E-Helper][${importPreviewContractCases.inlineResetCategory}] import preview specs use shared reset helpers in beforeEach hooks`, async () => {
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

test(`[E2E-Helper][${importPreviewContractCases.helperImportCategory}] import preview specs import reset helpers directly from tests/e2e-helpers.ts`, async () => {
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

test('[E2E-Helper][behavior] resetItemsByDelete is an asserted atomic reset alias, not a per-row delete loop', async () => {
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

test('[E2E-Helper][config-quality] e2eHelperMessagePrefixContract dictionaries are non-empty, unique, sorted, and ASCII', async () => {
  const verbs = [...e2eHelperMessagePrefixContract.allowedVerbs]
  const nouns = [...e2eHelperMessagePrefixContract.allowedNouns]
  const requiredIncludes = [...e2eHelperMessagePrefixContract.requiredIncludes]
  const { duplicates: duplicateVerbs, unsorted: unsortedVerbs } = analyzeEnumList(verbs, { locale: 'en' })
  const { duplicates: duplicateNouns, unsorted: unsortedNouns } = analyzeEnumList(nouns, { locale: 'en' })
  const { duplicates: duplicateRequiredIncludes, unsorted: unsortedRequiredIncludes } = analyzeEnumList(requiredIncludes, { locale: 'en' })
  const emptyVerbs = verbs.filter((v) => v.trim().length === 0)
  const emptyNouns = nouns.filter((v) => v.trim().length === 0)
  const emptyRequiredIncludes = requiredIncludes.filter((v) => v.trim().length === 0)
  const nonAsciiVerbs = verbs.filter((v) => /[^\x20-\x7E]/.test(v))
  const nonAsciiNouns = nouns.filter((v) => /[^\x20-\x7E]/.test(v))
  const nonAsciiRequiredIncludes = requiredIncludes.filter((v) => /[^\x20-\x7E]/.test(v))

  assert.deepEqual(
    emptyVerbs,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedVerbs non-empty',
      fix: 'remove empty entries from allowedVerbs',
      items: emptyVerbs,
    }),
  )
  assert.deepEqual(
    emptyNouns,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedNouns non-empty',
      fix: 'remove empty entries from allowedNouns',
      items: emptyNouns,
    }),
  )
  assert.deepEqual(
    duplicateVerbs,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedVerbs uniqueness',
      fix: 'deduplicate allowedVerbs entries',
      items: duplicateVerbs,
    }),
  )
  assert.deepEqual(
    duplicateNouns,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedNouns uniqueness',
      fix: 'deduplicate allowedNouns entries',
      items: duplicateNouns,
    }),
  )
  assert.deepEqual(
    unsortedVerbs,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedVerbs sorted order',
      fix: 'sort allowedVerbs in ascending en locale order',
      items: unsortedVerbs,
    }),
  )
  assert.deepEqual(
    unsortedNouns,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedNouns sorted order',
      fix: 'sort allowedNouns in ascending en locale order',
      items: unsortedNouns,
    }),
  )
  assert.deepEqual(
    nonAsciiVerbs,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedVerbs ASCII policy',
      fix: 'keep allowedVerbs ASCII to maintain English-only log consistency',
      items: nonAsciiVerbs,
    }),
  )
  assert.deepEqual(
    nonAsciiNouns,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedNouns ASCII policy',
      fix: 'keep allowedNouns ASCII to maintain English-only log consistency',
      items: nonAsciiNouns,
    }),
  )
  assert.deepEqual(
    emptyRequiredIncludes,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix requiredIncludes non-empty',
      fix: 'remove empty entries from requiredIncludes',
      items: emptyRequiredIncludes,
    }),
  )
  assert.deepEqual(
    duplicateRequiredIncludes,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix requiredIncludes uniqueness',
      fix: 'deduplicate requiredIncludes entries',
      items: duplicateRequiredIncludes,
    }),
  )
  assert.deepEqual(
    unsortedRequiredIncludes,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix requiredIncludes sorted order',
      fix: 'sort requiredIncludes in ascending en locale order',
      items: unsortedRequiredIncludes,
    }),
  )
  assert.deepEqual(
    nonAsciiRequiredIncludes,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix requiredIncludes ASCII policy',
      fix: 'keep requiredIncludes ASCII to maintain English-only log consistency',
      items: nonAsciiRequiredIncludes,
    }),
  )
})

test('[E2E-Helper][message-quality] messagePrefix strings follow contract (non-empty, max-length, required phrases)', async () => {
  const allCases = [...helperContractCases, ...directMutationContractCases]
  const prefixes = allCases.map(({ messagePrefix }) => String(messagePrefix ?? ''))

  const empty = prefixes.filter((v) => v.trim().length === 0)
  const overlong = prefixes
    .filter((v) => v.length > e2eHelperMessagePrefixContract.maxLength)
    .map((v) => `${v.slice(0, 40)}... (${v.length} chars)`)
  const missingRequired = prefixes.filter(
    (v) => !e2eHelperMessagePrefixContract.requiredIncludes.every((needle) => v.includes(needle)),
  )

  const usedRequiredIncludes = new Set()
  for (const phrase of e2eHelperMessagePrefixContract.requiredIncludes) {
    if (prefixes.some((line) => line.includes(phrase))) usedRequiredIncludes.add(phrase)
  }
  const deadRequiredIncludes = e2eHelperMessagePrefixContract.requiredIncludes
    .filter((phrase) => !usedRequiredIncludes.has(phrase))
    .sort((a, b) => a.localeCompare(b, 'en'))

  const usedVerbs = new Set()
  const usedNouns = new Set()
  const disallowedVerbOrNoun = prefixes.filter((v) => {
    const matchedVerb = e2eHelperMessagePrefixContract.allowedVerbs.find((verb) => v.includes(` ${verb} `))
    const matchedNoun = e2eHelperMessagePrefixContract.allowedNouns.find((noun) => v.includes(` ${noun} `))
    if (matchedVerb) usedVerbs.add(matchedVerb)
    if (matchedNoun) usedNouns.add(matchedNoun)
    return !matchedVerb || !matchedNoun
  })

  const deadAllowedVerbs = e2eHelperMessagePrefixContract.allowedVerbs
    .filter((verb) => !usedVerbs.has(verb))
    .sort((a, b) => a.localeCompare(b, 'en'))
  const deadAllowedNouns = e2eHelperMessagePrefixContract.allowedNouns
    .filter((noun) => !usedNouns.has(noun))
    .sort((a, b) => a.localeCompare(b, 'en'))

  assert.deepEqual(
    empty,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix presence',
      fix: 'set non-empty messagePrefix on every helper/direct-mutation contract case',
      items: empty,
    }),
  )
  assert.deepEqual(
    overlong,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix max length',
      fix: `keep messagePrefix length <= ${e2eHelperMessagePrefixContract.maxLength}`,
      items: overlong,
    }),
  )
  assert.deepEqual(
    missingRequired,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix required includes',
      fix: `include required phrases: ${e2eHelperMessagePrefixContract.requiredIncludes.join(', ')}`,
      items: missingRequired,
    }),
  )
  assert.deepEqual(
    disallowedVerbOrNoun,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowed vocabulary',
      fix: `use allowed verbs (${e2eHelperMessagePrefixContract.allowedVerbs.join(', ')}) and nouns (${e2eHelperMessagePrefixContract.allowedNouns.join(', ')})`,
      items: disallowedVerbOrNoun,
    }),
  )
  assert.deepEqual(
    deadAllowedVerbs,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedVerbs dead vocabulary',
      fix: 'remove unused verbs from allowedVerbs or use them in messagePrefix values',
      items: deadAllowedVerbs,
    }),
  )
  assert.deepEqual(
    deadAllowedNouns,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix allowedNouns dead vocabulary',
      fix: 'remove unused nouns from allowedNouns or use them in messagePrefix values',
      items: deadAllowedNouns,
    }),
  )
  assert.deepEqual(
    deadRequiredIncludes,
    [],
    missingItemsMessage({
      scope: 'E2E-Helper',
      rule: 'messagePrefix requiredIncludes dead tokens',
      fix: 'remove unused requiredIncludes tokens or use them in messagePrefix values',
      items: deadRequiredIncludes,
    }),
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
