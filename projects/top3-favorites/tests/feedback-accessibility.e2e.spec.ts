import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('success and error feedback are exposed through accessible live regions', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await uploadJsonImportFile(page, 'invalid-shape.json', '{"foo":1}')

  await expect(page.getByRole('alert')).toContainText('インポート失敗: JSON配列形式ではありません。既存データは保持しました。')
  await expect(page.getByRole('status')).not.toBeVisible()
})
