import { expect, test } from '@playwright/test'
import { tagFilterButton, clearSearchTagFilter, uploadJsonImportFile, resetItemsByReplace, registrationSaveButton, expectOperationStatus, searchSection as searchSectionLocator, registrationLocationField, registrationNameField, registrationTagField } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('clearing search tag closes pending import preview to keep search context consistent', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Clear Target')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const now = new Date().toISOString()
  const payload = [
    { id: 'imp-1', tag: 'プリン', location: '浅草', name: 'Pending A', rank: 1, memo: '', mapsUrl: '', placeId: '', createdAt: now, updatedAt: now },
  ]
  await uploadJsonImportFile(page, 'pending.json', payload)
  await expect(page.getByLabel('インポート確認')).toBeVisible()

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()
  await clearSearchTagFilter(searchSection)

  await expect(page.getByLabel('インポート確認')).toHaveCount(0)
})
