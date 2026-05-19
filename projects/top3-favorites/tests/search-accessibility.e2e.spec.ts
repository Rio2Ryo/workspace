import { expect, test } from '@playwright/test'
import {
  rankedItemSummary,
  resetItemsByReplace,
  saveSampleItems,
  searchInput,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('search field has an accessible name and filters saved Top3 items', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const search = searchInput(page)
  await expect(search).toBeVisible()
  await search.fill('松戸')

  await expect(rankedItemSummary(page, 1, 'とみ田')).toBeVisible()
  await expect(rankedItemSummary(page, 1, 'Solito MAGO')).not.toBeVisible()
})
