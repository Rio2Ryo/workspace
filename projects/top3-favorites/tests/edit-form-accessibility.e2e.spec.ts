import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('edit form fields have accessible names and save edited Top3 data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.getByText('1位: Solito MAGO').click()
  await page.getByRole('button', { name: '編集' }).click()

  const nameField = page.getByRole('textbox', { name: '編集 店舗名' })
  await expect(nameField).toBeVisible()
  await expect(page.getByRole('combobox', { name: '編集 タグ' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '編集 場所' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '編集 メモ' })).toBeVisible()

  await nameField.fill('Solito MAGO Edited')
  await page.getByRole('button', { name: '編集を保存' }).click()

  await expect(page.getByRole('status')).toContainText('編集を保存しました。')
  await expect(page.getByText('1位: Solito MAGO Edited')).toBeVisible()
  await expect(page.getByText('1位: Solito MAGO', { exact: true })).not.toBeVisible()
})

test('edit form validates required fields before saving', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.getByText('1位: Solito MAGO').click()
  await page.getByRole('button', { name: '編集' }).click()

  await page.getByRole('textbox', { name: '編集 店舗名' }).fill('   ')
  await page.getByRole('button', { name: '編集を保存' }).click()

  await expect(page.getByRole('alert')).toContainText('タグと店舗名は必須です。')
  await expect(page.getByRole('textbox', { name: '編集 店舗名' })).toBeVisible()

  await page.getByRole('button', { name: '編集をキャンセル' }).click()
  await expect(page.getByText(/\d位: Solito MAGO/)).toBeVisible()
  await expect(page.getByRole('alert')).not.toBeVisible()
})
