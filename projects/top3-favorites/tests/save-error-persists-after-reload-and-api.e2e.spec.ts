import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  expectOperationAlert,
  fetchItems,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationSaveButton,
  registrationTagField,
  reloadPageAndWaitForSearchReady,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('failed create keeps persisted data unchanged after reload and API check', async ({ page, request }) => {
  await page.goto('/')

  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Create Base')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  await page.route('**/api/items', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '保存APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })

  await registrationNameField(page).fill('Create Should Fail')
  await registrationSaveButton(page).click()
  await expectOperationAlert(page, '保存APIが一時的に利用できません。')
  await expect(registrationNameField(page)).toHaveValue('Create Should Fail')

  // reload should preserve only successful create
  await reloadPageAndWaitForSearchReady(page)
  await expect(rankedItemSummary(page, 1, 'Create Base')).toBeVisible()
  await expect(page.getByText('Create Should Fail')).toHaveCount(0)

  // API should remain unchanged (no failed-create item persisted)
  const apiData = await fetchItems<{ items: { name: string }[] }>(request)
  expect(canonicalizeItemsById(apiData.items.map((item) => ({ name: item.name })))).toBe(
    canonicalizeItemsById([{ name: 'Create Base' }]),
  )
})
