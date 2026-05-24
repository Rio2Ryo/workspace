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
  registrationSaveButton,
  registrationTagField,
  reloadPageAndWaitForSearchReady,
  resetItemsByReplace,
  saveRegistrationAndWaitForStatus,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('chained create/edit/delete failures keep persisted data unchanged after reload and API check', async ({ page, request }) => {
  await page.goto('/')

  // baseline item
  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill('Chain Base')
  await saveRegistrationAndWaitForStatus(page, 'カフェラテ の1位に保存しました。')

  await page.route('**/api/items**', async (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '保存APIが一時的に利用できません。' }),
      })
      return
    }
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

  // create failure
  await registrationNameField(page).fill('Chain Create Fail')
  await registrationSaveButton(page).click()
  await expectOperationAlert(page, '保存APIが一時的に利用できません。')
  await expect(registrationNameField(page)).toHaveValue('Chain Create Fail')

  // edit failure
  await rankedItemSummary(page, 1, 'Chain Base').click()
  await itemEditButton(page, 'Chain Base').click()
  await editNameField(page).fill('Chain Edit Fail')
  await editSaveButton(page).click()
  await expectOperationAlert(page, '編集APIが一時的に利用できません。')
  await editCancelButton(page).click()

  // delete failure
  await rankedItemSummary(page, 1, 'Chain Base').click()
  const dialogPromise = acceptNextDeleteDialog(page, 'Chain Base をTop3から削除しますか？')
  await itemDeleteButton(page, 'Chain Base').click()
  await dialogPromise
  await expectOperationAlert(page, '削除APIが一時的に利用できません。')
  await expect(rankedItemSummary(page, 1, 'Chain Base')).toBeVisible()

  // reload + API invariants
  await reloadPageAndWaitForSearchReady(page)
  await expect(rankedItemSummary(page, 1, 'Chain Base')).toBeVisible()
  await expect(page.getByText('Chain Create Fail')).toHaveCount(0)
  await expect(page.getByText('Chain Edit Fail')).toHaveCount(0)

  const apiData = await fetchItems<{ items: { name: string }[] }>(request)
  expect(canonicalizeItemsById(apiData.items.map((item) => ({ name: item.name })))).toBe(
    canonicalizeItemsById([{ name: 'Chain Base' }]),
  )
})
