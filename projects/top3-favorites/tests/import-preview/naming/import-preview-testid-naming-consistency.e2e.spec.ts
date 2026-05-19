import { expect, test } from '@playwright/test'
import {
  fetchItems,
  importPreviewDirectionMetrics,
  importPreviewMetricAdded,
  importPreviewMetricKept,
  importPreviewMetricRemoved,
  importPreviewTermsHelper,
  importPreviewToggleTermsHelper,
  resetItemsByDelete,
  saveSampleItems,
  uploadJsonImportFile,
} from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('import preview metrics/helpers use unified import-preview-* testid naming', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = await fetchItems<{ items: unknown[] }>(request)
  await uploadJsonImportFile(page, 'preview-testid-consistency.json', current.items)

  await expect(importPreviewDirectionMetrics(page)).toBeVisible()
  await expect(importPreviewMetricAdded(page)).toBeVisible()
  await expect(importPreviewMetricKept(page)).toBeVisible()
  await expect(importPreviewMetricRemoved(page)).toBeVisible()

  await importPreviewToggleTermsHelper(page).click()
  await expect(importPreviewTermsHelper(page)).toBeVisible()
})
