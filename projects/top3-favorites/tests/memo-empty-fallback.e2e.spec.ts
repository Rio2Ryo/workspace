import { expect, test } from '@playwright/test'
import {
  rankedItemSummary,
  rankedItemSummaryByName,
  registrationLocationField,
  registrationMemoField,
  registrationNameField,
  registrationRankButton,
  registrationSaveButton,
  registrationTagField,
  resetItemsByReplace,
  tagGroup,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('item with empty memo shows fallback text （メモなし） in details', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェ')
  await registrationLocationField(page).fill('渋谷')
  await registrationNameField(page).fill('茶亭')
  await registrationMemoField(page).fill('')
  await registrationRankButton(page, 2).click()
  await registrationSaveButton(page).click()

  const group = tagGroup(page, 'カフェ')
  await expect(rankedItemSummaryByName(group, '茶亭')).toBeVisible()

  await rankedItemSummary(group, 2, '茶亭').click()
  await expect(group.getByText('（メモなし）')).toBeVisible()
})
