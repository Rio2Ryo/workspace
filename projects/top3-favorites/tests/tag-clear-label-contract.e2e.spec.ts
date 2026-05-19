import { expect, test } from '@playwright/test'
import {
  clearSearchTagFilter,
  rankedItemSummary,
  resetItemsByReplace,
  saveSampleItems,
  searchSection as searchSectionLocator,
  tagFilterButton,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('tag filter clear action is exposed as クリア and resets list to all items', async ({ page }) => {
  await page.goto('/')

  await saveSampleItems(page)

  const searchSection = searchSectionLocator(page)
  await tagFilterButton(searchSection as searchSectionLocator, 'カフェラテ').first().click()

  await clearSearchTagFilter(searchSection)

  await expect(rankedItemSummary(searchSection, 1, 'Solito MAGO')).toBeVisible()
  await expect(rankedItemSummary(searchSection, 1, 'とみ田')).toBeVisible()
})
