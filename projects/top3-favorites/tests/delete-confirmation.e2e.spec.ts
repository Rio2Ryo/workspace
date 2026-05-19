import { expect, test } from '@playwright/test'
import {
  deleteItemAndWaitForStatus,
  dismissNextDeleteDialog,
  fetchItems,
  itemDeleteButton,
  operationStatus,
  rankedItemSummary,
  resetItemsByReplace,
  saveSampleItems,
} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('delete asks for confirmation and cancel keeps the item', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const target = rankedItemSummary(page, 1, 'Solito MAGO')
  await expect(target).toBeVisible()
  await target.click()

  const dialogPromise = dismissNextDeleteDialog(page, 'Solito MAGO')
  await itemDeleteButton(page, /削除/).first().click()
  await dialogPromise
  await expect(operationStatus(page)).not.toContainText('削除しました。')
  await expect(rankedItemSummary(page, 1, 'Solito MAGO')).toBeVisible()
})

test('delete confirmation accept removes the item', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  const target = rankedItemSummary(page, 1, 'Solito MAGO')
  await target.click()

  await deleteItemAndWaitForStatus(page, page, /削除/, 'Solito MAGO', '削除しました。')

  const apiData = await fetchItems<{ items: Array<{ name: string }> }>(page.request)
  expect(apiData.items.some((item) => item.name === 'Solito MAGO')).toBe(false)
})
