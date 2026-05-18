export const docs = [
  'docs/QA.md',
  'docs/QA_RESULT.md',
  'docs/MANUAL_TEST_CHECKLIST.md',
]

export const requiredDocPatterns = [
  {
    pattern: /\/api\/items/,
    message: 'should name the current API persistence path',
  },
  {
    pattern: /構造化フォーム|個別フォーム|タグ.+順位.+店舗名.+メモ/s,
    message: 'should describe the structured form UI',
  },
]

export const forbiddenDocPatterns = [
  {
    pattern: /localStorage|top3-favorites-items/i,
    message: 'QA docs must not describe the removed localStorage persistence path',
  },
  {
    pattern: /自然文|parseNaturalInput|parseQuickInput|parseSlashInput/,
    message: 'QA docs must not describe unsupported natural-language or legacy slash parsing',
  },
]

export const appRequiredPatterns = [
  {
    pattern: /api<[^>]+>\('\/api\/items'/,
    message: 'App should load items from /api/items',
  },
  {
    pattern: /JSON\.stringify\(draft\)/,
    message: 'App should save the structured draft form',
  },
]

export const appForbiddenPatterns = [
  {
    pattern: /localStorage\.(getItem|setItem)/,
    message: 'App should not persist through localStorage',
  },
  {
    pattern: /parseNaturalInput|parseQuickInput|parseSlashInput/,
    message: 'App should not advertise legacy free-form parsers',
  },
]

export const importPreviewManualHeadings = [
  '#### 4.2.1 direction（追加/保持/削除予定）',
  '#### 4.2.2 live（読み上げ要約）',
  '#### 4.2.3 tags（影響タグ）',
  '#### 4.2.4 terms（差分用語説明）',
  '#### 4.2.5 naming（a11y命名）',
  '#### 4.2.6 summary（件数サマリ）',
]

export const readmeLinkContracts = {
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

export const readmeCommandContractGroups = [
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

export const helperContractCases = [
  {
    title: 'search specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('search-'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'search beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    title: 'tag-sync specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('tag-sync'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'tag-sync beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    title: 'edit/delete specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('edit') || name.startsWith('delete'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'edit/delete beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    title: 'import specs (outside import-preview) use shared resetItemsByReplace helper for mode=replace resets',
    predicate: (name) => name.startsWith('import-'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'import beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
  {
    title: 'import specs (outside import-preview) use shared resetItemsByDelete helper for delete-based resets',
    predicate: (name) => name.startsWith('import-'),
    blockPattern: /request\.delete\(`\/api\/items\?id=/,
    messagePrefix: 'import beforeEach hooks should call resetItemsByDelete helper instead of inline delete reset',
  },
  {
    title: 'export specs use shared resetItemsByReplace helper in beforeEach hooks',
    predicate: (name) => name.startsWith('export-'),
    blockPattern: /\/api\/items\?mode=replace/,
    messagePrefix: 'export beforeEach hooks should call resetItemsByReplace helper instead of inline mode=replace reset',
  },
]

export const directMutationContractCases = [
  {
    title: 'export specs avoid direct per-row API deletes during roundtrip cleanup',
    predicate: (name) => name.startsWith('export-'),
    pattern: /request\.delete\(`\/api\/items\?id=/,
    messagePrefix: 'export specs should use resetItemsByReplace helper instead of per-row API deletes',
  },
]

export const manualAutomatedLinkContracts = {
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

export const contractMessageLimits = {
  default: 5,
  e2eHelper: 5,
  docsPaths: 8,
}

export const scopeLimitRules = [
  { id: 'e2e-helper', pattern: /^E2E-Helper$/, limit: contractMessageLimits.e2eHelper },
  { id: 'docs-family', pattern: /^Docs/, limit: contractMessageLimits.docsPaths },
]

export const importPreviewContractCases = {
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
