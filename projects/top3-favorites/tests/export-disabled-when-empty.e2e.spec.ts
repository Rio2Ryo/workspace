import { expect, test } from '@playwright/test'
import { jsonExportButton, resetItemsByReplace, registrationSaveButton, expectOperationStatus, registrationRankButton, registrationLocationField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('JSON export is disabled when there are no items, and enabled after adding one', async ({ page }) => {
  await page.goto('/')

  const exportButton = jsonExportButton(page)
  await expect(exportButton).toBeDisabled()
  await expect(exportButton).toHaveAccessibleDescription('エクスポート対象データがありません。まず1件以上保存してください。')

  await registrationTagField(page).fill('カフェ')
  await registrationLocationField(page).fill('渋谷')
  await registrationNameField(page).fill('茶亭')
  await registrationRankButton(page, 1).click()
  await registrationSaveButton(page).click()

  await expectOperationStatus(page, 'カフェ の1位に保存しました。')
  await expect(exportButton).toBeEnabled()
})
