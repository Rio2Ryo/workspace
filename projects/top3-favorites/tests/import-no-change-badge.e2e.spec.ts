import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('import preview shows explicit no-change badge when payload matches current data', async ({ page, request }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const current = (await request.get('/api/items').then((res) => res.json())) as { items: unknown[] }

  await uploadJsonImportFile(page, 'same-data.json', current.items)

  await expect(page.getByTestId('import-preview-counts')).toHaveAttribute('data-before-count', '3')
  await expect(page.getByTestId('import-preview-counts')).toHaveAttribute('data-after-count', '3')
  await expect(page.getByTestId('import-preview-no-change')).toHaveText('差分なし（このインポートでデータ変更はありません）')
})
