import { expect, test } from '@playwright/test'
import { itemEditButton, editSaveButton, uploadJsonImportFile, resetItemsByReplace , importCancelButton} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('pending import preview blocks edit until user cancels the import context', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Edit Target')
  await page.getByRole('button', { name: 'DBに保存' }).click()

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]

  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  await page.getByText('1位: Edit Target').click()
  await expect(itemEditButton(page, 'Edit Target')).toBeDisabled()

  await importCancelButton(page).click()
  await itemEditButton(page, 'Edit Target').click()
  await expect(editSaveButton(page)).toBeVisible()
  await expect(page.getByLabel('インポート確認')).toHaveCount(0)
})
