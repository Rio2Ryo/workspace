import { expect, test } from '@playwright/test'
import {
  canonicalizeItemsById,
  acceptNextDeleteDialog,
  editCancelButton,
  editNameField,
  editSaveButton,
  expectOperationAlert,
  fetchItems,
  itemDeleteButton,
  itemEditButton,
  rankedItemSummary,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  reloadPageAndWaitForSearchReady,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

async function seedOne(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill(name)
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')
}

test('failed edit/delete mutations keep persisted data unchanged after reload and API check', async ({ page, request }) => {
  await seedOne(page, 'Mutation Base')

  await page.route('**/api/items**', async (route) => {
    const method = route.request().method()
    if (method === 'PUT') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '編集APIが一時的に利用できません。' }),
      })
      return
    }
    if (method === 'DELETE') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '削除APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })

  // edit failure
  await rankedItemSummary(page, 1, 'Mutation Base').click()
  await itemEditButton(page, 'Mutation Base').click()
  await editNameField(page).fill('Mutation Edited Should Fail')
  await editSaveButton(page).click()
  await expectOperationAlert(page, '編集APIが一時的に利用できません。')
  await expect(editNameField(page)).toHaveValue('Mutation Edited Should Fail')
  await editCancelButton(page).click()

  // delete failure
  await rankedItemSummary(page, 1, 'Mutation Base').click()
  const dialogPromise = acceptNextDeleteDialog(page, 'Mutation Base をTop3から削除しますか？')
  await itemDeleteButton(page, 'Mutation Base').click()
  await dialogPromise
  await expectOperationAlert(page, '削除APIが一時的に利用できません。')
  await expect(rankedItemSummary(page, 1, 'Mutation Base')).toBeVisible()

  // reload should keep original persisted record
  await reloadPageAndWaitForSearchReady(page)
  await expect(rankedItemSummary(page, 1, 'Mutation Base')).toBeVisible()
  await expect(page.getByText('Mutation Edited Should Fail')).toHaveCount(0)

  // API should still have original name only
  const apiData = await fetchItems<{ items: { name: string; tag: string; location: string }[] }>(request)
  expect(canonicalizeItemsById(apiData.items.map((item) => ({ name: item.name })))).toBe(
    canonicalizeItemsById([{ name: 'Mutation Base' }]),
  )
})
