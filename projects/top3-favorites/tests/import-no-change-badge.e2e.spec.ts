import { expect, test } from '@playwright/test'
import {
  fetchItems,
  importPreviewCounts,
  importPreviewNoChange,
  resetItemsByReplace,
  saveSampleItems,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import preview shows explicit no-change badge when payload matches current data', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = await fetchItems<{ items: unknown[] }>(request)

  await uploadJsonImportFile(page, 'same-data.json', current.items)

  await expect(importPreviewCounts(page)).toHaveAttribute('data-before-count', '3')
  await expect(importPreviewCounts(page)).toHaveAttribute('data-after-count', '3')
  await expect(importPreviewNoChange(page)).toHaveText('差分なし（このインポートでデータ変更はありません）')
})
