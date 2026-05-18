import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('new and edit rank pickers have context-specific accessible names', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: '登録 3位に入れる' })).toBeVisible()

  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByRole('status')).toContainText('サンプルをDBに保存しました。')

  await page.getByText('1位: Solito MAGO').click()
  await page.getByRole('button', { name: '編集' }).click()

  const editThird = page.getByRole('button', { name: '編集 3位に変更' })
  await expect(editThird).toBeVisible()
  await editThird.click()
  await page.getByRole('button', { name: '編集を保存' }).click()

  await expect(page.getByRole('status')).toContainText('編集を保存しました。')
  await expect(page.getByText('2位: Solito MAGO')).toBeVisible()
})
