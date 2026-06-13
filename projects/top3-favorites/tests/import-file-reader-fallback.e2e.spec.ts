import { expect, test } from '@playwright/test'
import {
  confirmImportAndWaitForStatus,
  createImportTestItem,
  fetchItems,
  importPreviewPanel,
  resetItemsByReplace,
  uploadJsonImportFile,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('JSON import falls back to FileReader when Blob.text is unavailable', async ({ page, request }) => {
  await page.goto('/')
  await page.evaluate(() => {
    Object.defineProperty(Blob.prototype, 'text', {
      configurable: true,
      value: undefined,
    })
  })

  const payload = [
    createImportTestItem('reader-fallback-1', 'カフェラテ', 'Reader Fallback A', 1),
    createImportTestItem('reader-fallback-2', 'カフェラテ', 'Reader Fallback B', 2),
  ]

  await uploadJsonImportFile(page, 'reader-fallback.json', payload)

  await expect(importPreviewPanel(page)).toBeVisible()
  await confirmImportAndWaitForStatus(page, 'インポート成功: 2件を反映しました。')

  const data = await fetchItems<{ items: Array<{ id: string; name: string }> }>(request)
  expect(data.items.map((item) => item.id)).toEqual(['reader-fallback-1', 'reader-fallback-2'])
})
