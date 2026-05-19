import { expect, test } from '@playwright/test'
import { dismissNextDeleteDialog, acceptNextDeleteDialog, resetItemsByReplace, saveSampleItems, itemDeleteButton, expectOperationStatus, fetchItems, operationStatus } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('delete asks for confirmation and cancel keeps the item', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const target = page.getByText('1位: Solito MAGO')
  await expect(target).toBeVisible()
  await target.click()

  const dialogPromise = dismissNextDeleteDialog(page, 'Solito MAGO')
  await itemDeleteButton(page, /削除/).first().click()
  await dialogPromise
  await expect(operationStatus(page)).not.toContainText('削除しました。')
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
})

test('delete confirmation accept removes the item', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const target = page.getByText('1位: Solito MAGO')
  await target.click()

  const dialogPromise = acceptNextDeleteDialog(page, 'Solito MAGO')
  await itemDeleteButton(page, /削除/).first().click()
  await dialogPromise
  await expectOperationStatus(page, '削除しました。')

  const apiData = await fetchItems<{ items: Array<{ name: string }> }>(page.request)
  expect(apiData.items.some((item) => item.name === 'Solito MAGO')).toBe(false)
})
