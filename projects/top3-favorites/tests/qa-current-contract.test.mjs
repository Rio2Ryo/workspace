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
  e2eHelperMessagePrefixContract,
  requiredDocPatterns,
  importPreviewContractCases,
  contractMessageLimits,
  deepFreezeSkipTypeRules,
  missingItemsContextKeyContract,
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
  assert.deepEqual(
    deadSortModes,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowedContextSortModes dead modes',
      fix: 'remove unused sort modes from allowedContextSortModes or add matching usage in tests',
      context: { usedSortModes },
      items: deadSortModes,
    }),
  )

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
  const shouldPromoteDeadScope = deadScopePriority.length <= missingItemsContextKeyContract.promoteWhenDeadScopeCountLte

  if (missingItemsContextKeyContract.enforceDeadScopePriority) {
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
        fix: 'set enforceDeadScopePriority=true when dead scope count is at or below the promotion threshold',
        context: {
          enforceDeadScopePriority: String(missingItemsContextKeyContract.enforceDeadScopePriority),
          deadScopeCount: String(deadScopePriority.length),
          promoteWhenDeadScopeCountLte: String(missingItemsContextKeyContract.promoteWhenDeadScopeCountLte),
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

  assert.deepEqual(
    deadAllowedKeys,
    [],
    missingItemsMessage({
      scope: 'App',
      rule: 'missingItemsContextKeyContract.allowed dead keys',
      fix: 'remove unused keys from missingItemsContextKeyContract.allowed or add matching context usage',
      context: {
        ...usageSummary,
        scopePriorityDeadScopes: deadScopePriority.join(', '),
      },
      contextSortMode: 'valueCountDesc',
      items: deadAllowedKeys,
    }),
  )
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
