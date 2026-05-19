import { expect, test } from '@playwright/test'
import { jsonExportButton, resetItemsByReplace, registrationSaveButton } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('JSON export is disabled when there are no items, and enabled after adding one', async ({ page }) => {
  await page.goto('/')

  const exportButton = jsonExportButton(page)
  await expect(exportButton).toBeDisabled()

  await page.getByLabel('タグ', { exact: true }).fill('カフェ')
  await page.getByLabel('場所', { exact: true }).fill('渋谷')
  await page.getByLabel('店舗名', { exact: true }).fill('茶亭')
  await page.getByRole('button', { name: '登録 1位に入れる' }).click()
  await registrationSaveButton(page).click()

  await expect(page.getByRole('status')).toContainText('カフェ の1位に保存しました。')
  await expect(exportButton).toBeEnabled()
})
