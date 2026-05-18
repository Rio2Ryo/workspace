import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByDelete, saveSampleItems } from '../../e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByDelete(request)
})

test('import preview metrics/helpers use unified import-preview-* testid naming', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  const current = (await request.get('/api/items').then((res) => res.json())) as { items: unknown[] }
  await uploadJsonImportFile(page, 'preview-testid-consistency.json', current.items)

  await expect(page.getByTestId('import-preview-direction-metrics')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-added')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-kept')).toBeVisible()
  await expect(page.getByTestId('import-preview-metric-removed')).toBeVisible()

  await page.getByTestId('import-preview-toggle-terms-helper').click()
  await expect(page.getByTestId('import-preview-terms-helper')).toBeVisible()
})
