import { expect, test } from '@playwright/test'
import { itemEditButton, editSaveButton, resetItemsByReplace , jsonImportButton} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('starting JSON import closes edit context to avoid mixed workflows', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Edit Target')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  await page.getByText('1位: Edit Target').click()
  await itemEditButton(page, 'Edit Target').click()
  await expect(editSaveButton(page)).toBeVisible()

  await jsonImportButton(page).click()
  await expect(editSaveButton(page)).toHaveCount(0)
})
