import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace , jsonImportButton} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('clicking JSON import to retry clears stale import error before next file selection', async ({ page }) => {
  await page.goto('/')
  await uploadJsonImportFile(page, 'broken.json', '{"broken": ')

  await expect(page.getByRole('alert')).toContainText('インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')

  // Start retry flow: stale error should be cleared when user re-opens importer
  await jsonImportButton(page).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
