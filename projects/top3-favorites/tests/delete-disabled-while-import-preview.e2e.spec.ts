import { expect, test } from '@playwright/test'
import { uploadJsonImportFile, resetItemsByReplace, itemDeleteButton, registrationSaveButton, expectOperationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('delete action is disabled while import preview is active (preventive context guard)', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('タグ', { exact: true }).fill('カフェラテ')
  await page.getByLabel('場所', { exact: true }).fill('柏の葉')
  await page.getByLabel('店舗名', { exact: true }).fill('Delete Guard Target')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  await page.getByText('1位: Delete Guard Target').click()
  await expect(itemDeleteButton(page, /削除/).first()).toBeDisabled()
})
