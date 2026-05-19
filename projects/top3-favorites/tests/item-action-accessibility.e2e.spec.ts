import { expect, test } from '@playwright/test'
import { itemEditButton, resetItemsByReplace, saveSampleItems , itemDeleteButton} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('item edit and delete actions include the item name in their accessible labels', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)

  await page.getByText('1位: Solito MAGO').click()

  await expect(itemEditButton(page, 'Solito MAGO')).toBeVisible()
  await expect(itemDeleteButton(page, 'Solito MAGO')).toBeVisible()
})
