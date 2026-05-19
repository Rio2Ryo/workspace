import { expect, test } from '@playwright/test'
import { tagFilterButton, clearSearchTagFilter, resetItemsByReplace, saveSampleItems, searchSection as searchSectionLocator } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('tag filter clear action is exposed as クリア and resets list to all items', async ({ page }) => {
  await page.goto('/')

  await saveSampleItems(page)

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').first().click()

  await clearSearchTagFilter(searchSection)

  await expect(searchSection.getByText(/1位: Solito MAGO/)).toBeVisible()
  await expect(searchSection.getByText(/1位: とみ田/)).toBeVisible()
})
