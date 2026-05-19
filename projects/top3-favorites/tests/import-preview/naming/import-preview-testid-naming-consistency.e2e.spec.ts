import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete, saveSampleItems, fetchItems } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('import preview metrics/helpers use unified import-preview-* testid naming', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = await fetchItems<{ items: unknown[] }>(request)
  await uploadJsonImportFile(page, 'preview-testid-consistency.json', current.items)

  await expect(page.getByTestId('import-preview-direction-metrics')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-added')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-kept')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-removed')).toBeVisible()

  await page.getByTestId('import-preview-toggle-terms-helper').click()
  await expect(page.getByTestId('import-preview-terms-helper')).toBeVisible()
})
