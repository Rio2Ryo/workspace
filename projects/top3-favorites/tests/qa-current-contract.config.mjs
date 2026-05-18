const rawDocs = [
  'docs/QA.md',
  'docs/QA_RESULT.md',
  'docs/MANUAL_TEST_CHECKLIST.md',
]
Object.freeze(rawDocs)
export const docs = rawDocs

const rawRequiredDocPatterns = [
  {
    pattern: /\/api\/items/,
    message: 'should name the current API persistence path',
  },
  {
    pattern: /構造化フォーム|個別フォーム|タグ.+順位.+店舗名.+メモ/s,
    message: 'should describe the structured form UI',
  },
]
for (const rule of rawRequiredDocPatterns) Object.freeze(rule)
Object.freeze(rawRequiredDocPatterns)
export const requiredDocPatterns = rawRequiredDocPatterns

const rawForbiddenDocPatterns = [
  {
    pattern: /localStorage|top3-favorites-items/i,
    message: 'QA docs must not describe the removed localStorage persistence path',
  },
  {
    pattern: /自然文|parseNaturalInput|parseQuickInput|parseSlashInput/,
    message: 'QA docs must not describe unsupported natural-language or legacy slash parsing',
  },
]
for (const rule of rawForbiddenDocPatterns) Object.freeze(rule)
Object.freeze(rawForbiddenDocPatterns)
export const forbiddenDocPatterns = rawForbiddenDocPatterns

