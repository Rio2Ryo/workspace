import { expect, test } from '@playwright/test'
import {
  editRankButton,
  editSaveButton,
  expectOperationStatus,
  itemEditButton,
  rankedItemSummary,
  registrationRankButton,
  resetItemsByReplace,
  saveSampleItems,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('new and edit rank pickers have context-specific accessible names', async ({ page }) => {
  await page.goto('/')

  await expect(registrationRankButton(page, 3)).toBeVisible()

  await saveSampleItems(page)

  await rankedItemSummary(page, 1, 'Solito MAGO').click()
  await itemEditButton(page, /編集$/).click()

  const editThird = editRankButton(page, 3)
  await expect(editThird).toBeVisible()
  await editThird.click()
  await editSaveButton(page).click()

  await expectOperationStatus(page, '編集を保存しました。')
  await expect(rankedItemSummary(page, 3, 'Solito MAGO')).toBeVisible()
})
