import { expect, test } from '@playwright/test'
import { itemEditButton, editSaveButton, resetItemsByReplace, saveSampleItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('new and edit rank pickers have context-specific accessible names', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: '登録 3位に入れる' })).toBeVisible()

  await saveSampleItems(page)
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.getByText('1位: Solito MAGO').click()
  await itemEditButton(page, /編集$/).click()

  const editThird = page.getByRole('button', { name: '編集 3位に変更' })
  await expect(editThird).toBeVisible()
  await editThird.click()
  await editSaveButton(page).click()

  await expect(page.getByRole('status')).toContainText('編集を保存しました。')
  await expect(page.getByText('3位: Solito MAGO')).toBeVisible()
})
