import { expect, test } from '@playwright/test'
import {
  itemEditButton,
  editSaveButton,
  resetItemsByReplace,
  saveSampleItems,
  expectOperationStatus,
  registrationRankButton,
  editRankButton,
  rankedItemSummary,
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
  await expect(page.getByText('3位: Solito MAGO')).toBeVisible()
})
