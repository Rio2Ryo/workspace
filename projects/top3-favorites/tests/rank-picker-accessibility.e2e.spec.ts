import { expect, test } from '@playwright/test'
import {
  editRankButton,
  saveEditAndWaitForStatus,
  itemEditButton,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationRankButton,
  registrationTagField,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
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
  await saveEditAndWaitForStatus(page, '編集を保存しました。')
  await expect(rankedItemSummary(page, 3, 'Solito MAGO')).toBeVisible()
})

test('rank pickers can change rank with keyboard only', async ({ page }) => {
  await page.goto('/')

  await registrationTagField(page).fill('キーボード')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Keyboard Rank')

  const registrationThird = registrationRankButton(page, 3)
  await registrationThird.focus()
  await page.keyboard.press('Enter')
  await expect(registrationThird).toHaveClass(/active/)
  await saveRegistrationAndWaitForStatus(page, '3位に保存しました。')
  await expect(rankedItemSummary(page, 3, 'Keyboard Rank')).toBeVisible()

  await rankedItemSummary(page, 3, 'Keyboard Rank').click()
  await itemEditButton(page, /編集$/).click()

  const editFirst = editRankButton(page, 1)
  await editFirst.focus()
  await page.keyboard.press('Space')
  await expect(editFirst).toHaveClass(/active/)
  await saveEditAndWaitForStatus(page, '編集を保存しました。')
  await expect(rankedItemSummary(page, 1, 'Keyboard Rank')).toBeVisible()
})
