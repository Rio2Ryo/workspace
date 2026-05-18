import { expect, test } from '@playwright/test'
import { editSaveButton, resetItemsByReplace, saveSampleItems } from './e2e-helpers'

test.beforeEach(async ({ request }) => {
  await resetItemsByReplace(request)
})

test('edit form fields have accessible names and save edited Top3 data', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.getByText(/\d位: Solito MAGO/).first().click()
  await page.getByRole('button', { name: '編集' }).click()

  const nameField = page.getByRole('textbox', { name: '編集 店舗名' })
  await expect(nameField).toBeVisible()
  await expect(page.getByRole('combobox', { name: '編集 タグ' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '編集 場所' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '編集 メモ' })).toBeVisible()

  await nameField.fill('Solito MAGO Edited')
  await editSaveButton(page).click()

  await expect(page.getByText(/\d位: Solito MAGO Edited/)).toBeVisible()

  const apiData = (await page.request.get('/api/items').then((res) => res.json())) as { items: Array<{ name: string }> }
  expect(apiData.items.some((item) => item.name === 'Solito MAGO Edited')).toBe(true)
})

test('edit form validates required fields before saving', async ({ page }) => {
  await page.goto('/')
  await saveSampleItems(page)
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.getByText(/\d位: Solito MAGO/).first().click()
  await page.getByRole('button', { name: '編集' }).click()

  await page.getByRole('textbox', { name: '編集 店舗名' }).fill('   ')
  await editSaveButton(page).click()

  await expect(page.getByRole('alert')).toContainText('タグと店舗名は必須です。')
  await expect(page.getByRole('textbox', { name: '編集 店舗名' })).toBeVisible()

  await page.getByRole('button', { name: '編集をキャンセル' }).click()
  await expect(page.getByText(/\d位: Solito MAGO/)).toBeVisible()
  await expect(page.getByRole('alert')).not.toBeVisible()
})
