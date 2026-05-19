import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, jsonImportButton, expectOperationAlert, operationAlert } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('clicking JSON import to retry clears stale import error before next file selection', async ({ page }) => {
  await page.goto('/')
  await uploadJsonImportFile(page, 'broken.json', '{"broken": ')

  await expectOperationAlert(page, 'インポート失敗: ファイル「broken.json」のJSON構文を解析できません。既存データは保持しました。')

  // Start retry flow: stale error should be cleared when user re-opens importer
  await jsonImportButton(page).click()
  await expect(operationAlert(page)).toHaveCount(0)
})
