import { expect, test } from '@playwright/test'
import {
  acceptNextDeleteDialog,
  itemEditButton,
  editSaveButton,
  resetItemsByReplace,
  itemDeleteButton,
  registrationSaveButton,
  expectOperationStatus,
  expectOperationAlert,
  registrationLocationField,
  registrationNameField,
  registrationTagField,
  operationStatus,
  rankedItemSummary,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

async function seedOne(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await registrationTagField(page).fill('カフェラテ')
  await registrationLocationField(page).fill('柏の葉')
  await registrationNameField(page).fill(name)
  await registrationSaveButton(page).click()
  await expectOperationStatus(page, 'カフェラテ の1位に保存しました。')
}

test('failed edit clears stale success notice and keeps edit draft for retry', async ({ page }) => {
  await seedOne(page, 'Edit Base')

  await rankedItemSummary(page, 1, 'Edit Base').click()
  await itemEditButton(page, 'Edit Base').click()
  await page.getByLabel('編集 店舗名').fill('Edit Retry Candidate')

  await page.route('**/api/items', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '編集APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })

  await editSaveButton(page).click()

  await expectOperationAlert(page, '編集APIが一時的に利用できません。')
  await expect(operationStatus(page)).toHaveCount(0)
  await expect(page.getByLabel('編集 店舗名')).toHaveValue('Edit Retry Candidate')
})

test('failed delete clears stale success notice and keeps item visible', async ({ page }) => {
  await seedOne(page, 'Delete Base')

  await rankedItemSummary(page, 1, 'Delete Base').click()
  await page.route('**/api/items?**', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '削除APIが一時的に利用できません。' }),
      })
      return
    }
    await route.continue()
  })
  const dialogPromise = acceptNextDeleteDialog(page, 'Delete Base をTop3から削除しますか？')
  await itemDeleteButton(page, 'Delete Base').click()
  await dialogPromise

  await expectOperationAlert(page, '削除APIが一時的に利用できません。')
  await expect(operationStatus(page)).toHaveCount(0)
  await expect(rankedItemSummary(page, 1, 'Delete Base')).toBeVisible()
})
