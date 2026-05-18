import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }) => {
  const data = (await request.get('/api/items').then((res) => res.json())) as { items: { id: string }[] }
  for (const item of data.items) {
    await request.delete(`/api/items?id=${encodeURIComponent(item.id)}`)
  }
})

test('item edit and delete actions include the item name in their accessible labels', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルをDB保存' }).click()
  await expect(page.getByText('サンプルをDBに保存しました。')).toBeVisible()

  await page.getByText('1位: Solito MAGO').click()

  await expect(page.getByRole('button', { name: 'Solito MAGOを編集' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Solito MAGOを削除' })).toBeVisible()
})
