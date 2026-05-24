import { expect, test } from '@playwright/test'
import {
  createTagRankSeriesPayload,
  importPreviewToggleExcludedDetails,
  importPreviewToggleImpactTags,
  importPreviewToggleTermsHelper,
  resetItemsByDelete,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('import preview toggles follow unified data-testid naming (import-preview-toggle-*)', async ({ page }) => {
  await page.goto('/')

  const payload = createTagRankSeriesPayload(['A', 'B', 'C', 'D', 'E', 'F'])

  await uploadJsonImportFile(page, 'toggle-testid-contract.json', payload)

  await expect(importPreviewToggleImpactTags(page)).toBeVisible()
  await expect(importPreviewToggleExcludedDetails(page)).toBeVisible()
  await expect(importPreviewToggleTermsHelper(page)).toBeVisible()
})
