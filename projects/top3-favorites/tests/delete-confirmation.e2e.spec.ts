import { expect, test } from '@playwright/test'
import { resetItemsByReplace, saveSampleItems , itemDeleteButton} from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('delete asks for confirmation and cancel keeps the item', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const target = page.getByText('1位: Solito MAGO')
  await expect(target).toBeVisible()
  await target.click()

  let sawDialog = false
  page.once('dialog', async (dialog) => {
    sawDialog = true
    expect(dialog.message()).toContain('Solito MAGO')
    await dialog.dismiss()
  })
  await itemDeleteButton(page, /削除/).first().click()

  expect(sawDialog).toBe(true)
  await expect(page.getByText('削除しました。')).not.toBeVisible()
  await expect(page.getByText('1位: Solito MAGO')).toBeVisible()
})

test('delete confirmation accept removes the item', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  const target = page.getByText('1位: Solito MAGO')
  await target.click()

  let sawDialog = false
  page.once('dialog', async (dialog) => {
    sawDialog = true
    expect(dialog.message()).toContain('Solito MAGO')
    await dialog.accept()
  })
  await itemDeleteButton(page, /削除/).first().click()

  expect(sawDialog).toBe(true)
  await expect(page.getByText('削除しました。')).toBeVisible()

  const apiData = (await page.request.get('/api/items').then((res) => res.json())) as { items: Array<{ name: string }> }
  expect(apiData.items.some((item) => item.name === 'Solito MAGO')).toBe(false)
})
