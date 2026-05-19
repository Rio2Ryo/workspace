import { expect, test } from '@playwright/test'
import {
  clearSearchTagFilter,
  expectOperationStatus,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  searchSection as searchSectionLocator,
  tagFilterButton,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('shows sync status when tag is selected and hides after clear', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Sync Marker')
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').click()

  await expect(page.getByTestId('tag-sync-status')).toHaveText('検索タグ「カフェラテ」と登録タグを連動中')

  await clearSearchTagFilter(searchSection)
  await expect(page.getByTestId('tag-sync-status')).toHaveCount(0)
  await expect(registrationTagField(page)).toHaveValue('')
})