const rawAppRequiredPatterns = [
  {
    pattern: /api<[^>]+>\('\/api\/items'/,
    message: 'App should load items from /api/items',
  },
  {
    pattern: /JSON\.stringify\(draft\)/,
    message: 'App should save the structured draft form',
  },
]
for (const rule of rawAppRequiredPatterns) Object.freeze(rule)
Object.freeze(rawAppRequiredPatterns)
export const appRequiredPatterns = rawAppRequiredPatterns

const rawAppForbiddenPatterns = [
  {
    pattern: /localStorage\.(getItem|setItem)/,
    message: 'App should not persist through localStorage',
  },
  {
    pattern: /parseNaturalInput|parseQuickInput|parseSlashInput/,
    message: 'App should not advertise legacy free-form parsers',
  },
]
for (const rule of rawAppForbiddenPatterns) Object.freeze(rule)
Object.freeze(rawAppForbiddenPatterns)
export const appForbiddenPatterns = rawAppForbiddenPatterns

const rawImportPreviewManualHeadings = [
  '#### 4.2.1 direction（追加/保持/削除予定）',
  '#### 4.2.2 live（読み上げ要約）',
  '#### 4.2.3 tags（影響タグ）',
  '#### 4.2.4 terms（差分用語説明）',
  '#### 4.2.5 naming（a11y命名）',
  '#### 4.2.6 summary（件数サマリ）',
]
Object.freeze(rawImportPreviewManualHeadings)
export const importPreviewManualHeadings = rawImportPreviewManualHeadings

const rawReadmeLinkContracts = {
  title: 'README links QA docs with import preview six-category guidance',
  checks: [
    {
      pattern: /import preview.*direction\s*\/\s*live\s*\/\s*tags\s*\/\s*terms\s*\/\s*naming\s*\/\s*summary/s,
      message: 'README should explicitly mention import preview six-category guidance',
    },
    {
      pattern: /docs\/MANUAL_TEST_CHECKLIST\.md/,
      message: 'README should link MANUAL_TEST_CHECKLIST',
    },
    {
      pattern: /docs\/AUTOMATED_QA_COVERAGE\.md/,
      message: 'README should link AUTOMATED_QA_COVERAGE',
    },
  ],
}

for (const rule of rawReadmeLinkContracts.checks) {
  Object.freeze(rule)
}
Object.freeze(rawReadmeLinkContracts.checks)
Object.freeze(rawReadmeLinkContracts)

export const readmeLinkContracts = rawReadmeLinkContracts

const rawReadmeCommandContractGroups = [
  {
    title: 'README provides staged verification commands (quick/docs-only/import-preview-only/full)',
    commands: [
      'pnpm test:quick',
      'pnpm test:docs-only',
      'pnpm test:import-preview-only',
      'pnpm test:full',
    ],
  },
  {
    title: 'README includes import preview category-level quick regression commands',
    commands: [
      'pnpm test:import-preview-direction',
      'pnpm test:import-preview-live',
      'pnpm test:import-preview-tags',
      'pnpm test:import-preview-terms',
      'pnpm test:import-preview-naming',
      'pnpm test:import-preview-summary',
    ],
  },
]

for (const group of rawReadmeCommandContractGroups) {
  Object.freeze(group.commands)
  Object.freeze(group)
}
Object.freeze(rawReadmeCommandContractGroups)

export const readmeCommandContractGroups = rawReadmeCommandContractGroups

const rawHelperContractCases = [
  {
    category: 'before-each-reset',
    title: 'all E2E specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.endsWith('.e2e.spec.ts'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'E2E beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    category: 'before-each-reset',
    title: 'search specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('search-'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'search beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    category: 'before-each-reset',
    title: 'tag-sync specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('tag-sync'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'tag-sync beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    category: 'before-each-reset',
    title: 'edit/delete specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('edit') || name.startsWith('delete'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'edit/delete beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    category: 'before-each-reset',
    title: 'import specs (outside import-preview) use shared resetItemsByReplace helper for mode=replace resets',
    predicate: (name) => name.startsWith('import-'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'import beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    category: 'before-each-reset',
    title: 'import specs (outside import-preview) use shared resetItemsByDelete helper for delete-based resets',
    predicate: (name) => name.startsWith('import-'),
    blockPattern: /request\.delete\(`\/api\/items\?id=/,
    messagePrefix: 'import beforeEach hooks should call resetItemsByDelete helper instead of inline delete reset',
  },
  {
    category: 'before-each-reset',
    title: 'export specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('export-'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'export beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
]

for (const rule of rawHelperContractCases) {
  Object.freeze(rule)
}
Object.freeze(rawHelperContractCases)

export const helperContractCases = rawHelperContractCases

const rawE2EHelperCategoryContract = {
  allowed: ['api-delete', 'before-each-reset', 'import-path'],
}
Object.freeze(rawE2EHelperCategoryContract.allowed)
Object.freeze(rawE2EHelperCategoryContract)
export const e2eHelperCategoryContract = rawE2EHelperCategoryContract

const rawDirectMutationContractCases = [
  {
    category: 'api-delete',
    title: 'export specs avoid direct per-row API deletes during roundtrip cleanup',
    predicate: (name) => name.startsWith('export-'),
    pattern: /request\.delete\(`\/api\/items\?id=/,
    messagePrefix: 'export specs should use resetItemsByReplace helper instead of per-row API deletes',
  },
]

for (const rule of rawDirectMutationContractCases) {
  Object.freeze(rule)
}
Object.freeze(rawDirectMutationContractCases)

export const directMutationContractCases = rawDirectMutationContractCases

const rawE2EHelperMessagePrefixContract = {
  maxLength: 120,
  requiredIncludes: [' should '],
  allowedVerbs: ['call', 'use'],
  allowedNouns: ['beforeEach hooks', 'specs'],
}
Object.freeze(rawE2EHelperMessagePrefixContract.requiredIncludes)
Object.freeze(rawE2EHelperMessagePrefixContract.allowedVerbs)
Object.freeze(rawE2EHelperMessagePrefixContract.allowedNouns)
Object.freeze(rawE2EHelperMessagePrefixContract)
export const e2eHelperMessagePrefixContract = rawE2EHelperMessagePrefixContract

const rawManualAutomatedLinkContracts = {
  manualChecklistChecks: [
    {
      pattern: /Console に致命的エラーがない[\s\S]*自動確認: `tests\/startup-console-health\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect the DevTools console check to an automated startup console smoke spec',
    },
    {
      pattern: /API取得失敗耐性[\s\S]*自動確認: `tests\/api-load-retry\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect API failure resilience to the automated retry spec',
    },
  ],
  coverageChecks: [
    {
      pattern: /tests\/startup-console-health\.e2e\.spec\.ts/,
      message: 'automated QA coverage should list the startup console health smoke spec',
    },
  ],
}

for (const rule of rawManualAutomatedLinkContracts.manualChecklistChecks) {
  Object.freeze(rule)
}
for (const rule of rawManualAutomatedLinkContracts.coverageChecks) {
  Object.freeze(rule)
}
Object.freeze(rawManualAutomatedLinkContracts.manualChecklistChecks)
Object.freeze(rawManualAutomatedLinkContracts.coverageChecks)
Object.freeze(rawManualAutomatedLinkContracts)

export const manualAutomatedLinkContracts = rawManualAutomatedLinkContracts

const rawContractMessageLimits = {
  default: 5,
  e2eHelper: 5,
  docsPaths: 8,
}
Object.freeze(rawContractMessageLimits)
export const contractMessageLimits = rawContractMessageLimits

const rawDeepFreezeSkipTypeRules = ['function', 'RegExp']
Object.freeze(rawDeepFreezeSkipTypeRules)
export const deepFreezeSkipTypeRules = rawDeepFreezeSkipTypeRules

const rawScopeDescriptionContract = {
  allowedTargets: ['offender-list density'],
  allowedPurposes: [
    'Docs* coverage and path mismatches',
    'E2E-Helper reset-helper violations',
  ],
}

Object.freeze(rawScopeDescriptionContract.allowedTargets)
Object.freeze(rawScopeDescriptionContract.allowedPurposes)
Object.freeze(rawScopeDescriptionContract)

export const scopeDescriptionContract = rawScopeDescriptionContract

const rawScopeLimitRules = [
  {
    id: 'scope-e2e-helper',
    description: 'Controls offender-list density for E2E-Helper reset-helper violations',
    pattern: /^E2E-Helper$/,
    limit: contractMessageLimits.e2eHelper,
  },
  {
    id: 'scope-docs-family',
    description: 'Controls offender-list density for Docs* coverage and path mismatches',
    pattern: /^Docs/,
    limit: contractMessageLimits.docsPaths,
  },
]

for (const rule of rawScopeLimitRules) {
  Object.freeze(rule)
}
Object.freeze(rawScopeLimitRules)

export const scopeLimitRules = rawScopeLimitRules

const rawImportPreviewContractCases = {
  inlineResetCategory: 'before-each-reset',
  helperImportCategory: 'import-path',
  inlineResetChecks: [
    {
      pattern: /\/api\/items\?mode=replace/,
      message: 'import preview beforeEach hooks should call resetItemsByReplace/resetItemsByDelete helpers instead of inline API reset',
    },
    {
      pattern: /request\.delete\(`\/api\/items/,
      message: 'import preview beforeEach hooks should call resetItemsByReplace/resetItemsByDelete helpers instead of inline API reset',
    },
  ],
  helperImportChecks: {
    forbiddenPattern: "from '../helpers'",
    requiredPattern: "from '../../e2e-helpers'",
    message: 'import preview specs should import reset helpers directly from ../../e2e-helpers',
  },
}

for (const rule of rawImportPreviewContractCases.inlineResetChecks) {
  Object.freeze(rule)
}
Object.freeze(rawImportPreviewContractCases.inlineResetChecks)
Object.freeze(rawImportPreviewContractCases.helperImportChecks)
Object.freeze(rawImportPreviewContractCases)

export const importPreviewContractCases = rawImportPreviewContractCases
