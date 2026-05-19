import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, saveSampleItems, operationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('success and error feedback are exposed through accessible live regions', async ({ page }) => {
  await page.goto('/')

  await saveSampleItems(page)

  await uploadJsonImportFile(page, 'invalid-shape.json', '{"foo":1}')

  await expect(page.getByRole('alert')).toContainText('インポート失敗: JSON配列形式ではありません。既存データは保持しました。')
  await expect(operationStatus(page)).not.toBeVisible()
})
