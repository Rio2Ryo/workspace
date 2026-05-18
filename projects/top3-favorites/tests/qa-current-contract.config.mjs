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
      'pnpm test:legacy-zero-run-script',
      'pnpm test:legacy-zero-run-env-script',
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
      pattern: /永続化確認[\s\S]*自動確認: `tests\/create-persists-after-reload-and-api\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect create reload/API persistence to the automated persistence spec',
    },
    {
      pattern: /サンプルデータ投入（UI）[\s\S]*自動確認: `tests\/sample-data-persists-after-reload-and-api\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect sample seed reload/API persistence to the automated sample spec',
    },
    {
      pattern: /API取得失敗耐性[\s\S]*自動確認: `tests\/api-load-retry\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect API failure resilience to the automated retry spec',
    },
    {
      pattern: /検索欄で `店名\/タグ\/場所\/メモ` それぞれ部分一致検索が効く[\s\S]*自動確認: `tests\/top3\.e2e\.spec\.ts` と `tests\/search-memo-contains\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect multi-field partial search to automated search specs',
    },
    {
      pattern: /`クリア` で全件表示に戻る[\s\S]*自動確認: `tests\/tag-clear-label-contract\.e2e\.spec\.ts` と `tests\/clear-tag-filter-syncs-registration-tag\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect clear-filter behavior to automated clear/reset specs',
    },
    {
      pattern: /各アイテムの `Maps` を押すと新規タブでGoogle Maps検索が開く[\s\S]*自動確認: `tests\/maps-link-new-tab-contract\.e2e\.spec\.ts` と `tests\/maps-link-query\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect Google Maps tab/query behavior to automated maps specs',
    },
    {
      pattern: /JSONエクスポート成功[\s\S]*自動確認: `tests\/import-export\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect JSON export success to the automated import/export roundtrip spec',
    },
    {
      pattern: /JSONインポート成功（正常データ）[\s\S]*自動確認: `tests\/import-export\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect JSON import success to the automated import/export roundtrip spec',
    },
    {
      pattern: /JSONインポート失敗（配列以外）[\s\S]*自動確認: `tests\/import-fail-closed-matrix\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect non-array JSON import failure to the automated fail-closed matrix spec',
    },
    {
      pattern: /JSONインポート失敗（不正要素混在）[\s\S]*自動確認: `tests\/import-fail-closed-matrix\.e2e\.spec\.ts`、`tests\/import-export-rank-validation\.e2e\.spec\.ts`、`tests\/import-validation-error-details\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect invalid mixed import rows to automated validation specs',
    },
    {
      pattern: /JSONインポート失敗（壊れたJSON）[\s\S]*自動確認: `tests\/import-broken-json\.e2e\.spec\.ts` と `tests\/import-fail-closed-matrix\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect broken JSON import failure to automated parse-error specs',
    },
    {
      pattern: /direction（追加\/保持\/削除予定）[\s\S]*`\+追加 \/ ±保持 \/ -削除予定` の方向メトリクスが表示される[\s\S]*値が `0` のメトリクスは弱調表示[\s\S]*自動確認: `tests\/import-preview\/direction\/import-preview-direction-metrics\.e2e\.spec\.ts`、`tests\/import-preview\/direction\/import-preview-direction-a11y-labels\.e2e\.spec\.ts`、`tests\/import-preview\/summary\/import-preview-zero-metrics-muted\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect import preview direction metrics and muted-zero behavior to automated specs',
    },
    {
      pattern: /live（読み上げ要約）[\s\S]*aria-live="polite"[\s\S]*差分なし時は `差分なし。インポート後N件。`[\s\S]*正規化除外がある時は `正規化除外N件（例: 店名）`[\s\S]*自動確認: `tests\/import-preview\/live\/import-preview-live-region-updates\.e2e\.spec\.ts`、`tests\/import-preview\/live\/import-preview-live-summary-concise\.e2e\.spec\.ts`、`tests\/import-preview\/live\/import-preview-live-summary-includes-excluded-name\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect import preview live summary behavior to automated specs',
    },
    {
      pattern: /tags（影響タグ）[\s\S]*影響タグが多い場合、先頭表示 \+ `ほかN件`[\s\S]*`影響タグを全件表示` \/ `影響タグを折りたたむ`[\s\S]*自動確認: `tests\/import-preview\/tags\/import-preview-tags-collapsed\.e2e\.spec\.ts`、`tests\/import-preview\/tags\/import-preview-tags-expand-toggle\.e2e\.spec\.ts`、`tests\/import-preview\/tags\/import-preview-tags-deterministic-order\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect import preview impacted-tag collapse/expand behavior to automated specs',
    },
    {
      pattern: /terms（差分用語説明）[\s\S]*初期状態では差分用語説明は非表示[\s\S]*`差分用語の詳細説明を表示`[\s\S]*自動確認: `tests\/import-preview\/terms\/import-preview-terms-helper-toggle\.e2e\.spec\.ts`、`tests\/import-preview\/terms\/import-preview-terms-helper-text\.e2e\.spec\.ts`、`tests\/import-preview\/terms\/import-preview-terms-helper-toggle-a11y\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect import preview terms helper behavior to automated specs',
    },
    {
      pattern: /naming（a11y命名）[\s\S]*aria-label` は `インポート詳細:`[\s\S]*aria-expanded` が開閉に応じて更新される[\s\S]*自動確認: `tests\/import-preview\/naming\/import-preview-toggle-aria-label-consistency\.e2e\.spec\.ts`、`tests\/import-preview\/naming\/import-preview-toggle-testid-contract\.e2e\.spec\.ts`、`tests\/import-preview\/summary\/import-preview-expand-toggles-a11y\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect import preview toggle naming/a11y behavior to automated specs',
    },
    {
      pattern: /summary（件数サマリ）[\s\S]*`現在N件 → インポート後M件`[\s\S]*差分なし（このインポートでデータ変更はありません）[\s\S]*自動確認: `tests\/import-preview\/summary\/import-preview-summary\.e2e\.spec\.ts`、`tests\/import-preview\/summary\/import-preview-math-consistency\.e2e\.spec\.ts`、`tests\/import-preview\/summary\/import-preview-excluded-names-tag-context\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect import preview summary/no-change/excluded-name behavior to automated specs',
    },
    {
      pattern: /編集ボタンで既存値が編集フォームに入る[\s\S]*編集保存で一覧表示が更新される[\s\S]*自動確認: `tests\/edit-form-accessibility\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect edit form prefill/save behavior to the automated edit form spec',
    },
    {
      pattern: /編集キャンセルで編集モードを抜ける[\s\S]*自動確認: `tests\/edit-form-accessibility\.e2e\.spec\.ts` と `tests\/edit-cancel-clears-stale-notice\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect edit cancel behavior to automated edit cancel specs',
    },
    {
      pattern: /削除で対象のみ消える[\s\S]*削除後に再読み込みしても削除結果が維持される[\s\S]*自動確認: `tests\/delete-confirmation\.e2e\.spec\.ts` と `tests\/delete-persists-after-reload-and-api\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect delete-only-target and reload persistence to automated delete specs',
    },
    {
      pattern: /順位繰り下げ（重要）[\s\S]*期待: 既存1位→2位、既存2位→3位、既存3位はTop3外になる[\s\S]*再読み込み後も順位が維持される[\s\S]*自動確認: `tests\/rebalance-persists-after-reload-and-api\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect rank rebalance and reload persistence to the automated rebalance spec',
    },
    {
      pattern: /同じタグを複数件登録してもタグチップが重複表示されない[\s\S]*タグチップ押下後に新規登録フォームのタグ欄が同期する[\s\S]*自動確認: `tests\/top3\.e2e\.spec\.ts` と `tests\/search-tag-select-syncs-registration-tag\.e2e\.spec\.ts`/,
      message: 'manual checklist should connect tag chip dedupe and registration sync to automated tag specs',
    },
  ],
  coverageChecks: [
    {
      pattern: /tests\/startup-console-health\.e2e\.spec\.ts/,
      message: 'automated QA coverage should list the startup console health smoke spec',
    },
    {
      pattern: /tests\/import-export\.e2e\.spec\.ts/,
      message: 'automated QA coverage should list the import/export roundtrip spec',
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

const rawMissingItemsContextKeyContract = {
  allowed: [
    'configured',
    'consecutiveZeroRunsToEnforce',
    'deadAllowedKeyCount',
    'deadScopeCount',
    'deadScopes',
    'deadSortModeCount',
    'discovered',
    'documentedMatches',
    'enforceRemoval',
    'expected',
    'legacyContextUsageCount',
    'listed',
    'missingOnDisk',
    'observed',
    'observedZeroRunCount',
    'promoteWhenLegacyContextUsageCountLte',
    'promotionModeDeadAllowedKeys',
    'promotionModeDeadScopePriority',
    'promotionModeDeadSortModes',
    'promotionThresholdDeadAllowedKeys',
    'promotionThresholdDeadScopePriority',
    'promotionThresholdDeadSortModes',
    'scopePriorityDeadScopes',
    'usedScopes',
    'zeroRunCount',
  ],
  allowedContextSortModes: ['key', 'valueCountDesc'],
  scopePriority: ['App', 'Docs', 'Manual', 'README', 'E2E-Helper'],
  enforceDeadScopePriority: false,
  // legacy threshold (kept for compatibility)
  promoteWhenDeadScopeCountLte: 0,
  // generic promotion controls (new)
  promotionThresholds: {
    deadScopePriority: 0,
    deadSortModes: 0,
    deadAllowedKeys: 0,
  },
  promotionModes: {
    deadScopePriority: 'observe',
    deadSortModes: 'observe',
    deadAllowedKeys: 'enforce',
  },
}
Object.freeze(rawMissingItemsContextKeyContract.allowed)
Object.freeze(rawMissingItemsContextKeyContract.allowedContextSortModes)
Object.freeze(rawMissingItemsContextKeyContract.scopePriority)
Object.freeze(rawMissingItemsContextKeyContract.promotionThresholds)
Object.freeze(rawMissingItemsContextKeyContract.promotionModes)
Object.freeze(rawMissingItemsContextKeyContract)
export const missingItemsContextKeyContract = rawMissingItemsContextKeyContract

const rawLegacyPromotionKeys = ['enforceDeadScopePriority', 'promoteWhenDeadScopeCountLte']
Object.freeze(rawLegacyPromotionKeys)
export const legacyPromotionKeys = rawLegacyPromotionKeys

const rawLegacyPromotionRemovalContract = {
  enforceRemoval: true,
  promoteWhenLegacyContextUsageCountLte: 0,
  consecutiveZeroRunsToEnforce: 1,
  observedZeroRunCountEnv: 'QA_LEGACY_ZERO_RUN_COUNT',
}
Object.freeze(rawLegacyPromotionRemovalContract)
export const legacyPromotionRemovalContract = rawLegacyPromotionRemovalContract

const rawQaTestTitleSubscopeContract = {
  allowedByScope: {
    App: ['behavior', 'config-quality'],
    Docs: ['completeness', 'consistency', 'coverage-link', 'integrity', 'scope', 'structure'],
    Manual: ['a11y', 'automation-link', 'structure'],
    'E2E-Helper': ['api-delete', 'before-each-reset', 'behavior', 'config-quality', 'import-path', 'message-quality'],
  },
}
for (const arr of Object.values(rawQaTestTitleSubscopeContract.allowedByScope)) {
  Object.freeze(arr)
}
Object.freeze(rawQaTestTitleSubscopeContract.allowedByScope)
Object.freeze(rawQaTestTitleSubscopeContract)
export const qaTestTitleSubscopeContract = rawQaTestTitleSubscopeContract

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
